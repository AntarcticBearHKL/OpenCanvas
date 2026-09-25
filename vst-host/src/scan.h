// VST3 plug-in discovery.
//
// Scanning loads every module to read its factory/class metadata, which is the
// only reliable way to get names/vendors for bundles that ship no
// moduleinfo.json. To keep a misbehaving plug-in from taking the server down,
// the server never scans in-process: it re-runs itself as `--scan-worker` and
// reads the JSON the child prints. Both a `.vst3` bundle directory and a
// single-file `.vst3` DLL are valid and reported with their real packaging.
#pragma once

#include <string>
#include <vector>

namespace vhost {

struct PluginInfo
{
	std::string id;
	std::string name;
	std::string vendor;
	std::string version;
	std::string category;
	std::vector<std::string> subCategories;
	std::string path;
	std::string packaging; // "bundle" | "single"
	bool isInstrument {false};
};

struct ScanSpawnResult
{
	bool ok {false};
	bool timedOut {false};
	int exitCode {0};
	std::string output;
	std::string error;
};

// Worker side: enumerate + load modules in this process. Used by `--scan-worker`.
std::vector<PluginInfo> scanInProcess (const std::vector<std::string>& extraDirs);

// Serialize a plugin list as the `{"plugins":[...]}` response payload.
std::string pluginsToJson (const std::vector<PluginInfo>& plugins);

// Parent side: run `<exePath> --scan-worker` and capture its stdout.
ScanSpawnResult runScanWorker (const std::string& exePath, int timeoutMs);

// Load one module and read its Audio Module Classes (used when loading by path).
bool inspectModuleInProcess (const std::string& modulePath, std::vector<PluginInfo>& out,
                             std::string& error);

} // namespace vhost
