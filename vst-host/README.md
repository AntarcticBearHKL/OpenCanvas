# vst-host

Local companion process that hosts **VST3 instruments and effects** and streams their audio to the browser.
The browser never loads a `.vst3` (it can't — native binaries are sandboxed out); this process
does, and the web app talks to it over loopback.

It mirrors the trust model of `../mcp/src/canvas_mcp`: bind **127.0.0.1 only** and an exact
`Origin` allowlist, with an **optional** Bearer token, and the page dials out to it.

```
browser (web/src/lib/canvas/audio-vst.*)        vst-host.exe  (this process)
  worker ── POST /rpc (control) ──────────────►  router + auth guard
         ◄── GET /audio (chunked PCM) ───────   one PluginInstance per loaded plugin
  worker ── POST /audio-in (effect input) ────►  input bus of an effect instance
  worklet ──► strip.input in the studio graph      editor = native HWND (IPlugView)
```

The plugin's own editor is a **native window owned by this process** — it cannot be embedded in
the page. The UI just asks for it to be opened (`editorOpen`).

## Status

Verified on Windows x64 against a real machine's plugins (Steinberg HALion 7 / HALion Sonic /
Groove Agent / Groove Agent SE / Padshop / Retrologue / Backbone, Yamaha Omnivocal Beta,
Kong Audio QinEngineV3):

- `--scan` finds all 9, correctly reporting `bundle` vs `single` packaging.
- `--selftest` renders real audio (Retrologue RMS ≈ 0.139) and attaches the plugin editor.
- `/audio` framing is exact (16-byte header + planar Float32, no partial frames).
- The browser side is covered by `../web/e2e/vst-bridge.mjs`, `vst-graph.mjs`, `vst-picker.mjs`,
  `vst-editor.mjs`, `vst-mixdown.mjs`, and `vst-effect.mjs` (the effect path, against the fixture).

**Effects (`role: "effect"`) are implemented but unverified against any real Fx plug-in**: the
reference machine has no Fx plug-in installed, so the effect path was verified only against the
VST3 SDK's `again` sample built into a temporary fixture directory (see *Effect test fixture*
below and `../web/e2e/vst-effect.mjs`). Nothing here has been exercised with a commercial effect.

Not done yet: runtime plugin loading is **in-process** (a plugin crash can take the server down;
*scanning* is already isolated in a child process), and offline rendering of effects (`/render`
runs an effect on silence; an effect has no host-side stem bounce yet).

## Prerequisites

- Windows x64, **Visual Studio 2022** with the C++ toolchain (`cl.exe` does **not** need to be on
  PATH — the CMake generator finds it).
- **CMake ≥ 3.25**.
- The **VST3 SDK** cloned locally (not vendored here) — see below.
- Network access **at configure time** only: `cpp-httplib` is pulled by CMake `FetchContent`
  (pinned to `v0.58.0`).

## Build

```powershell
# 1. Clone the VST3 SDK (shallow, with submodules) into external/ — git-ignored.
git clone --depth 1 --recurse-submodules --shallow-submodules `
    https://github.com/steinbergmedia/vst3sdk.git vst-host/external/vst3sdk

# 2. Configure. Only the VS 2022 generator is available on the reference machine.
cmake -S vst-host -B vst-host/build -G "Visual Studio 17 2022" -A x64

# 3. Build Release.
cmake --build vst-host/build --config Release --parallel
```

Output: **`vst-host/build/bin/vst-host.exe`**.

The SDK is forced to build host-side libraries only (`SMTG_ENABLE_VSTGUI_SUPPORT`,
`..._VST3_PLUGIN_EXAMPLES`, `..._VST3_HOSTING_EXAMPLES`, `SMTG_CREATE_PLUGIN_LINK`,
`SMTG_RUN_VST_VALIDATOR` all `OFF`), so the build stays fast and dependency-free.

Using an SDK checkout elsewhere:

```powershell
cmake -S vst-host -B vst-host/build -G "Visual Studio 17 2022" -A x64 `
      -DVST3_SDK_DIR="C:/path/to/vst3sdk"
```

> Note: an SDK path is baked into `build/CMakeCache.txt`. If you re-clone the SDK or move it,
> either reconfigure with `-DVST3_SDK_DIR=...` or delete `vst-host/build` and configure again.

## Run

```powershell
$env:VST_HOST_TOKEN   = "dev-vst-token"          # optional: leave unset to require no token
$env:VST_HOST_ORIGINS = "http://localhost:3000"  # comma-separated Origin allowlist
vst-host\build\bin\vst-host.exe                  # run the server on 127.0.0.1:3211
```

| command | what it does |
|---|---|
| *(no args)* | run the HTTP server (loopback, port 3211) |
| `--stop` | stop the running server using the PID file |
| `--scan` | print the discovered plug-ins as JSON and exit |
| `--selftest <path>` | load one plug-in, render ~2 s, attach its editor, print stats |
| `--scan-worker` | internal: the isolated scanning child (don't call directly) |

Environment:

| variable | meaning |
|---|---|
| `VST_HOST_TOKEN` | Optional Bearer token. **Unset (the default) = no token required**, so the browser connects as soon as the host is up; set it to require one. |
| `VST_HOST_ORIGINS` | Comma-separated `Origin` allowlist. Defaults to the dev-server origins on 3000/5173. |
| `VST_HOST_PLUGIN_DIRS` | Extra directories to scan for `.vst3`, in addition to the standard ones. |

**PID file:** `%LOCALAPPDATA%\OpenCanvas\vst-host.pid` (written on start with `pid`, `port`,
`started`, `started_unix`, `exe`; removed on clean shutdown and by `--stop`).
Both `--scan` and `--selftest` never create it.

Starting while another instance already holds the port is refused — it names the holder and exits
non-zero, so two servers can't fight over the port:

```
vst-host: 127.0.0.1:3211 is already in use by pid 335016 (vst-host.exe)
vst-host: holder image: C:\...\vst-host\build\bin\vst-host.exe
vst-host: refusing to start; run `vst-host --stop` to stop that server, or stop pid 335016 manually
```

**Always stop it when you are done** — a forgotten server keeps a plugin loaded and holds the port:

```powershell
vst-host\build\bin\vst-host.exe --stop
powershell -NoProfile -ExecutionPolicy Bypass -File tools\dev-watchdog.ps1   # repo-wide leftover check
```

## HTTP protocol

Every request must carry an **allowlisted `Origin`** — wrong origin → **403**. The token is only
checked when `VST_HOST_TOKEN` is set: then a request must also carry it (`Authorization: Bearer
<token>` on `POST`, `?token=<token>` on the `GET` stream, since query params are used where the
browser can't set headers), or it answers **401**.

### `POST /rpc`

Body `{"id":<int>,"type":"<cmd>", ...}` → `{"id":<int>,"ok":true,...}`
or `{"id":<int>,"ok":false,"error":{"code":"<str>","message":"<str>"}}`.

| `type` | payload | result |
|---|---|---|
| `hello` | — | `{"protocol":1,"host":"vst-host","version":"<semver>"}` |
| `scan` | — | `{"plugins":[{id,name,vendor,version,category,subCategories,path,packaging,isInstrument}]}` |
| `load` | `{pluginId, role?, sampleRate?, blockSize?, channels?}` (defaults `role:"instrument"`, 48000/256/2) | `{instanceId}` |
| `unload` | `{instanceId}` | `{}` |
| `noteOn` | `{instanceId, pitch, velocity, channel?}` | `{}` |
| `noteOff` | `{instanceId, pitch, channel?}` | `{}` |
| `paramList` | `{instanceId}` | `{params:[{id,title,units,min,max,default,value,stepCount}]}` |
| `paramSet` | `{instanceId, paramId, value}` | `{}` |
| `editorOpen` | `{instanceId}` | `{opened:true}` — opens the plugin's native window |
| `editorClose` | `{instanceId}` | `{}` |
| `getState` / `setState` | `{instanceId}` / `{instanceId, state}` (base64) | `{state}` / `{}` |
| `audioStart` / `audioStop` | `{instanceId}` | `{}` |

`role` selects the Audio Module Class and the bus layout:

- `"instrument"` (default, omitted in every existing caller): picks the class whose subCategories
  contain `Instrument`, activates output bus 0 only and sends a zero-input process block — the
  original behaviour, byte-identical.
- `"effect"`: picks the class whose subCategories contain `Fx`, activates **input bus 0 and output
  bus 0**, and sets both bus arrangements (`setBusArrangements(in, out)`). Loading a class that is
  not `Fx` fails with `no_effect_class` (HTTP 500, `error.code == "no_effect_class"`); a class
  without an audio input bus fails with `load_failed`. Effects receive audio through `POST /audio-in`.

`packaging` is `"bundle"` (a `.vst3` directory) or `"single"` (a single-file `.vst3` DLL — **valid**,
not an error; Kong Audio's QinEngineV3 ships this way).

### `GET /audio?instance=<id>&token=<token>`

`Content-Type: application/octet-stream`, `Transfer-Encoding: chunked`, a continuous stream.
Each frame:

```
offset 0  u32 LE  instanceHash
offset 4  u32 LE  seq            (increments by 1 per frame)
offset 8  u32 LE  channels
offset 12 u32 LE  framesPerChannel
offset 16 ...     planar (channel-first) Float32: ch0[frames], ch1[frames], ...
```

48000 Hz, 256 frames per block, 2 channels → **2064 bytes per frame**.

### `POST /audio-in?instance=<id>&token=<token>`

Feeds the input bus of an instance loaded with `role:"effect"`. The request body is the **same
frame format as `/audio`** (16-byte LE header + planar Float32) and may concatenate whole frames;
`channels` is 1 or 2 and a mono body is mirrored to both input channels of a stereo bus, while a
stereo body is folded to channel 0 of a mono bus. The host re-blocks frames to its own block size,
so a browser sending 128-frame worklet quanta is fine. Response: `{"ok":true,"frames":<n>}`.

`GET /audio` (output) and `POST /audio-in` (input) are independent connections and are safe to run
concurrently: the input lands in a per-instance bounded queue and the render thread consumes one
re-blocked block per rendered block. An empty input queue renders silence (the effect still runs);
queued input past **48 blocks (~256 ms)** drops the oldest block. Feeding `/audio-in` does not start
the pump — open `GET /audio` (or call `audioStart`) for that. `/audio-in` against an instrument (or
an unknown instance) answers `400 not_effect` / `404 instance_not_found`.

Limits and timeouts: at most **1 MiB** and **64 frames** per request (`413 audio_in_too_large` /
`400 bad_audio_in`); a malformed or truncated frame is rejected with `400 bad_audio_in` and nothing
is appended; the server's 30 s read timeout applies to the body. The browser worker uploads in
batches of 4 blocks (~21 ms), keeps at most 32 blocks queued for a slow host (the worklet's capture
pool holds 8), and drops — returning the pooled buffer to the worklet — past that.

### `POST /render`

Bounces an already-loaded instance offline and streams the result in the **same frame format as
`/audio`** (`application/octet-stream`, chunked, frames end exactly on a frame boundary). The
plug-in runs in its offline process mode for the render — faster than real time and higher quality
where the plug-in supports it — and the notes go through the normal event path with sample-accurate
offsets.

```json
{ "instanceId": "1", "seconds": 12.5, "sampleRate": 48000, "blockSize": 256, "channels": 2,
  "notes": [{ "pitch": 60, "velocity": 100, "start": 0.5, "length": 0.25 }] }
```

`start` / `length` are seconds from the render start; `sampleRate` / `blockSize` / `channels` are
optional and must match the loaded instance when present. The response carries
`x-vst-latency-samples: <n>`, the plug-in's reported latency: the host renders `n` samples extra and
the caller drops the first `n`, so a bounce is aligned with the timeline (Steinberg plug-ins report 0).
`/render` does not stop a live `/audio` stream — with the pump active the instance keeps its
real-time process mode and the stream resumes when the render finishes.

Limits and timeouts (tunable in `src/server.cpp`): at most **1800 s** and **65536 notes** per request
(`400 render_too_long` / `render_too_many_notes` / `render_config_mismatch`), a **15 s** first-block
wait (`500 render_failed` / `plugin_hang`), a **30 s** per-block stall limit (the response ends
early), and the renderer blocks once **64 unread blocks** (~341 ms) are queued, so a slow reader
cannot grow host memory.

## curl examples

These are the exact cases the verification used. In **cmd/bash**:

```bash
# 403 - origin not allowlisted
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Origin: http://evil.example" -H "Authorization: Bearer dev-vst-token" \
  -H "Content-Type: application/json" -d "{\"id\":1,\"type\":\"hello\"}" \
  http://127.0.0.1:3211/rpc

# 401 - no token
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Origin: http://localhost:3000" -H "Content-Type: application/json" \
  -d "{\"id\":1,\"type\":\"hello\"}" http://127.0.0.1:3211/rpc

# 200 - hello / scan
curl -s -X POST -H "Origin: http://localhost:3000" -H "Authorization: Bearer dev-vst-token" \
  -H "Content-Type: application/json" -d "{\"id\":1,\"type\":\"hello\"}" \
  http://127.0.0.1:3211/rpc

curl -s -X POST -H "Origin: http://localhost:3000" -H "Authorization: Bearer dev-vst-token" \
  -H "Content-Type: application/json" -d "{\"id\":2,\"type\":\"scan\"}" \
  http://127.0.0.1:3211/rpc
```

> **PowerShell note:** `curl.exe` invoked from PowerShell can have header arguments with spaces
> split apart (they arrive mangled, which looks like an auth failure). Use `Invoke-WebRequest`
> instead, or wrap the call in `cmd /c "..."`:
> ```powershell
> Invoke-WebRequest -Uri http://127.0.0.1:3211/rpc -Method POST -UseBasicParsing `
>   -Headers @{ Origin = "http://localhost:3000"; Authorization = "Bearer dev-vst-token" } `
>   -ContentType "application/json" -Body '{"id":1,"type":"hello"}'
> ```

Reading a few seconds of audio (bounded, so the infinite stream doesn't hang the shell):

```bash
# load a plugin, take its instanceId, note-on, then read ~1.5 s of PCM into a file
IID=$(curl -s -X POST -H "Origin: http://localhost:3000" -H "Authorization: Bearer dev-vst-token" \
  -H "Content-Type: application/json" \
  -d "{\"id\":3,\"type\":\"load\",\"pluginId\":\"CC3695D88FE74881B46E6CCFFB291CFF\"}" \
  http://127.0.0.1:3211/rpc | sed -E 's/.*"instanceId":"([^"]+)".*/\1/')

curl -s --max-time 3 -H "Origin: http://localhost:3000" \
  -o out.pcm "http://127.0.0.1:3211/audio?instance=$IID&token=dev-vst-token"
# out.pcm size must be a multiple of 2064
```

## Where the browser side lives

| file (`web/src/lib/canvas/`) | role |
|---|---|
| `audio-vst-protocol.ts` | pure constants / encode-decode / `readFrame` (no DOM) |
| `audio-vst.ts` | typed client (base URL + token resolved like `AGENT_BRIDGE_URL`) |
| `audio-vst.worker.ts` | owns `/rpc` + the `/audio` stream, buffer pool, transferables |
| `audio-vst.worklet.ts` | `canvas-vst-source` AudioWorklet (lookahead jitter buffer) |

Wired into the studio by `audio-graph.ts`: an instrument track whose instrument is
`{kind:"vst3", pluginId}` is driven by this bridge instead of a `Tone.PolySynth`. A track with
`vst3Effect: {kind:"vst3", pluginId}` additionally gets an inline effect worklet inserted between
`strip.input` and the mute/solo gate, so fader, pan, mute/solo, sends and master stay downstream.

## Effect test fixture

No Fx plug-in is installed on the reference machine, so the effect path is tested with the VST3
SDK's `again` gain sample built **into a temp directory** (never in this repo and never in a plugin
directory). It needs the SDK checkout and only this target:

```powershell
cmake -S vst-host/external/vst3sdk -B "$env:TEMP\opencanvas-vst-effects\sdk" `
      -G "Visual Studio 17 2022" -A x64 `
      -DSMTG_ENABLE_VST3_PLUGIN_EXAMPLES=ON -DSMTG_ENABLE_VSTGUI_SUPPORT=ON
cmake --build "$env:TEMP\opencanvas-vst-effects\sdk" --config Release --target again --parallel
# the bundle is <build>/VST3/Release/again.vst3; copy it somewhere stable, e.g.:
#   "$env:TEMP\opencanvas-vst-effects\plugins\again.vst3"
```

Point the host at that directory and confirm it scans as an effect (`isInstrument: false`):

```powershell
$env:VST_HOST_PLUGIN_DIRS = "$env:TEMP\opencanvas-vst-effects\plugins"
vst-host\build\bin\vst-host.exe --scan
```

`again` is a plain gain: parameter 0 (`Gain`, normalised) scales the input directly, default 1.0.
`../web/e2e/vst-effect.mjs` uses it end to end (browser source → worklet input → `/audio-in` →
host → `/audio` → graph master) and asserts the measured gain follows the parameter.

## Troubleshooting

- **"port already in use"** — a server is already running. `vst-host.exe --stop`, or stop the pid
  the message names.
- **Editor never appears** — `vst-host.exe --selftest "<path to the .vst3>"` isolates it: it prints
  `EDITOR_ATTACH=ok|fail`. Some plugins need their resources next to the binary; a *copy* of a
  single-file plugin (e.g. a renamed `Kontakt.vst3.BAK` copied out of place) can hang the message
  pump because its resource bundle is missing — test plugins where they are installed.
- **A plugin hangs the host on load** — a known risk (runtime loading is in-process). Restart the
  server; scanning is already isolated in a child process so it can't be wedged by a bad plugin.
- **No audio but `editorOpen` works** — samplers like HALion Sonic / Groove Agent legitimately
  output silence until a program/kit is loaded. Open the plugin's editor and load a preset.
- **Leftovers after a crashed run** — `powershell -File tools/dev-watchdog.ps1 -Mode Reap`.
