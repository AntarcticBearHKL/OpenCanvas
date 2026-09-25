#include "scan.h"

#include "config.h"
#include "json.h"
#include "util.h"

#include "pluginterfaces/vst/ivstaudioprocessor.h" // kVstAudioEffectClass
#include "pluginterfaces/vst/ivstcomponent.h"
#include "public.sdk/source/vst/hosting/module.h"

#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <system_error>

#include <windows.h>

namespace fs = std::filesystem;
using VST3::Hosting::ClassInfo;
using VST3::Hosting::Module;

namespace vhost {
namespace {

struct Entry
{
	fs::path path;
	std::string packaging;
};

std::string toLowerAscii (std::string s)
{
	for (char& c : s)
		if (c >= 'A' && c <= 'Z')
			c = char (c - 'A' + 'a');
	return s;
}

bool endsWith (const std::string& s, const std::string& suffix)
{
	return s.size () >= suffix.size () && s.compare (s.size () - suffix.size (), suffix.size (), suffix) == 0;
}

std::vector<std::string> defaultRoots (const std::vector<std::string>& extraDirs)
{
	std::vector<std::string> roots;
	std::string common = getenvString ("CommonProgramFiles");
	if (common.empty ())
		common = "C:\\Program Files\\Common Files";
	roots.push_back (common + "\\VST3");
	for (const auto& d : extraDirs)
		roots.push_back (d);
	return roots;
}

std::vector<Entry> collectEntries (const std::vector<std::string>& roots)
{
	std::vector<Entry> entries;
	for (const auto& root : roots)
	{
		std::error_code ec;
		if (!fs::is_directory (fs::u8path (root), ec))
			continue;

		fs::recursive_directory_iterator it (fs::u8path (root),
		                                     fs::directory_options::skip_permission_denied, ec);
		const fs::recursive_directory_iterator end;
		for (; it != end; it.increment (ec))
		{
			if (ec)
			{
				ec.clear ();
				continue;
			}
			const fs::path& p = it->path ();
			if (!endsWith (toLowerAscii (p.filename ().string ()), ".vst3"))
				continue;

			std::error_code ec2;
			if (fs::is_directory (p, ec2))
			{
				entries.push_back ({p, "bundle"});
				it.disable_recursion_pending (); // never descend into a bundle
			}
			else
				entries.push_back ({p, "single"});
		}
	}

	std::sort (entries.begin (), entries.end (), [] (const Entry& a, const Entry& b) {
		return toLowerAscii (a.path.u8string ()) < toLowerAscii (b.path.u8string ());
	});
	entries.erase (std::unique (entries.begin (), entries.end (), [] (const Entry& a, const Entry& b) {
		               return toLowerAscii (a.path.u8string ()) == toLowerAscii (b.path.u8string ());
	               }),
	               entries.end ());
	return entries;
}

} // namespace

bool inspectModuleInProcess (const std::string& modulePath, std::vector<PluginInfo>& out, std::string& error)
{
	std::string moduleError;
	Module::Ptr module = Module::create (modulePath, moduleError);
	if (!module)
	{
		error = moduleError.empty () ? "failed to load module" : moduleError;
		return false;
	}

	const auto factory = module->getFactory ();
	const auto factoryInfo = factory.info ();
	const std::string packaging = module->isBundle () ? "bundle" : "single";
	const std::string path = module->getPath ();

	for (const ClassInfo& ci : factory.classInfos ())
	{
		if (ci.category () != kVstAudioEffectClass)
			continue;

		PluginInfo info;
		info.id = ci.ID ().toString ();
		info.name = ci.name ();
		info.vendor = ci.vendor ().empty () ? factoryInfo.vendor () : ci.vendor ();
		info.version = ci.version ();
		info.category = ci.category ();
		info.subCategories = ci.subCategories ();
		info.path = path;
		info.packaging = packaging;
		info.isInstrument =
		    std::find (info.subCategories.begin (), info.subCategories.end (), "Instrument") !=
		    info.subCategories.end ();
		out.push_back (std::move (info));
	}

	// Keep the module alive until the strings above are copied out, then let it
	// go. The caller (worker) terminates the process without teardown anyway.
	return true;
}

std::vector<PluginInfo> scanInProcess (const std::vector<std::string>& extraDirs)
{
	std::vector<PluginInfo> plugins;
	for (const Entry& e : collectEntries (defaultRoots (extraDirs)))
	{
		std::vector<PluginInfo> found;
		std::string error;
		if (inspectModuleInProcess (e.path.u8string (), found, error))
			plugins.insert (plugins.end (), found.begin (), found.end ());
		else
			std::fprintf (stderr, "[scan] skip %s: %s\n", e.path.u8string ().c_str (), error.c_str ());
	}

	std::sort (plugins.begin (), plugins.end (), [] (const PluginInfo& a, const PluginInfo& b) {
		if (a.path != b.path)
			return a.path < b.path;
		return a.name < b.name;
	});
	return plugins;
}

std::string pluginsToJson (const std::vector<PluginInfo>& plugins)
{
	Json list = Json::makeArray ();
	for (const PluginInfo& p : plugins)
	{
		Json item = Json::makeObject ();
		item.set ("id", Json::makeString (p.id));
		item.set ("name", Json::makeString (p.name));
		item.set ("vendor", Json::makeString (p.vendor));
		item.set ("version", Json::makeString (p.version));
		item.set ("category", Json::makeString (p.category));
		Json subs = Json::makeArray ();
		for (const auto& s : p.subCategories)
			subs.push (Json::makeString (s));
		item.set ("subCategories", std::move (subs));
		item.set ("path", Json::makeString (p.path));
		item.set ("packaging", Json::makeString (p.packaging));
		item.set ("isInstrument", Json::makeBool (p.isInstrument));
		list.push (std::move (item));
	}

	Json root = Json::makeObject ();
	root.set ("plugins", std::move (list));
	return root.dump ();
}

namespace {

std::string readAllFromPipe (HANDLE pipe)
{
	std::string out;
	char buffer[8192];
	for (;;)
	{
		DWORD available = 0;
		if (!PeekNamedPipe (pipe, nullptr, 0, nullptr, &available, nullptr))
			break;
		if (available == 0)
		{
			DWORD read = 0;
			if (!ReadFile (pipe, buffer, sizeof (buffer), &read, nullptr) || read == 0)
				break;
			out.append (buffer, read);
			continue;
		}
		DWORD read = 0;
		DWORD want = available < sizeof (buffer) ? available : DWORD (sizeof (buffer));
		if (!ReadFile (pipe, buffer, want, &read, nullptr) || read == 0)
			break;
		out.append (buffer, read);
	}
	return out;
}

} // namespace

ScanSpawnResult runScanWorker (const std::string& exePath, int timeoutMs)
{
	ScanSpawnResult result;

	SECURITY_ATTRIBUTES sa {};
	sa.nLength = sizeof (sa);
	sa.bInheritHandle = TRUE;
	HANDLE readPipe = nullptr;
	HANDLE writePipe = nullptr;
	if (!CreatePipe (&readPipe, &writePipe, &sa, 0))
	{
		result.error = "CreatePipe failed";
		return result;
	}
	SetHandleInformation (readPipe, HANDLE_FLAG_INHERIT, 0);

	std::string command = "\"" + exePath + "\" --scan-worker";
	int wideLen = MultiByteToWideChar (CP_UTF8, 0, command.c_str (), -1, nullptr, 0);
	std::wstring commandW (size_t (wideLen > 0 ? wideLen : 1), L'\0');
	if (wideLen > 0)
		MultiByteToWideChar (CP_UTF8, 0, command.c_str (), -1, commandW.data (), wideLen);

	STARTUPINFOW si {};
	si.cb = sizeof (si);
	si.dwFlags = STARTF_USESTDHANDLES;
	si.hStdInput = GetStdHandle (STD_INPUT_HANDLE);
	si.hStdOutput = writePipe;
	si.hStdError = GetStdHandle (STD_ERROR_HANDLE);

	PROCESS_INFORMATION pi {};
	BOOL created = CreateProcessW (nullptr, commandW.data (), nullptr, nullptr, TRUE, 0, nullptr, nullptr, &si, &pi);
	CloseHandle (writePipe);
	if (!created)
	{
		CloseHandle (readPipe);
		result.error = "CreateProcess failed (" + std::to_string (GetLastError ()) + ")";
		return result;
	}

	DWORD wait = WaitForSingleObject (pi.hProcess, DWORD (timeoutMs < 0 ? 0 : timeoutMs));
	if (wait == WAIT_TIMEOUT)
	{
		TerminateProcess (pi.hProcess, 124);
		WaitForSingleObject (pi.hProcess, 2000);
		result.timedOut = true;
		result.error = "scan worker timed out";
	}
	else
	{
		DWORD code = 0;
		GetExitCodeProcess (pi.hProcess, &code);
		result.exitCode = int (code);
	}
	// The child writes a small JSON blob (< pipe buffer) and exits, so reading
	// only after it finishes cannot deadlock.
	result.output = readAllFromPipe (readPipe);
	CloseHandle (readPipe);
	CloseHandle (pi.hThread);
	CloseHandle (pi.hProcess);

	result.ok = !result.timedOut && !result.output.empty ();
	if (!result.ok && result.error.empty ())
		result.error = "scan worker produced no output";
	return result;
}

} // namespace vhost
