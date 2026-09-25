// One loaded VST3 plug-in instance.
//
// Threading contract (this is what keeps the control plane alive):
//   * Every plug-in call runs on the instance's own worker thread. `post()`
//     queues a task there and returns a future; callers apply their own
//     per-call timeout and report `plugin_hang` when the worker does not
//     answer in time.
//   * Audio is produced by that same worker thread (paced at blockSize/
//     sampleRate) and handed to HTTP streaming threads through `popFrame()`;
//     HTTP threads only copy bytes, they never touch the plug-in.
//   * A hung plug-in therefore blocks only its own instance. `stop()` uses a
//     timeout and can detach, so the server can drop an unresponsive instance
//     without joining a stuck thread.
//
// The VST3 SDK types are hidden behind Impl so this header (and the HTTP
// layer) stays SDK-free. A per-instance child process backend can later
// replace `post`/`popFrame` without touching the server.
#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <type_traits>
#include <vector>

namespace vhost {

struct LoadResult
{
	bool ok {false};
	std::string error;
};

struct RenderStats
{
	bool ok {false};
	double rms {0.0};
	double peak {0.0};
};

struct ParamInfo
{
	uint32_t id {0};
	std::string title;
	std::string units;
	double min {0.0};
	double max {1.0};
	double def {0.0};
	double value {0.0};
	int stepCount {0};
};

// Set the process-wide IHostApplication context. Call once at startup.
void initHostApplication ();

class PluginInstance
{
public:
	explicit PluginInstance (std::string id);
	~PluginInstance ();

	const std::string& id () const { return id_; }
	uint32_t hash () const { return hash_; }
	bool stuck () const { return stuck_.load (); }
	void markStuck () { stuck_.store (true); }

	bool start (std::string& error);
	// Stops and joins within `timeoutMs`; returns false if the worker was
	// detached (hung). Callers must then leak the instance rather than destroy it.
	bool stop (int timeoutMs);
	bool stopped () const { return stopped_.load (); }

	// Queue `fn` on the instance thread. All do*() methods below must be run
	// this way (or from `run()`).
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

	// ---- instance-thread methods (invoke via post()) ----
	LoadResult doLoad (const std::string& modulePath, const std::string& classUid, double sampleRate,
	                   int blockSize, int channels);
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

	// ---- called from the instance thread only ----
	void onGuiParamEdit (uint32_t paramId, double value);
	void resizeEditorWindow (int width, int height);

	// Valid once doLoad() has returned. Read from the caller thread only after
	// awaiting the load future (which establishes the happens-before edge).
	double latencySamples () const;
	int channels () const;
	int blockSize () const;
	double sampleRate () const;

private:
	void run ();
	void pumpWin32 ();
	void destroyEditorOnThread ();
	void processOneBlock (bool emitFrame);
	void teardownPlugin ();

	std::string id_;
	uint32_t hash_ {0};

	std::atomic<bool> running_ {false};
	std::atomic<bool> stopped_ {false};
	std::atomic<bool> stuck_ {false};
	std::atomic<bool> pump_ {false};
	std::atomic<bool> editorOpen_ {false};

	std::thread thread_;
	std::mutex mutex_;
	std::condition_variable condition_;
	std::vector<std::function<void ()>> tasks_;
	std::promise<void> finishedPromise_;
	std::future<void> finished_;

	std::mutex queueMutex_;
	std::condition_variable queueCondition_;
	std::deque<std::shared_ptr<const std::vector<uint8_t>>> frameQueue_;

	struct Impl;
	std::unique_ptr<Impl> impl_;
};

} // namespace vhost
