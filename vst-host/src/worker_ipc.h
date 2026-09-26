// IPC shared by the server-side plugin proxy (`worker.cpp`) and the per-instance
// child (`worker_child.cpp`, `vst-host --plugin-worker <id>`).
//
// Three channels, all documented in `vst-host/README.md`「Worker isolation」:
//
//   control       one duplex byte-mode named pipe per instance. Frames are a
//                 4-byte LE payload length + UTF-8 JSON (json.h). Requests carry
//                 a `seq` the response echoes; events (renderDone) have none.
//   audio out     SPSC frame ring in a named `CreateFileMapping` section. The
//                 child publishes fixed-size slots and signals an inherited
//                 auto-reset event; the parent copies the frame out of the
//                 mapping. No socket/pipe per block.
//   render out    same shape, but the producer waits for space instead of
//                 dropping (an offline bounce must not lose a block).
//   audio in      a byte ring (length-prefixed `/audio-in` bodies) in the
//                 reverse direction, protected by a named mutex. Bounded and
//                 drop-oldest, so the render thread never blocks on the control
//                 plane.
//
// Ring slot layout (audio out / render out):
//   [u32 LE payloadBytes][payload = the exact `/audio` frame]
// where the payload is `[u32 hash][u32 seq][u32 channels][u32 frames]` + planar
// Float32 — the same bytes `GET /audio` already emits.
#pragma once

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

#include <windows.h>

namespace vhost {
namespace ipc {

inline void traceStep (const char* step)
{
	char path[512];
	std::snprintf (path, sizeof (path), "C:\\Users\\antar\\AppData\\Local\\Temp\\vst-trace-%lu.log",
	               GetCurrentProcessId ());
	FILE* f = _fsopen (path, "a", _SH_DENYNO);
	if (f)
	{
		std::fprintf (f, "%llu %s\n", (unsigned long long) GetTickCount64 (), step);
		std::fclose (f);
	}
}

// ---- control channel -------------------------------------------------------
/** Guard against a corrupt 4-byte length prefix turning into a huge allocation. */
constexpr uint32_t kMaxControlMessageBytes = 64u * 1024 * 1024;

// ---- timeouts (documented in the README; all values are milliseconds) -------
constexpr int kConnectTimeoutMs = 10000;    // parent waits for the child's pipe connect
constexpr int kConnectPollMs = 10;
constexpr int kPingIntervalMs = 5000;       // liveness ping cadence
constexpr int kPingTimeoutMs = 2000;        // one pong wait
constexpr int kPingMisses = 3;              // kill after 3 missed pongs (~15 s)
constexpr int kLoadTimeoutMs = 30000;       // < the server's load wait, so this fires first and its real code is relayed
constexpr int kCommandTimeoutMs = 10000;    // < the server's per-call timeout (same reason)
constexpr int kRenderBlocksTimeoutMs = 30000; // `renderBlocks` runs a full render on the child
constexpr int kRenderAckTimeoutMs = 15000;  // ack wait; the server waits 15 s for the first block
constexpr int kExitGraceMs = 5000;          // graceful unload before TerminateProcess
constexpr int kWaitSliceMs = 50;            // ring / drain poll slice

// ---- ring geometry ---------------------------------------------------------
/** Slot byte budget is sized for two channels; also the /audio-in frame cap. */
constexpr uint32_t kMaxBlockSize = 8192;
constexpr uint32_t kAudioSlots = 64;   // ~341 ms at 48 kHz / 256 frames
constexpr uint32_t kRenderSlots = 64;  // mirrors the in-process offline backlog
constexpr uint32_t kInputBytes = 2u * 1024 * 1024; // one max (1 MiB) /audio-in body + slack
constexpr uint32_t kSlotHeaderBytes = 4; // u32 LE payload length at the slot start

struct FrameRingHeader
{
	volatile LONG64 writeSeq;   // slots published by the producer
	volatile LONG64 readSeq;    // slots reserved by the consumer (or dropped on overrun)
	volatile LONG64 dropped;    // frames overwritten before the consumer read them
	volatile LONG producerAlive;
	uint32_t slotBytes;         // [u32 length][payload] bytes per slot
	uint32_t slotCount;
	uint32_t reserved[7];
};
static_assert (sizeof (FrameRingHeader) == 64, "frame ring header is 64 bytes");

struct ByteRingHeader
{
	volatile LONG64 writeBytes; // total bytes appended ([u32 length][payload])
	volatile LONG64 readBytes;  // total bytes consumed
	volatile LONG64 droppedRecords;
	volatile LONG producerAlive;
	uint32_t capacity;
	uint32_t reserved[7];
};
static_assert (sizeof (ByteRingHeader) == 64, "byte ring header is 64 bytes");

constexpr size_t kFrameRingHeaderBytes = sizeof (FrameRingHeader);
constexpr size_t kByteRingHeaderBytes = sizeof (ByteRingHeader);

inline FrameRingHeader* frameHeader (void* view)
{
	return static_cast<FrameRingHeader*> (view);
}

inline ByteRingHeader* byteHeader (void* view)
{
	return static_cast<ByteRingHeader*> (view);
}

inline uint8_t* frameSlot (void* view, uint32_t slotBytes, uint32_t slotCount, long long seq)
{
	auto* base = static_cast<uint8_t*> (view) + kFrameRingHeaderBytes;
	return base + size_t (seq % slotCount) * slotBytes;
}

// Byte-ring payload accessor with wrap-around; offsets are monotonic totals and
// are folded into the buffer here.
inline void byteRingCopyIn (void* view, uint32_t capacity, long long offset, const void* source, size_t size)
{
	auto* base = static_cast<uint8_t*> (view) + kByteRingHeaderBytes;
	const size_t start = size_t (offset % capacity);
	const size_t first = std::min (size, size_t (capacity) - start);
	std::memcpy (base + start, source, first);
	if (size > first)
		std::memcpy (base, static_cast<const uint8_t*> (source) + first, size - first);
}

inline void byteRingCopyOut (void* view, uint32_t capacity, long long offset, void* target, size_t size)
{
	const auto* base = static_cast<const uint8_t*> (view) + kByteRingHeaderBytes;
	const size_t start = size_t (offset % capacity);
	const size_t first = std::min (size, size_t (capacity) - start);
	std::memcpy (target, base + start, first);
	if (size > first)
		std::memcpy (static_cast<uint8_t*> (target) + first, base, size - first);
}

// 64-bit counters shared across processes: reads through an exchange, writes
// through the interlocked increment (x64 only, which this host targets).
inline long long ringRead (volatile LONG64* value)
{
	return _InterlockedCompareExchange64 (value, 0, 0);
}

inline void ringBump (volatile LONG64* value)
{
	_InterlockedIncrement64 (value);
}

inline LONG aliveRead (volatile LONG* value)
{
	return _InterlockedCompareExchange (value, 0, 0);
}

inline void aliveWrite (volatile LONG* value, LONG alive)
{
	_InterlockedExchange (value, alive);
}

// ---- control pipe framing --------------------------------------------------
inline bool pipeReadExact (HANDLE pipe, void* buffer, DWORD size)
{
	auto* bytes = static_cast<uint8_t*> (buffer);
	DWORD offset = 0;
	while (offset < size)
	{
		DWORD read = 0;
		if (!ReadFile (pipe, bytes + offset, size - offset, &read, nullptr) || read == 0)
			return false;
		offset += read;
	}
	return true;
}

inline bool pipeWriteFrame (HANDLE pipe, const std::string& payload)
{
	if (!pipe || payload.size () > kMaxControlMessageBytes)
		return false;
	const uint32_t size = uint32_t (payload.size ());
	uint8_t header[4];
	header[0] = uint8_t (size);
	header[1] = uint8_t (size >> 8);
	header[2] = uint8_t (size >> 16);
	header[3] = uint8_t (size >> 24);
	DWORD written = 0;
	traceStep (("pf enter size=" + std::to_string (size)).c_str ());
	if (!WriteFile (pipe, header, 4, &written, nullptr) || written != 4)
		return false;
	traceStep ("pf hdr ok");
	size_t offset = 0;
	while (offset < payload.size ())
	{
		DWORD wrote = 0;
		const DWORD chunk = DWORD (std::min<size_t> (payload.size () - offset, 1u << 20));
		if (!WriteFile (pipe, payload.data () + offset, chunk, &wrote, nullptr) || wrote == 0)
			return false;
		offset += wrote;
	}
	traceStep ("pf payload ok");
	return true;
}

inline bool pipeReadFrame (HANDLE pipe, std::string& payload)
{
	if (!pipe)
		return false;
	uint8_t header[4];
	if (!pipeReadExact (pipe, header, 4))
		return false;
	const uint32_t size = uint32_t (header[0]) | (uint32_t (header[1]) << 8) | (uint32_t (header[2]) << 16) |
	                      (uint32_t (header[3]) << 24);
	if (size > kMaxControlMessageBytes)
		return false;
	payload.assign (size, '\0');
	return size == 0 || pipeReadExact (pipe, payload.data (), DWORD (size));
}

} // namespace ipc
} // namespace vhost
