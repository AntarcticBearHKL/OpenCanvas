// vst-host entry point.
//
//   vst-host                 -> run the HTTP server (loopback, port 3211)
//   vst-host --stop          -> stop the server recorded in the PID file
//   vst-host --scan          -> print the discovered plug-ins as JSON and exit
//   vst-host --scan-worker   -> internal: the isolated scanning child
//   vst-host --selftest PATH -> load one plug-in, render ~2 s, attach its editor
//
// `--scan` deliberately re-executes this binary as `--scan-worker`: loading a
// commercial plug-in can hang or crash during factory init, and a child process
// keeps that away from the server. The worker terminates without running
// plug-in teardown, which several Steinberg plug-ins are not safe to do.

#include "config.h"
#include "instance.h"
#include "lifecycle.h"
#include "scan.h"
#include "server.h"
#include "util.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include <windows.h>

using namespace vhost;

namespace {

void printUsage ()
{
	std::printf ("vst-host %s\n", kVersion);
	std::printf ("usage:\n");
	std::printf ("  vst-host                      run the HTTP server on 127.0.0.1:3211\n");
	std::printf ("  vst-host --stop               stop the running server via the PID file\n");
	std::printf ("  vst-host --scan               print the plug-in list as JSON and exit\n");
	std::printf ("  vst-host --selftest <path>    load a plug-in, render ~2 s, attach its editor\n");
	std::printf ("  vst-host --scan-worker        internal scan child (do not call directly)\n");
	std::printf ("environment:\n");
	std::printf ("  VST_HOST_TOKEN        bearer token (generated and printed when unset)\n");
	std::printf ("  VST_HOST_ORIGINS      comma-separated Origin allowlist\n");
	std::printf ("  VST_HOST_PLUGIN_DIRS  extra directories to scan for .vst3\n");
	std::printf ("pid file:\n");
	std::printf ("  %s\n", pidFilePath ().c_str ());
}

int runScanWorkerMode ()
{
	Settings settings = loadSettings ();
	std::vector<PluginInfo> plugins = scanInProcess (settings.pluginDirs);
	std::string json = pluginsToJson (plugins);
	std::fwrite (json.data (), 1, json.size (), stdout);
	std::fputc ('\n', stdout);
	std::fflush (stdout);

	// Skip plug-in teardown/destructors: some loaded modules are unsafe to
	// unload, and the parent already has everything it needs.
	TerminateProcess (GetCurrentProcess (), 0);
	return 0;
}

int runScanMode ()
{
	ScanSpawnResult result = runScanWorker (executablePath (), 120000);
	if (result.timedOut)
	{
		std::fprintf (stderr, "scan failed: %s\n", result.error.c_str ());
		return 1;
	}
	if (result.output.empty ())
	{
		std::fprintf (stderr, "scan failed: %s\n",
		              result.error.empty () ? "no output" : result.error.c_str ());
		return 1;
	}
	std::fwrite (result.output.data (), 1, result.output.size (), stdout);
	if (result.output.back () != '\n')
		std::fputc ('\n', stdout);
	std::fflush (stdout);
	return 0;
}

int runSelfTest (const std::string& path)
{
	auto instance = std::make_shared<PluginInstance> ("selftest");
	std::string startError;
	if (!instance->start (startError))
	{
		std::printf ("ERROR=start:%s\n", startError.c_str ());
		return 2;
	}

	auto loadFuture = instance->post (
	    [instance, path] { return instance->doLoad (path, "", 48000.0, 256, 2); });
	if (loadFuture.wait_for (std::chrono::seconds (30)) != std::future_status::ready)
	{
		std::printf ("ERROR=load-timeout\n");
		return 2;
	}
	LoadResult load = loadFuture.get ();
	if (!load.ok)
	{
		std::printf ("ERROR=%s\n", load.error.c_str ());
		return 2;
	}
	std::printf ("MODULE_LOAD=ok\n");
	std::printf ("CHANNELS=%d\n", instance->channels ());

	instance->post ([instance] { return instance->doNoteOn (60, 100, 0); }).wait ();

	const int blocks = int ((2.0 * 48000.0) / 256.0); // ~2 s at 48 kHz / 256
	auto renderFuture = instance->post ([instance, blocks] { return instance->doRenderBlocks (blocks); });
	if (renderFuture.wait_for (std::chrono::seconds (30)) != std::future_status::ready)
	{
		std::printf ("ERROR=render-timeout\n");
		return 2;
	}
	RenderStats stats = renderFuture.get ();
	std::printf ("RMS=%.6f\n", stats.rms);
	std::printf ("PEAK=%.6f\n", stats.peak);
	std::printf ("LATENCY=%u\n", unsigned (instance->latencySamples ()));

	auto editorFuture = instance->post ([instance] { return instance->doEditorOpen (); });
	bool opened = false;
	if (editorFuture.wait_for (std::chrono::seconds (15)) == std::future_status::ready)
		opened = editorFuture.get ();
	std::printf ("EDITOR_ATTACH=%s\n", opened ? "ok" : "fail");

	instance->post ([instance] { return instance->doEditorClose (); }).wait ();
	bool cleanStop = instance->stop (5000);
	std::printf ("STOP=%s\n", cleanStop ? "ok" : "timeout");
	std::fflush (stdout);

	return (opened && stats.rms > 0.0) ? 0 : 3;
}

} // namespace

int main (int argc, char** argv)
{
	SetConsoleOutputCP (CP_UTF8);
	SetProcessDPIAware ();
	initHostApplication ();

	std::vector<std::string> args (argv + 1, argv + argc);
	if (args.empty ())
		return runServer (loadSettings ());

	const std::string& command = args[0];
	if (command == "--help" || command == "-h")
	{
		printUsage ();
		return 0;
	}
	if (command == "--scan-worker")
		return runScanWorkerMode ();
	if (command == "--scan")
		return runScanMode ();
	if (command == "--stop")
		return runStopCommand ();
	if (command == "--selftest")
	{
		if (args.size () < 2)
		{
			std::fprintf (stderr, "--selftest requires a plug-in path\n");
			return 2;
		}
		return runSelfTest (args[1]);
	}

	printUsage ();
	return 2;
}
