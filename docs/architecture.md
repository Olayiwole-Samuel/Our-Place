# Architecture

Our Place is a two-person, realtime, 3D application. This document describes the layers that exist today and where each future system plugs in. Anything marked *planned* does not exist in code yet.

## User flow (target)

```text
Sign in → Authentication → Pairing / existing couple → 3D Our Place
```

`/` is the gate (welcome or pairing); paired couples are redirected on the server to `/lobby`, the living room. See [world.md](world.md).

## Layers

| Layer | Lives in | Rule |
| --- | --- | --- |
| UI — routes | `app/` | Thin. Compose components; no business logic or DB calls. |
| UI — components | `components/` | Presentational. Visual components don't talk to Supabase directly. |
| 3D | `components/3d/` | Scene graph only. Reads state, never owns shared truth. |
| Client state | `store/` (Zustand) | Presentation/session state. **Never authoritative.** |
| Data | `lib/supabase/`, server actions/route handlers (planned) | All persistence goes through centralized clients. |
| Realtime | `lib/realtime/` (Supabase), `lib/game/protocol.js` (Colyseus) | See below. |
| Games | `lib/game/` + per-game modules (planned `games/<id>/`) | See [game-architecture.md](game-architecture.md). |
| External services | `lib/services/<name>/` (planned) | One module per provider; never called from components directly. |

## Client state (Zustand)

| Store | Scope | Holds |
| --- | --- | --- |
| `store/authStore.js` | Per page (context) | `status` (`loading`, `authenticated`, `unauthenticated`, `unavailable`, `unconfigured`), `user` |
| `store/coupleStore.js` | Per page (context) | `status` (`loading`, `unpaired`, `paired`), `me`, `partner`, `couple`, `invite`, `justPaired` + server-backed actions |
| `store/toastStore.js` | Module (client events only) | Feedback toasts |
| `store/worldStore.js` | Module (client only) | World HUD state: load stage, connection, partner status, interaction target, seated |

Auth and couple stores are created **per page instance** in `components/app/AppProviders.jsx` from the server-resolved viewer and read with `useAuthStore(selector)` / `useCoupleStore(selector)`. They are never module singletons, because a singleton written during a server render would leak one user's state into another user's request. Phase 3 reads the couple id, partner and membership from `useCoupleStore`; nothing else duplicates them. Expected later stores: `lobbyStore`, `gameStore`, `voiceStore`.

Rules:

- Subscribe to narrow slices (`useStore((s) => s.status)`), never the whole store, so the Canvas and overlays don't re-render each other.
- A store mirrors server truth for rendering; it never decides identity, couple membership, scores, results or streaks.

## Realtime: two transports, two jobs

| | Supabase Realtime | Colyseus (planned, on Render) |
| --- | --- | --- |
| Used for | **Living-room presence + movement (built)**, chat notifications, lobby changes, notifications | Active game sessions |
| Authority | Postgres + RLS (data is persisted, then broadcast) | Game server runs `lib/game/engine.js` |
| Code | `lib/realtime/channels.js` (`our-place:couple:<id>:<channel>`, private) + `lib/realtime/couplePresence.js` | `lib/game/protocol.js` — room name + message types |

Supabase is not used as a game server: it cannot validate moves, own a timer, or roll dice. Colyseus rooms are created per game session, authenticate the Supabase JWT on join, resolve the two players from the couple record, and run the engine. The Colyseus server will live in its own package (e.g. `server/`) and import `lib/game` directly.

## External service boundaries (planned)

Each provider gets one module under `lib/services/` with a narrow interface; components call hooks/server actions, never the provider SDK.

| Service | Purpose | Secret handling |
| --- | --- | --- |
| Daily.co | Voice | `DAILY_API_KEY` server-only; a route handler mints short-lived meeting tokens for verified couple members |
| Gemini | AI-generated questions | `GEMINI_API_KEY` server-only; output validated and stored in `question_bank` before use |
| MetaPerson | Selfie → 3D avatar | Result GLB stored in Supabase Storage; failure falls back (see below) |

### Avatars

`lib/avatar/resolveAvatar.js` always returns something renderable: the user's GLB + thumbnail if generated, otherwise `FALLBACK_AVATAR`. Avatar creation is optional — a MetaPerson outage must never block entering the room.

### Media (planned)

Three separate concerns, joined by ids:

1. **Storage object** — the file in a private Supabase Storage bucket, path prefixed by `couple_id`.
2. **Metadata** — a `media_assets` row (type, dimensions, uploader, storage path), RLS-scoped to the couple.
3. **Lobby representation** — a `lobby_items` row placing that asset in the 3D room (photo wall slot, screen).

## 3D

```text
World (components/3d/World/World.jsx)
├── Environment   RoomShell (floor, walls, ROOM_BOUNDS), Lighting      ← exists
├── Camera        CameraRig (establishing shot, reduced-motion aware)  ← exists
├── LocalPlayer / RemotePlayer                                         ← planned
├── InteractiveObjects (couch, rug, plant, bookshelf, photo wall,
│   video screen, door, message board)                                 ← planned
├── GameMenu (floating, in-world)                                      ← planned
└── Effects (only within device budget)                                ← planned
```

- `WorldStage` loads `World` with `next/dynamic({ ssr: false })`: three.js is a separate chunk and never server-rendered. The `/` route's first-load JS is ~106 kB without it.
- `PerformanceMonitor` (Drei) lowers pixel ratio on struggling devices; DPR starts at 1.5.
- Lighting is three cheap lights and no realtime shadows. Future models should be Draco/Meshopt-compressed GLBs with KTX2 textures in `public/models` and `public/textures`, loaded with Suspense per object.
- An `ErrorBoundary` around the Canvas turns WebGL or asset failures into a recoverable `asset_loading` error.
- Reduced motion: camera drift stops and the render loop switches to on-demand.

## Loading and errors

- **Loading** — `components/ui/LoadingScreen.jsx` (two lights drifting together), `variant="screen" | "inline"`, with a `label` per context (app, auth, room, partner, game, media, realtime). `app/loading.js` uses it for route transitions.
- **Errors** — `lib/errors` defines categories (`auth`, `database`, `realtime`, `multiplayer`, `asset_loading`, `media_upload`, `game_sync`, `external_service`, `unknown`), each with human copy and a recovery action. `presentError` never surfaces raw messages. `reportError` is the single logging point (console today; a monitoring service plugs in there). Boundaries: `ErrorBoundary` (feature-level), `app/error.js` (route), `app/global-error.js` (root layout).

## Security

- **Identity** comes from `supabase.auth.getUser()` on the server — never from client input or `getSession()`.
- **Couple scoping** is enforced by RLS on every couple-owned table and re-checked in server code (see [database.md](database.md)).
- **Outcomes** (winner, score, dice, move legality, streaks) are computed by the game server; the client sends intent only.
- **Secrets** are read only in `server-only` modules (`lib/config/server-env.js`, `lib/supabase/admin.js`); a client import fails the build (verified).
- **Headers** (`next.config.mjs`): `nosniff`, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a `Permissions-Policy` allowing camera/microphone for our own origin only. A Content-Security-Policy will be written once the real external origins (Supabase, Colyseus, Daily, MetaPerson) are integrated.
- `.env*` files are git-ignored except `.env.example`.

## PWA

- `app/manifest.js` → `/manifest.webmanifest`: `standalone`, `landscape`, theme/background `#120f0d`, 192/512 icons plus a 512 maskable icon (`public/icons`, generated from `icon.svg`).
- `public/sw.js` is deliberately minimal: when a navigation fails offline it shows `public/offline.html`. It caches nothing else — no app code, API data or media — because Our Place is live and must not pretend to work offline. Registered in production only.
- Orientation can only be locked by installed PWAs, so portrait phones get the CSS-driven `RotateDevicePrompt`.

## Responsive and safe areas

Mobile-first, landscape-first; phones, tablets and desktop are supported. `viewport-fit=cover` plus `--safe-*` variables and the `safe-inset` utility keep UI clear of notches, rounded corners and the home indicator. `app-viewport` uses `100dvh` to follow mobile browser chrome. See [design-system.md](design-system.md).

## Accessibility

Real `<button>`s with 44px minimum targets, visible `:focus-visible` ring, `role="status"`/`role="alert"` on loading and error states, labelled canvas, `prefers-reduced-motion` honoured in CSS and in 3D, and page zoom left enabled (only the canvas opts out of browser gestures).

## Performance rules

Lazy-load anything heavy (3D, each game, each game's assets); keep store subscriptions narrow; prefer Server Components and add `"use client"` only where interaction needs it; compressed GLBs/KTX2; no post-processing unless a device budget allows.

## Testing

Vitest runs `**/*.test.js`. Current coverage targets pure logic: the game system (registry, definitions, engine across turn-based/realtime/co-op/conversation fixtures), error presentation, realtime channel naming and avatar resolution. `npm run check` runs lint + tests + build. Component and end-to-end tests will be added alongside the first interactive features.

## Dependencies and known advisories

| Package | Why |
| --- | --- |
| `next`, `react`, `react-dom` | Framework (Next 15 pinned per stack decision) |
| `@supabase/supabase-js`, `@supabase/ssr` | Supabase clients with cookie-based sessions for the App Router |
| `three`, `@react-three/fiber`, `@react-three/drei` | 3D world |
| `zustand` | Client state (auth, couple, toasts, world) |
| `motion` | Framer Motion (renamed package): screen transitions, toasts, celebration. Used via `LazyMotion` + `m` |
| `tailwindcss`, `@tailwindcss/postcss` | Styling and design tokens |
| `eslint` 9, `eslint-config-next`, `@eslint/eslintrc` | Linting (ESLint 10 is not supported by `eslint-config-next@15`) |
| `vitest` | Test runner |
| `@electric-sql/pglite` (dev) | Real Postgres in WASM: runs the actual migrations to test RLS, constraints and pairing without Docker |
| `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event` (dev) | Component tests: keyboard, paste, ARIA |

- `overrides.postcss = 8.5.28` patches the PostCSS advisories in the version bundled by Next 15 (npm's suggested fix was an upgrade to Next 16).
- `braces` (high, dev-only) via `@next/eslint-plugin-next` → `fast-glob` → `micromatch`: no patched version exists. It only affects the lint tool matching our own file globs, never the shipped app. Revisit when upstream updates.
- `THREE.Clock` deprecation warning in the browser console comes from React Three Fiber internals with three r186; harmless, resolved by a future R3F release.
