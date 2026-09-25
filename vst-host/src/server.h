#pragma once

#include "config.h"

namespace vhost {

// Runs the blocking HTTP server (loopback only). Returns a process exit code.
int runServer (const Settings& settings);

} // namespace vhost
