// Small process-wide helpers: base64 (VST3 state blobs), a stable instance
// hash for the /audio frame header, a loopback token generator and a couple of
// path/UTF-8 conversions.
#pragma once

#include <cstdint>
#include <cstring>
#include <iterator>
#include <random>
#include <string>
#include <vector>

#include <windows.h>

namespace vhost {

inline uint32_t fnv1a32 (const std::string& s)
{
	uint32_t h = 2166136261u;
	for (unsigned char c : s)
	{
		h ^= c;
		h *= 16777619u;
	}
	return h;
}

inline std::string base64Encode (const uint8_t* data, size_t size)
{
	static const char* table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	std::string out;
	out.reserve (((size + 2) / 3) * 4);
	size_t i = 0;
	while (i + 2 < size)
	{
		uint32_t n = (uint32_t (data[i]) << 16) | (uint32_t (data[i + 1]) << 8) | data[i + 2];
		out += table[(n >> 18) & 63];
		out += table[(n >> 12) & 63];
		out += table[(n >> 6) & 63];
		out += table[n & 63];
		i += 3;
	}
	if (i < size)
	{
		uint32_t n = uint32_t (data[i]) << 16;
		out += table[(n >> 18) & 63];
		if (i + 1 < size)
		{
			n |= uint32_t (data[i + 1]) << 8;
			out += table[(n >> 12) & 63];
			out += table[(n >> 6) & 63];
		}
		else
			out += table[(n >> 12) & 63];
		out += '=';
	}
	return out;
}

inline std::string base64Encode (const std::vector<uint8_t>& data)
{
	return base64Encode (data.data (), data.size ());
}

inline bool base64Decode (const std::string& text, std::vector<uint8_t>& out)
{
	auto value = [] (char c) -> int {
		if (c >= 'A' && c <= 'Z')
			return c - 'A';
		if (c >= 'a' && c <= 'z')
			return c - 'a' + 26;
		if (c >= '0' && c <= '9')
			return c - '0' + 52;
		if (c == '+')
			return 62;
		if (c == '/')
			return 63;
		return -1;
	};
	out.clear ();
	out.reserve (text.size () / 4 * 3);
	uint32_t acc = 0;
	int bits = 0;
	for (char c : text)
	{
		if (c == '=' || c == '\n' || c == '\r')
			continue;
		int v = value (c);
		if (v < 0)
			return false;
		acc = (acc << 6) | uint32_t (v);
		bits += 6;
		if (bits >= 8)
		{
			bits -= 8;
			out.push_back (uint8_t ((acc >> bits) & 0xFF));
		}
	}
	return true;
}

// 32 random bytes, base64url without padding (mirrors Python's token_urlsafe).
inline std::string generateToken ()
{
	std::random_device rd;
	uint8_t bytes[32];
	for (size_t i = 0; i < sizeof (bytes); i += 4)
	{
		uint32_t v = rd ();
		std::memcpy (bytes + i, &v, 4);
	}
	std::string b64 = base64Encode (bytes, sizeof (bytes));
	for (char& c : b64)
	{
		if (c == '+')
			c = '-';
		else if (c == '/')
			c = '_';
	}
	while (!b64.empty () && b64.back () == '=')
		b64.pop_back ();
	return b64;
}

inline std::string wideToUtf8 (const std::wstring& w)
{
	if (w.empty ())
		return {};
	int needed = WideCharToMultiByte (CP_UTF8, 0, w.data (), int (w.size ()), nullptr, 0, nullptr, nullptr);
	std::string out (size_t (needed > 0 ? needed : 0), '\0');
	if (needed > 0)
		WideCharToMultiByte (CP_UTF8, 0, w.data (), int (w.size ()), out.data (), needed, nullptr, nullptr);
	return out;
}

inline std::string getenvString (const char* name)
{
	char buf[4096];
	DWORD n = GetEnvironmentVariableA (name, buf, sizeof (buf));
	return n > 0 && n < sizeof (buf) ? std::string (buf, n) : std::string ();
}

// Absolute path of the running executable (used to spawn the scan worker).
inline std::string executablePath ()
{
	wchar_t buf[MAX_PATH * 4];
	DWORD n = GetModuleFileNameW (nullptr, buf, DWORD (std::size (buf)));
	return wideToUtf8 (std::wstring (buf, buf + n));
}

} // namespace vhost
