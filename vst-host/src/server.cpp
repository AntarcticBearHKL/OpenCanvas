// HTTP control plane + audio stream.
//
// The Origin/token guard lives in one place (the pre-routing handler) and is
// therefore applied to both POST /rpc and GET /audio, exactly like
// mcp/src/canvas_mcp/server.py's BridgeGuard.
//
// The server thread pool never touches a plug-in: /rpc forwards every plug-in
// call to the owning instance thread with a timeout, and /audio only drains
// already-rendered frames. A hung plug-in can therefore stall only its own
// instance thread.

#include "server.h"

#include "instance.h"
#include "json.h"
#include "lifecycle.h"
#include "scan.h"
#include "util.h"
#include "worker.h"

#include <httplib.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

namespace vhost {
namespace {

constexpr int kLoadTimeoutMs = 40000;    // plug-in setup can be slow (samples); must exceed the worker's 30 s
constexpr int kCallTimeoutMs = 15000;    // note/param/editor/state/audio calls; must exceed the worker's 10 s
constexpr int kUnloadTimeoutMs = 5000;
constexpr int kScanTimeoutMs = 120000;   // whole scan worker
constexpr int kRenderStartWaitMs = 15000; // first offline block or an immediate failure
constexpr int kRenderFrameWaitMs = 30000; // per-block stall limit while streaming a render
constexpr double kMaxRenderSeconds = 1800.0; // 30 min per /render request
constexpr size_t kMaxRenderNotes = 65536;
constexpr size_t kMaxAudioInBytes = 1024 * 1024; // 1 MiB per /audio-in request (~500 blocks)

std::mutex g_zombieMutex;
std::vector<std::shared_ptr<PluginInstance>> g_zombies;

std::string trim (const std::string& s)
{
	size_t b = s.find_first_not_of (" \t\r\n");
	if (b == std::string::npos)
		return {};
	size_t e = s.find_last_not_of (" \t\r\n");
	return s.substr (b, e - b + 1);
}

Json okResponse (long long id)
{
	Json response = Json::makeObject ();
	response.set ("id", Json::makeNumber (double (id), true));
	response.set ("ok", Json::makeBool (true));
	return response;
}

Json errorResponse (long long id, const std::string& code, const std::string& message)
{
	Json response = Json::makeObject ();
	response.set ("id", Json::makeNumber (double (id), true));
	response.set ("ok", Json::makeBool (false));
	Json error = Json::makeObject ();
	error.set ("code", Json::makeString (code));
	error.set ("message", Json::makeString (message));
	response.set ("error", std::move (error));
	return response;
}

void respond (httplib::Response& res, int status, const Json& body)
{
	res.status = status;
	res.set_content (body.dump (), "application/json");
}

//------------------------------------------------------------------------
class Auth
{
public:
	explicit Auth (const Settings& settings)
	: origins_ (settings.origins.begin (), settings.origins.end ()), token_ (settings.token)
	{
	}

	bool originAllowed (const std::string& origin) const
	{
		return origins_.find (origin) != origins_.end ();
	}

	/** False when no token is configured: the Origin allowlist is then the only guard. */
	bool tokenRequired () const { return !token_.empty (); }

	bool tokenOk (const std::string& provided) const
	{
		if (provided.empty () || provided.size () != token_.size ())
			return false;
		unsigned char diff = 0;
		for (size_t i = 0; i < provided.size (); ++i)
			diff = static_cast<unsigned char> (diff | (provided[i] ^ token_[i]));
		return diff == 0;
	}

	bool tokenFromRequest (const httplib::Request& req, std::string& out) const
	{
		std::string authorization = req.get_header_value ("Authorization");
		if (authorization.size () >= 7)
		{
			std::string scheme = authorization.substr (0, 7);
			for (char& c : scheme)
				c = char (::tolower (static_cast<unsigned char> (c)));
			if (scheme == "bearer ")
			{
				out = trim (authorization.substr (7));
				return true;
			}
		}
		if (req.has_param ("token"))
		{
			out = req.get_param_value ("token");
			return true;
		}
		return false;
	}

	void addCors (const httplib::Request& req, httplib::Response& res) const
	{
		std::string origin = req.get_header_value ("Origin");
		if (!origin.empty () && originAllowed (origin))
		{
			res.set_header ("Access-Control-Allow-Origin", origin);
			res.set_header ("Vary", "Origin");
		}
		res.set_header ("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.set_header ("Access-Control-Allow-Headers", "content-type, authorization");
		res.set_header ("Access-Control-Expose-Headers", "content-type, x-vst-latency-samples");
		res.set_header ("Access-Control-Allow-Private-Network", "true");
		res.set_header ("Access-Control-Max-Age", "600");
	}

private:
	std::set<std::string> origins_;
	std::string token_;
};

//------------------------------------------------------------------------
class PluginServer
{
public:
	explicit PluginServer (const Settings& settings)
	: settings_ (settings), auth_ (settings), executable_ (executablePath ())
	{
	}

	const Auth& auth () const { return auth_; }

	// ---- routes ----
	void handleRpc (const httplib::Request& req, httplib::Response& res);
	void handleAudio (const httplib::Request& req, httplib::Response& res);
	void handleAudioIn (const httplib::Request& req, httplib::Response& res);
	void handleRender (const httplib::Request& req, httplib::Response& res);

	/** Stop every instance (and therefore every worker child) before the server exits. */
	void shutdown ();

private:
	std::shared_ptr<PluginInstance> findInstance (const std::string& id)
	{
		std::lock_guard<std::mutex> lock (mutex_);
		auto it = instances_.find (id);
		return it == instances_.end () ? nullptr : it->second;
	}

	bool ensureScanned (std::string& error)
	{
		std::lock_guard<std::mutex> lock (scanMutex_);
		if (scanned_)
			return true;
		return refreshScan (error);
	}

	bool refreshScan (std::string& error);

	bool resolvePlugin (const std::string& idOrPath, std::string& path, std::string& uid,
	                    std::string& error);

	void unload (const std::shared_ptr<PluginInstance>& instance)
	{
		bool stopped = instance->stop (kUnloadTimeoutMs);
		if (!stopped)
		{
			instance->markStuck ();
			std::lock_guard<std::mutex> lock (g_zombieMutex);
			g_zombies.push_back (instance);
		}
	}

	template <typename R, typename F>
	bool call (const std::shared_ptr<PluginInstance>& instance, int timeoutMs, F&& fn, R& out,
	           std::string& error)
	{
		if (instance->stuck ())
		{
			error = instance->failureCode ().empty () ? "plugin_hang" : instance->failureCode ();
			return false;
		}
		auto future = instance->post (std::forward<F> (fn));
		if (future.wait_for (std::chrono::milliseconds (timeoutMs)) != std::future_status::ready)
		{
			instance->markStuck ();
			error = "plugin_hang";
			return false;
		}
		out = future.get ();
		return true;
	}

	Settings settings_;
	Auth auth_;
	std::string executable_;

	std::mutex mutex_;
	std::map<std::string, std::shared_ptr<PluginInstance>> instances_;
	int nextInstance_ {1};

	std::mutex scanMutex_;
	bool scanned_ {false};
	std::vector<PluginInfo> plugins_;
};

bool PluginServer::refreshScan (std::string& error)
{
	ScanSpawnResult result = runScanWorker (executable_, kScanTimeoutMs);
	if (result.timedOut)
	{
		error = "plugin_hang";
		return false;
	}
	if (result.output.empty ())
	{
		error = result.error.empty () ? "scan worker produced no output" : result.error;
		return false;
	}

	Json root;
	std::string parseError;
	if (!Json::parse (result.output, root, parseError))
	{
		error = "invalid scan output: " + parseError;
		return false;
	}

	std::vector<PluginInfo> found;
	const Json& list = root.get ("plugins");
	for (size_t i = 0; i < list.size (); ++i)
	{
		const Json& item = list.at (i);
		PluginInfo info;
		info.id = item.get ("id").asString ();
		info.name = item.get ("name").asString ();
		info.vendor = item.get ("vendor").asString ();
		info.version = item.get ("version").asString ();
		info.category = item.get ("category").asString ();
		info.path = item.get ("path").asString ();
		info.packaging = item.get ("packaging").asString ();
		info.isInstrument = item.get ("isInstrument").asBool ();
		const Json& subs = item.get ("subCategories");
		for (size_t j = 0; j < subs.size (); ++j)
			info.subCategories.push_back (subs.at (j).asString ());
		found.push_back (std::move (info));
	}

	plugins_ = std::move (found);
	scanned_ = true;
	return true;
}

void PluginServer::shutdown ()
{
	std::map<std::string, std::shared_ptr<PluginInstance>> instances;
	{
		std::lock_guard<std::mutex> lock (mutex_);
		instances.swap (instances_);
	}
	for (auto& entry : instances)
		unload (entry.second);
}

bool PluginServer::resolvePlugin (const std::string& idOrPath, std::string& path, std::string& uid,
                                  std::string& error)
{
	std::error_code ec;
	if (std::filesystem::exists (std::filesystem::u8path (idOrPath), ec))
	{
		path = idOrPath;
		uid.clear (); // let `load` pick the class matching the requested role
		return true;
	}

	if (!ensureScanned (error))
		return false;

	for (const PluginInfo& info : plugins_)
	{
		if (info.id == idOrPath)
		{
			path = info.path;
			uid = info.id;
			return true;
		}
	}
	error = "unknown pluginId (not a scan id and not an existing path)";
	return false;
}

void PluginServer::handleRpc (const httplib::Request& req, httplib::Response& res)
{
	Json request;
	std::string parseError;
	if (!Json::parse (req.body, request, parseError) || !request.isObject ())
	{
		respond (res, 400,
		         errorResponse (0, "bad_request",
		                        parseError.empty () ? "request body must be a JSON object" : parseError));
		return;
	}

	long long id = request.get ("id").isNumber () ? request.get ("id").asInt () : 0;
	std::string type = request.get ("type").asStringOr ("");

	if (type == "hello")
	{
		Json response = okResponse (id);
		response.set ("protocol", Json::makeNumber (1, true));
		response.set ("host", Json::makeString ("vst-host"));
		response.set ("version", Json::makeString (kVersion));
		respond (res, 200, response);
		return;
	}

	if (type == "scan")
	{
		std::string error;
		if (!ensureScanned (error))
		{
			respond (res, 500, errorResponse (id, error == "plugin_hang" ? "plugin_hang" : "scan_failed", error));
			return;
		}
		Json parsed;
		if (!Json::parse (pluginsToJson (plugins_), parsed, error))
		{
			respond (res, 500, errorResponse (id, "internal_error", error));
			return;
		}
		Json response = okResponse (id);
		response.set ("plugins", parsed.get ("plugins"));
		respond (res, 200, response);
		return;
	}

	if (type == "load")
	{
		std::string pluginId = request.get ("pluginId").asStringOr ("");
		if (pluginId.empty ())
		{
			respond (res, 400, errorResponse (id, "bad_request", "pluginId is required"));
			return;
		}
		double sampleRate = request.get ("sampleRate").isNumber () ? request.get ("sampleRate").asNumber () : 48000.0;
		int blockSize = request.get ("blockSize").isNumber () ? int (request.get ("blockSize").asInt ()) : 256;
		int channels = request.get ("channels").isNumber () ? int (request.get ("channels").asInt ()) : 2;
		if (blockSize <= 0)
			blockSize = 256;
		if (channels <= 0)
			channels = 2;

		const std::string role = request.get ("role").asStringOr ("instrument");
		if (role != "instrument" && role != "effect")
		{
			respond (res, 400, errorResponse (id, "bad_role", "role must be \"instrument\" or \"effect\""));
			return;
		}
		const bool effect = role == "effect";

		std::string path, uid, error;
		if (!resolvePlugin (pluginId, path, uid, error))
		{
			respond (res, 404, errorResponse (id, "plugin_not_found", error));
			return;
		}

		std::string instanceId;
		{
			std::lock_guard<std::mutex> lock (mutex_);
			instanceId = std::to_string (nextInstance_++);
		}

		auto instance = std::make_shared<PluginInstance> (instanceId);
		std::string startError;
		if (!instance->start (startError))
		{
			respond (res, 500, errorResponse (id, "internal_error", startError));
			return;
		}

		auto future = instance->post (
		    [instance, path, uid, sampleRate, blockSize, channels, effect] {
			    return instance->doLoad (path, uid, sampleRate, blockSize, channels, effect);
		    });
		LoadResult load;
		if (future.wait_for (std::chrono::milliseconds (kLoadTimeoutMs)) != std::future_status::ready)
		{
			instance->markStuck ();
			unload (instance);
			respond (res, 500, errorResponse (id, "plugin_hang", "plug-in did not respond to load"));
			return;
		}
		load = future.get ();
		if (!load.ok)
		{
			unload (instance);
			respond (res, 500, errorResponse (id, load.code.empty () ? "load_failed" : load.code, load.error));
			return;
		}

		{
			std::lock_guard<std::mutex> lock (mutex_);
			instances_[instanceId] = instance;
		}
		Json response = okResponse (id);
		response.set ("instanceId", Json::makeString (instanceId));
		respond (res, 200, response);
		return;
	}

	std::string instanceId = request.get ("instanceId").asStringOr ("");
	auto instance = findInstance (instanceId);
	if (!instance)
	{
		respond (res, 404, errorResponse (id, "instance_not_found", "unknown instanceId: " + instanceId));
		return;
	}

	if (type == "unload")
	{
		{
			std::lock_guard<std::mutex> lock (mutex_);
			instances_.erase (instanceId);
		}
		unload (instance);
		respond (res, 200, okResponse (id));
		return;
	}

	// A dead worker answers with its own failure code and the message that names
	// it, so the client sees why instead of a generic timeout; `unload` above
	// stays available to clean the instance up.
	if (instance->failed ())
	{
		respond (res, 500, errorResponse (id, instance->failureCode (), instance->failureMessage ()));
		return;
	}

	if (type == "noteOn")
	{
		int pitch = int (request.get ("pitch").asInt ());
		int velocity = request.get ("velocity").isNumber () ? int (request.get ("velocity").asInt ()) : 100;
		int channel = request.get ("channel").isNumber () ? int (request.get ("channel").asInt ()) : 0;
		bool ok = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs,
		           [instance, pitch, velocity, channel] {
			           return instance->doNoteOn (pitch, velocity, channel);
		           },
		           ok, error))
		{
			respond (res, 500, errorResponse (id, error, "noteOn timed out"));
			return;
		}
		respond (res, 200, okResponse (id));
		return;
	}

	if (type == "noteOff")
	{
		int pitch = int (request.get ("pitch").asInt ());
		int channel = request.get ("channel").isNumber () ? int (request.get ("channel").asInt ()) : 0;
		bool ok = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs,
		           [instance, pitch, channel] { return instance->doNoteOff (pitch, channel); }, ok, error))
		{
			respond (res, 500, errorResponse (id, error, "noteOff timed out"));
			return;
		}
		respond (res, 200, okResponse (id));
		return;
	}

	if (type == "paramList")
	{
		std::vector<ParamInfo> params;
		std::string error;
		if (!call (instance, kCallTimeoutMs, [instance] { return instance->doParamList (); }, params, error))
		{
			respond (res, 500, errorResponse (id, error, "paramList timed out"));
			return;
		}
		Json list = Json::makeArray ();
		for (const ParamInfo& param : params)
		{
			Json item = Json::makeObject ();
			item.set ("id", Json::makeNumber (double (param.id), true));
			item.set ("title", Json::makeString (param.title));
			item.set ("units", Json::makeString (param.units));
			item.set ("min", Json::makeNumber (param.min));
			item.set ("max", Json::makeNumber (param.max));
			item.set ("default", Json::makeNumber (param.def));
			item.set ("value", Json::makeNumber (param.value));
			item.set ("stepCount", Json::makeNumber (double (param.stepCount), true));
			list.push (std::move (item));
		}
		Json response = okResponse (id);
		response.set ("params", std::move (list));
		respond (res, 200, response);
		return;
	}

	if (type == "paramSet")
	{
		if (!request.get ("paramId").isNumber () || !request.get ("value").isNumber ())
		{
			respond (res, 400, errorResponse (id, "bad_request", "paramId and value are required"));
			return;
		}
		uint32_t paramId = uint32_t (request.get ("paramId").asInt ());
		double value = request.get ("value").asNumber ();
		bool ok = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs,
		           [instance, paramId, value] { return instance->doParamSet (paramId, value); }, ok, error))
		{
			respond (res, 500, errorResponse (id, error, "paramSet timed out"));
			return;
		}
		if (!ok)
		{
			respond (res, 500, errorResponse (id, "param_failed", "plug-in rejected the parameter"));
			return;
		}
		respond (res, 200, okResponse (id));
		return;
	}

	if (type == "editorOpen")
	{
		bool opened = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs, [instance] { return instance->doEditorOpen (); }, opened, error))
		{
			respond (res, 500, errorResponse (id, error, "editorOpen timed out"));
			return;
		}
		if (!opened)
		{
			respond (res, 500, errorResponse (id, "editor_failed", "plug-in editor could not be attached"));
			return;
		}
		Json response = okResponse (id);
		response.set ("opened", Json::makeBool (true));
		respond (res, 200, response);
		return;
	}

	if (type == "editorClose")
	{
		bool ok = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs, [instance] { return instance->doEditorClose (); }, ok, error))
		{
			respond (res, 500, errorResponse (id, error, "editorClose timed out"));
			return;
		}
		respond (res, 200, okResponse (id));
		return;
	}

	if (type == "getState")
	{
		std::string state;
		std::string error;
		if (!call (instance, kCallTimeoutMs, [instance] { return instance->doGetState (); }, state, error))
		{
			respond (res, 500, errorResponse (id, error, "getState timed out"));
			return;
		}
		if (state.empty ())
		{
			respond (res, 500, errorResponse (id, "state_failed", "plug-in returned no state"));
			return;
		}
		Json response = okResponse (id);
		response.set ("state", Json::makeString (state));
		respond (res, 200, response);
		return;
	}

	if (type == "setState")
	{
		std::string state = request.get ("state").asStringOr ("");
		if (state.empty ())
		{
			respond (res, 400, errorResponse (id, "bad_request", "state is required"));
			return;
		}
		bool ok = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs,
		           [instance, state] { return instance->doSetState (state); }, ok, error))
		{
			respond (res, 500, errorResponse (id, error, "setState timed out"));
			return;
		}
		if (!ok)
		{
			respond (res, 500, errorResponse (id, "state_failed", "plug-in rejected the state"));
			return;
		}
		respond (res, 200, okResponse (id));
		return;
	}

	if (type == "audioStart")
	{
		bool ok = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs, [instance] { return instance->doSetProcessing (true); }, ok, error))
		{
			respond (res, 500, errorResponse (id, error, "audioStart timed out"));
			return;
		}
		instance->setPump (true);
		respond (res, 200, okResponse (id));
		return;
	}

	if (type == "audioStop")
	{
		instance->setPump (false);
		bool ok = false;
		std::string error;
		if (!call (instance, kCallTimeoutMs, [instance] { return instance->doSetProcessing (false); }, ok, error))
		{
			respond (res, 500, errorResponse (id, error, "audioStop timed out"));
			return;
		}
		respond (res, 200, okResponse (id));
		return;
	}

	respond (res, 400, errorResponse (id, "unknown_command", type.empty () ? "missing type" : type));
}

void PluginServer::handleAudio (const httplib::Request& req, httplib::Response& res)
{
	std::string instanceId = req.has_param ("instance") ? req.get_param_value ("instance") : "";
	auto instance = findInstance (instanceId);
	if (!instance)
	{
		respond (res, 404, errorResponse (0, "instance_not_found", "unknown instance: " + instanceId));
		return;
	}
	if (instance->failed ())
	{
		respond (res, 500, errorResponse (0, instance->failureCode (), instance->failureMessage ()));
		return;
	}

	// Opening the stream also starts audio, so a client that did load + noteOn
	// can read /audio without an explicit audioStart.
	if (!instance->pumpOn ())
	{
		auto future = instance->post ([instance] { return instance->doSetProcessing (true); });
		if (future.wait_for (std::chrono::milliseconds (kCallTimeoutMs)) != std::future_status::ready)
		{
			instance->markStuck ();
			respond (res, 500, errorResponse (0, "plugin_hang", "plug-in did not start audio"));
			return;
		}
		future.get ();
		instance->setPump (true);
	}

	res.set_chunked_content_provider (
	    "application/octet-stream",
	    [instance] (size_t, httplib::DataSink& sink) -> bool {
		    auto frame = instance->popFrame (1000);
		    if (!frame)
			    return instance->pumpOn (); // keep waiting while audio is active
		    if (frame->empty ())
			    return true;
		    return sink.write (reinterpret_cast<const char*> (frame->data ()), frame->size ());
	    },
	    [] (bool) {});
}

// `POST /audio-in` feeds an effect instance's input bus with the very same frame format `/audio` emits.
// It is the mirror of the output stream: the browser uploads whole blocks, the instance thread consumes
// one re-blocked block per rendered block (silence on underrun, oldest dropped past 48 queued blocks),
// while `GET /audio` drains the rendered output on its own connection. Both only share the per-instance
// queues under their own mutex, so a stream and an upload can run concurrently without blocking each other.
void PluginServer::handleAudioIn (const httplib::Request& req, httplib::Response& res)
{
	std::string instanceId = req.has_param ("instance") ? req.get_param_value ("instance") : "";
	auto instance = findInstance (instanceId);
	if (!instance)
	{
		respond (res, 404, errorResponse (0, "instance_not_found", "unknown instance: " + instanceId));
		return;
	}
	if (instance->failed ())
	{
		respond (res, 500, errorResponse (0, instance->failureCode (), instance->failureMessage ()));
		return;
	}
	if (!instance->isEffect ())
	{
		respond (res, 400, errorResponse (0, "not_effect", "/audio-in requires an instance loaded with role=effect"));
		return;
	}
	if (req.body.size () > kMaxAudioInBytes)
	{
		respond (res, 413, errorResponse (0, "audio_in_too_large", "at most 1 MiB and 64 frames per /audio-in request"));
		return;
	}

	size_t frames = 0;
	std::string error;
	if (!instance->queueInput (reinterpret_cast<const uint8_t*> (req.body.data ()), req.body.size (), frames, error))
	{
		respond (res, 400, errorResponse (0, "bad_audio_in", error));
		return;
	}
	Json response = okResponse (0);
	response.set ("frames", Json::makeNumber (double (frames), true));
	respond (res, 200, response);
}

// `POST /render` bounces one already-loaded instance through the same frame format as /audio.
// Frames stream out while the instance thread renders; a stopped host or a failed plug-in still
// answers with the same JSON error shape as /rpc. Limits: <= 1800 s and <= 65536 notes per request,
// and the response ends early (client sees short/absent PCM) when a block stalls for 30 s.
void PluginServer::handleRender (const httplib::Request& req, httplib::Response& res)
{
	Json request;
	std::string parseError;
	if (!Json::parse (req.body, request, parseError) || !request.isObject ())
	{
		respond (res, 400,
		         errorResponse (0, "bad_request",
		                        parseError.empty () ? "request body must be a JSON object" : parseError));
		return;
	}

	std::string instanceId = request.get ("instanceId").asStringOr ("");
	auto instance = findInstance (instanceId);
	if (!instance)
	{
		respond (res, 404, errorResponse (0, "instance_not_found", "unknown instanceId: " + instanceId));
		return;
	}
	if (instance->failed ())
	{
		respond (res, 500, errorResponse (0, instance->failureCode (), instance->failureMessage ()));
		return;
	}

	double seconds = request.get ("seconds").asNumber ();
	if (!(seconds > 0.0) || seconds > kMaxRenderSeconds)
	{
		respond (res, 400, errorResponse (0, "render_too_long", "seconds must be > 0 and <= 1800"));
		return;
	}

	// The optional configuration describes the loaded instance; changing it needs a reload.
	auto matches = [] (const Json& value, double loaded) {
		return !value.isNumber () || std::fabs (value.asNumber () - loaded) < 0.5;
	};
	if (!matches (request.get ("sampleRate"), instance->sampleRate ()) ||
	    !matches (request.get ("blockSize"), instance->blockSize ()) ||
	    !matches (request.get ("channels"), instance->channels ()))
	{
		respond (res, 400, errorResponse (0, "render_config_mismatch",
		                                  "sampleRate/blockSize/channels must match the loaded instance"));
		return;
	}

	const Json& notesJson = request.get ("notes");
	if (!notesJson.isArray ())
	{
		respond (res, 400, errorResponse (0, "bad_request", "notes must be an array"));
		return;
	}
	if (notesJson.size () > kMaxRenderNotes)
	{
		respond (res, 400, errorResponse (0, "render_too_many_notes", "at most 65536 notes per render"));
		return;
	}
	std::vector<OfflineNote> notes;
	notes.reserve (notesJson.size ());
	for (size_t i = 0; i < notesJson.size (); ++i)
	{
		const Json& item = notesJson.at (i);
		if (!item.isObject () || !item.get ("pitch").isNumber () || !item.get ("start").isNumber () ||
		    !item.get ("length").isNumber ())
		{
			respond (res, 400, errorResponse (0, "bad_request", "each note needs numeric pitch, start and length"));
			return;
		}
		OfflineNote note;
		note.pitch = int (item.get ("pitch").asInt ());
		note.velocity = item.get ("velocity").isNumber () ? int (item.get ("velocity").asInt ()) : 100;
		note.start = item.get ("start").asNumber ();
		note.length = item.get ("length").asNumber ();
		notes.push_back (note);
	}

	auto state = instance->renderOffline (seconds, notes);
	std::string startError;
	if (!waitRenderStart (state, startError, kRenderStartWaitMs))
	{
		cancelRender (state);
		const bool workerFailure =
		    startError == "worker_failed" || startError == "worker_hung" || startError == "worker_timeout";
		respond (res, 500,
		         errorResponse (0, startError == "plugin_hang" ? "plugin_hang"
		                          : workerFailure           ? startError
		                                                    : "render_failed",
		                        startError));
		return;
	}

	res.set_header ("x-vst-latency-samples", std::to_string (long long (std::llround (instance->latencySamples ()))));
	res.set_chunked_content_provider (
	    "application/octet-stream",
	    [state] (size_t, httplib::DataSink& sink) -> bool {
		    std::shared_ptr<const std::vector<uint8_t>> frame;
		    if (!popRenderFrame (state, frame, kRenderFrameWaitMs))
		    {
			    // Returning false would cancel the connection without the terminal chunk; done()
			    // ends the body cleanly whether the render finished, stalled or was cancelled.
			    sink.done ();
			    return true;
		    }
		    return sink.write (reinterpret_cast<const char*> (frame->data ()), frame->size ());
	    },
	    [state] (bool) { cancelRender (state); });
}

} // namespace

int runServer (const Settings& settings)
{
	// Port hygiene (AGENTS.md): never bind over someone else and never move
	// ports silently - name the holder and let the user decide.
	ProcessRef holder;
	std::string portError;
	if (findPortListener (settings.port, holder, portError))
	{
		std::fprintf (stderr, "vst-host: %s:%d is already in use by pid %lu", settings.host.c_str (),
		              settings.port, holder.pid);
		if (!holder.name.empty ())
			std::fprintf (stderr, " (%s)", holder.name.c_str ());
		std::fprintf (stderr, "\n");
		if (!holder.path.empty ())
			std::fprintf (stderr, "vst-host: holder image: %s\n", holder.path.c_str ());
		std::fprintf (stderr,
		              "vst-host: refusing to start; run `vst-host --stop` to stop that server, or stop pid %lu "
		              "manually\n",
		              holder.pid);
		return 1;
	}
	if (!portError.empty ())
		std::fprintf (stderr, "vst-host: warning: port check failed: %s\n", portError.c_str ());

	PluginServer server (settings);

	httplib::Server svr;
	svr.set_payload_max_length (256ull * 1024 * 1024);
	svr.set_read_timeout (30, 0);
	svr.set_write_timeout (30, 0);
	svr.set_keep_alive_max_count (100);
	svr.new_task_queue = [] { return new httplib::ThreadPool (16); };

	svr.set_pre_routing_handler ([&server] (const httplib::Request& req, httplib::Response& res) {
		if (req.method == "OPTIONS")
		{
			res.status = 204;
			return httplib::Server::HandlerResponse::Handled;
		}
		std::string origin = req.get_header_value ("Origin");
		if (!origin.empty () && !server.auth ().originAllowed (origin))
		{
			res.status = 403;
			res.set_content ("{\"error\":\"origin not allowed\"}", "application/json");
			return httplib::Server::HandlerResponse::Handled;
		}
		if (server.auth ().tokenRequired ())
		{
			std::string provided;
			if (!server.auth ().tokenFromRequest (req, provided) || !server.auth ().tokenOk (provided))
			{
				res.status = 401;
				res.set_content ("{\"error\":\"unauthorized\"}", "application/json");
				return httplib::Server::HandlerResponse::Handled;
			}
		}
		return httplib::Server::HandlerResponse::Unhandled;
	});

	svr.set_post_routing_handler ([&server] (const httplib::Request& req, httplib::Response& res) {
		server.auth ().addCors (req, res);
	});

	svr.Post ("/rpc", [&server] (const httplib::Request& req, httplib::Response& res) {
		server.handleRpc (req, res);
	});
	svr.Get ("/audio", [&server] (const httplib::Request& req, httplib::Response& res) {
		server.handleAudio (req, res);
	});
	svr.Post ("/audio-in", [&server] (const httplib::Request& req, httplib::Response& res) {
		server.handleAudioIn (req, res);
	});
	svr.Post ("/render", [&server] (const httplib::Request& req, httplib::Response& res) {
		server.handleRender (req, res);
	});
	svr.set_exception_handler ([] (const httplib::Request&, httplib::Response& res, std::exception_ptr ep) {
		std::string message = "internal error";
		try
		{
			if (ep)
				std::rethrow_exception (ep);
		}
		catch (const std::exception& e)
		{
			message = e.what ();
		}
		catch (...)
		{
		}
		res.status = 500;
		res.set_content (errorResponse (0, "internal_error", message).dump (), "application/json");
	});

	if (!svr.bind_to_port (settings.host.c_str (), settings.port))
	{
		std::fprintf (stderr, "vst-host: failed to bind %s:%d\n", settings.host.c_str (), settings.port);
		return 1;
	}

	// From here the server owns the port: record the pid and arm the graceful
	// stop channel `--stop` uses (named event -> svr.stop() -> clean unwinding).
	installPidFileCleanup ();
	std::string pidError;
	if (!writePidFile (settings, pidError))
		std::fprintf (stderr, "vst-host: warning: could not write %s (%s); `--stop` will not find this process\n",
		              pidFilePath ().c_str (), pidError.c_str ());

	HANDLE stopEvent = createStopEvent ();
	std::thread stopWatcher;
	if (stopEvent)
		stopWatcher = std::thread ([&svr, stopEvent] {
			WaitForSingleObject (stopEvent, INFINITE);
			svr.stop ();
		});

	std::printf ("vst-host %s\n", kVersion);
	std::printf ("listening on http://%s:%d\n", settings.host.c_str (), settings.port);
	std::printf ("pid file: %s (pid %lu)\n", pidFilePath ().c_str (), GetCurrentProcessId ());
	std::printf ("stop with: vst-host --stop\n");
	std::printf ("allowed origins: ");
	for (size_t i = 0; i < settings.origins.size (); ++i)
		std::printf ("%s%s", i ? ", " : "", settings.origins[i].c_str ());
	std::printf ("\n");
	if (settings.token.empty ())
		std::printf ("auth: none (set VST_HOST_TOKEN to require a bearer token)\n");
	else
		std::printf ("auth: bearer token from VST_HOST_TOKEN\n");
	std::fflush (stdout);

	svr.listen_after_bind ();

	// Every worker child is terminated here, before the PID file goes away, so a
	// clean stop never leaves an orphan behind (a hard kill is covered by the
	// job object's KILL_ON_JOB_CLOSE).
	server.shutdown ();

	if (stopEvent)
	{
		SetEvent (stopEvent); // release the watcher when listen returns on its own
		stopWatcher.join ();
		CloseHandle (stopEvent);
	}
	removePidFile ();
	return 0;
}

} // namespace vhost
