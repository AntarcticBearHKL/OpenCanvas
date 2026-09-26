// Server-side proxy for one plug-in hosted in its own child process.
//
// The HTTP layer keeps its old `PluginInstance` API unchanged: every call is
// forwarded over a per-instance control pipe to `vst-host --plugin-worker <id>`,
// which owns the plug-in, its editor HWND, its audio thread and the IPC rings.
// The server process never loads a plug-in at runtime any more, so a crashed or
// hung child cannot take it down: the proxy watches the process handle (a wait,
// not polling), marks the instance `failed` with a clear code and message, ends
// its streams and leaves every other instance untouched. `--selftest` still
// runs in-process (`LocalPluginInstance`) because it is a diagnostic.
//
// No auto-restart on child death: reloading would silently drop the plug-in's
// state (a user's preset tweaks), so the client must `load` again — the
// instance stays in the map and every call answers with the failure code until
// `unload` (see `vst-host/README.md`「Worker isolation」).
#pragma once

#include "instance.h"

#include <atomic>
#include <condition_variable>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <type_traits>
#include <vector>

namespace vhost {

class PluginInstance
{
public:
	explicit PluginInstance (std::string id);
	~PluginInstance ();

	const std::string& id () const { return id_; }
	uint32_t hash () const { return hash_; }
	bool stuck () const { return stuck_.load (); }
	void markStuck () { stuck_.store (true); }

	/** True once the worker process exited or was killed by the watchdog. */
	bool failed () const { return failed_.load (); }
	/** Machine-readable failure code (`worker_failed` / `worker_timeout` / `worker_hung` / `worker_spawn_failed`). */
	std::string failureCode () const;
	/** Human-readable failure detail naming the worker pid / exit code. */
	std::string failureMessage () const;

	bool start (std::string& error);
	// Stops the control thread and the worker process. Returns false when the
	// control thread had to be detached (callers must keep the instance alive).
	bool stop (int timeoutMs);
	bool stopped () const { return stopped_.load (); }

	// Queue `fn` on the control thread. All do*() methods below must be run
	// this way (or from `controlLoop`).
	template <typename F>
	std::future<std::invoke_result_t<F>> post (F&& fn)
	{
		using R = std::invoke_result_t<F>;
		auto task = std::make_shared<std::packaged_task<R ()>> (std::forward<F> (fn));
		std::future<R> future = task->get_future ();
		{
			std::lock_guard<std::mutex> lock (mutex_);
			tasks_.emplace_back ([task] () { (*task) (); });
		}
		condition_.notify_one ();
		return future;
	}

	// ---- control-thread methods (invoke via post()) ----
	LoadResult doLoad (const std::string& modulePath, const std::string& classUid, double sampleRate,
	                   int blockSize, int channels, bool effect = false);
	bool doSetProcessing (bool on);
	RenderStats doRenderBlocks (int blocks);
	bool doNoteOn (int pitch, int velocity, int channel);
	bool doNoteOff (int pitch, int channel);
	std::vector<ParamInfo> doParamList ();
	bool doParamSet (uint32_t paramId, double value);
	std::string doGetState ();
	bool doSetState (const std::string& base64);
	bool doEditorOpen ();
	bool doEditorClose ();

	// ---- called from other threads ----
	void setPump (bool on);
	bool pumpOn () const { return pump_.load (); }
	std::shared_ptr<const std::vector<uint8_t>> popFrame (int waitMs);

	// ---- effect input (called from other threads) ----
	bool isEffect () const { return loaded_.load () && effect_.load (); }
	int inputChannels () const { return effect_.load () ? inputChannels_.load () : 0; }
	/**
	 * Validates a `/audio-in` body exactly like the in-process instance, then
	 * appends it to the child's input ring. Bounded and drop-oldest on the child
	 * side, so the render thread never blocks on the control plane.
	 */
	bool queueInput (const uint8_t* data, size_t size, size_t& acceptedFrames, std::string& error);

	std::shared_ptr<OfflineRenderState> renderOffline (double seconds, const std::vector<OfflineNote>& notes);

	// Configuration reported by the worker's `load` response; valid once doLoad()
	// has returned (read from the caller thread after awaiting the future).
	double latencySamples () const { return latencySamples_.load (); }
	int channels () const { return channels_.load (); }
	int blockSize () const { return blockSize_.load (); }
	double sampleRate () const { return sampleRate_.load (); }

private:
	void controlLoop ();
	void onWorkerDeath (const std::string& code, const std::string& message);

	std::string id_;
	uint32_t hash_ {0};

	std::atomic<bool> stuck_ {false};
	std::atomic<bool> failed_ {false};
	std::atomic<bool> stopped_ {false};
	std::atomic<bool> running_ {false};
	std::atomic<bool> pump_ {false};
	std::atomic<bool> loaded_ {false};
	std::atomic<bool> effect_ {false};
	std::atomic<int> channels_ {0};
	std::atomic<int> blockSize_ {0};
	std::atomic<double> sampleRate_ {0.0};
	std::atomic<double> latencySamples_ {0.0};
	std::atomic<int> inputChannels_ {0};

	std::thread thread_;
	std::mutex mutex_;
	std::condition_variable condition_;
	std::vector<std::function<void ()>> tasks_;
	std::promise<void> finishedPromise_;
	std::future<void> finished_;

	struct Impl;
	std::unique_ptr<Impl> impl_;
};

/**
 * Child side of `vst-host --plugin-worker <id> ...` (internal): hosts exactly one
 * plug-in instance in this process and serves the parent's control pipe.
 */
int runPluginWorkerMode (const std::vector<std::string>& args);

} // namespace vhost
