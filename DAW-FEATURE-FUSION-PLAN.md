# Cubase-like Multitrack DAW — Feature-Fusion & Design Plan

**Scope:** redesign the audio workspace (`AudioProject` node + `audio-studio.tsx`) as a Cubase-like multitrack DAW —
arrangement, clips, mixer/routing, automation — inside the existing canvas app.
**Repo:** `C:\Users\antar\Desktop\BlenderMCP\infinite-canvas`
**Status:** design only. Nothing implemented, no existing file edited.

Reference study for this revision: **openDAW** (AGPL-3.0 — *ideas only*), cloned read-only to
`C:\Users\antar\AppData\Local\Temp\opencode\opendaw-study` via sparse checkout of
`packages/studio/forge-boxes`, `packages/studio/core`, `packages/lib`, `docs`.
No openDAW source, schema text, or code is vendored, copied, or paraphrased into this repo — §3 records
which *design decisions* were adopted as ideas and re-expressed in this project's own model and naming.

---

## 1. Executive summary

We turn the audio workspace from "a strip of clips on a timestamp" into a **small multitrack DAW**: a
bars/beats arrangement with real clip editing, a routing mixer with buses/sends, and parameter automation,
whose export is guaranteed to match playback.

The one principle that drives every decision:

> **The document is a small, flat, seconds-based data structure that lives entirely inside the
> `AudioProject` node's metadata; every view (arrangement, mixer, automation) is a projection of it, and
> every sound (live and exported) is produced by one shared graph builder.**

Everything else follows from that: no separate bus/effect/region box types, no PPQN round-trips, no second
audio engine, no React state on the render path.

v1 is reachable with **zero new runtime dependencies**, using Tone.js's existing `Player` / `Channel` /
`Transport` / `Offline` primitives. MIDI/instrument tracks, recording, and modulation are staged later.

**Scale calibration (what we are *not*):** openDAW is a full collaborative production suite with a
code-generated box graph, a dual WASM/TS DSP engine, OPFS caches, yjs sync and a modular rack. Its document
is a graph of ~40 box types; ours is one JSON object on one node. §3 reads each openDAW decision and either
keeps it because it earns its place at *our* scale, or drops it as over-engineered.

---

## 2. Design principles

These govern the architecture **and** the UI. Each is one line.

1. **The document stays inside the node's metadata** — flat optional fields on `CanvasNodeMetadata`, no new
   datablock, no side tables; one edit is one `setNodes` patch (one undo step at the existing 180 ms / 50-snapshot cap).
2. **One shared audio-graph builder** (`buildAudioGraph(ctx, doc, { offline })`) so playback and export
   *cannot* diverge; `audio-mixdown.ts` calls it, it does not re-implement it.
3. **Seconds are authoritative; musical time is derived** — `Tone.Transport.seconds` and `Tone.Player` are
   seconds-native, so v1 stores seconds and computes bars for display/snap; tempo/meter are events, not scalars.
4. **No per-frame React re-renders on the timeline** — playhead, meters and waveform paint straight to the
   DOM/canvas from `requestAnimationFrame` and never touch React state; React re-renders only on document edits.
5. **Every editor surface is a sibling of the PS editor** — same `pt-14` root, same header row, same wrap
   options row, same left tool column, same `w-[288px]` right dock with `PsPanelTabs`, same flat chrome.
6. **Flat token surfaces, no decoration** — colours come from `theme.*` only; no shadows, no grey decorative
   fills; hover is `hover:bg-black/5 dark:hover:bg-white/10`; `theme.toolbar.activeBg` is reserved for
   *state* (selected tool, active tab, engaged M/S/arm), never for decoration.
7. **One gesture = one undo step** — drags/trims/automation edits use a local draft committed once on
   pointer-up, matching the existing clip-drag pattern and the 180 ms debounce.
8. **The document is the source; media is referenced by node id** — audio bytes, decoded buffers and peaks
   never enter metadata; clips point at `AUDIO` canvas nodes.

---

## 3. Adopted vs rejected design decisions

Study source: openDAW (AGPL-3.0, 0.0.110) — **design ideas only; no code or schema text reused**. The
"Re-expressed as" column is *this* project's own naming. `[v1]`/`[v2]`/`[later]` follow §4–§7.

### 3.1 Adopted as ideas

| # | Idea studied in openDAW | Why it earns its place here | Re-expressed as (ours) |
|---|---|---|---|
| A1 | **PPQN (960 pulses) is authoritative; seconds derived via a tempo map** | The *idea* that musical time is derived, not stored, is right. We adopt the idea **inverted**: seconds are authoritative (they match Tone and the current clips) and **bars/beats are derived** for the ruler, grid and snap. Keeps one conversion layer, none in the document. | `audio-timeline.ts`: `secondsToBars(t, tempo, meter)`, `barsToSeconds`, `snapSeconds` — pure functions; tempo events are events. |
| A2 | **Region carries `fading{in,out,in-slope,out-slope}` and gain; per-placement trim/loop without touching the source** | Fades and non-destructive trim are table stakes and map 1:1 onto `Tone.Player.fadeIn/fadeOut/loop`. Slopes as a small *shape* is enough; four numbers per edge is ceremony. | `CanvasAudioClip.{fadeIn,fadeOut,fadeInShape,fadeOutShape,gain,loop,offset,duration}` `[v1]`. |
| A3 | **Channel strip: volume in dB, panning bipolar, mute/solo, sends, output** | A mixer needs dB faders (linear % reads wrong), bipolar pan, and a per-channel output. dB is the display unit; we keep the existing linear `gain` field and convert at the UI/graph edge so no data migration is implied. | `CanvasAudioTrack.{gain,pan,mute,solo,output,sends}` `[v1]`; UI shows dB via `Tone.gainToDb` / `Tone.dbToGain`. |
| A4 | **`AuxSendBox.routing` = pre \| post fader** | Pre/post is genuinely two different taps and must be per-send. But it is a *boolean*, not an enum. | `CanvasAudioSend.pre: boolean` `[v1]`. |
| A5 | **Buses as first-class routing targets (group → master, returns fed only by sends)** | We need group buses and FX returns, but not a new box type. A track `type` + `output` pointer gives the same routing with a flat array. | `CanvasAudioTrack.type: "group" \| "return" \| "master"` + `output` `[v1]`; cycles rejected in `audio-project.ts`. |
| A6 | **Automation is a list of value events with an interpolation enum; events sit on the shared param, not the UI** | The shape `{time, value, interpolation}` is exactly right and directly schedulable as `AudioParam` events. We reject the extra curve box and the int+slope encoding (§3.2). | `CanvasAudioAutomationLane{ target, points: {time,value,curve}[] }` `[v1]`. |
| A7 | **Marker = `{position, label}` on a marker lane; meter changes are events** | Multiple tempo/meter changes should be natural from day one, but stored as events with absolute seconds (our axis), not relative bars. | `audioMarkers`, `audioTempoEvents`, `audioSignatureEvents` — all `{time, …}` `[v1]`/`[v2]`. |
| A8 | **Record modes `normal / replace / punch`; capture has channels + gain + input latency** | Worth modelling now so Stage 6 is additive. The latency *sentinel* trick is not (see §3.2). | `audioPunch {in,out}` `[v1 data, later behavior]`; `CanvasAudioCapture {mode, channels, gainDb, inputLatencyMs}` `[later]`. |
| A9 | **Viewport is not in the document; zoom/scroll are ephemeral UI state** | Zoom, scroll, snap and selection are React state, never metadata — keeps the document small and undo meaningful. | `pxPerSecond`, `scrollX`, `selectedClipIds`, `selectedTrackId` — component state in `audio-studio.tsx`. |
| A10 | **Grid density and snap interval derived from zoom with a min-pixel rule (≥48 px per cell); snap doubles as you zoom out** | Prevents a cluttered ruler and makes snap feel the same at every zoom. | `audio-timeline.ts`: `chooseGridStep(pxPerSecond)` / `chooseSnapStep(pxPerSecond, snapMode)`. |
| A11 | **Pure render functions + a `requestUpdate` flag coalesced by `requestAnimationFrame`; never per-frame React** | This is the core performance decision for a many-track timeline. | Arrangement and waveform draw to `<canvas>` in an rAF loop keyed off `Tone.Transport.seconds`. |
| A12 | **Waveform peaks as a multi-resolution min/max pyramid, stage-selected by zoom** (Float16 packing, worker generation, OPFS cache) | The *pyramid + zoom-selected stage* idea is the right fix for the current fixed 96-bar decode; the Float16/worker/OPFS apparatus is not (§3.2). | `audio-waveform.ts` rewrite: `Float32Array` min/max pyramid, `stageForZoom(pxPerSecond)`, in-memory cache keyed by `storageKey` `[v1]`. |
| A13 | **Overlap resolution as a policy; the `clip` policy trims/splits the existing clip on overlap** | We adopt exactly one policy — **auto-crossfade on overlap** — because that is what a music DAW wants and it needs no extra mode UI. | `audio-clip-ops.ts`: `applyOverlap(clips, movedClip)` writes complementary fades `[v1]`. |
| A14 | **Decoupled shortcut handling with priority contexts, a text-input guard, and reserved clipboard keys (`Ctrl+C/X/V`)** | One window-level keydown listener with an `isTyping` guard, like `image-studio.tsx` already does. Rebinding/registry is not needed. | `useAudioShortcuts` inside `audio-studio.tsx` `[v1]`. |
| A15 | **Double-click places/replaces a point; holding the snap modifier suppresses snap** | The standard automation point gesture and the standard "temporarily disable snap" modifier. | Automation lane: double-click add; `Shift` suppresses snap during any drag `[v1]`. |

### 3.2 Rejected — over-engineered for our scale (and why)

| Idea studied | Verdict | Reason |
|---|---|---|
| **Box graph with typed pointer/field hubs** (root → timeline / groove / modulators / audio-units / audio-busses / output-device / project-meta; pointer rules, `shared` resources, vertex selection, transactions) | **Drop** | Solves collaborative, code-generated, multi-window state. We have one JSON object, one writer, one window. Arrays in metadata are clearer and cheaper. |
| **Region ≠ Clip split** (region = placement on timeline; clip = reusable launchable source with trigger/quantise/speed/reverse) | **Drop — collapse into one `CanvasAudioClip`** | See §4.2. No clip-launcher/session view in scope; both would point at the same `sourceNodeId`; two near-duplicate schemas would double every op *and* every metadata snapshot in the 50-step undo buffer. The idea is preserved structurally: a clip is a *placement* that references a *source node*, and `[v2] timeBase/tick` fields leave room to reintroduce the split without reshaping. |
| **Play-mode boxes** (`AudioTimeStretchBox` / `AudioPitchStretchBox` / `AudioSignalsmithBox`), warp markers, piecewise rate rendering | **Drop `[later]`** | Needs time-stretch DSP/WASM; out of reach for v1 and explicitly listed in §9. |
| **`ValueEventCurveBox` + `interpolation` int `0\|1` + slope `0..1`** | **Drop — one `curve` field** | The extra box exists so a UI can point-edit a slope. A single `"linear" \| "hold" \| "sCurve"` enum is all we need and is directly schedulable. |
| **`ValueRegionBox` wrapper and shared `ValueEventCollectionBox` across owners** | **Drop — a lane is a plain object** | A lane is per-track/per-parameter here; sharing event collections across owners has no consumer. |
| **`AudioBusBox` as its own node type with `enabled/icon/label/color/minimized`** | **Drop — a track typed `"group" \| "return"`** | Routing identity and UI identity are one thing for us. |
| **Three overlap policies (`clip` / `push-existing` / `keep-existing`) + lazy `TrackResolver` + float32 `boundaryTolerance`** | **Drop — one policy** | `push/keep` exist for users who don't want overlapping regions at all. We want overlap (crossfade). One policy, no mode UI, no sliver maths. |
| **`CaptureBox.input-latency` sentinels (`-2` inherit, `-1` = output latency)** | **Drop** | Clever, obscure. `inputLatencyMs: number` (default 0) is auditable. |
| **Modulatable `mute`/`solo` via parameter pointer rules** | **Drop** | No one modulates mute. Booleans. |
| **`MarkerBox.plays` (0 = infinite)** | **Drop** | A marker is a position + label in v1. |
| **`NoteEventBox` `chance`/`cent`/`play-count`/`play-curve`, `NoteEventRepeatBox`** | **Drop `[later]`** | Generative niceties; not core sequencing. |
| **`LiveStream` SharedArrayBuffer lock protocol with subscription flags** | **Drop** | We need two or three `Tone.Meter` rAF reads, not audio-thread telemetry. |
| **OPFS / worker peak generation, content-hash keys, `peaks.bin` persistence** | **Drop `[v2]`** | Valuable at scale; v1's in-memory pyramid decodes once and caches by `storageKey`. Revisit only if long-session memory bites. |
| **Async context-menu collector bus feeding a 6-type clipboard wire format** | **Drop** | The PS editor already uses AntD `Dropdown` menus; the DAW does the same. One in-memory clipboard for clips. |
| **yjs collaboration, cloud backup, P2P, DAWproject interchange, scripting host, modular rack** | **Drop** | Not in scope; §9. |
| **`base-frequency` (440 Hz tuning), groove boxes, piano-mode object** | **Drop** | No consumer. |

---

## 4. The target data model

All additions are **flat, optional fields on `CanvasNodeMetadata`**, matching the existing style
(`audioTracks`, `audioClips`, `audioMasterGain` already live there — `web/src/types/canvas.ts:212-301`).
Because `AGENTS.md` says the project is not launched and no old-data compatibility is needed, v1 may
reinterpret fields the UI reads, but we **add rather than rename** wherever existing code depends on a
field, to keep stages small and reviewable.

Marks: `[v1]` this release · `[v2]` next design · `[later]` explicitly future.

### 4.1 Track (lane + channel strip)

```ts
// web/src/types/canvas.ts
export type CanvasAudioTrackType = "audio" | "instrument" | "midi" | "group" | "return" | "master";

/** Arrangement lane AND mixer channel strip. `[v1]` Exactly one `master` track; `group`/`return` exist from v1. */
export type CanvasAudioTrack = {
    id: string;                  // [v1]
    name: string;                // [v1]
    type?: CanvasAudioTrackType; // [v1] default "audio"
    gain: number;                // [v1] linear 0..1 (existing); UI and graph read it as dB via Tone.gainToDb
    pan?: number;                // [v1] -1..1, default 0
    mute: boolean;               // [v1]
    solo: boolean;               // [v1] resolved globally across the routing graph (§7.3)
    output?: string;             // [v1] target track id (group/return/master); undefined = master
    sends?: CanvasAudioSend[];   // [v1] aux sends
    color?: string;              // [v1] lane/strip colour
    height?: number;             // [v1] lane height px, default 56
    armed?: boolean;             // [v1] record-arm (state only until Stage 6)
    collapsed?: boolean;         // [v1] fold this track's automation lanes
    // [v2] channel strip depth:
    // inserts?: CanvasAudioInsert[];     // [v2] ordered effect chain + bypass
    // eq?: CanvasAudioEq;                // [v2] coarse EQ
    // input?: "none" | "mic" | "line";   // [later] physical input for recording
    // monitor?: "auto" | "on" | "off";   // [later]
    // instrument?: CanvasAudioInstrument; // [v2] instrument tracks
};

/** Aux send. `pre:true` taps before the fader, `pre:false` after. `[v1]` */
export type CanvasAudioSend = {
    id: string;              // [v1]
    targetTrackId: string;   // [v1] must resolve to a `return` (v1) or `group` (v2) track
    gain: number;            // [v1] linear
    pre: boolean;            // [v1]
    enabled: boolean;        // [v1]
    pan?: number;            // [v2] -1..1, default 0
};
```

**Track semantics (v1).**
- **1:1 lane ↔ channel.** The `id` is shared by the lane and its strip; there is no separate instrument/unit identity.
- `type:"audio"` plays clips; `type:"group"` sums its inputs; `type:"return"` is fed only by sends;
  `type:"instrument"`/`"midi"` arrive in Stage 5; `type:"master"` is the single sink.
- **Routing:** a track plays into `output` (default the `master` track). Sends tap the strip pre- or post-fader.
  Cycles (including a track outputting to itself or to a descendant) are rejected in `audio-project.ts` before a graph is built.
- **Default project:** one `type:"master"` track named 主输出, plus one `type:"audio"` track. Seeded in `web/src/constant/canvas.ts`.

### 4.2 Clip — the region/clip decision

**Decision: we collapse region and clip into one type.** Justification:

1. **No clip launcher.** openDAW's split buys session-style triggering (`quantise`, `trigger`), reverse, loop
   and rate *independently of* arrangement placement. We have no session view and no trigger mode; every clip
   exists on the timeline.
2. **One source, one reference.** Both openDAW types point at the same `AudioFileBox`. Ours already points at
   an `AUDIO` canvas node via `sourceNodeId`, so "placement vs asset" is already expressed by the reference —
   we don't need a second record to say it.
3. **Metadata and undo cost.** The document is one JSON blob that autosaves, exports, and is snapshotted ×50
   for undo. Two near-duplicate clip collections double the write amplification of every drag, trim and paste.
4. **The split stays available.** A clip is still a *placement of a source window*; `[v2] timeBase` + tick
   fields let a later session/launcher feature attach launch metadata without reshaping existing clips.

```ts
export type CanvasAudioFadeShape = "linear" | "exponential" | "sCurve";

/** Timeline placement of an audio source node. Times are seconds. `[v1]` */
export type CanvasAudioClip = {
    id: string;              // [v1]
    trackId: string;         // [v1]
    sourceNodeId: string;    // [v1] canvas AUDIO node id — never a copied payload
    start: number;           // [v1] timeline position (s)
    offset: number;          // [v1] source in-point (s)
    duration: number;        // [v1] visible length (s) = out − in on the timeline
    name?: string;           // [v1]
    gain?: number;           // [v1] clip gain linear, default 1
    fadeIn?: number;         // [v1] s, clamp ≤ duration
    fadeOut?: number;        // [v1] s
    fadeInShape?: CanvasAudioFadeShape;  // [v1] stored; only "linear" rendered in v1
    fadeOutShape?: CanvasAudioFadeShape; // [v1]
    loop?: boolean;          // [v1] loop the source window to fill `duration`
    reversed?: boolean;      // [v1] play source reversed
    muted?: boolean;         // [v1] clip mute
    color?: string;          // [v1]
    locked?: boolean;        // [v1] no move/trim (still selectable)
    // [v2] musical placement:
    // timeBase?: "seconds" | "musical";
    // startTicks?: number; durationTicks?: number;  // PPQN, authoritative when timeBase==="musical"
    // [later]
    // stretch?: number;   // playback ratio (time-stretch)
    // pitch?: number;     // semitones
};
```

**Clip operations → model change → playback mechanism.** These are pure document maths; Tone supplies the
DSP, which is why v1 is cheap.

| Op | Model change | Playback |
|---|---|---|
| trim in | `start += d; offset += d; duration -= d` | `player.start(t, offset, duration)` |
| trim out | `duration -= d` | same |
| split at t | `{offset, duration: t−start}` + `{offset + (t−start), start: t, duration: end−t}` | two Players |
| duplicate | new `id`, default `start += duration` | new Player |
| fade in/out | set `fadeIn`/`fadeOut` (clamp ≤ `duration`) | `player.fadeIn` / `player.fadeOut` |
| crossfade on overlap | on overlap of `a` (left) and `b` (right): `a.fadeOut = b.fadeIn = overlap` | complementary Tone fades |
| loop | `loop = true` | `player.loop = true`, `loopStart=0`, `loopEnd = sourceDuration` |
| reverse | `reversed = true` | `player.reverse = true` |
| clip gain | `gain` | `player.volume.value = Tone.gainToDb(gain)` |
| mute | `muted = true` | clip skipped in the graph |

Shaped fades (exponential / S-curve) are stored in v1 but rendered as linear until v2, when a `Gain` node
with scheduled ramps replaces `player.fadeIn/fadeOut`.

### 4.3 Project-level settings (flat metadata)

```ts
// CanvasNodeMetadata additions
audioTracks?: CanvasAudioTrack[];        // [v1] existing
audioClips?: CanvasAudioClip[];          // [v1] existing
audioMasterGain?: number;                // [v1] existing, linear 0..1

// [v1] timeline / transport
audioTempo?: number;                     // [v1] BPM, default 120
audioTimeSignature?: { numerator: number; denominator: number }; // [v1] default 4/4
audioGrid?: { enabled: boolean; snap: CanvasAudioSnap };         // [v1]
audioCycle?: { enabled: boolean; start: number; end: number };   // [v1] loop region (s)
audioPunch?: { enabled: boolean; in: number; out: number };      // [v1] data; recording behavior [later]
audioMarkers?: CanvasAudioMarker[];      // [v1]
audioMetronome?: { enabled: boolean; volumeDb: number };         // [v1]

// [v1] automation
audioAutomation?: CanvasAudioAutomationLane[];                   // [v1]

// [v2]
audioTempoEvents?: CanvasAudioTempoEvent[];         // multiple tempo changes
audioSignatureEvents?: CanvasAudioSignatureEvent[]; // multiple meter changes
audioPpqn?: number;                                 // 960, only if ticks become authoritative
audioMasterLimiter?: boolean;
audioMidiRegions?: CanvasAudioMidiRegion[];
```

```ts
export type CanvasAudioSnap = "off" | "bar" | "beat" | "1/2" | "1/4" | "1/8" | "1/16";
```

### 4.4 Markers, tempo, meter, cycle, punch

```ts
export type CanvasAudioMarker = { id: string; time: number; name?: string; color?: string };                              // [v1]
export type CanvasAudioTempoEvent = { id: string; time: number; bpm: number };                                             // [v2]
export type CanvasAudioSignatureEvent = { id: string; time: number; numerator: number; denominator: number };             // [v2]
```

v1 applies a single tempo/meter: `Tone.getTransport().bpm.value = audioTempo`,
`transport.timeSignature = numerator`; cycle → `transport.loop = true`, `loopStart/loopEnd`.
**Grid is a view concern**: bar/beat positions are computed from tempo + meter for the ruler and snapping
(`audio-timeline.ts`), and **seconds stay authoritative** in all stored positions.

### 4.5 Automation

```ts
export type CanvasAudioAutomationCurve = "linear" | "hold" | "sCurve";
export type CanvasAudioAutomationPoint = { time: number; value: number; curve?: CanvasAudioAutomationCurve }; // default "linear"
export type CanvasAudioAutomationLane = {
    id: string;              // [v1]
    trackId: string;         // [v1]
    target: string;          // [v1] "track.gain" | "track.pan" | "send.<sendId>.gain"
    enabled: boolean;        // [v1]
    points: CanvasAudioAutomationPoint[];   // [v1] sorted by time
    // [v2] mode?: "read" | "write" | "latch" | "touch";
};
```

v1 is **read-only playback**: at graph build, each enabled lane schedules `Tone.Param` writes on the target
node across the transport (`setValueAtTime` → `linearRampToValueAtTime`; `hold` = step; `sCurve` ≈ a few
linear segments). A parameter with an enabled lane is owned by automation — the mixer's manual effect skips it.

### 4.6 Seconds vs PPQN — explicit justification

**Choice: seconds authoritative in v1; bars/beats derived. PPQN is deliberately absent from the document.**

For seconds:
- The current model is already seconds (`CanvasAudioClip.start/offset/duration`), and `Tone.Transport.seconds`
  + `Tone.Player.start(t, offset, dur)` are seconds-native. Storing ticks would force a conversion on every
  play, seek, hit-test and export.
- Audio assets are seconds; the common project has one tempo and never changes it, so ticks buy nothing.
- The document is JSON in metadata; a tick field means a PPQN constant and a tempo-map lookup on every read,
  for no v1 user-visible benefit.

Cost and mitigation: musical edits do not follow a tempo change in v1. Mitigation is structural — tempo,
meter and markers are **events** (§4.4), so multiple changes are natural later, and `[v2]` adds
`timeBase` + `startTicks/durationTicks` to clips so `"musical"` placements can derive seconds through the
tempo map at build time. We take openDAW's idea that **the musical grid is derived, not stored**; we only
invert which side is the storage of record.

### 4.7 MIDI / instrument (v2, later — shape only)

```ts
export type CanvasAudioNote = { id: string; tick: number; durationTicks: number; pitch: number; velocity: number }; // [v2]
export type CanvasAudioMidiRegion = {
    id: string; trackId: string; startTicks: number; durationTicks: number; notes: CanvasAudioNote[]; name?: string;  // [v2]
};
export type CanvasAudioInstrument = { kind: "synth" | "sampler"; preset?: string; soundFontKey?: string };            // [v2]
```

### 4.8 What is deliberately NOT in the document

- **Decoded PCM / `AudioBuffer`** — not JSON, huge, re-creatable from the source node.
- **Waveform peaks** — in-memory cache keyed by `sourceNodeId` + `storageKey` (§7.5).
- **Any bitmap** — no waveform/spectrogram PNGs. If a bitmap is ever cached it must use an `image:` key **and**
  its metadata field must be registered in `collectImageStorageKeys` (`image-storage.ts`) or the cleanup sweep
  deletes it. (No new bitmap cache is planned.)
- **Viewport / selection / zoom / scroll / snap** — UI state only (principle 3 of §2).

---

## 5. UI / UX design

The DAW is a **sibling of the PS editor**. It reuses the exact chrome grammar of `image-studio.tsx`
(same classes, same tokens) so switching workspaces never feels like changing apps.

### 5.1 Overall layout

Root, identical to PS: `<div className="flex min-h-0 min-w-0 flex-1 flex-col pt-14">`.

**Row A — header / transport bar** · `flex shrink-0 items-center gap-1.5 px-3 py-2`
(back `FLAT_ACTION_CLASS` · project `Select` · settings popover · divider · transport cluster · position
readout · spacer · zoom % · fill · 「导出为音频节点」 button). The transport cluster is: 回到起点 / 播放 /
暂停 / 停止 / 录音, then the bars.beats.ticks position and the time readout. A divider separates tempo/meter.
`activeBg` is used only on the engaged state of 循环/节拍器 and on the record button when armed.

**Row B — options / menus bar** · `flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pb-2 text-[11px]`
— AntD `Dropdown` text menus with `MENU_BUTTON_CLASS` (sibling of `ps-menus.tsx`): **编辑 · 轨道 · 片段 ·
视图 · 自动化**. Then contextual options for the active tool (网格 · 吸附值 · 淡入形状 · 片段增益 · 循环 ·
反转 · 自动交叉淡化), then the hint text, then the snap indicator (`Magnet` + 吸附; exactly the PS pattern).

**Row C — workspace** · `flex min-h-0 flex-1`
- **Left tool column** `thin-scrollbar flex shrink-0 flex-col items-center gap-1 overflow-y-auto px-1.5 py-2`
  — DAW tools as `TOOL_CLASS` (`size-8`) buttons: 选择 `V` / 范围 `R` / 分割 `C` / 绘制 `D` / 擦除 `E` /
  粘合 `G` / 手 `H` / 缩放 `Z`, divider, 放大/缩小. Active tool uses `theme.toolbar.activeBg`.
- **Centre viewport** `relative min-h-0 min-w-0 flex-1 overflow-hidden`,
  `background: theme.canvas.background`. A `Segmented` in the header switches **编曲 (Arrangement)** /
  **混音 (Mixer)** — the analogue of PS's view modes. The arrangement viewport is a self-contained
  `relative overflow-auto` scroller (as today), not a canvas pan/zoom surface.
- **Right dock** `flex w-[288px] shrink-0 flex-col overflow-hidden border-l`
  `borderColor: theme.toolbar.border; background: theme.toolbar.panel`:
  - `PsPanelTabs` dock group (`flex-[3]`): **检查器 · 自动化 · 历史**
  - `PsPanelTabs` asset group (`flex-[2]`, `border-t`): **媒体池 · 标记**
  - fixed section: **工程设置** (tempo, meter, grid, cycle, punch, master gain, 节拍器) — the slot the PS
    editor gives to `PsAdjustmentsPanel`.

The **mixer is a centre-view mode**, not a floating window, because the app is single-workspace. The track
inspector, media pool and automation editor are dock panels because they are contextual to the selection.

### 5.2 Visual language (mapped to real tokens)

Source of truth: `web/src/lib/canvas-theme.ts` via `useCanvasTheme()`. Nothing is hardcoded; no `dark:`
branches except the sanctioned hover utilities.

| Element | Token / class |
|---|---|
| App/page background | `theme.canvas.background` |
| Lane separator (1px, bottom) | `theme.toolbar.border` — **no lane fill** (AGENTS: no grey decorative fills) |
| Track header text / secondary | `theme.node.text` / `theme.node.muted` |
| Track colour chip | the track's own `color` value if set, else `theme.node.faint` (no theme token for track colours) |
| Bar grid line | `theme.toolbar.border` |
| Beat/sub grid line | `theme.canvas.line` |
| Ruler baseline / border | `theme.toolbar.border` |
| Ruler label | `theme.node.muted`, `text-[9px] tabular-nums` |
| Clip body | `theme.toolbar.panel`, `rounded-md`, border `theme.toolbar.border` |
| Clip hover | border → `theme.node.muted` (no fill change; hover is feedback only) |
| Clip selected | border `theme.node.activeStroke` + `box-shadow: inset 0 0 0 1px` **not used** — selection is the border + `theme.canvas.selectionFill` at 6% |
| Clip muted / locked | `opacity: .45` / small `Lock` icon in `theme.node.muted` |
| Clip missing source | text `素材缺失` in `theme.node.blocked`; dashed 1px `theme.toolbar.border` box, no waveform |
| Waveform peak | `theme.node.faint` |
| Waveform played region | `theme.node.muted` |
| Fade triangle | `theme.canvas.selectionFill` fill, `theme.toolbar.border` edge |
| Crossfade overlap band | `theme.canvas.selectionFill` |
| Playhead | 1px `theme.node.activeStroke` |
| Cycle region | `theme.canvas.selectionFill` over the ruler |
| Punch region | `theme.node.blocked` at 15% alpha |
| Marker flag | `theme.node.primaryText` on `theme.node.primary` |
| Selection marquee | fill `theme.canvas.selectionFill`, border `theme.canvas.selectionStroke` |
| Focus ring (keyboard) | `outline: 1px solid theme.node.activeStroke; outline-offset: 1px` |
| Panel / dock background | `theme.toolbar.panel` (+ `frostedSurfaceClass` where it overlaps the canvas) |
| Panel divider / border | `theme.toolbar.border` |
| Flat icon button | `hover:bg-black/5 dark:hover:bg-white/10`, `disabled:opacity-30` |
| Selected tool / tab / engaged toggle | `theme.toolbar.activeBg` + `theme.toolbar.activeText` |
| Meter bar | fill `theme.node.muted`; > −6 dB fill `theme.node.primaryText` on `theme.node.primary`; clip warning `theme.node.blocked` |
| Fader track / thumb | track `theme.toolbar.border`, thumb `theme.toolbar.panel` + border `theme.node.activeStroke` |

Explicit non-uses: `theme.toolbar.itemHover` is **not** used (it is a grey fill; AGENTS prefers the
`hover:bg-black/5 dark:hover:bg-white/10` utility), and `theme.node.fill` is **not** used as a button or row
background — only as an incidental surface where a panel genuinely needs a raised fill (mixer strip body may
use `theme.toolbar.panel`, not `node.fill`).

Light/dark: everything above is token-driven, so both themes follow for free. The waveform canvas reads the
resolved theme object once per render and repaints on theme change (it is not CSS-coloured).

### 5.3 Interaction model

Tools: 选择 `V` · 范围 `R` · 分割 `C` · 绘制 `D` · 擦除 `E` · 粘合 `G` · 手 `H` · 缩放 `Z`.

**Clip gestures (select tool).**
- **Move** — drag body. Vertical drag moves the clip to another lane (`trackId` follows the lane under the
  cursor); horizontal drag moves `start`. Snap applies; **hold `Shift` to suspend snap**. A translucent ghost
  shows the target. On pointer-up, one `patchMetadata`.
- **Trim in / trim out** — hover within 6 px of either edge (`cursor: ew-resize`), drag. Left edge changes
  `start`, `offset`, `duration` together; right edge changes `duration`. Clamped so `duration ≥ 0.01 s` and
  `offset ≥ 0`.
- **Split** — split tool click at position, or `Ctrl+K` splits the selected clip(s) at the playhead.
- **Duplicate** — `Alt`+drag (copy-on-drag, the DAW convention) or `Ctrl+D` (places after the original).
- **Fade** — the top-left / top-right **corner triangles** are fade handles (`cursor: ew-resize`); drag inward
  sets `fadeIn`/`fadeOut`. Before a fade exists the triangle is a 6 px hit zone with no visible fill.
- **Loop extend** — `Alt`+drag the right edge (or the dedicated loop handle drawn at the right edge when the
  clip is selected) extends `duration` beyond the source window with `loop = true`; the out-of-source part is
  drawn with a repeated-waveform hatching at `opacity: .55`.
- **Crossfade** — when two clips on one lane overlap, the overlap band shows `theme.canvas.selectionFill`;
  the overlap is auto-crossfaded (`a.fadeOut = b.fadeIn = overlap`) as soon as the drag commits, unless
  自动交叉淡化 is off. `X` on a selection forces a crossfade across the join.
- **Marquee** — drag on empty lane space with the select tool selects all clips intersecting the rect
  (additive with `Shift`, subtractive with `Alt`).
- **Context menu** — right-click a clip → 分割 / 复制 / 删除 / 淡入 / 淡出 / 交叉淡化 / 循环 / 反转 / 重命名 /
  属性; right-click a lane → 添加片段 / 重命名 / 复制轨道 / 删除轨道 / 显示自动化; right-click the ruler →
  在此添加标记 / 设置循环区域 / 清除循环.

**Snapping.** `audioGrid.snap` ∈ off / bar / beat / 1/2 / 1/4 / 1/8 / 1/16. The effective snap step is
`chooseSnapStep(pxPerSecond, snapMode)` so "1/16" never becomes sub-pixel; `Shift` suspends snap for the
duration of a drag (A15).

**Zoom / scroll.** `Ctrl`+wheel = zoom horizontally about the cursor (px/s), plain wheel = scroll vertically,
`Shift`+wheel = scroll horizontally, middle-drag or 手 tool drag = pan, 缩放 tool drag = rubber-band zoom to
the drawn range. Zoom clamps to a min (whole song, e.g. 2 px/s) and max (~240 px/s).

**Keyboard map (v1).**

| Key | Action | Key | Action |
|---|---|---|---|
| `Space` | 播放 / 停止 | `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Enter` | 回到起点 | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | 复制 / 剪切 / 粘贴片段 |
| `Delete` / `Backspace` | 删除所选 | `Ctrl+D` | 复制所选 |
| `←` / `→` | 按网格微移 | `Shift+←/→` | 按小节微移 |
| `↑` / `↓` | 移动到上/下一条轨道 | `Ctrl+K` | 在播放头处分割 |
| `M` | 所选轨道静音 | `S` | 所选轨道独奏 |
| `R` | 所选轨道录音待命 | `L` | 循环开关 |
| `T` | 节拍器开关 | `Esc` | 取消选择 / 结束手势 |
| `Home` / `End` | 跳到开头 / 结尾 | `+` / `-` | 放大 / 缩小 |

**Mixer/automation gestures.**
- Fader drag = gain (dB tooltip), double-click = reset to unity.
- Pan drag = pan; double-click = centre.
- Send slot click = select target; the pre/post chip toggles `pre`.
- Automation: double-click empty lane adds a point; drag moves; double-click a point deletes; right-click sets
  interpolation (线性 / 保持 / S 曲线). `Shift` suspends snap.

### 5.4 Mixer view

A horizontal strip lane inside the centre viewport, scrolled horizontally when strips overflow.

**Channel strip (top → bottom):** colour chip + name (double-click to rename) · **发送** slot list (target
select, `前/后` chip, gain mini-slider, remove) · **声像** knob/slider · **推子** (vertical, dB label) ·
**电平表** (stereo, rAF-painted) · **M / S** toggles (`activeBg` when engaged) · **输出** select (default
主输出) · for `return`/`group`, the same minus clip-related rows.

**Master strip** is pinned at the right end (or left in RTL), never scrolled away; it shows the fader, master
meter, and (v2) the limiter.

**Lane ↔ strip relationship:** both are keyed by `track.id`. The lane header is the *compact* form of the
strip: name, arm/`M`/`S`, a mini-fader and a mini-meter. Selecting a lane focuses and scrolls to its strip,
and vice versa; the selected track's strip and lane share the `activeBg`-derived highlight so the pairing is
never ambiguous. 「在混音台中显示」 on the lane header jumps to the mixer and focuses that strip.

**Sends and buses:** sends render as slots; a `return` track's strip has no clips and shows what feeds it.
`group`/`return` strips are visually identical to audio strips (same chrome), differing only in the header
badge (分组 / 返回) and the absence of clip rows.

**Solo/mute semantics** are resolved globally by `computeAudibility(tracks)` (§7.3): solo on a group implies
its children; a muted group mutes its feed; pre-fader sends still pass the strip's mute/solo gate (documented
so "mute" never surprises).

### 5.5 Automation UI

An automation lane sits **under its track lane**, toggled by a chevron in the lane header (`collapsed`).
The lane header carries a parameter `Select` (音量 / 声像 / 发送增益) and a 启用 toggle; multiple lanes can be
open per track.

Rendering: a 1 px polyline through the points at `theme.node.muted`; points are 6 px squares,
selected = `theme.node.activeStroke`; the segment between points is `linear`, stepped for `hold`, and a curved
path for `sCurve`. The current value (during playback) is a small dot painted by rAF, not React state.
While a lane is enabled, its mixer parameter shows a small link icon and is read-only (automation owns it).
Editing gestures are in §5.3. Lane height default 40 px; the lane shares the timeline's horizontal scale
exactly, so clip positions and automation points line up pixel-for-pixel.

### 5.6 States

| State | Design |
|---|---|
| **Empty project** | Centred `AudioLines` (lucide) at `theme.node.muted` 40% opacity + `theme.node.placeholder` copy 「还没有音频轨道」 + a flat 「添加轨道」 button. No illustration, no card, no shadow. |
| **No audio nodes** (media pool empty) | Media pool shows 「画布中还没有音频素材」 + 「前往画布添加」 flat action; the 添加片段 picker is disabled with the same hint. |
| **Missing source audio** | Clip keeps its geometry and editability, waveform replaced by a dashed placeholder, label 「素材缺失」 in `theme.node.blocked`. Export skips missing sources and warns once. |
| **Playing vs stopped** | Play button reflects transport state; position readout `theme.node.text` when playing, `theme.node.muted` when stopped; playhead animates via rAF. |
| **Recording armed** | Arm toggle engaged on `activeBg` with `theme.node.blocked` text; transport record button `theme.node.blocked`; punch range overlaid in `theme.node.blocked` 15%; armed lane header gets a 2 px left border in `theme.node.blocked`. No glow/shadow. |
| **Solo active** | Non-soloed lanes and strips drop to `opacity: .45` (opacity is allowed; grey fills are not). |
| **Loading a source** | Waveform area shows the placeholder bars at `theme.node.faint` until peaks decode; no spinner in the timeline. |
| **Export running** | 「导出为音频节点」 button swaps to a disabled 「导出中…」 label; no modal (matches PS's save-as-node flow). |

### 5.7 Narrow-width adaptation (375 / 768 / 1280 / 1440)

Breakpoints follow Tailwind v4 defaults and the top bar's existing `sm:`/`lg:` usage.

- **375 (base).** Right dock hidden. Left tool column becomes a **horizontal strip** directly under Row B
  (`flex-row`, horizontal scroll). Row A keeps only back · play/stop · position · overflow `…` menu; tempo,
  zoom and export move into that menu. Row B collapses to a single 「选项」 Dropdown that contains the DAW menus.
  Arrangement shows the lane headers as a 88 px column and the timeline scrolls. **Mixer** shows one strip at
  a time with a track `Select` at the top of the viewport.
- **768 (`md`).** Right dock hidden by default; a panel toggle button in Row A opens it as an overlay
  `w-[288px]` with `frostedSurfaceClass`, dismissed by tapping outside. Left tool column vertical again.
  Mixer scrolls horizontally. Row B shows the menus, contextual options collapse behind 「更多」.
- **1280 (`lg`).** Full three-column layout: left tool column + centre + `w-[288px]` dock. Row B shows all
  menus and contextual options.
- **1440 (`xl`).** As 1280, with the mixer fitting more strips before scrolling and the dock unchanged at
  288 px (fidelity to PS). No new columns; we do not widen the dock per breakpoint.

What collapses, in order: dock → tool column orientation → Row B options → transport controls into a menu.
Nothing is removed; the same model is reachable at every width.

### 5.8 Accessibility basics

- **Focus order:** Row A transport → Row B menus/options → left tool column → centre viewport → right dock.
  The dock is `aside`; panels use `PsPanelTabs`' existing `aria-pressed`.
- **Keyboard reachable:** every tool/tab/toggle is a `<button>`; clips are `tabIndex=0` with arrow-nudge,
  `Delete`, `Enter` (focus inspector); automation points are focusable and nudge-able.
- **aria labels:** every icon-only button has `aria-label` **and** `title`; tools include the hotkey
  (`aria-label={"分割 (C)"}`, exactly the PS convention). Toggles (M/S/arm/循环/节拍器) use `aria-pressed`.
  Sliders use AntD `ariaLabelForHandle`.
- **Visible focus:** `outline: 1px solid theme.node.activeStroke; outline-offset: 1px` on focus-visible only.
  Never rely on `activeBg` alone for focus.
- **Colour independence:** mute/arm/solo/selected each carry a shape or icon in addition to colour
  (`M`/`S`/● arm, lock icon, border change), so state survives colour-blindness and greyscale.
- **Motion:** playhead smoothing is skipped under `prefers-reduced-motion`; the value keeps updating, just
  without interpolation.

### 5.9 Cubase conventions vs our style — where they conflict, we win, and why

| Topic | Cubase | Our choice | Why |
|---|---|---|---|
| Transport location | bottom bar + separate toolbar | **top options bar** (PS grammar) | One chrome language across workspaces beats Cubase fidelity; the app already reserves the top for transport-like context. |
| Panel depth | 3D faders, shadows, dark frames | **flat token surfaces, no shadows** | `AGENTS.md` canvas UI spec is binding; shadows and raised fills are explicitly out. |
| Mixer | separate window | **centre-view tab** | Single-workspace app; a second window has no home and no state model. |
| Inspector | left of timeline | **right dock** (PS grammar) | The PS editor already trains users to find contextual panels on the right; the lane header covers left-side track info. |
| Track headers | left of timeline | **left of timeline** (keep) | Universal, matches the existing `audio-studio.tsx`, and costs nothing. |
| Tempo track | dedicated lane | **dedicated ruler lane** (keep) | Same information, less vertical cost; a full tempo track is a v2 concern. |
| Object selection | complex object/edit modes | **single select + marquee** | Need mode complexity is not justified by v1 features. |
| Colour | per-track/user colour palettes | **theme-derived default + optional `color`** | Avoids hardcoded palettes that fight the light/dark tokens. |
| Grid/snap | snap always on with modifier | **same** (on by default, `Shift` suspends) | Cubase's convention is good and costs one modifier. |
| Automation | write/latch/touch modes | **read-only in v1** | Recording automation is approximate under UI load and is a v2 concern (§9). |

---

## 6. Feature-fusion checklist

Union of the reference checklist, ordered core → advanced.
`[v1]` this release · `[v2]` next design · `[later]` future · `[cannot-do]` out of reach.

### Transport & timeline

| # | Feature | Mark | Approach (v1) |
|---|---|---|---|
| 1 | Sample-accurate transport play/pause/stop/seek + playhead | `[v1]` | existing `Tone.Transport`; playhead painted by rAF |
| 2 | Monotonic audio clock (never `setTimeout`) | `[v1]` | `Tone.getTransport().seconds` |
| 3 | Bars/beats ruler from tempo + meter | `[v1]` | `audio-timeline.ts` `secondsToBars` |
| 4 | Grid + snap (bar/beat/divisions) | `[v1]` | `chooseSnapStep(pxPerSecond, mode)` |
| 5 | Cycle/loop region | `[v1]` | `audioCycle` → `transport.loop`, `loopStart/loopEnd` |
| 6 | Markers / cue points | `[v1]` | `audioMarkers`; ruler lane |
| 7 | Punch in/out | `[v1 data]` `[later behavior]` | `audioPunch` stored + drawn; recording Stage 6 |
| 8 | Tempo + meter **maps** (many changes) | `[v2]` | `audioTempoEvents` / `audioSignatureEvents` |
| 9 | Zoom / scroll / playhead follow | `[v1]` | `pxPerSecond` + scroll container; follow toggle |
| 10 | PPQN as authoritative time | `[v2]` | `timeBase` + tick fields; §4.6 justifies v1 seconds |

### Clips / arrangement

| # | Feature | Mark | Approach (v1) |
|---|---|---|---|
| 11 | Clip model: position, duration, source in/out | `[v1]` | exists; extended |
| 12 | Non-destructive trim in/out | `[v1]` | pure doc edit → `player.start(t, offset, dur)` |
| 13 | Split at playhead / at cursor | `[v1]` | `Ctrl+K` / split tool; two clips |
| 14 | Duplicate / delete / copy-paste | `[v1]` | `Alt`+drag, `Ctrl+D`, `Ctrl+C/X/V`; new ids |
| 15 | Fades in/out (linear) | `[v1]` | corner handles → `player.fadeIn/fadeOut` |
| 16 | Shaped fades (exp / S-curve) | `[v2]` | `Gain` + scheduled ramps |
| 17 | Crossfade on overlap (auto) | `[v1]` | `applyOverlap` writes complementary fades |
| 18 | Loop clip | `[v1]` | `player.loop`; `Alt`+drag right edge |
| 19 | Reverse clip | `[v1]` | `player.reverse` |
| 20 | Per-clip gain | `[v1]` | `player.volume.value` |
| 21 | Clip colour / rename / lock / mute | `[v1]` | doc fields |
| 22 | Multi-select + marquee + keyboard ops | `[v1]` | hand-built; one undo step per gesture |
| 23 | Clip launcher / trigger / quantise | `[cannot-do]` | no session view; would need the region/clip split we dropped (§3.2) |

### Mixing

| # | Feature | Mark | Approach (v1) |
|---|---|---|---|
| 24 | Per-track fader (dB), pan, mute, solo | `[v1]` | hand-built strip (gain/pan/mute) + `computeAudibility` |
| 25 | Correct global solo semantics + implicit group solo | `[v1]` | walk `output`/`sends` in `audio-project.ts` |
| 26 | Group / bus tracks | `[v1]` | `type:"group"` + `output` |
| 27 | FX return tracks | `[v1]` | `type:"return"`; fed only by sends |
| 28 | Aux sends with pre/post | `[v1]` | pre/post Gain taps in the strip |
| 29 | Master channel + metering | `[v1]` | `master` track + `Tone.Meter`, rAF |
| 30 | Master limiter | `[v2]` | `Tone.Limiter` |
| 31 | Track meters (peak) | `[v1]` | `Tone.Meter` per channel; rAF only |
| 32 | Insert effect chain + bypass | `[v2]` | Tone effects per channel |
| 33 | EQ + dynamics | `[v2]` | `Tone.EQ3` / `Tone.Filter` / `Tone.Compressor` |
| 34 | Arbitrary output routing | `[v1]` | per-track `output`; cycles rejected |
| 35 | Stem export | `[v2]` | render each track offline through the same builder |
| 36 | Plugin delay compensation | `[cannot-do]` | no auto-PDC over user plugins in a browser graph |
| 37 | Sidechain routing | `[later]` | needs a splitter workaround |

### Automation

| # | Feature | Mark | Approach (v1) |
|---|---|---|---|
| 38 | Parameter lanes with breakpoints | `[v1]` | `audioAutomation` |
| 39 | Linear / hold interpolation | `[v1]` | scheduled `Param` ramps |
| 40 | Read mode | `[v1]` | default |
| 41 | Write / latch / touch recording | `[v2]` | UI capture + event insertion |
| 42 | Modulators (LFO / Macro / Random) | `[later]` | separate model |
| 43 | Per-clip envelopes | `[later]` | second representation |

### Composition (MIDI / instruments)

| # | Feature | Mark | Approach |
|---|---|---|---|
| 44 | MIDI / note regions + piano roll | `[v2]` | `audioMidiRegions`; hand-built canvas |
| 45 | Virtual instrument track (synth) | `[v2]` | `Tone.PolySynth` into the channel strip |
| 46 | Sampler / SoundFont | `[later]` | `smplr` or Tone `Sampler` |
| 47 | `.mid` import/export | `[v2]` | `@tonejs/midi` (MIT) |
| 48 | Pattern / step sequencer view | `[later]` | BeepBox-style |
| 49 | Generative note fields (chance/curve) | `[later]` | openDAW shapes |

### Recording / project

| # | Feature | Mark | Approach |
|---|---|---|---|
| 50 | Record to armed track | `[later]` | Web Audio + worklet; `uploadMediaFile(blob,"audio")` |
| 51 | Count-in | `[later]` | metronome + bar count |
| 52 | Punch in/out, takes/comping | `[later]` | approximate only; no comping |
| 53 | Undo/redo covering every edit | `[v1]` | existing history; gesture → one commit |
| 54 | Autosave / export-import / cleanup | `[v1]` | provided by metadata (no back-compat needed) |
| 55 | Offline mixdown parity | `[v1]` | shared `buildAudioGraph` |
| 56 | WAV export | `[v1]` | existing `encodeWavBlob` |
| 57 | MP3 / Opus export | `[cannot-do]` (MP3) / `[later]` (Opus) | MP3 = LGPL `lamejs`; Opus via encoder |
| 58 | DAWproject / Cubase `.cpr` interchange | `[later]` / `[cannot-do]` | own format later; `.cpr` never |
| 59 | Collaboration / CRDT | `[cannot-do]` | no backend |
| 60 | Command palette + shortcut map | `[v1]` (subset) | §5.3 keyboard map |

---

## 7. Staged implementation plan

Each stage is independently shippable and leaves the app working. **No new runtime dependencies through
Stage 6.** Every mutation is one `setNodes` patch; every pointer gesture uses a local draft committed on
pointer-up (one undo step). File paths are relative to `infinite-canvas/`.

### Stage 1 — Musical timeline + clip operations `[v1]`

**Ships:** bars/beats ruler (tempo + meter), grid + snap, zoom/scroll, markers, cycle region, cursor;
tool column + DAW menus + right dock (empty shells with the three panels); clip select/multi-select, trim,
split, duplicate, delete, copy/paste, fades, auto-crossfade, loop, reverse, clip gain, rename/colour/lock/mute;
the §5.3 keyboard map.

- **Files:** `web/src/types/canvas.ts` (track/clip + metadata extensions), `web/src/lib/canvas/audio-project.ts`
  (helpers, defaults, validation), **new** `web/src/lib/canvas/audio-clip-ops.ts` (pure trim/split/duplicate/
  fade/overlap maths), **new** `web/src/lib/canvas/audio-timeline.ts` (seconds↔bars, grid/snap/zoom maths),
  `web/src/components/canvas/workspace/audio-studio.tsx` (layout rewrite: header, options row, tool column,
  dock), **new** `web/src/components/canvas/workspace/audio-menus.tsx` (sibling of `ps-menus.tsx`),
  `web/src/i18n/locales/zh-CN.ts` + `en-US.ts` (new keys).
- **Deps:** none. Tone.Player supplies fades/loop/reverse.
- **Tempo/meter application:** `Tone.getTransport().bpm` / `.timeSignature`; cycle → `transport.loop`.
- **Deliberately not yet:** buses/sends, pan, automation, MIDI, recording. The graph is still track → master.
- **Risk to watch:** clip drag already uses a draft ref — reuse that pattern for trim/fade/loop handles so a
  drag is one undo step.

### Stage 2 — Mixer, routing and buses `[v1]`

**Ships:** pan, colours, track types (`audio/group/return/master`), per-track `output` routing, aux sends
pre/post, track + master meters, correct global solo/mute, the Mixer centre-view, the track inspector panel,
the media pool panel, the project-settings panel.

- **Files:** `web/src/types/canvas.ts`, `web/src/lib/canvas/audio-project.ts` (graph-aware
  `computeAudibility`, cycle validation, default project with a master track),
  **new** `web/src/lib/canvas/audio-graph.ts` (**the shared graph builder**),
  `web/src/lib/canvas/audio-mixdown.ts` (call the builder — stop duplicating graph logic),
  `web/src/components/canvas/workspace/audio-studio.tsx`,
  **new** `web/src/components/canvas/workspace/audio-mixer.tsx`,
  **new** `web/src/components/canvas/workspace/audio-panels.tsx` (inspector / media pool / settings),
  `web/src/constant/canvas.ts` (seed master + one audio track), i18n.
- **Graph shape (v1):** per non-master track a hand-built strip
  `input → pre-send taps → gain → panner → mute/solo gate → post-send taps → output`;
  group/return strips identical minus clip sources; one master strip → destination.
  This replaces `Tone.Channel` because pre-fader taps need explicit split points.
- **Deps:** none.
- **Deliberately not yet:** inserts/EQ (v2), automation, MIDI. Sends target `return` tracks only.

### Stage 3 — Automation `[v1]`

**Ships:** per-parameter lanes (gain, pan, send gain), breakpoint add/drag/delete, linear/hold, enabled
toggle, playback scheduling, offline parity, lanes in the arrangement, the automation dock panel.

- **Files:** `web/src/types/canvas.ts`, **new** `web/src/lib/canvas/audio-automation.ts` (sorted-point utils,
  curve eval, schedule builder), `web/src/lib/canvas/audio-graph.ts` (apply scheduled ramps),
  `web/src/lib/canvas/audio-mixdown.ts`, `web/src/components/canvas/workspace/audio-studio.tsx`,
  **new** `web/src/components/canvas/workspace/audio-automation-lane.tsx`, i18n.
- **Deps:** none.
- **Deliberately not yet:** write/latch/touch recording, modulators, effect-param targets
  (`target` stays `track.*` / `send.*`).
- **Interaction rule:** when a lane is enabled for a parameter, the mixer's manual effect must not overwrite
  it — the graph builder owns automation; the manual effect skips automated params.

### Stage 4 — Waveform & performance + responsive/a11y `[v1]`

**Ships:** multi-resolution decimated peaks (pyramid, stage chosen by zoom), canvas-rendered waveform lanes,
`tracksVersion` vs `mixerVersion` split, virtualized lane rendering, AudioContext unlock hardening, buffer
cache with eviction, the 375/768/1280/1440 adaptations of §5.7, and the accessibility pass of §5.8.

- **Files:** `web/src/lib/canvas/audio-waveform.ts` (pyramid, drop the fixed 96 bars),
  **new** `web/src/lib/canvas/audio-peaks-cache.ts` (stage cache + eviction),
  `web/src/components/canvas/workspace/audio-studio.tsx` (canvas lanes, split effects, responsive layout),
  `web/src/components/canvas/workspace/audio-mixer.tsx` (responsive strip scroll), i18n.
- **Deps:** none (hand-built). If it becomes painful, the only sanctioned fallback is `waveform-data` (MIT) —
  **not** Peaks.js (§6/appendix B).
- **Deliberately not yet:** spectrogram, time-stretch.

### Stage 5 — MIDI / instrument tracks `[v2]`

**Ships:** `type:"instrument"` + `type:"midi"` tracks, MIDI regions, a basic piano-roll editor
(draw/move/resize notes, velocity), `Tone.PolySynth` rendering through the channel strip, playback + offline parity.

- **Files:** `web/src/types/canvas.ts`, **new** `web/src/lib/canvas/audio-midi.ts`,
  `web/src/lib/canvas/audio-graph.ts`, `web/src/lib/canvas/audio-mixdown.ts`,
  **new** `web/src/components/canvas/workspace/audio-piano-roll.tsx`,
  `web/src/components/canvas/workspace/audio-studio.tsx`, i18n.
- **Deps:** none for the synth (Tone). `.mid` import/export later needs `@tonejs/midi` (MIT) — verify the
  exact version at implementation and pin it exactly.
- **Deliberately not yet:** SoundFont/sampler, pattern sequencer, generative note fields.

### Stage 6 — Recording & export hardening `[later]`

**Ships:** record to armed track (mic/line via `getUserMedia`), count-in, punch in/out (approximate), takes,
metronome, stem export.

- **Files:** **new** `web/src/lib/canvas/audio-record.ts`, `web/src/lib/canvas/audio-graph.ts` (monitor
  routing), `web/src/components/canvas/workspace/audio-studio.tsx`, `web/src/pages/canvas/project.tsx`
  (write recorded blob via `uploadMediaFile(blob,"audio")`, add an `AUDIO` node, then a clip referencing it).
- **Deps:** none required. Optional later: Signalsmith Stretch (MIT, WASM) for time-stretch, WAM 2.0 (MIT)
  for third-party effects.
- **Deliberately:** no comping, no PDC, no MIDI hardware sync.

---

## 8. Risks & traps

### 8.1 Tone.js `latest` vs `next` and the `Tone.Offline` regression

`tone` ships two lines: **`latest` = 15.1.22** and **`next` = 15.5.42** (verified 2026-09-22 via
`npm view tone dist-tags`). A reported regression around **15.5.6** causes intermittent dropouts and
**`Tone.Offline` WAV-export failures** — exactly our mixdown path. `web/package.json` pins the exact string
`"15.1.22"` (no `^`). **Keep it exact; block any tool that would bump it** (ignore `tone` in Dependabot/
Renovate; treat a `latest`-tag move as a deliberate, tested upgrade). Any PR touching the mixdown must
re-verify `renderAudioMixdown` + `encodeWavBlob` end-to-end.

### 8.2 AudioContext unlock + React 19 StrictMode double-effects

- **User gesture:** `Tone.start()` must stay inside the click handler (as `audio-studio.tsx` already does).
  Never create/start the context at module scope or in render.
- **StrictMode:** dev mounts effects twice → two graphs / doubled nodes. Every graph effect must fully tear
  down (dispose nodes, cancel transport) in its cleanup — the current effect does this; new stages must too.
- **Orphan context:** importing `tone` can create a default context before we configure one. Consider a single
  lazily-set `Tone.setContext` on first gesture; keep `AudioStudio` `lazy()`-loaded.
- **Build the graph after unlock**, not during initial render.

### 8.3 Graph shape (channel → bus → master) and solo/mute

- Solo is **not** a per-track playback flag — it is a global computation over the routing graph.
  Replace `isTrackAudible` with `computeAudibility(tracks)` returning effective mute per track, walking
  `output` and `sends`: any solo silences everything not on the path from a soloed track to master;
  **soloing a group implies soloing its children**; a muted group mutes its feed.
- **Pre-fader sends:** decide and document whether channel mute kills a pre send. Recommended **yes** — mute
  is on the strip and both taps sit inside the strip's mute/solo gate; otherwise "mute" behaves surprisingly.
- **Cycles:** validate `output` and send targets in `audio-project.ts` before building.
- **Offline render must build the identical graph** → one builder, `buildAudioGraph`.

### 8.4 Automation timing precision

- Schedule automation as `AudioParam` events at transport time, **never** from React state or `setInterval`.
- Schedule automation for the **offline** render too, or exports won't match playback.
- Tempo changes / cycle looping must not leave stale ramps; reschedule on `transport.cancel()` + rebuild
  (same lifecycle as players).
- v1 interpolation is linear/hold only; S-curve is approximated by multiple linear segments.

### 8.5 Performance with many tracks/clips

- **Waveform:** replace the fixed `AUDIO_WAVEFORM_BARS = 96` whole-buffer decode + DOM spans with
  multi-resolution decimated peaks drawn to `<canvas>`. Decimation target ≈ 1 bucket per 1024 samples
  (≈1/1024 the float-buffer memory); select the pyramid stage by `pxPerSecond` (A10/A12).
- **Decode memory:** 44.1 kHz stereo float32 ≈ **10.6 MB per stereo minute** (a 5-min file ≈ 53 MB). Cap
  concurrent decoded buffers and evict; never hold every source at once in long sessions.
- **React re-renders:** playhead and meters write DOM style / canvas directly from rAF; never add per-frame
  state to the timeline.
- **Version counters:** formalise `tracksVersion` (structural: rebuild players + graph + peaks) vs
  `mixerVersion` (volume/pan/mute/solo only: set params). Today the graph effect keys on `trackIdsKey`/
  `clipsKey` strings — extend those keys deliberately.
- **Key strings:** `clipsKey` must include only structural fields (`id/trackId/sourceNodeId/start/offset/
  duration/loop/reversed/muted`), **not** fade/gain/automation point arrays, or every automation edit rebuilds
  the graph.

### 8.6 Vite bundling (worklets / WASM), if a library is added later

Tone v15 needs no WASM/worklet assets for v1. If recording or time-stretch is added: Vite does **not**
rewrite `new AudioWorkletNode(url)`; use `new URL("./x.worklet.ts", import.meta.url)` or an inline Blob URL,
and put WASM deps under `optimizeDeps.exclude` with `?url` asset imports. Keep the DAW workspace `lazy()`-loaded
so Tone's ~77 KB gzip never lands in the main chunk.

### 8.7 Metadata-size risk

The document is the node's metadata: autosave, export/import, and **undo (50 snapshots)** all scale with it.

- **Never** store PCM, peaks, or bitmaps in metadata.
- Automation point arrays and MIDI note arrays grow fast; cap point density, round values, and store musical
  content compactly (ticks as integers) when v2 arrives.
- Each `patchMetadata` replaces the whole metadata object; 50 undo snapshots × large metadata is real memory.
  If a sub-document gets large (MIDI), keep it out of metadata behind a store key — but note: **any new
  storage-key field must be registered in `collectImageStorageKeys` (`image-storage.ts`) or
  `collectMediaStorageKeys` (`file-storage.ts`)**, or the cleanup sweeps delete it. New bitmaps must use
  `image:` keys.
- Clip sources stay node-id references, so audio bytes never enter the document (principle 8).

### 8.8 Smaller correctness traps already present

- `nextClipStart` returns the track's total duration, not the last clip's end → new clips always land at the
  far end. Fix in Stage 1.
- `audioProjectDuration` ignores fades/tails; the offline duration needs `+ max(fadeOut, effect tail)`.
- `player.buffer.onload` schedules `sync().start(...)` asynchronously; adding clips while playing must not
  double-schedule.
- `resolveClipDuration` spawns a temporary `<audio>` element per add; cache it by `sourceNodeId`.

### 8.9 New UI-specific traps

- **Layout drift from PS:** the DAW must reuse the exact root/header/options/tool-column/dock classes; a
  "close enough" layout is the most likely way this stops looking like a sibling. Copy the class strings, not
  the look.
- **Token leakage:** a single hardcoded grey breaks both themes. Waveform and meters are canvas-painted, so
  they must read tokens and repaint on theme change — the one place CSS variables cannot save us.
- **Dock at 768 px:** an overlay dock must trap focus and close on outside pointerdown, or keyboard users get
  lost behind it.

---

## 9. Explicitly out of reach

Blunt, so expectations are set:

1. **Sample-accurate recording / comping like Cubase.** Browser input latency, no ASIO, MediaRecorder/worklet
   jitter → punch and takes are approximate, not sample-locked.
2. **VST/AU/native plugin hosting and per-plugin sandboxing.** No native plugins; WAM is the only browser path
   and is out of scope.
3. **Automatic plugin delay compensation (PDC).** Hand-built effect chains cannot auto-align latency like Cubase.
4. **Cubase `.cpr` import.** Only a future own-format or DAWproject-style interchange is realistic.
5. **Real-time, high-quality per-clip time-stretch/warp.** Possible later via Signalsmith (WASM) but never
   Cubase-grade, and not in v1.
6. **MIDI hardware clock sync (MTC/SMPTE), external gear sync.**
7. **Peaks.js/Audacity-grade zooming on 2-hour files.** Decimated canvas peaks are fine for songs, not
   forensic long-form editing; cap import length or bound zoom.
8. **MP3 export.** WAV only; MP3 needs LGPL `lamejs`. (Opus may be possible later via encoders.)
9. **Cloud / collaboration / CRDT.** No backend, so no accounts, no server render, no stem separation service.
10. **Floating-window workspace and multi-window.** Single workspace only; the mixer is a centre-view tab.
11. **Full write/latch/touch automation capture with sample-accurate parameter smoothing under UI load.**
    v2 automation recording will be approximate; v1 is read-only.
12. **32-bit float project render and per-sample editing.** WAV output stays 16-bit PCM.
13. **A clip launcher / session view with trigger + quantise.** Dropping the region/clip split (§3.2) is what
    makes this out of reach; reintroducing it is a v2+ project, not a feature flag.

---

## Appendix A — licence & dependency verdicts

Versions verified 2026-09-22 (npm registry / GitHub).

| Library | Version | Licence | React 19 verdict | Bundle cost | Decision | Reason |
|---|---|---|---|---|---|---|
| **Tone.js** | `15.1.22` (exact) | MIT | framework-agnostic, no React peer | ~76.6 KB gzip | **adopt** (already present) | transport + scheduling + Player/Channel + `Tone.Offline`; keep the exact pin (§8.1) |
| **WaveSurfer.js** | 7.12.12 | BSD-3-Clause | no React peer | large | **reject** | v7 playback is `HTMLMediaElement`; a second playback engine would fight Tone |
| **Peaks.js** | 4.0.0 | **LGPL-3.0** (+ `waveform-data` LGPL-3.0) | vanilla, no React peer | ~83 KB gzip | **reject** | wrong shape (single long-form file, BBC use case), weak-copyleft surface, peer `konva <10` vs konva 10.x |
| **Howler.js** | 2.2.4 | MIT | no bundled types | 9.7 KB gzip | **reject** | no timeline / no offline render / not a DAW library |
| **@waveform-playlist/browser** | 15.4.0 | MIT | peer `react ^18.2 \|\| ^19` ✅ | ~142 KB gzip | **study-only** | would ship v1 in a day, but drags `styled-components@^6` + its own context next to AntD/Tailwind/zustand + required peer `@dnd-kit/react ^0.3` vs 0.5. Borrow the model, don't embed |
| **waveform-data.js** | 5.x | MIT | framework-agnostic | ~6 KB gzip | **optional** | only if hand-built multi-resolution peaks become painful |
| **audiobuffer-to-wav** | 1.0.0 | MIT | n/a | tiny | **reject** | `encodeWavBlob` already exists |
| **@breezystack/lamejs** (MP3) | — | **LGPL-3.0** | n/a | — | **reject** | MP3 pulls weak copyleft; WAV only |
| **@tonejs/midi** | latest (verify at impl.) | MIT | no React peer | small | **later** (v2) | standard `.mid` parse/write |
| **smplr** (SoundFont) | latest (verify at impl.) | MIT | no React peer | medium | **later** (v2) | cheap SoundFont sampler; alternative is Tone `Sampler` |
| **Elementary Audio** | — | MIT | framework-agnostic | heavy | **study-only** | declarative DSP / offline renderer; unnecessary for v1 |
| **Signalsmith Stretch** | — | MIT | n/a | small WASM | **later** | real time-stretch; needs WASM/worklet bundling (§8.6) |
| **Web Audio Modules 2.0** | — | MIT | n/a | varies | **later** | standard path to third-party browser instruments/effects |
| **openDAW** | 0.0.110 | **AGPL-3.0-or-later** | n/a (own JSX) | very heavy | **study-only** | AGPL §13 network copyleft — **its code may not be reused here**; ideas only (§3) |
| **GridSound** | — | **AGPL-3.0** + **private core** | n/a | — | **unavailable** | AGPL, and the core submodules (`daw-core`, `gs-wa-components`, `gs-components`, `gs-api-client`) return **404 "Repository not found"** (verified 2026-09-22) → not even buildable publicly; **code must not be reused** |
| **Wavacity / Audacity** | — | **GPL-2.0** | n/a | — | **study-only** | strong copyleft; model reference only |
| **SoundBox (mbitsnbites)** | — | **GPL-3.0** editor; `player-small.js` **zlib** | n/a | tiny | **study-only** | only the zlib player is legally vendorable |
| **BeepBox** | — | MIT | n/a | small | **study-only** | pattern model + URL sharing; synth not needed for v1 |

**AGPL/GPL call-out (blunt):** openDAW and GridSound are AGPL-3.0 — copying any of their source into this app
(or serving it) triggers AGPL network copyleft. Study the architecture, re-implement the model from scratch,
copy no code and no schema text. Wavacity/Audacity (GPL-2.0), SoundBox's editor (GPL-3.0), OpenStudio (GPL-3.0)
and Zrythm/Ardour/LMMS are the same: ideas only. The MIT references we may legitimately learn from at source
level are waveform-playlist, Signal, AudioMass, BeepBox, and wavesurfer-multitrack (BSD-3).

**Net new runtime dependencies across all 6 stages: none for v1–v4 and v6; v5 is also dependency-free for the
synth** (`.mid` import/export later adds `@tonejs/midi`, pin exactly). Optional later adds are flagged above.

---

## Appendix B — files each stage touches

| Stage | Existing files | New files |
|---|---|---|
| 1 | `types/canvas.ts`, `lib/canvas/audio-project.ts`, `components/canvas/workspace/audio-studio.tsx`, `i18n/locales/*` | `lib/canvas/audio-clip-ops.ts`, `lib/canvas/audio-timeline.ts`, `components/canvas/workspace/audio-menus.tsx` |
| 2 | `types/canvas.ts`, `lib/canvas/audio-project.ts`, `lib/canvas/audio-mixdown.ts`, `components/canvas/workspace/audio-studio.tsx`, `constant/canvas.ts`, `i18n/locales/*` | `lib/canvas/audio-graph.ts`, `components/canvas/workspace/audio-mixer.tsx`, `components/canvas/workspace/audio-panels.tsx` |
| 3 | `types/canvas.ts`, `lib/canvas/audio-graph.ts`, `lib/canvas/audio-mixdown.ts`, `components/canvas/workspace/audio-studio.tsx`, `i18n/locales/*` | `lib/canvas/audio-automation.ts`, `components/canvas/workspace/audio-automation-lane.tsx` |
| 4 | `lib/canvas/audio-waveform.ts`, `components/canvas/workspace/audio-studio.tsx`, `components/canvas/workspace/audio-mixer.tsx` | `lib/canvas/audio-peaks-cache.ts` |
| 5 | `types/canvas.ts`, `lib/canvas/audio-graph.ts`, `lib/canvas/audio-mixdown.ts`, `components/canvas/workspace/audio-studio.tsx`, `i18n/locales/*` | `lib/canvas/audio-midi.ts`, `components/canvas/workspace/audio-piano-roll.tsx` |
| 6 | `components/canvas/workspace/audio-studio.tsx`, `pages/canvas/project.tsx`, `lib/canvas/audio-graph.ts` | `lib/canvas/audio-record.ts` |

**Untouched by design:** `use-canvas-history.ts` (the existing 180 ms / 50-snapshot model is sufficient),
`use-canvas-workspace.ts` (still selects the one `AudioProject` node), `canvas-top-bar.tsx` (the `audio`
workspace tab already exists), `services/file-storage.ts` / `services/image-storage.ts` (unless a new bitmap
cache is introduced, in which case the key collector must be extended — §8.7).
