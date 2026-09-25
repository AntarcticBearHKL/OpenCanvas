// VST3 plug-in instance: module/component/controller setup, audio rendering,
// note and parameter handling, native editor attach and state save/load.
//
// Logic (module load, factory scan, PlugProvider, IHostApplication /
// IComponentHandler / IPlugFrame, Win32 HWND editor attach + message pump,
// process()) is adapted from the Phase-0 reference probe
// public.sdk/samples/vst-hosting/vst3probe and the SDK's editorhost, but
// restructured around a single long-lived per-instance worker thread.

#include "instance.h"

#include "util.h"

#include "public.sdk/source/common/memorystream.h"
#include "public.sdk/source/vst/hosting/eventlist.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/parameterchanges.h"
#include "public.sdk/source/vst/hosting/plugprovider.h"
#include "public.sdk/source/vst/utility/stringconvert.h"
#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <mutex>

#include <windows.h>
#include <ole2.h>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")

using namespace Steinberg;
using namespace Steinberg::Vst;
using VST3::Hosting::ClassInfo;
using VST3::Hosting::Module;
using Clock = std::chrono::steady_clock;

namespace vhost {
namespace {

constexpr size_t kMaxQueuedFrames = 48; // ~256 ms of audio at 48 kHz/256
constexpr size_t kMaxPendingEvents = 1024;
constexpr size_t kMaxPendingParams = 512;

Steinberg::Vst::HostApplication& hostApp ()
{
	static Steinberg::Vst::HostApplication app;
	return app;
}

//------------------------------------------------------------------------
struct EditorWindow
{
	HWND hwnd {nullptr};
	IPlugView* view {nullptr};
	bool onSizeSent {false};
	ViewRect lastSize {};
};

void resizeHostWindow (HWND hwnd, int width, int height)
{
	if (!hwnd || width <= 0 || height <= 0)
		return;
	RECT rect {0, 0, width, height};
	auto style = DWORD (GetWindowLongPtrW (hwnd, GWL_STYLE));
	auto exStyle = DWORD (GetWindowLongPtrW (hwnd, GWL_EXSTYLE));
	AdjustWindowRectEx (&rect, style, FALSE, exStyle);
	SetWindowPos (hwnd, nullptr, 0, 0, rect.right - rect.left, rect.bottom - rect.top,
	              SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
}

bool rectsEqual (const ViewRect& a, const ViewRect& b)
{
	return a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom;
}

const wchar_t* kEditorWindowClass = L"VstHostEditorWnd";
std::once_flag g_editorClassOnce;

LRESULT CALLBACK editorWndProc (HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
	auto* window = reinterpret_cast<EditorWindow*> (GetWindowLongPtrW (hwnd, GWLP_USERDATA));
	switch (msg)
	{
		case WM_ERASEBKGND: return 1;
		case WM_PAINT:
		{
			PAINTSTRUCT ps {};
			BeginPaint (hwnd, &ps);
			EndPaint (hwnd, &ps);
			return 0;
		}
		case WM_SIZE:
			if (window && window->view)
			{
				ViewRect r {0, 0, (int32)LOWORD (lParam), (int32)HIWORD (lParam)};
				window->view->onSize (&r);
			}
			return 0;
		case WM_CLOSE:
			return 0; // the host decides when to close
		default: break;
	}
	return DefWindowProcW (hwnd, msg, wParam, lParam);
}

void ensureEditorWindowClass ()
{
	std::call_once (g_editorClassOnce, [] {
		WNDCLASSEXW wc {};
		wc.cbSize = sizeof (wc);
		wc.style = CS_DBLCLKS;
		wc.lpfnWndProc = editorWndProc;
		wc.hInstance = GetModuleHandleW (nullptr);
		wc.hCursor = LoadCursorW (nullptr, reinterpret_cast<LPCWSTR> (IDC_ARROW));
		wc.lpszClassName = kEditorWindowClass;
		RegisterClassExW (&wc);
	});
}

//------------------------------------------------------------------------
// Minimal IPlugFrame (cribbed from editorhost's WindowController).
//------------------------------------------------------------------------
class InstancePlugFrame : public IPlugFrame
{
public:
	explicit InstancePlugFrame (PluginInstance* instance) : instance_ (instance) {}

	tresult PLUGIN_API resizeView (IPlugView* view, ViewRect* newSize) override
	{
		if (!view || !newSize)
			return kInvalidArgument;
		int width = newSize->right - newSize->left;
		int height = newSize->bottom - newSize->top;
		if (width > 0 && height > 0 && hwnd)
			instance_->resizeEditorWindow (width, height);
		ViewRect current {};
		if (view->getSize (&current) == kResultTrue && !rectsEqual (current, *newSize))
			view->onSize (newSize);
		return kResultTrue;
	}

	tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
	{
		if (!obj)
			return kInvalidArgument;
		if (FUnknownPrivate::iidEqual (iid, IPlugFrame::iid) || FUnknownPrivate::iidEqual (iid, FUnknown::iid))
		{
			*obj = this;
			addRef ();
			return kResultTrue;
		}
		*obj = nullptr;
		return kNoInterface;
	}
	uint32 PLUGIN_API addRef () override { return 1000; }
	uint32 PLUGIN_API release () override { return 1000; }

	HWND hwnd {nullptr};

private:
	PluginInstance* instance_;
};

//------------------------------------------------------------------------
// Minimal IComponentHandler. performEdit only records the change; the queued
// value is applied on the next process block instead of calling back into the
// controller (avoids re-entrancy while the plug-in's own UI is dispatching).
//------------------------------------------------------------------------
class InstanceComponentHandler : public IComponentHandler
{
public:
	explicit InstanceComponentHandler (PluginInstance* instance) : instance_ (instance) {}

	tresult PLUGIN_API beginEdit (ParamID) override { return kResultOk; }
	tresult PLUGIN_API performEdit (ParamID id, ParamValue value) override
	{
		if (instance_)
			instance_->onGuiParamEdit (id, value);
		return kResultOk;
	}
	tresult PLUGIN_API endEdit (ParamID) override { return kResultOk; }
	tresult PLUGIN_API restartComponent (int32) override { return kResultOk; }

	tresult PLUGIN_API queryInterface (const TUID, void** obj) override
	{
		if (obj)
			*obj = nullptr;
		return kNoInterface;
	}
	uint32 PLUGIN_API addRef () override { return 1000; }
	uint32 PLUGIN_API release () override { return 1000; }

private:
	PluginInstance* instance_;
};

} // namespace

//------------------------------------------------------------------------
struct PluginInstance::Impl
{
	std::shared_ptr<Module> module;
	IPtr<PlugProvider> provider;
	IPtr<IComponent> component;
	IPtr<IEditController> controller;
	FUnknownPtr<IAudioProcessor> processor;
	IPtr<IPlugView> view;

	std::unique_ptr<InstanceComponentHandler> handler;
	std::unique_ptr<InstancePlugFrame> plugFrame;

	bool active {false};
	bool processing {false};
	bool editorOpen {false};
	double sampleRate {48000.0};
	int blockSize {256};
	int channels {2};
	double latency {0.0};
	std::chrono::microseconds period {5333};

	EventList eventList {64};
	ParameterChanges parameterChanges {16};
	std::vector<std::pair<uint32_t, double>> pendingParams;
	std::vector<Event> pendingEvents;
	std::vector<float> outData;
	std::vector<float*> outPtrs;
	AudioBusBuffers outBus {};
	ProcessContext context {};
	uint32_t sequence {0};

	EditorWindow window;
	Clock::time_point lastSizePoll {};
};

//------------------------------------------------------------------------
void initHostApplication ()
{
	PluginContextFactory::instance ().setPluginContext (&hostApp ());
}

PluginInstance::PluginInstance (std::string id)
: id_ (std::move (id))
, hash_ (fnv1a32 (id_))
, impl_ (std::make_unique<Impl> ())
{
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
		thread_ = std::thread (&PluginInstance::run, this);
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
	running_.store (false);
	condition_.notify_all ();
	queueCondition_.notify_all ();

	bool finished = false;
	if (finished_.valid ())
		finished = finished_.wait_for (std::chrono::milliseconds (timeoutMs)) == std::future_status::ready;

	if (finished)
	{
		if (thread_.joinable ())
			thread_.join ();
	}
	else
	{
		// The plug-in ignored our stop request; detach so the server is never
		// blocked joining a stuck thread. Callers must keep the instance alive.
		if (thread_.joinable ())
			thread_.detach ();
	}
	stopped_.store (true);
	return finished;
}

void PluginInstance::run ()
{
	OleInitialize (nullptr);
	auto nextAudio = Clock::now ();

	while (running_.load ())
	{
		std::vector<std::function<void ()>> batch;
		{
			std::unique_lock<std::mutex> lock (mutex_);
			if (tasks_.empty ())
			{
				auto wake = Clock::now () + std::chrono::milliseconds (2);
				if (pump_.load () && nextAudio < wake)
					wake = nextAudio;
				condition_.wait_until (lock, wake,
				                       [this] { return !tasks_.empty () || !running_.load (); });
			}
			batch.swap (tasks_);
		}

		for (auto& task : batch)
			task ();
		if (!running_.load ())
			break;

		if (editorOpen_.load ())
			pumpWin32 ();

		if (pump_.load () && impl_ && impl_->processor)
		{
			auto now = Clock::now ();
			int produced = 0;
			while (pump_.load () && produced < 64 && nextAudio <= now)
			{
				processOneBlock (true);
				nextAudio += impl_->period;
				++produced;
				now = Clock::now ();
			}
			if (nextAudio + std::chrono::milliseconds (200) < now)
				nextAudio = now; // resync after a long stall
		}
		else
			nextAudio = Clock::now ();
	}

	teardownPlugin ();
	stopped_.store (true);
	finishedPromise_.set_value ();
	OleUninitialize ();
}

//------------------------------------------------------------------------
LoadResult PluginInstance::doLoad (const std::string& modulePath, const std::string& classUid,
                                   double sampleRate, int blockSize, int channels)
{
	if (!impl_)
		return {false, "instance not initialized"};
	if (impl_->component)
		return {false, "already loaded"};

	std::string error;
	Module::Ptr module = Module::create (modulePath, error);
	if (!module)
		return {false, error.empty () ? "failed to load module" : error};

	auto factory = module->getFactory ();
	factory.setHostContext (&hostApp ());

	// classInfos() returns by value: copy it so `chosen` stays valid.
	auto classes = factory.classInfos ();
	const ClassInfo* chosen = nullptr;
	for (const auto& info : classes)
	{
		if (info.category () != kVstAudioEffectClass)
			continue;
		if (!classUid.empty ())
		{
			if (info.ID ().toString () == classUid)
			{
				chosen = &info;
				break;
			}
			continue;
		}
		const auto& sub = info.subCategories ();
		bool instrument = std::find (sub.begin (), sub.end (), "Instrument") != sub.end ();
		if (instrument)
		{
			chosen = &info;
			break;
		}
		if (!chosen)
			chosen = &info;
	}
	if (!chosen)
		return {false, "no Audio Module Class found"};

	IPtr<PlugProvider> provider = owned (new PlugProvider (factory, *chosen, true));
	if (!provider->initialize ())
		return {false, "plug-in initialization failed"};

	IPtr<IComponent> component = provider->getComponentPtr ();
	IPtr<IEditController> controller = provider->getControllerPtr ();
	if (!component)
		return {false, "plug-in has no component"};
	if (!controller)
		return {false, "plug-in has no edit controller"};

	impl_->handler = std::make_unique<InstanceComponentHandler> (this);
	controller->setComponentHandler (impl_->handler.get ());

	// Start component and controller in sync (avoids "state not set" warnings).
	MemoryStream componentState;
	if (component->getState (&componentState) == kResultOk)
	{
		componentState.seek (0, IBStream::kIBSeekSet, nullptr);
		controller->setComponentState (&componentState);
	}

	FUnknownPtr<IAudioProcessor> processor (component);
	if (!processor)
		return {false, "plug-in has no IAudioProcessor"};

	int32 outputBuses = component->getBusCount (kAudio, kOutput);
	for (int32 i = 0; i < outputBuses; ++i)
		component->activateBus (kAudio, kOutput, i, i == 0);
	int32 inputBuses = component->getBusCount (kAudio, kInput);
	for (int32 i = 0; i < inputBuses; ++i)
		component->activateBus (kAudio, kInput, i, false);

	SpeakerArrangement arrangement = (channels == 1) ? SpeakerArr::kMono : SpeakerArr::kStereo;
	processor->setBusArrangements (nullptr, 0, &arrangement, 1);

	int outputChannels = channels;
	if (outputBuses > 0)
	{
		BusInfo busInfo {};
		if (component->getBusInfo (kAudio, kOutput, 0, busInfo) == kResultOk && busInfo.channelCount > 0)
			outputChannels = busInfo.channelCount;
	}
	outputChannels = std::max (1, std::min (2, outputChannels));

	ProcessSetup setup {};
	setup.processMode = kRealtime;
	setup.symbolicSampleSize = kSample32;
	setup.maxSamplesPerBlock = blockSize;
	setup.sampleRate = sampleRate;
	if (processor->setupProcessing (setup) != kResultOk)
		return {false, "setupProcessing failed"};

	if (component->setActive (true) != kResultOk)
		return {false, "setActive failed"};
	processor->setProcessing (false);

	impl_->module = module;
	impl_->provider = provider;
	impl_->component = component;
	impl_->controller = controller;
	impl_->processor = processor;
	impl_->sampleRate = sampleRate;
	impl_->blockSize = blockSize;
	impl_->channels = outputChannels;
	impl_->latency = processor->getLatencySamples ();
	impl_->active = true;
	impl_->period = std::chrono::microseconds (int64_t ((double (blockSize) / sampleRate) * 1e6));

	size_t sampleCount = size_t (outputChannels) * size_t (blockSize);
	impl_->outData.assign (sampleCount, 0.f);
	impl_->outPtrs.assign (size_t (outputChannels), nullptr);
	for (int c = 0; c < outputChannels; ++c)
		impl_->outPtrs[size_t (c)] = impl_->outData.data () + size_t (c) * size_t (blockSize);
	impl_->outBus = AudioBusBuffers {};
	impl_->outBus.numChannels = outputChannels;
	impl_->outBus.silenceFlags = 0;
	impl_->outBus.channelBuffers32 = impl_->outPtrs.data ();

	impl_->context = ProcessContext {};
	impl_->context.state = ProcessContext::kPlaying | ProcessContext::kTempoValid |
	                       ProcessContext::kTimeSigValid | ProcessContext::kProjectTimeMusicValid |
	                       ProcessContext::kBarPositionValid | ProcessContext::kSystemTimeValid |
	                       ProcessContext::kContTimeValid;
	impl_->context.sampleRate = sampleRate;
	impl_->context.tempo = 120.0;
	impl_->context.timeSigNumerator = 4;
	impl_->context.timeSigDenominator = 4;

	return {true, {}};
}

void PluginInstance::teardownPlugin ()
{
	destroyEditorOnThread ();
	if (impl_ && impl_->processor && impl_->processing)
	{
		impl_->processor->setProcessing (false);
		impl_->processing = false;
	}
	if (impl_ && impl_->component && impl_->active)
	{
		impl_->component->setActive (false);
		impl_->active = false;
	}
	if (impl_ && impl_->controller)
		impl_->controller->setComponentHandler (nullptr);
	if (impl_)
	{
		impl_->handler.reset ();
		impl_->outPtrs.clear ();
		impl_->outData.clear ();
		impl_->processor = nullptr;
		impl_->component = nullptr;
		impl_->controller = nullptr;
		impl_->view = nullptr;
		impl_->provider = nullptr; // runs PlugProvider::terminatePlugin()
		impl_->module = nullptr;
	}
}

//------------------------------------------------------------------------
void PluginInstance::processOneBlock (bool emitFrame)
{
	if (!impl_ || !impl_->processor || !impl_->component)
		return;

	impl_->eventList.clear ();
	for (const Event& event : impl_->pendingEvents)
		impl_->eventList.addEvent (const_cast<Event&> (event));
	impl_->pendingEvents.clear ();

	std::fill (impl_->outData.begin (), impl_->outData.end (), 0.f);

	impl_->parameterChanges.clearQueue ();
	for (const auto& change : impl_->pendingParams)
	{
		int32 index = 0;
		if (IParamValueQueue* queue = impl_->parameterChanges.addParameterData (change.first, index))
		{
			int32 pointIndex = 0;
			queue->addPoint (0, change.second, pointIndex);
		}
	}
	impl_->pendingParams.clear ();

	ProcessData data {};
	data.processMode = kRealtime;
	data.symbolicSampleSize = kSample32;
	data.numSamples = impl_->blockSize;
	data.numInputs = 0;
	data.inputs = nullptr;
	data.numOutputs = impl_->outBus.numChannels > 0 ? 1 : 0;
	data.outputs = &impl_->outBus;
	data.inputEvents = impl_->eventList.getEventCount () > 0 ? &impl_->eventList : nullptr;
	data.outputEvents = nullptr;
	data.inputParameterChanges =
	    impl_->parameterChanges.getParameterCount () > 0 ? &impl_->parameterChanges : nullptr;
	data.outputParameterChanges = nullptr;
	data.processContext = &impl_->context;

	impl_->processor->process (data);
	impl_->context.continousTimeSamples += impl_->blockSize;
	impl_->context.projectTimeMusic +=
	    (impl_->blockSize / impl_->sampleRate) * (impl_->context.tempo / 60.0);

	if (!emitFrame)
		return;

	const size_t sampleCount = size_t (impl_->channels) * size_t (impl_->blockSize);
	std::vector<uint8_t> frame (16 + sampleCount * sizeof (float));
	uint32_t hash = hash_;
	uint32_t sequence = impl_->sequence++;
	uint32_t channels = uint32_t (impl_->channels);
	uint32_t frames = uint32_t (impl_->blockSize);
	std::memcpy (frame.data (), &hash, 4);
	std::memcpy (frame.data () + 4, &sequence, 4);
	std::memcpy (frame.data () + 8, &channels, 4);
	std::memcpy (frame.data () + 12, &frames, 4);
	if (sampleCount > 0)
		std::memcpy (frame.data () + 16, impl_->outData.data (), sampleCount * sizeof (float));

	auto shared = std::make_shared<const std::vector<uint8_t>> (std::move (frame));
	{
		std::lock_guard<std::mutex> lock (queueMutex_);
		if (frameQueue_.size () >= kMaxQueuedFrames)
			frameQueue_.pop_front ();
		frameQueue_.push_back (std::move (shared));
	}
	queueCondition_.notify_one ();
}

void PluginInstance::setPump (bool on)
{
	pump_.store (on);
	condition_.notify_all ();
}

std::shared_ptr<const std::vector<uint8_t>> PluginInstance::popFrame (int waitMs)
{
	std::unique_lock<std::mutex> lock (queueMutex_);
	queueCondition_.wait_for (lock, std::chrono::milliseconds (waitMs),
	                          [this] { return !frameQueue_.empty () || !running_.load (); });
	if (frameQueue_.empty ())
		return nullptr;
	auto frame = std::move (frameQueue_.front ());
	frameQueue_.pop_front ();
	return frame;
}

//------------------------------------------------------------------------
bool PluginInstance::doSetProcessing (bool on)
{
	if (!impl_ || !impl_->processor)
		return false;
	tresult result = impl_->processor->setProcessing (on);
	if (result == kResultOk)
		impl_->processing = on;
	return result == kResultOk;
}

RenderStats PluginInstance::doRenderBlocks (int blocks)
{
	if (!impl_ || !impl_->processor)
		return {};
	if (!impl_->processing)
	{
		if (impl_->processor->setProcessing (true) != kResultOk)
			return {};
		impl_->processing = true;
	}

	double sumSquares = 0.0;
	double peak = 0.0;
	for (int i = 0; i < blocks; ++i)
	{
		processOneBlock (false);
		for (float value : impl_->outData)
		{
			sumSquares += double (value) * double (value);
			if (std::fabs (value) > peak)
				peak = std::fabs (value);
		}
	}
	double denominator = double (blocks) * double (impl_->blockSize) * double (impl_->channels);
	RenderStats stats;
	stats.ok = true;
	stats.rms = denominator > 0.0 ? std::sqrt (sumSquares / denominator) : 0.0;
	stats.peak = peak;
	return stats;
}

bool PluginInstance::doNoteOn (int pitch, int velocity, int channel)
{
	if (!impl_)
		return false;
	if (impl_->pendingEvents.size () >= kMaxPendingEvents)
		impl_->pendingEvents.erase (impl_->pendingEvents.begin ());

	Event event {};
	event.type = Event::kNoteOnEvent;
	event.sampleOffset = 0;
	event.noteOn.channel = int16 (std::max (0, std::min (15, channel)));
	event.noteOn.pitch = int16 (std::max (0, std::min (127, pitch)));
	event.noteOn.velocity = float (std::max (0, std::min (127, velocity))) / 127.0f;
	event.noteOn.noteId = -1;
	event.noteOn.tuning = 0.0f;
	event.noteOn.length = 0;
	impl_->pendingEvents.push_back (event);
	return true;
}

bool PluginInstance::doNoteOff (int pitch, int channel)
{
	if (!impl_)
		return false;
	if (impl_->pendingEvents.size () >= kMaxPendingEvents)
		impl_->pendingEvents.erase (impl_->pendingEvents.begin ());

	Event event {};
	event.type = Event::kNoteOffEvent;
	event.sampleOffset = 0;
	event.noteOff.channel = int16 (std::max (0, std::min (15, channel)));
	event.noteOff.pitch = int16 (std::max (0, std::min (127, pitch)));
	event.noteOff.velocity = 0.5f;
	event.noteOff.noteId = -1;
	event.noteOff.tuning = 0.0f;
	impl_->pendingEvents.push_back (event);
	return true;
}

std::vector<ParamInfo> PluginInstance::doParamList ()
{
	std::vector<ParamInfo> params;
	if (!impl_ || !impl_->controller)
		return params;

	int32 count = impl_->controller->getParameterCount ();
	for (int32 i = 0; i < count; ++i)
	{
		ParameterInfo info {};
		if (impl_->controller->getParameterInfo (i, info) != kResultOk)
			continue;
		ParamInfo param;
		param.id = info.id;
		param.title = StringConvert::convert (info.title);
		param.units = StringConvert::convert (info.units);
		param.min = 0.0;
		param.max = 1.0;
		param.def = info.defaultNormalizedValue;
		param.value = impl_->controller->getParamNormalized (info.id);
		param.stepCount = info.stepCount;
		params.push_back (std::move (param));
	}
	return params;
}

bool PluginInstance::doParamSet (uint32_t paramId, double value)
{
	if (!impl_ || !impl_->controller)
		return false;
	if (impl_->controller->setParamNormalized (paramId, value) != kResultOk)
		return false;
	if (impl_->pendingParams.size () < kMaxPendingParams)
		impl_->pendingParams.emplace_back (paramId, value);
	return true;
}

std::string PluginInstance::doGetState ()
{
	if (!impl_ || !impl_->component)
		return {};
	std::vector<uint8_t> blob;

	auto appendStream = [&blob] (IBStream* stream) {
		MemoryStream* memory = dynamic_cast<MemoryStream*> (stream);
		if (!memory)
			return;
		uint32_t size = uint32_t (memory->getSize ());
		uint8_t sizeBytes[4];
		std::memcpy (sizeBytes, &size, 4);
		blob.insert (blob.end (), sizeBytes, sizeBytes + 4);
		const char* data = memory->getData ();
		blob.insert (blob.end (), reinterpret_cast<const uint8_t*> (data),
		             reinterpret_cast<const uint8_t*> (data) + size);
	};

	MemoryStream componentState;
	if (impl_->component->getState (&componentState) == kResultOk)
		appendStream (&componentState);
	else
	{
		uint32_t zero = 0;
		blob.insert (blob.end (), reinterpret_cast<uint8_t*> (&zero),
		             reinterpret_cast<uint8_t*> (&zero) + 4);
	}
	MemoryStream controllerState;
	if (impl_->controller && impl_->controller->getState (&controllerState) == kResultOk)
		appendStream (&controllerState);
	else
	{
		uint32_t zero = 0;
		blob.insert (blob.end (), reinterpret_cast<uint8_t*> (&zero),
		             reinterpret_cast<uint8_t*> (&zero) + 4);
	}
	return base64Encode (blob);
}

bool PluginInstance::doSetState (const std::string& base64)
{
	if (!impl_ || !impl_->component || !impl_->controller)
		return false;
	std::vector<uint8_t> blob;
	if (!base64Decode (base64, blob) || blob.size () < 4)
		return false;

	auto readSize = [&blob] (size_t offset, uint32_t& size) {
		if (offset + 4 > blob.size ())
			return false;
		std::memcpy (&size, blob.data () + offset, 4);
		return true;
	};

	uint32_t componentSize = 0;
	if (!readSize (0, componentSize) || blob.size () < 4 + size_t (componentSize) + 4)
		return false;
	uint32_t controllerSize = 0;
	if (!readSize (4 + size_t (componentSize), controllerSize) ||
	    blob.size () < 4 + size_t (componentSize) + 4 + size_t (controllerSize))
		return false;

	MemoryStream componentState (blob.data () + 4, componentSize);
	if (componentSize > 0)
		impl_->component->setState (&componentState);
	componentState.seek (0, IBStream::kIBSeekSet, nullptr);
	impl_->controller->setComponentState (&componentState);

	if (controllerSize > 0)
	{
		MemoryStream controllerState (blob.data () + 8 + size_t (componentSize), controllerSize);
		impl_->controller->setState (&controllerState);
	}
	return true;
}

//------------------------------------------------------------------------
bool PluginInstance::doEditorOpen ()
{
	if (!impl_ || !impl_->controller)
		return false;
	if (impl_->editorOpen)
		return true;

	IPtr<IPlugView> view = owned (impl_->controller->createView (ViewType::kEditor));
	if (!view)
		return false;
	if (auto scale = FUnknownPtr<IPlugViewContentScaleSupport> (view))
		scale->setContentScaleFactor (1.0f);

	ensureEditorWindowClass ();

	ViewRect size {0, 0, 800, 600};
	view->getSize (&size);
	int width = std::max (1, size.right - size.left);
	int height = std::max (1, size.bottom - size.top);

	DWORD style = WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN | WS_CLIPSIBLINGS;
	RECT rect {0, 0, width, height};
	AdjustWindowRectEx (&rect, style, FALSE, 0);
	HWND hwnd = CreateWindowExW (0, kEditorWindowClass, L"vst-host editor", style, -4000, -4000,
	                             rect.right - rect.left, rect.bottom - rect.top, nullptr, nullptr,
	                             GetModuleHandleW (nullptr), nullptr);
	if (!hwnd)
		return false;
	SetWindowLongPtrW (hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR> (&impl_->window));
	SetWindowPos (hwnd, HWND_BOTTOM, -4000, -4000, rect.right - rect.left, rect.bottom - rect.top,
	              SWP_NOACTIVATE | SWP_SHOWWINDOW);

	impl_->window.hwnd = hwnd;
	impl_->window.view = view.get ();
	impl_->window.onSizeSent = false;

	impl_->plugFrame = std::make_unique<InstancePlugFrame> (this);
	impl_->plugFrame->hwnd = hwnd;
	view->setFrame (impl_->plugFrame.get ());

	if (view->attached (hwnd, kPlatformTypeHWND) != kResultTrue)
	{
		view->setFrame (nullptr);
		impl_->plugFrame.reset ();
		impl_->window.hwnd = nullptr;
		impl_->window.view = nullptr;
		DestroyWindow (hwnd);
		return false;
	}

	impl_->view = view;
	impl_->editorOpen = true;
	editorOpen_.store (true);
	return true;
}

bool PluginInstance::doEditorClose ()
{
	if (!impl_)
		return false;
	if (!impl_->editorOpen)
		return true;

	if (impl_->view)
	{
		impl_->view->removed ();
		impl_->view->setFrame (nullptr);
		impl_->view = nullptr;
	}
	impl_->plugFrame.reset ();
	if (impl_->window.hwnd)
	{
		DestroyWindow (impl_->window.hwnd);
		impl_->window.hwnd = nullptr;
	}
	impl_->window.view = nullptr;
	impl_->editorOpen = false;
	editorOpen_.store (false);
	return true;
}

void PluginInstance::destroyEditorOnThread ()
{
	if (impl_ && impl_->editorOpen)
		doEditorClose ();
}

void PluginInstance::pumpWin32 ()
{
	MSG message;
	while (PeekMessageW (&message, nullptr, 0, 0, PM_REMOVE))
	{
		TranslateMessage (&message);
		DispatchMessageW (&message);
	}

	if (!impl_ || !impl_->view || !impl_->window.hwnd)
		return;

	auto now = Clock::now ();
	if (now - impl_->lastSizePoll < std::chrono::milliseconds (100))
		return;
	impl_->lastSizePoll = now;

	ViewRect size {};
	if (impl_->view->getSize (&size) != kResultTrue)
		return;
	RECT client {};
	GetClientRect (impl_->window.hwnd, &client);
	int clientWidth = client.right - client.left;
	int clientHeight = client.bottom - client.top;
	int viewWidth = size.right - size.left;
	int viewHeight = size.bottom - size.top;
	if (viewWidth > 0 && viewHeight > 0 && (viewWidth != clientWidth || viewHeight != clientHeight))
		resizeHostWindow (impl_->window.hwnd, viewWidth, viewHeight);
	if (!impl_->window.onSizeSent || !rectsEqual (impl_->window.lastSize, size))
	{
		impl_->view->onSize (&size);
		impl_->window.lastSize = size;
		impl_->window.onSizeSent = true;
	}
}

void PluginInstance::onGuiParamEdit (uint32_t paramId, double value)
{
	if (impl_ && impl_->pendingParams.size () < kMaxPendingParams)
		impl_->pendingParams.emplace_back (paramId, value);
}

void PluginInstance::resizeEditorWindow (int width, int height)
{
	if (impl_ && impl_->window.hwnd)
		resizeHostWindow (impl_->window.hwnd, width, height);
}

//------------------------------------------------------------------------
double PluginInstance::latencySamples () const { return impl_ ? impl_->latency : 0.0; }
int PluginInstance::channels () const { return impl_ ? impl_->channels : 0; }
int PluginInstance::blockSize () const { return impl_ ? impl_->blockSize : 0; }
double PluginInstance::sampleRate () const { return impl_ ? impl_->sampleRate : 0.0; }

} // namespace vhost
