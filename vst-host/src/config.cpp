#include "config.h"

#include "util.h"

namespace vhost {

std::vector<std::string> splitList (const std::string& value)
{
	std::vector<std::string> out;
	size_t start = 0;
	while (start <= value.size ())
	{
		size_t sep = value.find_first_of (",;", start);
		std::string item = value.substr (start, sep == std::string::npos ? std::string::npos : sep - start);
		// trim ASCII whitespace
		size_t b = item.find_first_not_of (" \t");
		size_t e = item.find_last_not_of (" \t");
		if (b != std::string::npos)
			out.push_back (item.substr (b, e - b + 1));
		if (sep == std::string::npos)
			break;
		start = sep + 1;
	}
	return out;
}

Settings loadSettings ()
{
	Settings s;
	s.origins = splitList (getenvString ("VST_HOST_ORIGINS"));
	if (s.origins.empty ())
		s.origins = splitList (kDefaultOrigins);

	s.pluginDirs = splitList (getenvString ("VST_HOST_PLUGIN_DIRS"));

	// The Bearer token is optional: unset means the Origin allowlist is the only
	// guard, so a local host is reachable without any token plumbing.
	s.token = getenvString ("VST_HOST_TOKEN");

	std::string debug = getenvString ("VST_HOST_DEBUG");
	s.debug = (debug == "1" || debug == "true" || debug == "yes" || debug == "on");
	return s;
}

} // namespace vhost
