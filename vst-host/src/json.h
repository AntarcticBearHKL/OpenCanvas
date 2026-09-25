// Minimal JSON value + parser/serializer.
//
// The frozen v1 protocol only needs flat scalar request objects and small
// nested response objects, so this stays deliberately compact instead of
// pulling in a third-party JSON dependency. Values are kept in insertion
// order so request/response fields read the way they were written.
#pragma once

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <utility>
#include <vector>

namespace vhost {

class Json {
public:
	enum class Type
	{
		Null,
		Bool,
		Number,
		String,
		Array,
		Object
	};

	Json () = default;

	static Json makeBool (bool v)
	{
		Json j;
		j.type_ = Type::Bool;
		j.bool_ = v;
		return j;
	}
	static Json makeNumber (double v, bool isInt = false)
	{
		Json j;
		j.type_ = Type::Number;
		j.num_ = v;
		j.isInt_ = isInt;
		return j;
	}
	static Json makeString (std::string v)
	{
		Json j;
		j.type_ = Type::String;
		j.str_ = std::move (v);
		return j;
	}
	static Json makeArray ()
	{
		Json j;
		j.type_ = Type::Array;
		return j;
	}
	static Json makeObject ()
	{
		Json j;
		j.type_ = Type::Object;
		return j;
	}

	Type type () const { return type_; }
	bool isNull () const { return type_ == Type::Null; }
	bool isBool () const { return type_ == Type::Bool; }
	bool isNumber () const { return type_ == Type::Number; }
	bool isString () const { return type_ == Type::String; }
	bool isArray () const { return type_ == Type::Array; }
	bool isObject () const { return type_ == Type::Object; }

	bool asBool (bool def = false) const
	{
		if (type_ == Type::Bool)
			return bool_;
		if (type_ == Type::Number)
			return num_ != 0.0;
		return def;
	}
	double asNumber (double def = 0.0) const { return type_ == Type::Number ? num_ : def; }
	long long asInt (long long def = 0) const
	{
		return type_ == Type::Number ? static_cast<long long> (std::llround (num_)) : def;
	}
	const std::string& asString () const { return str_; }
	std::string asStringOr (const std::string& def) const { return type_ == Type::String ? str_ : def; }

	// array
	void push (Json v) { arr_.push_back (std::move (v)); }
	size_t size () const
	{
		if (type_ == Type::Array)
			return arr_.size ();
		if (type_ == Type::Object)
			return obj_.size ();
		return 0;
	}
	const Json& at (size_t i) const
	{
		static const Json null;
		return (type_ == Type::Array && i < arr_.size ()) ? arr_[i] : null;
	}

	// object
	void set (const std::string& key, Json v)
	{
		for (auto& kv : obj_)
		{
			if (kv.first == key)
			{
				kv.second = std::move (v);
				return;
			}
		}
		obj_.emplace_back (key, std::move (v));
	}
	const Json* find (const std::string& key) const
	{
		for (const auto& kv : obj_)
			if (kv.first == key)
				return &kv.second;
		return nullptr;
	}
	bool has (const std::string& key) const { return find (key) != nullptr; }
	const Json& get (const std::string& key) const
	{
		static const Json null;
		const Json* p = find (key);
		return p ? *p : null;
	}

	std::string dump () const
	{
		std::string out;
		dumpTo (out);
		return out;
	}

	static bool parse (const std::string& text, Json& out, std::string& error)
	{
		Parser p {text.data (), text.data () + text.size ()};
		p.skipWs ();
		if (!p.parseValue (out))
		{
			error = p.error.empty () ? "invalid json" : p.error;
			return false;
		}
		p.skipWs ();
		if (p.cur != p.end)
		{
			error = "trailing data";
			return false;
		}
		return true;
	}

private:
	void dumpTo (std::string& out) const
	{
		switch (type_)
		{
			case Type::Null: out += "null"; break;
			case Type::Bool: out += bool_ ? "true" : "false"; break;
			case Type::Number:
			{
				char buf[40];
				if (isInt_)
					std::snprintf (buf, sizeof (buf), "%lld", static_cast<long long> (std::llround (num_)));
				else
					std::snprintf (buf, sizeof (buf), "%.9g", num_);
				out += buf;
				break;
			}
			case Type::String: dumpString (out, str_); break;
			case Type::Array:
			{
				out += '[';
				for (size_t i = 0; i < arr_.size (); ++i)
				{
					if (i)
						out += ',';
					arr_[i].dumpTo (out);
				}
				out += ']';
				break;
			}
			case Type::Object:
			{
				out += '{';
				for (size_t i = 0; i < obj_.size (); ++i)
				{
					if (i)
						out += ',';
					dumpString (out, obj_[i].first);
					out += ':';
					obj_[i].second.dumpTo (out);
				}
				out += '}';
				break;
			}
		}
	}

	static void dumpString (std::string& out, const std::string& s)
	{
		out += '"';
		for (unsigned char c : s)
		{
			switch (c)
			{
				case '"': out += "\\\""; break;
				case '\\': out += "\\\\"; break;
				case '\b': out += "\\b"; break;
				case '\f': out += "\\f"; break;
				case '\n': out += "\\n"; break;
				case '\r': out += "\\r"; break;
				case '\t': out += "\\t"; break;
				default:
					if (c < 0x20)
					{
						char buf[8];
						std::snprintf (buf, sizeof (buf), "\\u%04x", c);
						out += buf;
					}
					else
						out += static_cast<char> (c);
			}
		}
		out += '"';
	}

	struct Parser
	{
		const char* cur;
		const char* end;
		std::string error;

		void skipWs ()
		{
			while (cur != end && (*cur == ' ' || *cur == '\t' || *cur == '\n' || *cur == '\r'))
				++cur;
		}

		bool parseValue (Json& out)
		{
			if (cur == end)
			{
				error = "unexpected end of input";
				return false;
			}
			switch (*cur)
			{
				case '{': return parseObject (out);
				case '[': return parseArray (out);
				case '"': return parseString (out);
				case 't': return parseLiteral ("true", Json::makeBool (true), out);
				case 'f': return parseLiteral ("false", Json::makeBool (false), out);
				case 'n': return parseLiteral ("null", Json (), out);
				default: return parseNumber (out);
			}
		}

		bool parseLiteral (const char* lit, Json value, Json& out)
		{
			size_t n = std::strlen (lit);
			if (static_cast<size_t> (end - cur) < n || std::strncmp (cur, lit, n) != 0)
			{
				error = "invalid literal";
				return false;
			}
			cur += n;
			out = std::move (value);
			return true;
		}

		bool parseNumber (Json& out)
		{
			const char* start = cur;
			bool isInt = true;
			if (cur != end && (*cur == '-' || *cur == '+'))
				++cur;
			while (cur != end && *cur >= '0' && *cur <= '9')
				++cur;
			if (cur != end && *cur == '.')
			{
				isInt = false;
				++cur;
				while (cur != end && *cur >= '0' && *cur <= '9')
					++cur;
			}
			if (cur != end && (*cur == 'e' || *cur == 'E'))
			{
				isInt = false;
				++cur;
				if (cur != end && (*cur == '-' || *cur == '+'))
					++cur;
				while (cur != end && *cur >= '0' && *cur <= '9')
					++cur;
			}
			if (cur == start)
			{
				error = "invalid number";
				return false;
			}
			out = Json::makeNumber (std::strtod (std::string (start, cur).c_str (), nullptr), isInt);
			return true;
		}

		static void appendUtf8 (std::string& out, uint32_t cp)
		{
			if (cp <= 0x7F)
				out += static_cast<char> (cp);
			else if (cp <= 0x7FF)
			{
				out += static_cast<char> (0xC0 | (cp >> 6));
				out += static_cast<char> (0x80 | (cp & 0x3F));
			}
			else if (cp <= 0xFFFF)
			{
				out += static_cast<char> (0xE0 | (cp >> 12));
				out += static_cast<char> (0x80 | ((cp >> 6) & 0x3F));
				out += static_cast<char> (0x80 | (cp & 0x3F));
			}
			else
			{
				out += static_cast<char> (0xF0 | (cp >> 18));
				out += static_cast<char> (0x80 | ((cp >> 12) & 0x3F));
				out += static_cast<char> (0x80 | ((cp >> 6) & 0x3F));
				out += static_cast<char> (0x80 | (cp & 0x3F));
			}
		}

		bool parseHex4 (uint32_t& value)
		{
			if (static_cast<size_t> (end - cur) < 4)
			{
				error = "bad unicode escape";
				return false;
			}
			value = 0;
			for (int i = 0; i < 4; ++i)
			{
				char c = *cur++;
				value <<= 4;
				if (c >= '0' && c <= '9')
					value |= static_cast<uint32_t> (c - '0');
				else if (c >= 'a' && c <= 'f')
					value |= static_cast<uint32_t> (c - 'a' + 10);
				else if (c >= 'A' && c <= 'F')
					value |= static_cast<uint32_t> (c - 'A' + 10);
				else
				{
					error = "bad unicode escape";
					return false;
				}
			}
			return true;
		}

		bool parseString (Json& out)
		{
			if (*cur != '"')
			{
				error = "expected string";
				return false;
			}
			++cur;
			std::string s;
			while (cur != end && *cur != '"')
			{
				char c = *cur++;
				if (c != '\\')
				{
					s += c;
					continue;
				}
				if (cur == end)
				{
					error = "unterminated escape";
					return false;
				}
				char e = *cur++;
				switch (e)
				{
					case '"': s += '"'; break;
					case '\\': s += '\\'; break;
					case '/': s += '/'; break;
					case 'b': s += '\b'; break;
					case 'f': s += '\f'; break;
					case 'n': s += '\n'; break;
					case 'r': s += '\r'; break;
					case 't': s += '\t'; break;
					case 'u':
					{
						uint32_t cp = 0;
						if (!parseHex4 (cp))
							return false;
						if (cp >= 0xD800 && cp <= 0xDBFF && static_cast<size_t> (end - cur) >= 6 &&
						    cur[0] == '\\' && cur[1] == 'u')
						{
							cur += 2;
							uint32_t lo = 0;
							if (!parseHex4 (lo))
								return false;
							cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
						}
						appendUtf8 (s, cp);
						break;
					}
					default: error = "bad escape"; return false;
				}
			}
			if (cur == end)
			{
				error = "unterminated string";
				return false;
			}
			++cur; // closing quote
			out = Json::makeString (std::move (s));
			return true;
		}

		bool parseArray (Json& out)
		{
			++cur; // [
			Json arr = Json::makeArray ();
			skipWs ();
			if (cur != end && *cur == ']')
			{
				++cur;
				out = std::move (arr);
				return true;
			}
			for (;;)
			{
				skipWs ();
				Json item;
				if (!parseValue (item))
					return false;
				arr.push (std::move (item));
				skipWs ();
				if (cur == end)
				{
					error = "unterminated array";
					return false;
				}
				if (*cur == ',')
				{
					++cur;
					continue;
				}
				if (*cur == ']')
				{
					++cur;
					break;
				}
				error = "expected ',' or ']'";
				return false;
			}
			out = std::move (arr);
			return true;
		}

		bool parseObject (Json& out)
		{
			++cur; // {
			Json obj = Json::makeObject ();
			skipWs ();
			if (cur != end && *cur == '}')
			{
				++cur;
				out = std::move (obj);
				return true;
			}
			for (;;)
			{
				skipWs ();
				Json key;
				if (!parseString (key))
					return false;
				skipWs ();
				if (cur == end || *cur != ':')
				{
					error = "expected ':'";
					return false;
				}
				++cur;
				skipWs ();
				Json value;
				if (!parseValue (value))
					return false;
				obj.set (key.asString (), std::move (value));
				skipWs ();
				if (cur == end)
				{
					error = "unterminated object";
					return false;
				}
				if (*cur == ',')
				{
					++cur;
					continue;
				}
				if (*cur == '}')
				{
					++cur;
					break;
				}
				error = "expected ',' or '}'";
				return false;
			}
			out = std::move (obj);
			return true;
		}
	};

	Type type_ {Type::Null};
	bool bool_ {false};
	double num_ {0.0};
	bool isInt_ {false};
	std::string str_;
	std::vector<Json> arr_;
	std::vector<std::pair<std::string, Json>> obj_;
};

} // namespace vhost
