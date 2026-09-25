// Process hygiene for the long-running server (see AGENTS.md 「反复提醒沉淀」):
//   * refuse to start when 127.0.0.1:<port> is already listening, naming the
//     holder's pid and image instead of silently retrying or moving ports,
//   * write a PID file so `--stop` can find this exact process later,
//   * `--stop` verifies the pid still belongs to this vst-host binary (name,
//     path and start time) before signalling it, so a recycled pid is never
//     killed, and removes the PID file afterwards.
#pragma once

#include "config.h"

#include <string>

#include <windows.h>

namespace vhost {

struct ProcessRef
{
	unsigned long pid {0};
	std::string name; // executable file name, e.g. "vst-host.exe"
	std::string path; // full image path when it can be read
};

// `%LOCALAPPDATA%\OpenCanvas\vst-host.pid` (falls back to `%TEMP%` when
// LOCALAPPDATA is unset). Same directory as the watchdog log.
std::string pidFilePath ();

// True when some process is LISTENing on the port. `out` is filled with the
// holder (name may stay empty when it cannot be queried). `error` reports a
// failed table query only; it does not change the return value.
bool findPortListener (int port, ProcessRef& out, std::string& error);

// Reads pid/name/path for an existing process. False when it is gone.
bool queryProcess (unsigned long pid, ProcessRef& out);

// Handle to the per-process graceful stop event. Created by the server after a
// successful bind; nullptr when the channel is unavailable.
HANDLE createStopEvent ();

// Server side: write the pid file after a successful bind.
bool writePidFile (const Settings& settings, std::string& error);

// Server side: delete the pid file (no-op when it is already gone).
void removePidFile ();

// Server side: remove the pid file on Ctrl+C / console close / logoff.
void installPidFileCleanup ();

// `vst-host --stop`. Returns a process exit code.
int runStopCommand ();

} // namespace vhost
