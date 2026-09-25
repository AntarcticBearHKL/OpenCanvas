// Runtime settings, resolved once from the environment at startup. Mirrors the
// shape of mcp/src/canvas_mcp/config.py: loopback bind, exact Origin allowlist
// and a generated Bearer token when none is configured.
#pragma once

#include <string>
#include <vector>

namespace vhost {

inline constexpr const char* kVersion = "0.1.0";
inline constexpr const char* kDefaultOrigins =
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000";

struct Settings
{
	std::string host {"127.0.0.1"};
	int port {3211};
	std::vector<std::string> origins;
	std::string token;
	bool tokenGenerated {false};
	std::vector<std::string> pluginDirs;
	bool debug {false};
};

Settings loadSettings ();
std::vector<std::string> splitList (const std::string& value);

} // namespace vhost
