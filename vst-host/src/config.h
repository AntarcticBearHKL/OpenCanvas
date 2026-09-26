// Runtime settings, resolved once from the environment at startup. Loopback bind
// and an exact Origin allowlist; the Bearer token is optional (set VST_HOST_TOKEN
// to require it, leave it unset for a frictionless local host).
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
	std::vector<std::string> pluginDirs;
	bool debug {false};
};

Settings loadSettings ();
std::vector<std::string> splitList (const std::string& value);

} // namespace vhost
