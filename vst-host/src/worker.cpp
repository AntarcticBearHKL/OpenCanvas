// Server-side half of the per-instance worker split (see worker.h and
// worker_ipc.h): spawn the child, forward the instance API over the control
// pipe, read the audio rings, watch the process and clean up so no worker is
// ever orphaned (a job object with KILL_ON_JOB_CLOSE backs the graceful path).

#include "worker.h"

#include "json.h"
#include "util.h"
#include "worker_ipc.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <random>
#include <string>
#include <vector>

#include <windows.h>

namespace vhost {
namespace {

using Clock = std::chrono::steady_clock;

constexpr const char* kPipePrefix = "\\\\.\\pipe\\OpenCanvas-vst-worker-";
constexpr const char* kMapPrefix = "Local\\OpenCanvas-vst-worker-";
/** Parent-side `/render` backlog: the in-process instance used the same 64. */
constexpr size_t kRenderBacklogFrames = 64;
/** Control-pipe buffers (both directions); larger responses (getState) block
 *  the child until the parent's reader drains them, which it always does. */
constexpr DWORD kPipeBufferBytes = 64 * 1024;

std::string randomSuffix ()
{
	std::random_device device;
	char buffer[17];
	for (size_t i = 0; i < 16; i += 4)
		std::snprintf (buffer + i, 5, "%04x", unsigned (device () & 0xFFFFu));
	return std::string (buffer, 16);
}

Json makeErrorJson (const std::string& code, const std::string& message)
{
	Json item = Json::makeObject ();
	item.set ("ok", Json::makeBool (false));
	item.set ("code", Json::makeString (code));
	item.set ("message", Json::makeString (message));
	return item;
}

Json makeSimpleCommand (const char* name)
{
	Json command = Json::makeObject ();
	command.set ("cmd", Json::makeString (name));
	return command;
}

void setRenderError (const std::shared_ptr<OfflineRenderState>& state, const std::string& code,
                     const std::string& message)
{
	std::lock_guard<std::mutex> lock (state->mutex);
	if (state->error.empty ())
		state->error = code.empty () ? (message.empty () ? "render_failed" : message) : code;
	state->finished = true;
	state->condition.notify_all ();
}

} // namespace

//------------------------------------------------------------------------
struct PluginInstance::Impl
{
	PluginInstance* owner {nullptr};

	std::mutex mutex; // spawn()/shutdown() resource ownership only
	std::atomic<bool> shutdownStarted {false};
	HANDLE process {nullptr};
	HANDLE pipe {nullptr};
	HANDLE job {nullptr};
	HANDLE outEvent {nullptr};
	HANDLE renderEvent {nullptr};
	HANDLE inEvent {nullptr};
	HANDLE inMutex {nullptr};
	HANDLE outMapping {nullptr};
	HANDLE renderMapping {nullptr};
	HANDLE inMapping {nullptr};
	void* outView {nullptr};
	void* renderView {nullptr};
	void* inView {nullptr};
	std::atomic<bool> workerAlive {false};
	unsigned long pid {0};
	uint32_t slotBytes {0};
	uint32_t slotCount {0};
	uint32_t renderSlotCount {0};
	uint32_t inCapacity {0};

	std::atomic<bool> closing {false};
	std::thread reader;
	std::thread watchdog;
	std::mutex writeMutex; // guards `pipe` writes and the CloseHandle
	std::atomic<uint64_t> nextSeq {1};
	std::mutex pendingMutex;
	std::map<uint64_t, std::shared_ptr<std::promise<Json>>> pending;

	std::mutex failureMutex;
	std::string failureCode;
	std::string failureMessage;

	std::mutex popMutex; // the out ring is SPSC; HTTP readers take turns

	std::mutex renderMutex;
	std::shared_ptr<OfflineRenderState> activeRender;
	std::thread renderDrain;
	std::atomic<bool> renderDrainDone {true};
	std::atomic<bool> renderDoneFlag {false};
	bool renderDoneOk {true};
	std::string renderDoneError;

	~Impl ()
	{
		if (outView)
			UnmapViewOfFile (outView);
		if (renderView)
			UnmapViewOfFile (renderView);
		if (inView)
			UnmapViewOfFile (inView);
		if (outMapping)
			CloseHandle (outMapping);
		if (renderMapping)
			CloseHandle (renderMapping);
		if (inMapping)
			CloseHandle (inMapping);
	}

	// ---- lifecycle ----
	bool spawn (const std::string& id, int blockSize, bool effect, std::string& error);
	void shutdown (int graceMs);
	void cleanupHandles ();

	// ---- control plane ----
	bool callWorker (const Json& command, int timeoutMs, bool killOnTimeout, Json& response);
	bool writeMessage (const std::string& payload);
	void readerLoop ();
	void watchdogLoop ();
	void failPending (const std::string& code, const std::string& message);

	// ---- audio ----
	std::shared_ptr<const std::vector<uint8_t>> readFrame (int waitMs, void* view, HANDLE event, uint32_t slots);
	bool writeInputRecord (const uint8_t* data, size_t size, std::string& error);
	void drainRender (const std::shared_ptr<OfflineRenderState>& state, double seconds,
	                  std::vector<OfflineNote> notes);
	void finishRender ();
};

//------------------------------------------------------------------------
bool PluginInstance::Impl::spawn (const std::string& id, int blockSize, bool effect, std::string& error)
{
	if (blockSize < 1 || blockSize > int (ipc::kMaxBlockSize))
	{
		error = "blockSize must be between 1 and 8192 for the isolated worker";
		return false;
	}

	std::lock_guard<std::mutex> lock (mutex);
	if (process)
	{
		error = "worker already spawned";
		return false;
	}

	const std::string base = std::to_string (GetCurrentProcessId ()) + "-" + id + "-" + randomSuffix ();
	const std::string pipeName = std::string (kPipePrefix) + base;
	const std::string outName = std::string (kMapPrefix) + base + "-out";
	const std::string renderName = std::string (kMapPrefix) + base + "-render";
	const std::string inName = std::string (kMapPrefix) + base + "-in";

	slotBytes = ipc::kSlotHeaderBytes + 16 + 2 * uint32_t (blockSize) * 4;
	slotCount = ipc::kAudioSlots;
	renderSlotCount = ipc::kRenderSlots;
	inCapacity = effect ? ipc::kInputBytes : 0;

	auto cleanup = [this] { cleanupHandles (); };

	// Pipe: created BLOCKING. The accept runs on a short-lived helper thread below so
	// a child that dies before dialling in cannot wedge the caller. Not inheritable:
	// the child dials it by name, so no server-end handle leaks into the child and a
	// parent exit really breaks the pipe.
	pipe = CreateNamedPipeW (utf8ToWide (pipeName).c_str (),
	                         PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
	                         PIPE_TYPE_BYTE | PIPE_READMODE_BYTE, 1, kPipeBufferBytes,
	                         kPipeBufferBytes, 0, nullptr);
	if (pipe == INVALID_HANDLE_VALUE)
	{
		pipe = nullptr;
		error = "CreateNamedPipe failed (" + std::to_string (GetLastError ()) + ")";
		return false;
	}

	// Events/mutex are inherited by handle value on the child's command line.
	SECURITY_ATTRIBUTES inherit {};
	inherit.nLength = sizeof (inherit);
	inherit.bInheritHandle = TRUE;
	outEvent = CreateEventW (&inherit, FALSE, FALSE, nullptr);
	renderEvent = CreateEventW (&inherit, FALSE, FALSE, nullptr);
	if (!outEvent || !renderEvent)
	{
		error = "CreateEvent failed (" + std::to_string (GetLastError ()) + ")";
		cleanup ();
		return false;
	}
	if (effect)
	{
		inEvent = CreateEventW (&inherit, FALSE, FALSE, nullptr);
		inMutex = CreateMutexW (&inherit, FALSE, nullptr);
		if (!inEvent || !inMutex)
		{
			error = "CreateEvent/CreateMutex failed (" + std::to_string (GetLastError ()) + ")";
			cleanup ();
			return false;
		}
	}

	auto createMapping = [&] (const std::string& name, size_t bytes) -> HANDLE {
		return CreateFileMappingW (INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, DWORD (bytes >> 32),
		                           DWORD (bytes & 0xFFFFFFFFu), utf8ToWide (name).c_str ());
	};
	const size_t frameRingBytes = ipc::kFrameRingHeaderBytes + size_t (slotCount) * slotBytes;
	outMapping = createMapping (outName, frameRingBytes);
	renderMapping = createMapping (renderName, ipc::kFrameRingHeaderBytes + size_t (renderSlotCount) * slotBytes);
	if (!outMapping || !renderMapping)
	{
		error = "CreateFileMapping failed (" + std::to_string (GetLastError ()) + ")";
		cleanup ();
		return false;
	}
	if (effect)
	{
		inMapping = createMapping (inName, ipc::kByteRingHeaderBytes + size_t (inCapacity));
		if (!inMapping)
		{
			error = "CreateFileMapping failed (" + std::to_string (GetLastError ()) + ")";
			cleanup ();
			return false;
		}
	}

	outView = MapViewOfFile (outMapping, FILE_MAP_ALL_ACCESS, 0, 0, 0);
	renderView = MapViewOfFile (renderMapping, FILE_MAP_ALL_ACCESS, 0, 0, 0);
	if (effect)
		inView = MapViewOfFile (inMapping, FILE_MAP_ALL_ACCESS, 0, 0, 0);
	if (!outView || !renderView || (effect && !inView))
	{
		error = "MapViewOfFile failed (" + std::to_string (GetLastError ()) + ")";
		cleanup ();
		return false;
	}
	std::memset (outView, 0, frameRingBytes);
	std::memset (renderView, 0, ipc::kFrameRingHeaderBytes + size_t (renderSlotCount) * slotBytes);
	if (effect)
		std::memset (inView, 0, ipc::kByteRingHeaderBytes + size_t (inCapacity));

	// Command line: the child parses these flags (see worker_child.cpp).
	std::wstring command = L"\"" + utf8ToWide (executablePath ()) + L"\" --plugin-worker " + utf8ToWide (id) +
	                       L" --pipe " + utf8ToWide (pipeName) + L" --out-map " + utf8ToWide (outName) +
	                       L" --render-map " + utf8ToWide (renderName) + L" --slot-bytes " +
	                       std::to_wstring (slotBytes) + L" --slot-count " + std::to_wstring (slotCount) +
	                       L" --render-slots " + std::to_wstring (renderSlotCount) + L" --event-out " +
	                       std::to_wstring (uintptr_t (outEvent)) + L" --event-render " +
	                       std::to_wstring (uintptr_t (renderEvent));
	if (effect)
		command += L" --in-map " + utf8ToWide (inName) + L" --in-capacity " + std::to_wstring (inCapacity) +
		           L" --event-in " + std::to_wstring (uintptr_t (inEvent)) + L" --in-mutex " +
		           std::to_wstring (uintptr_t (inMutex));

	STARTUPINFOW startInfo {};
	startInfo.cb = sizeof (startInfo);
	startInfo.dwFlags = STARTF_USESTDHANDLES;
	startInfo.hStdInput = GetStdHandle (STD_INPUT_HANDLE);
	startInfo.hStdOutput = GetStdHandle (STD_OUTPUT_HANDLE);
	startInfo.hStdError = GetStdHandle (STD_ERROR_HANDLE);

	PROCESS_INFORMATION processInfo {};
	if (!CreateProcessW (nullptr, command.data (), nullptr, nullptr, TRUE, CREATE_SUSPENDED | CREATE_NO_WINDOW,
	                     nullptr, nullptr, &startInfo, &processInfo))
	{
		error = "CreateProcess failed (" + std::to_string (GetLastError ()) + ")";
		cleanup ();
		return false;
	}
	process = processInfo.hProcess;
	pid = processInfo.dwProcessId;

	// A job with KILL_ON_JOB_CLOSE guarantees no worker outlives the server,
	// even when the server is killed without running its shutdown path. The
	// child is still suspended here, so it cannot spawn anything outside it.
	job = CreateJobObjectW (nullptr, nullptr);
	if (job)
	{
		JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits {};
		limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
		SetInformationJobObject (job, JobObjectExtendedLimitInformation, &limits, sizeof (limits));
		if (!AssignProcessToJobObject (job, process))
			std::fprintf (stderr, "vst-host: warning: could not attach worker pid %lu to a job (%lu)\n", pid,
			              GetLastError ());
	}
	ResumeThread (processInfo.hThread);
	CloseHandle (processInfo.hThread);

	// Accept on a helper thread: a blocking ConnectNamedPipe completes the connection
	// properly (a nonblocking one returned "connectable" and left the pipe half-open),
	// and the wait below still bounds a child that never dials in. On timeout the pipe
	// is closed, which aborts the pending accept so the helper returns.
	std::atomic<bool> connected {false};
	std::thread acceptThread ([this, &connected] {
		if (ConnectNamedPipe (pipe, nullptr))
			connected.store (true);
		else if (GetLastError () == ERROR_PIPE_CONNECTED)
			connected.store (true);
	});
	bool timedOut = false;
	const auto deadline = Clock::now () + std::chrono::milliseconds (ipc::kConnectTimeoutMs);
	while (!connected.load ())
	{
		if (WaitForSingleObject (process, 0) == WAIT_OBJECT_0)
			break; // child exited before connecting
		if (Clock::now () >= deadline)
		{
			timedOut = true;
			break;
		}
		Sleep (ipc::kConnectPollMs);
	}
	if (!connected.load ())
	{
		// Close the pipe in cleanupHandles() to abort the pending ConnectNamedPipe.
		DWORD exitCode = 0;
		GetExitCodeProcess (process, &exitCode);
		error = "worker did not connect" + std::string (timedOut ? " (connect timeout)"
		                                                        : " (exited, code " + std::to_string (exitCode) + ")");
		HANDLE proc = nullptr;
		{
			const int64_t grace = timedOut ? 4000 : 2000;
			if (WaitForSingleObject (process, DWORD (grace)) == WAIT_TIMEOUT)
				TerminateProcess (process, 1);
			(void) proc;
		}
		cleanup ();
		acceptThread.join ();
		return false;
	}
	acceptThread.join ();
	ipc::traceStep ("P connected");

	workerAlive.store (true);
	reader = std::thread (&Impl::readerLoop, this);
	watchdog = std::thread (&Impl::watchdogLoop, this);
	return true;
}

void PluginInstance::Impl::cleanupHandles ()
{
	std::lock_guard<std::mutex> lock (writeMutex);
	if (process && WaitForSingleObject (process, 0) == WAIT_TIMEOUT)
		TerminateProcess (process, 1); // job-less fallback: never leave an orphan
	if (pipe)
	{
		CloseHandle (pipe);
		pipe = nullptr;
	}
	if (outEvent)
	{
		CloseHandle (outEvent);
		outEvent = nullptr;
	}
	if (renderEvent)
	{
		CloseHandle (renderEvent);
		renderEvent = nullptr;
	}
	if (inEvent)
	{
		CloseHandle (inEvent);
		inEvent = nullptr;
	}
	if (inMutex)
	{
		CloseHandle (inMutex);
		inMutex = nullptr;
	}
	if (process)
	{
		CloseHandle (process);
		process = nullptr;
	}
	if (job)
	{
		CloseHandle (job); // KILL_ON_JOB_CLOSE: any survivor dies here
		job = nullptr;
	}
}

void PluginInstance::Impl::shutdown (int graceMs)
{
	if (shutdownStarted.exchange (true))
		return;
	closing.store (true);

	HANDLE proc = nullptr;
	{
		std::lock_guard<std::mutex> lock (mutex);
		proc = process;
	}
	if (!proc)
	{
		cleanupHandles ();
		return;
	}

	// Graceful unload first: the child tears the plug-in down and exits. Past
	// `graceMs` it is terminated (a hung teardown must not keep a worker alive,
	// and no orphan may be left behind).
	if (workerAlive.load ())
	{
		const int unloadWait = std::max (500, graceMs / 2);
		Json response;
		callWorker (makeSimpleCommand ("unload"), unloadWait, false, response);
		const DWORD left = DWORD (std::max (0, graceMs - unloadWait));
		if (WaitForSingleObject (proc, left) == WAIT_TIMEOUT)
		{
			TerminateProcess (proc, 1);
			WaitForSingleObject (proc, 2000);
		}
	}
	workerAlive.store (false);
	failPending ("worker_failed", "插件工作进程已停止");

	// Wake every waiter, abort the reader's blocking ReadFile and join. The
	// worker is already dead, so the pipe is broken as well.
	{
		std::lock_guard<std::mutex> lock (renderMutex);
		if (activeRender)
			cancelRender (activeRender);
	}
	if (outEvent)
		SetEvent (outEvent);
	if (renderEvent)
		SetEvent (renderEvent);
	if (inEvent)
		SetEvent (inEvent);
	if (reader.joinable ())
		CancelSynchronousIo (reader.native_handle ());
	if (reader.joinable ())
		reader.join ();
	if (watchdog.joinable ())
		watchdog.join ();
	if (renderDrain.joinable ())
		renderDrain.join ();

	{
		// popFrame() may be blocked on outEvent; taking its lock guarantees no
		// reader is inside readFrame() while the handles are closed (the mapping
		// views stay alive until ~Impl, so a late reader only sees a stale frame).
		std::lock_guard<std::mutex> lock (popMutex);
		cleanupHandles ();
	}
}

//------------------------------------------------------------------------
bool PluginInstance::Impl::writeMessage (const std::string& payload)
{
	std::lock_guard<std::mutex> lock (writeMutex);
	if (!pipe)
		return false;
	return ipc::pipeWriteFrame (pipe, payload);
}

void PluginInstance::Impl::failPending (const std::string& code, const std::string& message)
{
	std::map<uint64_t, std::shared_ptr<std::promise<Json>>> pendingNow;
	{
		std::lock_guard<std::mutex> lock (pendingMutex);
		pendingNow.swap (pending);
	}
	Json failure = makeErrorJson (code, message);
	for (auto& entry : pendingNow)
	{
		try
		{
			entry.second->set_value (failure);
		}
		catch (...)
		{
		}
	}
}

bool PluginInstance::Impl::callWorker (const Json& command, int timeoutMs, bool killOnTimeout, Json& response)
{
	if (!workerAlive.load ())
	{
		response = makeErrorJson (owner->failureCode ().empty () ? "worker_failed" : owner->failureCode (),
		                          owner->failureMessage ());
		return false;
	}

	const uint64_t seq = nextSeq.fetch_add (1);
	Json payload = command;
	payload.set ("seq", Json::makeNumber (double (seq), true));
	auto promise = std::make_shared<std::promise<Json>> ();
	std::future<Json> future = promise->get_future ();
	{
		std::lock_guard<std::mutex> lock (pendingMutex);
		pending[seq] = promise;
	}

	if (!writeMessage (payload.dump ()))
	{
		std::lock_guard<std::mutex> lock (pendingMutex);
		pending.erase (seq);
		response = makeErrorJson ("worker_failed", owner->failureMessage ());
		return false;
	}
	ipc::traceStep (("P sent " + std::to_string (seq) + " " + command.get ("cmd").asStringOr ("?")).c_str ());

	if (future.wait_for (std::chrono::milliseconds (timeoutMs)) != std::future_status::ready)
	{
		{
			std::lock_guard<std::mutex> lock (pendingMutex);
			pending.erase (seq);
		}
		// A command that never answered means the child is wedged inside the
		// plug-in: the watchdog kills it instead of leaving a zombie worker.
		if (killOnTimeout)
		{
			owner->onWorkerDeath ("worker_timeout", "插件调用超时，工作进程已被终止");
			HANDLE proc = nullptr;
			{
				std::lock_guard<std::mutex> lock (mutex);
				proc = process;
			}
			if (proc)
				TerminateProcess (proc, 1);
		}
		response = makeErrorJson ("worker_timeout", "插件调用超时");
		return false;
	}

	response = future.get ();
	return response.get ("ok").asBool ();
}

void PluginInstance::Impl::readerLoop ()
{
	ipc::traceStep ("P reader enter");
	for (;;)
	{
		std::string payload;
		if (!ipc::pipeReadFrame (pipe, payload))
		{
			if (closing.load ())
				return;
			DWORD exitCode = 0;
			GetExitCodeProcess (process, &exitCode);
			owner->onWorkerDeath ("worker_failed",
			                      "插件工作进程已退出（exit code " + std::to_string (exitCode) + "，pid " +
			                          std::to_string (pid) + "）");
			return;
		}

		Json message;
		std::string parseError;
		if (!Json::parse (payload, message, parseError))
		{
			std::fprintf (stderr, "vst-host: dropping malformed worker frame: %s\n", parseError.c_str ());
			continue; // drop malformed frames; the waiting seq times out instead
		}

		const Json& seq = message.get ("seq");
		if (seq.isNumber ())
		{
			ipc::traceStep (("P recv " + std::to_string (uint64_t (seq.asInt ()))).c_str ());
			std::shared_ptr<std::promise<Json>> promise;
			{
				std::lock_guard<std::mutex> lock (pendingMutex);
				auto it = pending.find (uint64_t (seq.asInt ()));
				if (it != pending.end ())
				{
					promise = it->second;
					pending.erase (it);
				}
			}
			if (promise)
				promise->set_value (std::move (message));
			continue;
		}

		if (message.get ("event").asStringOr ("") == "renderDone")
		{
			std::lock_guard<std::mutex> lock (renderMutex);
			renderDoneOk = message.get ("ok").asBool (true);
			renderDoneError = message.get ("error").asStringOr ("");
			renderDoneFlag.store (true);
		}
	}
}

void PluginInstance::Impl::watchdogLoop ()
{
	int misses = 0;
	for (;;)
	{
		if (closing.load () || !workerAlive.load ())
			return;
		if (WaitForSingleObject (process, DWORD (ipc::kPingIntervalMs)) == WAIT_OBJECT_0)
		{
			if (closing.load ())
				return;
			DWORD exitCode = 0;
			GetExitCodeProcess (process, &exitCode);
			owner->onWorkerDeath ("worker_failed",
			                      "插件工作进程已退出（exit code " + std::to_string (exitCode) + "，pid " +
			                          std::to_string (pid) + "）");
			return;
		}
		if (closing.load ())
			return;

		// Pings are answered by the child's control thread even while its
		// instance thread is busy; three missed pongs mean the process itself
		// is wedged, so it is killed instead of wedging the server.
		Json response;
		if (callWorker (makeSimpleCommand ("ping"), ipc::kPingTimeoutMs, false, response))
			misses = 0;
		else if (++misses >= ipc::kPingMisses)
		{
			owner->onWorkerDeath ("worker_hung",
			                      "插件工作进程连续 " + std::to_string (misses) + " 次心跳无响应，已被终止");
			HANDLE proc = nullptr;
			{
				std::lock_guard<std::mutex> lock (mutex);
				proc = process;
			}
			if (proc)
				TerminateProcess (proc, 1);
			return;
		}
	}
}

//------------------------------------------------------------------------
std::shared_ptr<const std::vector<uint8_t>> PluginInstance::Impl::readFrame (int waitMs, void* view,
                                                                             HANDLE event, uint32_t slots)
{
	if (!view)
		return nullptr;
	const auto deadline = Clock::now () + std::chrono::milliseconds (waitMs);
	for (;;)
	{
		auto* header = ipc::frameHeader (view);
		const long long write = ipc::ringRead (&header->writeSeq);
		const long long read = ipc::ringRead (&header->readSeq);
		if (read < write)
		{
			// Reserve before copying: past a full ring the producer may drop the
			// oldest slot, and reserving keeps this one out of its window.
			ipc::ringBump (&header->readSeq);
			const uint8_t* slot = ipc::frameSlot (view, slotBytes, slots, read);
			uint32_t length = 0;
			std::memcpy (&length, slot, ipc::kSlotHeaderBytes);
			if (length < 16 || length > slotBytes - ipc::kSlotHeaderBytes)
				continue; // torn frame from an overrun; drop the slot
			return std::make_shared<std::vector<uint8_t>> (slot + ipc::kSlotHeaderBytes,
			                                               slot + ipc::kSlotHeaderBytes + length);
		}
		if (!workerAlive.load ())
			return nullptr;
		if (Clock::now () >= deadline)
			return nullptr;
		WaitForSingleObject (event, ipc::kWaitSliceMs);
	}
}

bool PluginInstance::Impl::writeInputRecord (const uint8_t* data, size_t size, std::string& error)
{
	if (!workerAlive.load () || !inView || !inMutex)
	{
		error = "worker is not running";
		return false;
	}
	const uint64_t needed = 4 + uint64_t (size);
	if (needed > inCapacity)
	{
		error = "input record larger than the worker input ring";
		return false;
	}

	// A cross-process mutex keeps producer (parent HTTP threads) and consumer
	// (child input thread) consistent; records are dropped oldest-first so the
	// producer never blocks and nothing is silently truncated.
	const DWORD wait = WaitForSingleObject (inMutex, 1000);
	if (wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED)
	{
		error = "worker input ring is busy";
		return false;
	}
	auto* header = ipc::byteHeader (inView);
	for (;;)
	{
		const long long write = ipc::ringRead (&header->writeBytes);
		const long long read = ipc::ringRead (&header->readBytes);
		if (uint64_t (inCapacity) - uint64_t (write - read) >= needed)
			break;
		if (read >= write)
			break; // can only happen when `needed <= capacity`, handled above
		uint32_t length = 0;
		ipc::byteRingCopyOut (inView, inCapacity, read, &length, 4);
		header->readBytes = read + 4 + length;
		ipc::ringBump (&header->droppedRecords);
	}
	const long long write = ipc::ringRead (&header->writeBytes);
	const uint32_t length = uint32_t (size);
	ipc::byteRingCopyIn (inView, inCapacity, write, &length, 4);
	ipc::byteRingCopyIn (inView, inCapacity, write + 4, data, size);
	header->writeBytes = write + long long (needed);
	ReleaseMutex (inMutex);
	if (inEvent)
		SetEvent (inEvent);
	return true;
}

void PluginInstance::Impl::finishRender ()
{
	std::lock_guard<std::mutex> lock (renderMutex);
	activeRender.reset ();
	renderDrainDone.store (true);
}

void PluginInstance::Impl::drainRender (const std::shared_ptr<OfflineRenderState>& state, double seconds,
                                        std::vector<OfflineNote> notes)
{
	Json command = makeSimpleCommand ("renderOffline");
	command.set ("seconds", Json::makeNumber (seconds));
	Json list = Json::makeArray ();
	for (const OfflineNote& note : notes)
	{
		Json item = Json::makeObject ();
		item.set ("pitch", Json::makeNumber (double (note.pitch), true));
		item.set ("velocity", Json::makeNumber (double (note.velocity), true));
		item.set ("start", Json::makeNumber (note.start));
		item.set ("length", Json::makeNumber (note.length));
		list.push (std::move (item));
	}
	command.set ("notes", std::move (list));

	Json response;
	if (!callWorker (command, ipc::kRenderAckTimeoutMs, true, response))
	{
		setRenderError (state, response.get ("code").asStringOr ("render_failed"),
		                response.get ("message").asStringOr ("plug-in render failed to start"));
		finishRender ();
		return;
	}

	auto* header = ipc::frameHeader (renderView);
	for (;;)
	{
		{
			std::unique_lock<std::mutex> lock (state->mutex);
			if (state->cancelled)
			{
				lock.unlock ();
				Json ignored;
				callWorker (makeSimpleCommand ("renderCancel"), ipc::kCommandTimeoutMs, false, ignored);
				break;
			}
			// Backpressure: never queued beyond 64 unread blocks (same bound as
			// the in-process renderer).
			state->condition.wait (lock, [&state] {
				return state->cancelled || state->frames.size () < kRenderBacklogFrames;
			});
			if (state->cancelled)
				continue;
		}

		auto frame = readFrame (ipc::kWaitSliceMs, renderView, renderEvent, renderSlotCount);
		if (frame)
		{
			std::lock_guard<std::mutex> lock (state->mutex);
			if (!state->cancelled)
			{
				state->frames.push_back (std::move (frame));
				state->condition.notify_all ();
			}
			continue;
		}
		if (renderDoneFlag.load ())
		{
			const long long write = ipc::ringRead (&header->writeSeq);
			const long long read = ipc::ringRead (&header->readSeq);
			if (read >= write)
			{
				bool ok = true;
				std::string error;
				{
					std::lock_guard<std::mutex> lock (renderMutex);
					ok = renderDoneOk;
					error = renderDoneError;
				}
				std::lock_guard<std::mutex> lock (state->mutex);
				if (!ok)
					state->error = error.empty () ? "render_failed" : error;
				state->finished = true;
				state->condition.notify_all ();
				break;
			}
		}
		if (!workerAlive.load ())
		{
			setRenderError (state, owner->failureCode ().empty () ? "worker_failed" : owner->failureCode (),
			                owner->failureMessage ());
			break;
		}
	}
	finishRender ();
}

//------------------------------------------------------------------------
PluginInstance::PluginInstance (std::string id)
: id_ (std::move (id))
, hash_ (fnv1a32 (id_))
, impl_ (std::make_unique<Impl> ())
{
	impl_->owner = this;
}

PluginInstance::~PluginInstance ()
{
	if (!stopped_.load ())
		stop (2000);
	if (thread_.joinable ())
		thread_.join ();
}

bool PluginInstance::start (std::string& error)
{
	if (!finished_.valid ())
		finished_ = finishedPromise_.get_future ();
	running_.store (true);
	try
	{
		thread_ = std::thread (&PluginInstance::controlLoop, this);
	}
	catch (const std::exception& e)
	{
		running_.store (false);
		error = e.what ();
		return false;
	}
	return true;
}

bool PluginInstance::stop (int timeoutMs)
{
	if (stopped_.load ())
		return true;
	impl_->shutdown (timeoutMs);
	running_.store (false);
	condition_.notify_all ();

	bool finished = false;
	if (finished_.valid ())
		finished = finished_.wait_for (std::chrono::milliseconds (timeoutMs)) == std::future_status::ready;

	if (finished)
	{
		if (thread_.joinable ())
			thread_.join ();
	}
	else if (thread_.joinable ())
		thread_.detach (); // never block the server joining a wedged control thread

	stopped_.store (true);
	return finished;
}

void PluginInstance::controlLoop ()
{
	while (running_.load ())
	{
		std::vector<std::function<void ()>> batch;
		{
			std::unique_lock<std::mutex> lock (mutex_);
			if (tasks_.empty ())
				condition_.wait_for (lock, std::chrono::milliseconds (50),
				                     [this] { return !tasks_.empty () || !running_.load (); });
			batch.swap (tasks_);
		}
		for (auto& task : batch)
			task ();
	}
	stopped_.store (true);
	finishedPromise_.set_value ();
}

void PluginInstance::onWorkerDeath (const std::string& code, const std::string& message)
{
	if (impl_->closing.load ())
		return;
	if (!failed_.exchange (true))
	{
		std::lock_guard<std::mutex> lock (impl_->failureMutex);
		impl_->failureCode = code;
		impl_->failureMessage = message;
	}
	// The instance is dead but the server keeps running: end its streams, fail
	// every in-flight call and report a clear failure for later commands.
	stuck_.store (true);
	pump_.store (false);
	impl_->workerAlive.store (false);
	if (impl_->outEvent)
		SetEvent (impl_->outEvent);
	if (impl_->renderEvent)
		SetEvent (impl_->renderEvent);
	impl_->failPending (code, message);
}

std::string PluginInstance::failureCode () const
{
	std::lock_guard<std::mutex> lock (impl_->failureMutex);
	return impl_->failureCode;
}

std::string PluginInstance::failureMessage () const
{
	std::lock_guard<std::mutex> lock (impl_->failureMutex);
	return impl_->failureMessage;
}

//------------------------------------------------------------------------
LoadResult PluginInstance::doLoad (const std::string& modulePath, const std::string& classUid, double sampleRate,
                                   int blockSize, int channels, bool effect)
{
	if (loaded_.load ())
		return {false, "already loaded"};
	std::string error;
	if (!impl_->spawn (id_, blockSize, effect, error))
		return {false, error, "worker_spawn_failed"};

	Json command = makeSimpleCommand ("load");
	command.set ("modulePath", Json::makeString (modulePath));
	command.set ("classUid", Json::makeString (classUid));
	command.set ("sampleRate", Json::makeNumber (sampleRate));
	command.set ("blockSize", Json::makeNumber (double (blockSize), true));
	command.set ("channels", Json::makeNumber (double (channels), true));
	command.set ("effect", Json::makeBool (effect));

	Json response;
	if (!impl_->callWorker (command, ipc::kLoadTimeoutMs, true, response) || !response.get ("ok").asBool ())
	{
		const std::string code = response.get ("code").asStringOr ("load_failed");
		const std::string message = response.get ("message").asStringOr ("plug-in did not load");
		impl_->shutdown (ipc::kExitGraceMs); // a failed load leaves no child behind
		return {false, message, code};
	}

	const Json& value = response.get ("value");
	channels_.store (int (value.get ("channels").asInt (channels)));
	blockSize_.store (int (value.get ("blockSize").asInt (blockSize)));
	sampleRate_.store (value.get ("sampleRate").asNumber (sampleRate));
	latencySamples_.store (value.get ("latencySamples").asNumber (0.0));
	effect_.store (value.get ("effect").asBool (effect));
	inputChannels_.store (int (value.get ("inputChannels").asInt (0)));
	loaded_.store (true);
	return {true, {}};
}

bool PluginInstance::doSetProcessing (bool on)
{
	Json command = makeSimpleCommand ("setProcessing");
	command.set ("on", Json::makeBool (on));
	Json response;
	if (!impl_->callWorker (command, ipc::kCommandTimeoutMs, true, response))
		return false;
	return response.get ("ok").asBool () && response.get ("value").asBool ();
}

RenderStats PluginInstance::doRenderBlocks (int blocks)
{
	RenderStats stats;
	Json command = makeSimpleCommand ("renderBlocks");
	command.set ("blocks", Json::makeNumber (double (blocks), true));
	Json response;
	if (!impl_->callWorker (command, ipc::kRenderBlocksTimeoutMs, true, response))
		return stats;
	const Json& value = response.get ("value");
	stats.ok = value.get ("ok").asBool ();
	stats.rms = value.get ("rms").asNumber ();
	stats.peak = value.get ("peak").asNumber ();
	return stats;
}

bool PluginInstance::doNoteOn (int pitch, int velocity, int channel)
{
	Json command = makeSimpleCommand ("noteOn");
	command.set ("pitch", Json::makeNumber (double (pitch), true));
	command.set ("velocity", Json::makeNumber (double (velocity), true));
	command.set ("channel", Json::makeNumber (double (channel), true));
	Json response;
	if (!impl_->callWorker (command, ipc::kCommandTimeoutMs, true, response))
		return false;
	return response.get ("ok").asBool () && response.get ("value").asBool ();
}

bool PluginInstance::doNoteOff (int pitch, int channel)
{
	Json command = makeSimpleCommand ("noteOff");
	command.set ("pitch", Json::makeNumber (double (pitch), true));
	command.set ("channel", Json::makeNumber (double (channel), true));
	Json response;
	if (!impl_->callWorker (command, ipc::kCommandTimeoutMs, true, response))
		return false;
	return response.get ("ok").asBool () && response.get ("value").asBool ();
}

std::vector<ParamInfo> PluginInstance::doParamList ()
{
	std::vector<ParamInfo> params;
	Json response;
	if (!impl_->callWorker (makeSimpleCommand ("paramList"), ipc::kCommandTimeoutMs, true, response))
		return params;
	const Json& list = response.get ("value");
	for (size_t i = 0; i < list.size (); ++i)
	{
		const Json& item = list.at (i);
		ParamInfo param;
		param.id = uint32_t (item.get ("id").asInt ());
		param.title = item.get ("title").asString ();
		param.units = item.get ("units").asString ();
		param.min = item.get ("min").asNumber ();
		param.max = item.get ("max").asNumber (1.0);
		param.def = item.get ("def").asNumber ();
		param.value = item.get ("value").asNumber ();
		param.stepCount = int (item.get ("stepCount").asInt ());
		params.push_back (std::move (param));
	}
	return params;
}

bool PluginInstance::doParamSet (uint32_t paramId, double value)
{
	Json command = makeSimpleCommand ("paramSet");
	command.set ("paramId", Json::makeNumber (double (paramId), true));
	command.set ("value", Json::makeNumber (value));
	Json response;
	if (!impl_->callWorker (command, ipc::kCommandTimeoutMs, true, response))
		return false;
	return response.get ("ok").asBool () && response.get ("value").asBool ();
}

std::string PluginInstance::doGetState ()
{
	Json response;
	if (!impl_->callWorker (makeSimpleCommand ("getState"), ipc::kCommandTimeoutMs, true, response))
		return {};
	return response.get ("value").asString ();
}

bool PluginInstance::doSetState (const std::string& base64)
{
	Json command = makeSimpleCommand ("setState");
	command.set ("state", Json::makeString (base64));
	Json response;
	if (!impl_->callWorker (command, ipc::kCommandTimeoutMs, true, response))
		return false;
	return response.get ("ok").asBool () && response.get ("value").asBool ();
}

bool PluginInstance::doEditorOpen ()
{
	Json response;
	if (!impl_->callWorker (makeSimpleCommand ("editorOpen"), ipc::kCommandTimeoutMs, true, response))
		return false;
	return response.get ("ok").asBool () && response.get ("value").asBool ();
}

bool PluginInstance::doEditorClose ()
{
	Json response;
	if (!impl_->callWorker (makeSimpleCommand ("editorClose"), ipc::kCommandTimeoutMs, true, response))
		return false;
	return response.get ("ok").asBool () && response.get ("value").asBool ();
}

//------------------------------------------------------------------------
void PluginInstance::setPump (bool on)
{
	pump_.store (on);
	if (impl_->outEvent)
		SetEvent (impl_->outEvent); // wake /audio readers so they re-check the pump
}

std::shared_ptr<const std::vector<uint8_t>> PluginInstance::popFrame (int waitMs)
{
	std::lock_guard<std::mutex> lock (impl_->popMutex);
	return impl_->readFrame (waitMs, impl_->outView, impl_->outEvent, impl_->slotCount);
}

bool PluginInstance::queueInput (const uint8_t* data, size_t size, size_t& acceptedFrames, std::string& error)
{
	acceptedFrames = 0;
	error.clear ();
	if (!isEffect ())
	{
		error = "instance is not an effect (it has no input bus)";
		return false;
	}
	const size_t frames = countAudioInFrames (data, size, error);
	if (!error.empty ())
		return false;
	acceptedFrames = frames;
	if (frames == 0)
		return true; // an empty body is valid and queues nothing (as before)
	if (!impl_->writeInputRecord (data, size, error))
	{
		acceptedFrames = 0;
		return false;
	}
	return true;
}

std::shared_ptr<OfflineRenderState> PluginInstance::renderOffline (double seconds,
                                                                  const std::vector<OfflineNote>& notes)
{
	auto state = std::make_shared<OfflineRenderState> ();
	if (failed_.load () || !loaded_.load ())
	{
		std::lock_guard<std::mutex> lock (state->mutex);
		state->error = failed_.load () ? failureCode () : "worker_failed";
		state->finished = true;
		return state;
	}

	{
		std::lock_guard<std::mutex> lock (impl_->renderMutex);
		if (impl_->renderDrain.joinable () && impl_->renderDrainDone.load ())
			impl_->renderDrain.join ();
		if (impl_->activeRender)
		{
			// One render ring per worker: a second concurrent bounce of the same
			// instance is rejected instead of interleaving frames (the web app
			// bounces tracks sequentially).
			std::lock_guard<std::mutex> stateLock (state->mutex);
			state->error = "render_busy";
			state->finished = true;
			return state;
		}
		impl_->activeRender = state;
		impl_->renderDoneFlag.store (false);
		impl_->renderDrainDone.store (false);
		impl_->renderDrain =
		    std::thread ([this, state, seconds, notes] { impl_->drainRender (state, seconds, notes); });
	}
	return state;
}

} // namespace vhost
