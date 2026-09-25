#include "lifecycle.h"

#include "util.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include <winsock2.h> // before windows.h: ntohs for the TCP table
#include <iphlpapi.h>
#include <tlhelp32.h>
#include <windows.h>

namespace fs = std::filesystem;

namespace vhost {
namespace {

constexpr DWORD kStopWaitMs = 10000;       // graceful stop: event -> clean exit
constexpr DWORD kTerminateWaitMs = 5000;   // force stop: TerminateProcess
constexpr long long kStartToleranceSec = 60;

std::string toLowerAscii (std::string s)
{
	for (char& c : s)
		if (c >= 'A' && c <= 'Z')
			c = char (c - 'A' + 'a');
	return s;
}

bool equalsIgnoreCase (const std::string& a, const std::string& b)
{
	return a.size () == b.size () && toLowerAscii (a) == toLowerAscii (b);
}

std::string baseName (const std::string& path)
{
	size_t sep = path.find_last_of ("\\/");
	return sep == std::string::npos ? path : path.substr (sep + 1);
}

std::string stopEventName (unsigned long pid)
{
	return "Local\\OpenCanvas-vst-host-stop-" + std::to_string (pid);
}

std::string readWholeFile (const std::string& path, bool& ok)
{
	std::ifstream file (fs::u8path (path), std::ios::binary);
	ok = file.good ();
	if (!ok)
		return {};
	return std::string (std::istreambuf_iterator<char> (file), std::istreambuf_iterator<char> ());
}

void parsePidFile (const std::string& text, unsigned long& pid, int& port, long long& startedUnix,
                   std::string& exe)
{
	size_t pos = 0;
	while (pos < text.size ())
	{
		size_t end = text.find ('\n', pos);
		std::string line = text.substr (pos, end == std::string::npos ? std::string::npos : end - pos);
		pos = end == std::string::npos ? text.size () : end + 1;
		if (!line.empty () && line.back () == '\r')
			line.pop_back ();

		size_t eq = line.find ('=');
		if (eq == std::string::npos)
			continue;
		std::string key = line.substr (0, eq);
		std::string value = line.substr (eq + 1);
		if (key == "pid")
			pid = std::strtoul (value.c_str (), nullptr, 10);
		else if (key == "port")
			port = int (std::strtol (value.c_str (), nullptr, 10));
		else if (key == "started_unix")
			startedUnix = std::strtoll (value.c_str (), nullptr, 10);
		else if (key == "exe")
			exe = value;
	}
}

// Creation time of a live process as Unix seconds (FILETIME is UTC).
bool processCreationUnix (unsigned long pid, long long& out)
{
	HANDLE process = OpenProcess (PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
	if (!process)
		return false;
	FILETIME creation {}, exitTime {}, kernel {}, user {};
	BOOL ok = GetProcessTimes (process, &creation, &exitTime, &kernel, &user);
	CloseHandle (process);
	if (!ok)
		return false;

	ULARGE_INTEGER value {};
	value.LowPart = creation.dwLowDateTime;
	value.HighPart = creation.dwHighDateTime;
	constexpr long long kUnixEpoch100ns = 116444736000000000LL;
	out = (long long (value.QuadPart) - kUnixEpoch100ns) / 10000000LL;
	return true;
}

// The pid file may only be trusted when the live image is this vst-host build:
// same executable name, and the recorded full path matches when both exist.
bool isOurBinary (const ProcessRef& proc, const std::string& recordedExe)
{
	const std::string selfName = baseName (executablePath ());
	const std::string liveName = proc.name.empty () ? baseName (proc.path) : proc.name;
	if (liveName.empty () || !equalsIgnoreCase (liveName, selfName))
		return false;
	if (!proc.path.empty () && !recordedExe.empty () && !equalsIgnoreCase (proc.path, recordedExe))
		return false;
	return true;
}

BOOL WINAPI pidFileConsoleHandler (DWORD controlType)
{
	switch (controlType)
	{
	case CTRL_C_EVENT:
	case CTRL_BREAK_EVENT:
	case CTRL_CLOSE_EVENT:
	case CTRL_LOGOFF_EVENT:
	case CTRL_SHUTDOWN_EVENT:
		removePidFile ();
		break;
	default:
		break;
	}
	return FALSE; // let the default handler terminate us
}

} // namespace

std::string pidFilePath ()
{
	std::string base = getenvString ("LOCALAPPDATA");
	if (base.empty ())
	{
		wchar_t buffer[MAX_PATH];
		DWORD n = GetTempPathW (MAX_PATH, buffer);
		if (n > 0 && n < MAX_PATH)
			base = wideToUtf8 (std::wstring (buffer, buffer + n));
	}
	if (base.empty ())
		base = ".";
	if (base.back () == '\\' || base.back () == '/')
		base.pop_back ();
	return base + "\\OpenCanvas\\vst-host.pid";
}

bool queryProcess (unsigned long pid, ProcessRef& out)
{
	out = {};
	if (pid == 0)
		return false;
	out.pid = pid;

	HANDLE snapshot = CreateToolhelp32Snapshot (TH32CS_SNAPPROCESS, 0);
	if (snapshot != INVALID_HANDLE_VALUE)
	{
		PROCESSENTRY32W entry {};
		entry.dwSize = sizeof (entry);
		if (Process32FirstW (snapshot, &entry))
		{
			do
			{
				if (entry.th32ProcessID == pid)
				{
					out.name = wideToUtf8 (entry.szExeFile);
					break;
				}
			} while (Process32NextW (snapshot, &entry));
		}
		CloseHandle (snapshot);
	}

	HANDLE process = OpenProcess (PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
	if (process)
	{
		wchar_t buffer[32768];
		DWORD length = DWORD (std::size (buffer));
		if (QueryFullProcessImageNameW (process, 0, buffer, &length))
			out.path = wideToUtf8 (std::wstring (buffer, buffer + length));
		CloseHandle (process);
	}
	return !out.name.empty () || !out.path.empty ();
}

bool findPortListener (int port, ProcessRef& out, std::string& error)
{
	DWORD size = 0;
	DWORD code = GetExtendedTcpTable (nullptr, &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0);
	if (code == ERROR_NOT_SUPPORTED)
		return false; // no IPv4 table; bind_to_port() is the backstop
	if (code != ERROR_INSUFFICIENT_BUFFER)
	{
		error = "GetExtendedTcpTable(size) failed (" + std::to_string (code) + ")";
		return false;
	}

	std::vector<unsigned char> buffer (size);
	code = GetExtendedTcpTable (buffer.data (), &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0);
	if (code != NO_ERROR)
	{
		error = "GetExtendedTcpTable failed (" + std::to_string (code) + ")";
		return false;
	}

	const auto* table = reinterpret_cast<const MIB_TCPTABLE_OWNER_PID*> (buffer.data ());
	for (DWORD i = 0; i < table->dwNumEntries; ++i)
	{
		const MIB_TCPROW_OWNER_PID& row = table->table[i];
		if (row.dwState != MIB_TCP_STATE_LISTEN)
			continue;
		if (ntohs (u_short (row.dwLocalPort)) != u_short (port))
			continue;

		out.pid = row.dwOwningPid;
		queryProcess (out.pid, out); // name/path are best-effort
		return true;
	}
	return false;
}

HANDLE createStopEvent ()
{
	std::string name = stopEventName (GetCurrentProcessId ());
	std::wstring wide (name.begin (), name.end ());
	return CreateEventW (nullptr, TRUE, FALSE, wide.c_str ());
}

bool writePidFile (const Settings& settings, std::string& error)
{
	const std::string path = pidFilePath ();
	std::error_code ec;
	fs::create_directories (fs::u8path (path).parent_path (), ec);
	if (ec)
	{
		error = "cannot create " + fs::u8path (path).parent_path ().u8string () + ": " + ec.message ();
		return false;
	}

	SYSTEMTIME local {};
	GetLocalTime (&local);
	char stamp[32];
	std::snprintf (stamp, sizeof (stamp), "%04u-%02u-%02uT%02u:%02u:%02u", unsigned (local.wYear),
	               unsigned (local.wMonth), unsigned (local.wDay), unsigned (local.wHour),
	               unsigned (local.wMinute), unsigned (local.wSecond));

	std::ofstream file (fs::u8path (path), std::ios::binary | std::ios::trunc);
	if (!file)
	{
		error = "cannot open for writing";
		return false;
	}
	file << "pid=" << GetCurrentProcessId () << "\r\n";
	file << "port=" << settings.port << "\r\n";
	file << "started=" << stamp << "\r\n";
	file << "started_unix=" << (long long) std::time (nullptr) << "\r\n";
	file << "exe=" << executablePath () << "\r\n";
	if (!file)
	{
		error = "write failed";
		return false;
	}
	return true;
}

void removePidFile ()
{
	std::error_code ec;
	fs::remove (fs::u8path (pidFilePath ()), ec);
}

void installPidFileCleanup ()
{
	SetConsoleCtrlHandler (pidFileConsoleHandler, TRUE);
}

int runStopCommand ()
{
	const std::string path = pidFilePath ();
	std::printf ("vst-host --stop\n");
	std::printf ("pid file: %s\n", path.c_str ());

	bool readOk = false;
	std::string text = readWholeFile (path, readOk);
	if (!readOk)
	{
		std::fprintf (stderr, "vst-host: no pid file; the server is not running (or was started without PID tracking)\n");
		return 1;
	}

	unsigned long pid = 0;
	int port = 0;
	long long startedUnix = 0;
	std::string exe;
	parsePidFile (text, pid, port, startedUnix, exe);
	if (pid == 0)
	{
		std::fprintf (stderr, "vst-host: pid file has no usable pid; removing it\n");
		removePidFile ();
		return 1;
	}

	ProcessRef proc;
	if (!queryProcess (pid, proc))
	{
		std::fprintf (stderr, "vst-host: pid file says pid %lu, but that process is gone; removing the stale pid file\n",
		              pid);
		removePidFile ();
		return 1;
	}

	std::printf ("target:   pid %lu  %s  port %d\n", pid, proc.name.empty () ? "<unknown>" : proc.name.c_str (),
	             port);
	if (!proc.path.empty ())
		std::printf ("          %s\n", proc.path.c_str ());

	if (!isOurBinary (proc, exe))
	{
		std::fprintf (stderr, "vst-host: pid %lu is %s, not this vst-host binary (%s);\n", pid,
		              proc.name.empty () ? "<unknown>" : proc.name.c_str (),
		              proc.path.empty () ? "<unreadable path>" : proc.path.c_str ());
		std::fprintf (stderr, "vst-host: refusing to stop it and removing the stale pid file\n");
		removePidFile ();
		return 1;
	}

	// A recycled pid is alive, same-named and possibly the same image: only the
	// start time proves the pid file belongs to this process.
	if (startedUnix > 0)
	{
		long long created = 0;
		if (processCreationUnix (pid, created))
		{
			const long long delta = created > startedUnix ? created - startedUnix : startedUnix - created;
			if (delta > kStartToleranceSec)
			{
				std::fprintf (stderr,
				              "vst-host: pid %lu started at %lld but the pid file was written at %lld; the pid was "
				              "recycled.\n",
				              pid, created, startedUnix);
				std::fprintf (stderr, "vst-host: refusing to stop it and removing the stale pid file\n");
				removePidFile ();
				return 1;
			}
		}
	}

	// The stop event is created by runServer() itself; without it this is not a
	// running server from this build, so never fall through to a hard kill.
	std::string eventName = stopEventName (pid);
	std::wstring eventNameW (eventName.begin (), eventName.end ());
	HANDLE event = OpenEventW (EVENT_MODIFY_STATE, FALSE, eventNameW.c_str ());
	if (!event || !SetEvent (event))
	{
		if (event)
			CloseHandle (event);
		std::fprintf (stderr,
		              "vst-host: pid %lu does not expose the stop channel (not a running server from this build?);\n",
		              pid);
		std::fprintf (stderr, "vst-host: not terminating it. Re-run --stop in a moment, or stop pid %lu manually\n",
		              pid);
		return 1;
	}
	CloseHandle (event);

	HANDLE process = OpenProcess (SYNCHRONIZE | PROCESS_TERMINATE, FALSE, pid);
	if (!process)
	{
		std::fprintf (stderr, "vst-host: could not open pid %lu for termination (%lu); leaving it running\n", pid,
		              GetLastError ());
		return 1;
	}

	std::printf ("sent graceful stop; waiting up to %lus\n", kStopWaitMs / 1000);
	if (WaitForSingleObject (process, kStopWaitMs) == WAIT_TIMEOUT)
	{
		std::printf ("no exit within %lus; terminating pid %lu\n", kStopWaitMs / 1000, pid);
		TerminateProcess (process, 0);
		WaitForSingleObject (process, kTerminateWaitMs);
	}

	DWORD exitCode = 0;
	GetExitCodeProcess (process, &exitCode);
	CloseHandle (process);
	removePidFile ();
	std::printf ("stopped pid %lu (exit code %lu) and removed the pid file\n", pid, exitCode);
	return 0;
}

} // namespace vhost
