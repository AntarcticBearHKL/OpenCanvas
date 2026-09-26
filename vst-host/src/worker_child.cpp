// Child side of the per-instance worker split: `vst-host --plugin-worker <id>`.
//
// This process hosts exactly ONE plug-in through the unchanged in-process
// `LocalPluginInstance` (editor HWND + message loop, offline render, input queue)
// and serves the parent's control pipe. Audio moves through the shared-memory
// rings (worker_ipc.h); the pipe only carries JSON. The plug-in loop runs on the
// MAIN thread (VST3 requires plug-in creation on the process main/UI thread) and the
// pipe is served by a helper thread, so pings and render cancels are still answered
// while a plug-in call is in flight.

#include "worker.h"

#include "json.h"
#include "util.h"
#include "worker_ipc.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <windows.h>

namespace vhost {
namespace {

struct ChildConfig
{
	std::string id;
	std::string pipeName;
	std::string outMap;
	std::string renderMap;
	std::string inMap;
	uintptr_t outEvent {0};
	uintptr_t renderEvent {0};
	uintptr_t inEvent {0};
	uintptr_t inMutex {0};
	uint32_t slotBytes {0};
	uint32_t slotCount {0};
	uint32_t renderSlots {0};
	uint32_t inCapacity {0};
	bool hasInput {false};
};

struct WorkerState
{
	ChildConfig config;
	HANDLE pipe {nullptr};
	HANDLE outEvent {nullptr};
	HANDLE renderEvent {nullptr};
	HANDLE inEvent {nullptr};
	HANDLE inMutex {nullptr};
	void* outView {nullptr};
	void* renderView {nullptr};
	void* inView {nullptr};
	ipc::FrameRingHeader* outHeader {nullptr};
	ipc::FrameRingHeader* renderHeader {nullptr};
	ipc::ByteRingHeader* inHeader {nullptr};

	std::unique_ptr<LocalPluginInstance> instance;
	std::atomic<bool> running {true};
	std::thread audioPump;

	std::atomic<bool> inputRunning {false};
	std::thread inputThread;

	std::mutex writeMutex;

	std::mutex renderMutex;
	std::shared_ptr<OfflineRenderState> renderState;
	std::atomic<bool> renderActive {false};
	std::thread renderPump;
};

bool parseArgs (const std::vector<std::string>& args, ChildConfig& config, std::string& error)
{
	if (args.size () < 2)
	{
		error = "missing worker id";
		return false;
	}
	config.id = args[1];
	for (size_t i = 2; i + 1 < args.size (); i += 2)
	{
		const std::string& flag = args[i];
		const std::string& value = args[i + 1];
		if (flag == "--pipe")
			config.pipeName = value;
		else if (flag == "--out-map")
			config.outMap = value;
		else if (flag == "--render-map")
			config.renderMap = value;
		else if (flag == "--in-map")
		{
			config.inMap = value;
			config.hasInput = true;
		}
		else if (flag == "--slot-bytes")
			config.slotBytes = uint32_t (std::strtoul (value.c_str (), nullptr, 10));
		else if (flag == "--slot-count")
			config.slotCount = uint32_t (std::strtoul (value.c_str (), nullptr, 10));
		else if (flag == "--render-slots")
			config.renderSlots = uint32_t (std::strtoul (value.c_str (), nullptr, 10));
		else if (flag == "--in-capacity")
			config.inCapacity = uint32_t (std::strtoul (value.c_str (), nullptr, 10));
		else if (flag == "--event-out")
			config.outEvent = uintptr_t (std::strtoull (value.c_str (), nullptr, 10));
		else if (flag == "--event-render")
			config.renderEvent = uintptr_t (std::strtoull (value.c_str (), nullptr, 10));
		else if (flag == "--event-in")
			config.inEvent = uintptr_t (std::strtoull (value.c_str (), nullptr, 10));
		else if (flag == "--in-mutex")
			config.inMutex = uintptr_t (std::strtoull (value.c_str (), nullptr, 10));
		else
		{
			error = "unknown flag " + flag;
			return false;
		}
	}
	if (config.pipeName.empty () || config.outMap.empty () || config.renderMap.empty () || config.slotBytes == 0 ||
	    config.slotCount == 0 || config.renderSlots == 0 || config.outEvent == 0 || config.renderEvent == 0)
	{
		error = "missing worker flags";
		return false;
	}
	if (config.hasInput && (config.inCapacity == 0 || config.inEvent == 0 || config.inMutex == 0))
	{
		error = "incomplete input ring flags";
		return false;
	}
	return true;
}

bool writeJson (WorkerState& state, const Json& message)
{
	std::lock_guard<std::mutex> lock (state.writeMutex);
	const bool ok = ipc::pipeWriteFrame (state.pipe, message.dump ());
	ipc::traceStep (ok ? "C write ok" : "C write FAIL");
	return ok;
}

void respond (WorkerState& state, uint64_t seq, const Json& value, bool ok, const std::string& code,
              const std::string& error)
{
	Json message = Json::makeObject ();
	message.set ("seq", Json::makeNumber (double (seq), true));
	message.set ("ok", Json::makeBool (ok));
	if (ok)
		message.set ("value", value);
	else
	{
		message.set ("code", Json::makeString (code.empty () ? "worker_error" : code));
		message.set ("message", Json::makeString (error));
	}
	writeJson (state, message);
}

bool publishFrame (WorkerState& state, ipc::FrameRingHeader* header, void* view, uint32_t slotBytes,
                   uint32_t slotCount, HANDLE signal, const std::vector<uint8_t>& frame, bool dropOldest,
                   const std::function<bool ()>& canWait)
{
	const uint32_t size = uint32_t (frame.size ());
	if (size + ipc::kSlotHeaderBytes > slotBytes)
		return false;
	const long long write = ipc::ringRead (&header->writeSeq);
	if (dropOldest)
	{
		// Realtime audio: never block the render thread; a slow reader loses the
		// oldest frames (the frame header's seq lets the client detect the gap).
		for (;;)
		{
			const long long read = ipc::ringRead (&header->readSeq);
			if (write - read < long long (slotCount))
				break;
			ipc::ringBump (&header->readSeq);
			ipc::ringBump (&header->dropped);
		}
	}
	else
	{
		// Offline bounce: every block must arrive, so wait for the parent to
		// drain (aborting when the render was cancelled or the parent left).
		for (;;)
		{
			const long long read = ipc::ringRead (&header->readSeq);
			if (write - read < long long (slotCount))
				break;
			if (canWait && !canWait ())
				return false;
			Sleep (ipc::kWaitSliceMs);
		}
	}
	uint8_t* slot = ipc::frameSlot (view, slotBytes, slotCount, write);
	std::memcpy (slot, &size, ipc::kSlotHeaderBytes);
	std::memcpy (slot + ipc::kSlotHeaderBytes, frame.data (), size);
	ipc::ringBump (&header->writeSeq);
	if (signal)
		SetEvent (signal);
	return true;
}

void audioPump (WorkerState& state)
{
	while (state.running.load ())
	{
		auto frame = state.instance->popFrame (100);
		if (!frame || frame->empty () || !state.outHeader)
			continue;
		publishFrame (state, state.outHeader, state.outView, state.config.slotBytes, state.config.slotCount,
		              state.outEvent, *frame, true, nullptr);
	}
}

void inputPump (WorkerState& state)
{
	while (state.inputRunning.load ())
	{
		WaitForSingleObject (state.inEvent, 20);
		for (;;)
		{
			std::vector<uint8_t> record;
			const DWORD wait = WaitForSingleObject (state.inMutex, 20);
			if (wait != WAIT_OBJECT_0 && wait != WAIT_ABANDONED)
				break;
			bool have = false;
			const long long write = ipc::ringRead (&state.inHeader->writeBytes);
			const long long read = ipc::ringRead (&state.inHeader->readBytes);
			if (read < write)
			{
				uint32_t length = 0;
				ipc::byteRingCopyOut (state.inView, state.config.inCapacity, read, &length, 4);
				if (length <= state.config.inCapacity && read + 4 + long long (length) <= write)
				{
					record.resize (length);
					if (length > 0)
						ipc::byteRingCopyOut (state.inView, state.config.inCapacity, read + 4, record.data (),
						                      length);
					state.inHeader->readBytes = read + 4 + length;
					have = true;
				}
				else
					state.inHeader->readBytes = write; // corrupt record: resync to the writer
			}
			ReleaseMutex (state.inMutex);
			if (!have)
				break;
			size_t accepted = 0;
			std::string error;
			state.instance->queueInput (record.data (), record.size (), accepted, error);
			if (!error.empty ())
				std::fprintf (stderr, "[worker %s] audio-in dropped: %s\n", state.config.id.c_str (),
				              error.c_str ());
		}
	}
}

void startInput (WorkerState& state)
{
	if (state.inputThread.joinable () || !state.inView || !state.inMutex)
		return;
	state.inputRunning.store (true);
	state.inputThread = std::thread (&inputPump, std::ref (state));
}

void stopInput (WorkerState& state)
{
	if (!state.inputRunning.exchange (false))
		return;
	if (state.inEvent)
		SetEvent (state.inEvent);
	if (state.inputThread.joinable ())
		state.inputThread.join ();
}

void renderPump (WorkerState& state, std::shared_ptr<OfflineRenderState> render)
{
	auto canWait = [&render] {
		std::lock_guard<std::mutex> lock (render->mutex);
		return !render->cancelled;
	};
	for (;;)
	{
		std::shared_ptr<const std::vector<uint8_t>> frame;
		if (popRenderFrame (render, frame, 100))
		{
			publishFrame (state, state.renderHeader, state.renderView, state.config.slotBytes,
			              state.config.renderSlots, state.renderEvent, *frame, false, canWait);
			continue;
		}
		std::lock_guard<std::mutex> lock (render->mutex);
		if (render->cancelled || (render->finished && render->frames.empty ()))
			break;
	}

	bool ok = true;
	std::string error;
	{
		std::lock_guard<std::mutex> lock (render->mutex);
		ok = render->error.empty ();
		error = render->error;
	}
	Json event = Json::makeObject ();
	event.set ("event", Json::makeString ("renderDone"));
	event.set ("ok", Json::makeBool (ok));
	event.set ("error", Json::makeString (error));
	// Clear the slot before the parent is told: a render that starts the instant
	// the parent's drain finishes must not be rejected as `render_busy`.
	state.renderActive.store (false);
	writeJson (state, event);
}

void cancelActiveRender (WorkerState& state)
{
	std::shared_ptr<OfflineRenderState> render;
	{
		std::lock_guard<std::mutex> lock (state.renderMutex);
		render = state.renderState;
	}
	if (render)
		cancelRender (render);
}

bool runCommand (WorkerState& state, const std::string& command, const Json& message, Json& value,
                 std::string& code, std::string& error)
{
	LocalPluginInstance& instance = *state.instance;

	if (command == "load")
	{
		LoadResult result = instance.doLoad (
		    message.get ("modulePath").asString (), message.get ("classUid").asString (),
		    message.get ("sampleRate").asNumber (48000.0), int (message.get ("blockSize").asInt (256)),
		    int (message.get ("channels").asInt (2)), message.get ("effect").asBool ());
		if (!result.ok)
		{
			code = result.code.empty () ? "load_failed" : result.code;
			error = result.error;
			return false;
		}
		Json config = Json::makeObject ();
		config.set ("channels", Json::makeNumber (double (instance.channels ()), true));
		config.set ("blockSize", Json::makeNumber (double (instance.blockSize ()), true));
		config.set ("sampleRate", Json::makeNumber (instance.sampleRate ()));
		config.set ("latencySamples", Json::makeNumber (instance.latencySamples ()));
		config.set ("effect", Json::makeBool (instance.isEffect ()));
		config.set ("inputChannels", Json::makeNumber (double (instance.inputChannels ()), true));
		value = std::move (config);
		if (instance.isEffect ())
			startInput (state);
		return true;
	}

	if (command == "setProcessing")
	{
		const bool on = message.get ("on").asBool ();
		const bool result = instance.doSetProcessing (on);
		if (result)
			instance.setPump (on);
		value = Json::makeBool (result);
		return true;
	}

	if (command == "noteOn")
	{
		value = Json::makeBool (instance.doNoteOn (int (message.get ("pitch").asInt ()),
		                                           int (message.get ("velocity").asInt (100)),
		                                           int (message.get ("channel").asInt (0))));
		return true;
	}
	if (command == "noteOff")
	{
		value = Json::makeBool (instance.doNoteOff (int (message.get ("pitch").asInt ()),
		                                            int (message.get ("channel").asInt (0))));
		return true;
	}
	if (command == "paramList")
	{
		Json list = Json::makeArray ();
		for (const ParamInfo& param : instance.doParamList ())
		{
			Json item = Json::makeObject ();
			item.set ("id", Json::makeNumber (double (param.id), true));
			item.set ("title", Json::makeString (param.title));
			item.set ("units", Json::makeString (param.units));
			item.set ("min", Json::makeNumber (param.min));
			item.set ("max", Json::makeNumber (param.max));
			item.set ("def", Json::makeNumber (param.def));
			item.set ("value", Json::makeNumber (param.value));
			item.set ("stepCount", Json::makeNumber (double (param.stepCount), true));
			list.push (std::move (item));
		}
		value = std::move (list);
		return true;
	}
	if (command == "paramSet")
	{
		value = Json::makeBool (instance.doParamSet (uint32_t (message.get ("paramId").asInt ()),
		                                             message.get ("value").asNumber ()));
		return true;
	}
	if (command == "getState")
	{
		value = Json::makeString (instance.doGetState ());
		return true;
	}
	if (command == "setState")
	{
		value = Json::makeBool (instance.doSetState (message.get ("state").asString ()));
		return true;
	}
	if (command == "editorOpen")
	{
		value = Json::makeBool (instance.doEditorOpen ());
		return true;
	}
	if (command == "editorClose")
	{
		value = Json::makeBool (instance.doEditorClose ());
		return true;
	}
	if (command == "renderBlocks")
	{
		RenderStats stats = instance.doRenderBlocks (int (message.get ("blocks").asInt ()));
		Json result = Json::makeObject ();
		result.set ("ok", Json::makeBool (stats.ok));
		result.set ("rms", Json::makeNumber (stats.rms));
		result.set ("peak", Json::makeNumber (stats.peak));
		value = std::move (result);
		return true;
	}
	if (command == "renderOffline")
	{
		if (state.renderActive.load ())
		{
			code = "render_busy";
			error = "a render is already in flight for this instance";
			return false;
		}
		std::vector<OfflineNote> notes;
		const Json& list = message.get ("notes");
		for (size_t i = 0; i < list.size (); ++i)
		{
			const Json& item = list.at (i);
			OfflineNote note;
			note.pitch = int (item.get ("pitch").asInt (60));
			note.velocity = int (item.get ("velocity").asInt (100));
			note.start = item.get ("start").asNumber ();
			note.length = item.get ("length").asNumber ();
			notes.push_back (note);
		}
		// renderMutex serializes the pump thread's creation (here) with its join
		// (unload, on the control thread); the pump itself never takes it.
		std::lock_guard<std::mutex> lock (state.renderMutex);
		if (state.renderActive.load ())
		{
			code = "render_busy";
			error = "a render is already in flight for this instance";
			return false;
		}
		if (state.renderPump.joinable ())
			state.renderPump.join (); // the previous pump has finished
		auto render = instance.renderOffline (message.get ("seconds").asNumber (), notes);
		state.renderState = render;
		state.renderActive.store (true);
		state.renderPump = std::thread (&renderPump, std::ref (state), render);
		value = Json::makeObject ();
		return true;
	}

	code = "unknown_command";
	error = "unknown command: " + command;
	return false;
}

void dispatchToInstance (WorkerState& state, uint64_t seq, const std::string& command, const Json& message)
{
	// The control thread never blocks on the instance thread: each command runs
	// there and writes its own response (routed by `seq` on the parent side). A
	// throwing command must still answer, or the parent stalls until its timeout.
	state.instance->post ([&state, seq, command, message] {
		Json value;
		std::string code;
		std::string error;
		bool ok = false;
		try
		{
			ok = runCommand (state, command, message, value, code, error);
		}
		catch (const std::exception& e)
		{
			code = "worker_error";
			error = e.what ();
		}
		catch (...)
		{
			code = "worker_error";
			error = "unhandled exception in worker command";
		}
		respond (state, seq, value, ok, code, error);
	});
}

void serveCommands (WorkerState& state)
{
	for (;;)
	{
		ipc::traceStep ("C serve read");
		std::string payload;
		if (!ipc::pipeReadFrame (state.pipe, payload))
			break; // the parent went away (or shut us down): exit, the job cleans up
		ipc::traceStep ("C serve got");

		Json message;
		std::string parseError;
		if (!Json::parse (payload, message, parseError))
		{
			std::fprintf (stderr, "[worker %s] dropping malformed control frame: %s\n", state.config.id.c_str (),
			              parseError.c_str ());
			continue;
		}

		const uint64_t seq = uint64_t (message.get ("seq").asInt ());
		const std::string command = message.get ("cmd").asStringOr ("");

		if (command == "ping")
		{
			respond (state, seq, Json::makeObject (), true, "", "");
			continue;
		}
		if (command == "renderCancel")
		{
			cancelActiveRender (state);
			respond (state, seq, Json::makeObject (), true, "", "");
			continue;
		}
		if (command == "unload")
		{
			respond (state, seq, Json::makeObject (), true, "", "");
			FlushFileBuffers (state.pipe);
			break;
		}
		dispatchToInstance (state, seq, command, message);
	}

	// Exit path (also reached by `unload`): stop the pumps first so nothing touches the
	// plug-in during teardown, then stop the instance loop so the main thread's
	// runOnCurrentThread() returns and the process can exit.
	state.running.store (false);
	stopInput (state);
	cancelActiveRender (state);
	{
		std::lock_guard<std::mutex> lock (state.renderMutex);
		if (state.renderPump.joinable ())
			state.renderPump.join ();
	}
	if (state.audioPump.joinable ())
		state.audioPump.join ();
	state.instance->stop (3000);
}

HANDLE openMapping (const std::string& name)
{
	return OpenFileMappingW (FILE_MAP_ALL_ACCESS, FALSE, utf8ToWide (name).c_str ());
}

} // namespace

int runPluginWorkerMode (const std::vector<std::string>& args)
{
	ChildConfig config;
	std::string error;
	if (!parseArgs (args, config, error))
	{
		std::fprintf (stderr, "[worker] %s\n", error.c_str ());
		return 2;
	}

	WorkerState state;
	state.config = config;
	state.pipe = CreateFileW (utf8ToWide (config.pipeName).c_str (), GENERIC_READ | GENERIC_WRITE, 0, nullptr,
	                          OPEN_EXISTING, 0, nullptr);
	if (state.pipe == INVALID_HANDLE_VALUE)
	{
		state.pipe = nullptr;
		std::fprintf (stderr, "[worker %s] could not open the control pipe (%lu)\n", config.id.c_str (),
		              GetLastError ());
		return 2;
	}

	state.outEvent = HANDLE (config.outEvent);
	state.renderEvent = HANDLE (config.renderEvent);
	if (config.hasInput)
	{
		state.inEvent = HANDLE (config.inEvent);
		state.inMutex = HANDLE (config.inMutex);
	}

	HANDLE outMapping = openMapping (config.outMap);
	HANDLE renderMapping = openMapping (config.renderMap);
	HANDLE inMapping = config.hasInput ? openMapping (config.inMap) : nullptr;
	if (!outMapping || !renderMapping || (config.hasInput && !inMapping))
	{
		std::fprintf (stderr, "[worker %s] could not open the audio rings (%lu)\n", config.id.c_str (),
		              GetLastError ());
		return 2;
	}
	state.outView = MapViewOfFile (outMapping, FILE_MAP_ALL_ACCESS, 0, 0, 0);
	state.renderView = MapViewOfFile (renderMapping, FILE_MAP_ALL_ACCESS, 0, 0, 0);
	if (config.hasInput)
		state.inView = MapViewOfFile (inMapping, FILE_MAP_ALL_ACCESS, 0, 0, 0);
	if (!state.outView || !state.renderView || (config.hasInput && !state.inView))
	{
		std::fprintf (stderr, "[worker %s] could not map the audio rings (%lu)\n", config.id.c_str (),
		              GetLastError ());
		return 2;
	}
	state.outHeader = ipc::frameHeader (state.outView);
	state.renderHeader = ipc::frameHeader (state.renderView);
	if (config.hasInput)
		state.inHeader = ipc::byteHeader (state.inView);
	ipc::aliveWrite (&state.outHeader->producerAlive, 1);
	ipc::aliveWrite (&state.renderHeader->producerAlive, 1);
	if (state.inHeader)
		ipc::aliveWrite (&state.inHeader->producerAlive, 1);

	state.instance = std::make_unique<LocalPluginInstance> (config.id);

	// The plug-in loop runs on THIS (main) thread: VST3 requires plug-in creation on the
	// process main/UI thread, and the main thread must not sit in a blocking pipe read
	// while a plug-in call is in flight (that deadlocked Retrologue's init). The control
	// pipe is served by a helper thread instead.
	std::thread control (&serveCommands, std::ref (state));
	state.audioPump = std::thread (&audioPump, std::ref (state));

	state.instance->runOnCurrentThread (); // returns once serveCommands stops the instance

	// Exit path: stop the pumps and tear the plug-in down (the unload path
	// already did most of this; every step is idempotent).
	state.running.store (false);
	stopInput (state);
	cancelActiveRender (state);
	{
		std::lock_guard<std::mutex> lock (state.renderMutex);
		if (state.renderPump.joinable ())
			state.renderPump.join ();
	}
	if (state.audioPump.joinable ())
		state.audioPump.join ();
	if (control.joinable ())
		control.join ();
	state.instance->stop (2000);
	ipc::aliveWrite (&state.outHeader->producerAlive, 0);
	ipc::aliveWrite (&state.renderHeader->producerAlive, 0);
	if (state.inHeader)
		ipc::aliveWrite (&state.inHeader->producerAlive, 0);
	return 0;
}

} // namespace vhost
