# Performance

Our Place is a 3D product for real couples on real phones. **No feature is complete until its performance impact has been considered.** The same world renders at every quality tier; tiers change cost, never content.

## Device targets

| Class | Baseline device | Target |
| --- | --- | --- |
| Low-end | Redmi A5 (Mali-G57 MP1 class) | a **stable ~30 fps** (consistency over quality) |
| Mid-range | Redmi 13C (Mali-G52 MC2 class) | 30–60 fps depending on the scene |
| High-end | flagships, desktops | ~60 fps |

> **Physical validation status**
> - Redmi A5: **NOT TESTED** — device unavailable
> - Redmi 13C: **NOT TESTED** — device unavailable
> - Desktop (Intel UHD Graphics 620, Chrome, Windows, headless with GPU): tested
>
> Desktop numbers don't prove mobile performance. The A–J procedure under *Testing on the devices* is ready for when the phones are available.

## Quality tiers — `lib/performance/profiles.js`

| | LOW | MEDIUM | HIGH |
| --- | --- | --- | --- |
| Frame cap | 30 fps | 60 fps | 60 fps |
| Render scale steps (× pixel ratio, never above the screen's) | 1 → 0.85 → 0.75 | 1.25 → 1 → 0.85 | 1.75 → 1.5 → 1.25 → 1 |
| Antialiasing (MSAA) | off | off | on |
| Shadows | blob shadows only | key light, characters only, 512 px | key light, characters only, 1024 px |
| Imported characters | colour maps only, 512 px, Lambert shading | as authored minus AO maps | as authored |
| Decorative animation | static | full | full |
| Particles / post-processing | none exist in the scene; `particleDensity` and `postProcessing` are reserved for future effects to read |

Every tier keeps the room, both full-body characters, presence, chat, voice, emotes and the game menu. Low keeps the palette and identity (see the LOW/HIGH screenshots in this phase's report).

Users choose **Graphics: Auto / Performance / Balanced / Quality** in the account menu (remembered on the device). Auto is the default.

## How quality is chosen and adapted

1. **Startup assessment** (`lib/performance/capabilities.js`) — a few synchronous reads, no benchmark scene: CPU cores, device memory, touch-first input, WebGL 2, max texture size and the GPU renderer string. Never the device model. Nothing is sent or stored (no fingerprinting).
   **When uncertain, start safely and measure:**
   - Entry-level signals → LOW.
   - **HIGH only with confidence:** a known strong GPU on a non-touch device that also reports ≥ 8 GB memory, ≥ 8 cores, WebGL 2 and ≥ 8192 px textures.
   - **Everything else starts at MEDIUM:** unknown renderer, missing memory info (Safari/Firefox), flagship phones and integrated laptop GPUs (an Intel UHD 620 measured 40 fps with stutter on HIGH). The governor upgrades after measuring sustained headroom.
2. **Learned tier** — Auto also remembers the tier this device last settled on, and starts at the lower of the two, so a reload doesn't repeat a slow start.
3. **Runtime governor** (`lib/performance/governor.js`, pure and unit-tested), fed by the frame driver:
   - One-second windows → fps and long frames (> 50 ms); never a single `1/delta`.
   - 3 bad seconds → lower render scale; at the lowest scale → next tier down (Auto only).
   - Recovery: 10 good seconds raise the scale; a tier upgrade needs 30. A 30 fps tier is probed uncapped for 3 s first, and upgrades only if it really sustains ~50 fps.
   - Stability: ≥ 4 s between changes, no upgrades for 20 s after a drop, at most 2 tier upgrades per session. An upgrade that's followed by a drop within 30 s becomes the session's ceiling. Nothing is measured during a 6 s warm-up (uploads and shader compilation).
   - Manual settings keep their tier; only render scale adapts. **Safety floor:** if even the lowest render scale stays below 15 fps for 5 s, the tier steps down one level with a short notice ("Graphics lowered to keep Our Place smooth on this device"), so a Quality choice can never make the app unusable.
   - Hidden tab: the frame loop stops with the page. On return, measurement restarts with a fresh window, so the pause isn't mistaken for slowness.
4. **Frame driver** (`components/3d/World/FrameDriver.jsx`): the Canvas runs `frameloop="never"`, and the driver renders frames itself:
   - It enforces the tier's frame cap.
   - It drops to **30 fps when the room is still** (no input, no camera drag, still partner, no emote for 4 s) and **while a game panel is open**. Measured: idle rendering halves while characters keep breathing.
   - A hidden tab stops it by itself.
5. **Developer overlay** (development builds, `?perf=1`): fps, frame time, tier, pixel ratio, draw calls, triangles, geometries, textures, shader programs, shadows, character quality, JS heap and the last change. It shows only renderer-reported numbers. Production users never see it.

## Measurements (Intel UHD 620, 1600×900 @1×, `scripts/bench-headless.mjs`)

Final hardening run:

| Characters | Setting | Tier | fps | p95 frame | long frames / 8 s | draw calls | triangles | textures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| built-in ×2 | Quality | HIGH | 60.2 | 17 ms | 0 | 147 | 70.8k | 12 |
| built-in ×2 | Balanced | MEDIUM | 59.8 | 17 ms | 0 | 147 | 70.8k | 12 |
| built-in ×2 | Performance | LOW | 30.0 | 34 ms | 0 | 125 | 37.1k | 10 |
| imported ×2 | Quality | HIGH | 53.6 | 18 ms | 3 | 117 | 122.4k | 46 |
| imported ×2 | Balanced | MEDIUM | 58.1 | 17 ms | 1 | 117 | 122.4k | 42 |
| imported ×2 | Performance | LOW | 30.1 | 33 ms | 0 | 110 | 62.9k | 25 |
| imported ×2, walking | Quality | HIGH | 51.5 | 17 ms | 2 | 101 | 120.9k | 46 |
| imported ×2, walking | Performance | LOW | 29.5 | 33 ms | 1 | 66 | 25.2k | 25 |
| imported ×2, 2560×1440 @2× | Quality (manual) | HIGH, scale 1.0 | 21.7 | 183 ms | 42 | 102 | 121.2k | 46 |

That last row was 5.2 fps before the warm-up exclusion let the render scale step down; it stays above the 15 fps safety floor, so the tier keeps the user's choice.

First Phase 4.5 run (for reference):

| Characters | Setting | Tier | fps | p95 frame | long frames / 8 s | draw calls | triangles | textures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| built-in ×2 | Quality | HIGH | 59.9 | 17 ms | 0 | 147 | 70.8k | 12 |
| built-in ×2 | Balanced | MEDIUM | 55.4 | 33 ms | 2 | 147 | 70.8k | 12 |
| built-in ×2 | Performance | LOW | 30.1 | 33 ms | 0 | 125 | 37.1k | 10 |
| imported ×2 | Quality | HIGH | 39.8 | 33 ms | 9 | 117 | 122.4k | 46 |
| imported ×2 | Balanced | MEDIUM | 59.9 | 17 ms | 1 | 117 | 122.4k | 46 |
| imported ×2 | Performance | LOW | 30.1 | 33 ms | 0 | 110 | 62.9k | **25** (was 52) |
| imported ×2 | Auto | MEDIUM (start) | 60.2 | 17 ms | 0 | 117 | 122.4k | 42 |
| imported ×2, 2560×1440 @2× (stress) | Auto | → LOW | 28.9 | 50 ms | 3 | 91 | 61.8k | 25 |
| imported ×2, 2560×1440 @2× (stress) | Quality (manual) | HIGH | 5.2 | 317 ms | 26 | 117 | 121.8k | 46 |

Triangles roughly double with real shadows (the characters are drawn again into the shadow map).

**Imported character cost** (the Avaturn exports, measured from the files):
- As authored: 4.2–4.8 MB download, 17k–32k vertices, 4–5 materials, 13–14 textures at 1024² (colour, normal, roughness/metal, AO), about **57–63 MB of GPU texture memory per character**.
- On LOW: colour maps only at 512 px, about 3–4 MB per character.

## GPU memory lifecycle (avatars)

Ownership in the current architecture:

| Resource | Owner | Shared? |
| --- | --- | --- |
| Loaded GLB (geometry, textures, decoded images) | `lib/character/modelCache.js`, one cache entry per model (LRU of 4) | yes — every avatar of that model |
| Skeleton, materials | each avatar instance (`instantiateCharacterModel`) | no (copies) |
| LOW textures (512 px colour maps) | `lib/character/quality.js`, one per source texture | yes |

Rules:

- **Textures are reference-counted by use.** Every texture an avatar actually draws with is retained when its quality is applied and released when the quality changes or the avatar unmounts. A texture whose count reaches zero has its **GPU copy** released after 3 s (`texture.dispose()`); the decoded image stays in the cache, so it re-uploads from memory if needed again.
  - A texture any avatar still uses is never released.
  - A quick quality flip-flop within 3 s releases nothing, so no re-upload and no flash.
- **Geometry** of a cached model with no avatars (the partner left, or you left the room) is released from the GPU after 5 s; it re-uploads from memory on return.
- **Final cleanup** happens when a model leaves the cache: GPU copies are disposed and the decoded ImageBitmaps are closed (they aren't garbage-collected on their own).
- **No quality change makes a network request.** Models download once per page (verified below).

Measured (`node scripts/bench-lifecycle.mjs`, two imported avatars):

| Step | Tier | GPU textures | Model downloads |
| --- | --- | --- | --- |
| Quality (HIGH) | HIGH | 46 | 2 |
| → Performance, 1 s | LOW | 54 (old and new briefly overlap) | 2 |
| → Performance, 6 s | LOW | **27** | 2 |
| → back to Quality | HIGH | 46 | 2 |
| leave/re-enter ×1 | HIGH | 46 | 2 |
| leave/re-enter ×6 | HIGH | 46 | 2 |

JS heap stayed at 158–162 MB through all of it.

## Imported avatar size

- **As authored:** Avaturn exports are 4.2–4.8 MB, about 70% of it embedded textures (13–14 images, mostly 1024² PNG/JPEG).
- **`npm run optimize:character -- "model.glb"`:** uses the same tool as the gallery build (gltf-transform: meshopt geometry, WebP textures ≤ 1024 px, no geometry simplification).
  - Measured: me model 4.4 → 1.3 MB, mineee 4.7 → 1.5 MB. Triangles are unchanged and there's no visible difference in the room (checked side by side).
  - The import validator accepts meshopt and WebP: the client loader already decodes both.
- **Recommended later:** run this automatically on the server at import (needs `@gltf-transform/core` + `sharp`, a native dependency, so it wasn't added in a hardening pass). KTX2/Basis textures would also cut GPU memory at HIGH/MEDIUM, but they need a transcoder and visual review.

## Antialiasing

MSAA is a property of the WebGL context, so it's fixed when the canvas is created (on only if the starting tier is HIGH). Changing it mid-session would mean rebuilding the renderer and the whole scene — not worth the risk. Since devices rarely start at HIGH now, most sessions run without MSAA; HIGH compensates with a higher render scale (up to 1.75×). This is a documented limitation, not a bug: the next page load picks up the new setting.

## Budgets (set from the measurements above)

| Budget | Value |
| --- | --- |
| Living room draw calls | ≤ 160 (now 110–150) |
| Triangles | ≤ 130k at HIGH, ≤ 70k at LOW (now 122k / 63k with two imported characters) |
| Character GPU textures | ≤ 64 MB each at HIGH, ≤ 4 MB at LOW |
| Character file | ≤ 30 MB upload limit; aim for ≤ 5 MB |
| Character triangles | ≤ 120k each (import validation); aim for ≤ 40k |
| Lights | 4 (hemisphere, key, lamp, accent); only the key light may cast shadows |
| Realtime subscriptions per client | 5 private couple channels (presence, chat, emotes, voice, games) |
| Movement network rate | ≤ 10 Hz while moving, nothing while still; ~40-byte payloads, interpolated 150 ms behind |
| Lobby first-load JS | ~203 kB; three.js (~184 kB gz across two chunks), voice, games and Supabase Realtime load lazily |
| Avatar GPU texture release after a quality drop | ≤ 3 s; re-entry must not add textures or downloads |

## Rules for future work

Every feature answers: **does it add triangles, textures, draw calls, realtime traffic, memory, CPU work, GPU work or bundle size? If yes, how much?** Measure with `?perf=1` and `scripts/bench-headless.mjs` before and after.

- **3D assets:** compress (meshopt), textures ≤ 1024 px (≤ 512 for small/distant props), WebP or KTX2, share materials, avoid transparency, no new shadow casters.
- **Characters and clothing:** shared materials and textures, limited simultaneous accessories, and per-tier quality through `lib/character/quality.js`. Don't add a second character system.
- **Effects:** particles and post-processing must read `particleDensity` / `postProcessing` and be off on LOW. Decorative animation must respect `environment: "static"`.
- **Games:** declare `performanceProfile` in the catalog. `light` = DOM/2D over the room (the default). `medium` = light 3D or media. `heavy` = its own space. The registry refuses a heavy game as an overlay. Game code loads only on selection.
- **Rooms** (Range Room, Watch Room…): load like the living room (a dynamic import with its own World). When a heavy room opens, living-room effects stop and its assets are released; on return the room is restored. Never keep two full scenes active.
- **Video and audio:** nothing loads or autoplays until the user asks for it. The screen shows a static state until activated.
- **React:** per-frame state lives in refs/runtime, never in React state. HUD state must not re-render the scene; `WorldStage` is memoized on stable inputs. Use narrow Zustand selectors.
- **Service worker:** caches only `offline.html`. Never cache 3D assets or app data in it.

## Testing on the devices (Redmi A5, Redmi 13C)

Use Chrome on Android plus the installed PWA, in landscape. Enable the overlay with a development build over the LAN (`npm run dev -- -H 0.0.0.0`, open `http://<pc-ip>:3000/lobby?perf=1`). Note: the camera and microphone need HTTPS outside localhost.

| Test | What to record |
| --- | --- |
| A Launch, B enter the room | time to usable room; tier at start |
| C Move for 5 min | fps, p95 frame, long frames, any tier change |
| D Partner joins, E both move | fps, stutter, movement smoothness |
| F Emotes, G chat, H voice | frame drops while used |
| I 20–30 min in the room | fps over time (thermal slowdown), heat and battery (qualitative), crashes |
| J Leave / re-enter, open and close a game | JS heap and textures in the overlay should return to the same level |

Run the same matrix on the 13C and check whether MEDIUM holds, and whether Auto settles above LOW. Don't force 60 fps: record what the device sustains.
