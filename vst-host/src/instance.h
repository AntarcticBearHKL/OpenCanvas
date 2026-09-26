// One loaded VST3 plug-in instance, hosted in the current process.
//
// This is the implementation the per-instance worker child (`--plugin-worker`)
// and `--selftest` use; the HTTP server talks to the proxy in worker.h, which
// forwards to a child running this class. A crash or a hang here therefore
// stays inside the child.
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
// layer) stays SDK-free.
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
	/** Machine-readable failure code (e.g. `no_effect_class`); empty means the generic `load_failed`. */
	std::string code;
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

/** One note of an offline render request; times are seconds from the render start. */
struct OfflineNote
{
	int pitch {60};
	int velocity {100};
	double start {0.0};
	double length {0.0};
};

/**
 * Shared state of one in-flight `/render`: the instance thread renders blocks into `frames`,
 * an HTTP thread drains them into the response. `cancelled` is set when the client goes away so
 * the renderer stops instead of filling a queue nobody reads.
 */
struct OfflineRenderState
{
	std::mutex mutex;
	std::condition_variable condition;
	std::deque<std::shared_ptr<const std::vector<uint8_t>>> frames;
	std::string error;
	double latencySamples {0.0};
	uint32_t channels {0};
	uint32_t framesPerBlock {0};
	bool finished {false};
	bool cancelled {false};
};

/** HTTP-thread side: wait for a first block or an immediate failure (never both: a failure has no frames). */
bool waitRenderStart (const std::shared_ptr<OfflineRenderState>& state, std::string& error, int timeoutMs);
/** HTTP-thread side: pop one rendered frame, waiting up to `waitMs`. False = finished, cancelled or stalled. */
bool popRenderFrame (const std::shared_ptr<OfflineRenderState>& state, std::shared_ptr<const std::vector<uint8_t>>& frame, int waitMs);
/** HTTP-thread side: tell the renderer to stop (client disconnected or the response ended early). */
void cancelRender (const std::shared_ptr<OfflineRenderState>& state);

/**
 * Validate a run of `/audio` frames (`POST /audio-in` body). Returns the number of whole
 * frames (0 for an empty body) or 0 with `error` set to the same message the instance has
 * always reported (truncated header/body, malformed header, more than 64 frames). The
 * worker proxy uses it so a bad body is rejected before it reaches the child's ring.
 */
size_t countAudioInFrames (const uint8_t* data, size_t size, std::string& error);

// Set the process-wide IHostApplication context. Call once at startup.
void initHostApplication ();

class LocalPluginInstance
{
public:
	explicit LocalPluginInstance (std::string id);
	~LocalPluginInstance ();

	const std::string& id () const { return id_; }
	uint32_t hash () const { return hash_; }
	bool stuck () const { return stuck_.load (); }
	void markStuck () { stuck_.store (true); }

	bool start (std::string& error);
	// Stops and joins within `timeoutMs`; returns false if the worker was
	// detached (hung). Callers must then leak the instance rather than destroy it.
	bool stop (int timeoutMs);
	bool stopped () const { return stopped_.load (); }

	// Runs the instance loop on the CALLING thread and blocks until stop(). The worker
	// child uses this so plug-in calls run on the process main thread (the VST3 rule);
	// `start()` keeps the self-test path, which owns its own thread.
	void runOnCurrentThread ();

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
	// `effect` selects the Audio Module Class whose subCategories contain "Fx" and activates input bus 0;
	// the default keeps the instrument path unchanged (input buses deactivated, zero-input process block).
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
	/** True for an effect instance: input bus 0 is active and the process block reads queued input. */
	bool isEffect () const;
	int inputChannels () const;
	/**
	 * Feed one `POST /audio-in` body into the instance input queue. The body is the `/audio` frame format
	 * (16-byte LE header + planar Float32) and may concatenate whole frames; frames are re-blocked to the
	 * instance block size. Rejects malformed input before appending anything. Queued blocks are bounded
	 * (dropped oldest) and consumed one per rendered block; an empty queue renders silence.
	 */
	bool queueInput (const uint8_t* data, size_t size, size_t& acceptedFrames, std::string& error);

	// Queues an offline render on the instance thread and returns the state the HTTP thread streams
	// from. The plug-in keeps its loaded configuration; notes are absolute seconds. Runs in the
	// plug-in's offline process mode when nothing else is streaming.
	std::shared_ptr<OfflineRenderState> renderOffline (double seconds, const std::vector<OfflineNote>& notes);

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
	void processOneBlock (bool emitFrame, OfflineRenderState* renderTarget = nullptr);
	void doRenderOffline (const std::shared_ptr<OfflineRenderState>& state, double seconds, std::vector<OfflineNote> notes);
	bool applyProcessMode (bool offline);
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
