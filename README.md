# Our Place

A private 3D space for exactly two people in a relationship.

> **Open the app → you're together.**

The product is a persistent 3D living room the couple shares: avatars, voice, chat, emotes, games, photos, messages, streaks and a room that evolves over time. The 3D room *is* the app — there is no dashboard. There are no public rooms, followers, profiles or feeds; every couple is exactly two people.

## Status

**Phase 4 — Chat, voice & emotes: implemented.** Inside the living room the couple can chat (persistent, couple-private), talk over Daily voice (mic off by default) and send emotes their full-body characters perform for each other. Live two-account verification needs the Supabase project set up (migrations applied, Google enabled) — see [auth-and-pairing.md](docs/auth-and-pairing.md#one-time-setup-supabase--google).

| Area | State |
| --- | --- |
| Official visual identity (black / army green / soft pink), Geist type, motion | ✅ Built |
| Google sign-in (Supabase Auth, PKCE), session restore/expiry/sign-out | ✅ Built — needs Supabase + Google provider configured |
| Profile trigger, couples, six-character invites, atomic pairing, RLS | ✅ Built and tested in real Postgres |
| Welcome, pairing, celebration and paired-entry screens; toasts | ✅ Built |
| Next.js app, loading/error system | ✅ Built |
| 3D world architecture (empty room shell, lighting, camera, lazy loading) | ✅ Built |
| Supabase browser / server / admin clients, session-refresh middleware | ✅ Built (needs env values to connect) |
| Migration structure + foundation migration (helpers only, no tables) | ✅ Built |
| Game system: categories, registry, definitions, session engine, results | ✅ Built and tested — **no games registered yet** |
| PWA manifest, icons, minimal offline-fallback service worker | ✅ Built |
| 3D living room (zones, lighting by time of day), third-person camera, movement, collision | ✅ Built |
| Couple presence (private Realtime channel + RLS), interpolated partner, arrival/away states | ✅ Built and tested — live run needs project setup |
| Interactions (sit on the couch; info cards), touch joystick, HUD | ✅ Built |
| Full-body characters: Character Studio, built-in rigged character, .glb import, animation controller | ✅ Built (Phase 3.5) |
| Character gallery (free CC0 packs) | ⏳ Pipeline ready — needs the two free packs in `assets-src/` |
| Photo characters (MetaPerson) | ⏳ Built, off until `METAPERSON_*` credentials are set |
| Chat (persistent, realtime, paged), voice (direct WebRTC by default; Daily optional), character emotes, presence notices | ✅ Built (Phase 4) — apply migrations `20261007000000_chat_and_emotes.sql` and `20261008000000_voice_signaling.sql` |
| Imported models animated by the built-in controller (retargeting) | ✅ Built (Phase 4) |
| Game menu, games, media, streaks, room evolution | ⏳ Not started |
| Game platform: menu, registry (full roster), sessions, server authority, shell | ✅ Built (Phase 5) — apply migration `20261009000000_game_sessions.sql`; Tic Tac Toe (platform test), **Would You Rather** (Phase 6A; apply `20261010000000_question_usage.sql`) and **Naija Ludo** (Phase 6B; apply `20261011000000_win_streaks.sql` for win streaks and `20261012000000_couple_photos.sql` for the personalised board) are playable |
| Chess, Naija Whot (house-rule settings), Scrabble (ENABLE word list) and a co-op Jigsaw Puzzle; "How to play" guides for every game | ✅ Built (2026-10-19) — no migration needed |
| Phones: landscape only ("turn your phone sideways"), full-screen button, layouts fitted to ~800×300 (Redmi 13C / A5) | ✅ Built |
| The room comes alive: last seen, together streak 🔥, notes board, memory wall, trophy bookshelf, watch-together TV (YouTube + uploads to Backblaze B2), phone push notifications — see [docs/room.md](docs/room.md) | ✅ Built (2026-10-20) — apply `20261013000000_room_features.sql`; set the B2 and VAPID env vars |
| Remaining game implementations, Colyseus realtime game server | ⏳ Not started |
| Streaks, leaderboard, media, notifications, AI questions, avatars | ⏳ Not started |

## Stack

Next.js 15 (App Router, JavaScript) · React 19 · Tailwind CSS 4 · Framer Motion (`motion`) · Three.js + React Three Fiber + Drei · Zustand · Supabase (Auth, Postgres, Storage, Realtime) · Vitest + Testing Library + PGlite.

Daily.co (`@daily-co/daily-js`, voice) and Lucide icons were added in Phase 4. Planned, not yet installed: Colyseus (multiplayer, hosted on Render), Google Gemini (AI questions).

## Getting started

Requires Node.js ≥ 20.9.

```bash
npm install
cp .env.example .env.local   # fill in Supabase values when you have a project
npm run dev                  # http://localhost:3000
```

Without valid Supabase credentials the app still runs: the welcome screen shows sign-in as unavailable and the server logs why. Setup for Supabase and Google: [docs/auth-and-pairing.md](docs/auth-and-pairing.md#one-time-setup-supabase--google).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (Next.js core-web-vitals rules) |
| `npm test` | All tests: unit, component (jsdom), and database security tests (real migrations in PGlite) |
| `npm run check` | Lint + tests + build — run before every merge |
| `node scripts/b2-cors.mjs` | One-time: allow the site to upload videos to your Backblaze bucket |
| `node scripts/voice-e2e.mjs` | Two headless browsers talk through Agora for 30 s and report what each hears (needs `npm run dev` and Agora keys) |
| `npm run characters:build` | Build the male/female characters and their animations from Mixamo downloads in `assets-src/mixamo/` (docs/characters.md) |
| `npm run gallery:build` | Build the character gallery from free CC0 packs in `assets-src/` |
| `node scripts/bench-headless.mjs` | Measure the living room in headless Chrome (needs `npm run dev`); see docs/performance.md |
| `node scripts/bench-lifecycle.mjs` | Check avatar GPU memory across quality changes and leave/re-enter (needs `npm run dev`) |
| `npm run optimize:character -- "model.glb"` | Shrink a character GLB (~70%) before importing it |

## Environment variables

See [.env.example](.env.example) for the authoritative list with comments.

| Variable | Exposure | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public — must be `https://<ref>.supabase.co` | All Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (RLS-protected) | Browser + server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | `lib/supabase/admin.js` — **required** for games, win streaks and couple photos |
| `NEXT_PUBLIC_VOICE_PROVIDER` | Public | `p2p` (default, free) or `daily` |
| `DAILY_API_KEY` | **Server only** | `lib/voice/daily.server.js` (only when the voice provider is `daily`) |
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | **Server only** | Voice over Agora (`lib/voice/agora.server.js`) — used automatically when set. Free 10,000 participant-minutes a month |
| `METERED_TURN_APP`, `METERED_TURN_API_KEY` | **Server only** | TURN relay for direct voice (`lib/voice/ice.server.js`) — needed for voice between phones on mobile data. Metered Open Relay: free 20 GB/month, no card |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_KEY_API_TOKEN` | **Server only** | Alternative relay (Cloudflare; asks for a card) |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | **Server only** | Alternative: any TURN provider with fixed credentials |
| `METAPERSON_CLIENT_ID`, `METAPERSON_CLIENT_SECRET` | **Server only** | Photo characters (off until set) |
| `NEXT_PUBLIC_COLYSEUS_URL`, `GEMINI_API_KEY` | Reserved | Not read yet |

`NEXT_PUBLIC_*` values are compiled into browser JavaScript. Secrets never use that prefix and are only read from modules that import `server-only`, which makes the build fail if they reach client code.

## Project structure

```text
app/                    Routes (App Router), global CSS/tokens, manifest, error/loading boundaries
  api/health/           Liveness probe
components/
  3d/                   World (Canvas root), Environment, Camera — Player/Interactions later
  app/                  AppProviders (stores, motion, auth listener) + AppStage (screen selection)
  auth/                 WelcomeScreen, GoogleSignInButton, SignOutButton
  pairing/              PairingScreen, InviteCodePanel, JoinCodePanel, CodeInput, PairingSuccess
  lobby/                Lobby (world + HUD), presence & controls hooks, joystick, interaction UI
  3d/                   World, Room, Environment, Furniture, Player (avatars), Camera
  brand/                BrandMark, Wordmark, Atmosphere
  ui/                   Button, Toaster, PulseDots, LoadingScreen, ErrorState, ErrorBoundary, RotateDevicePrompt
  pwa/                  Service-worker registration
hooks/                  Reusable React hooks
lib/
  config/               Public env (env.js, validated) and server-only secrets (server-env.js)
  auth/                 Session resolution (server), viewer for the first render, Google sign-in (client)
  couple/               Invite-code format, pairing errors/copy, server data access, client API
  api/                  authenticatedRoute wrapper: auth, CSRF checks, safe error responses
  world/                Room config, collision, interpolation, interactions, presence state, input, time of day
  realtime/             Couple channel naming + presence (private channel, pose sync)
  supabase/             Browser, server, admin clients + middleware session refresh
  game/                 Game-agnostic game system (see docs/game-architecture.md)
  realtime/             Supabase Realtime channel conventions
  errors/               Error categories, user-facing copy, reporting
  avatar/               Avatar resolution with guaranteed fallback
  design/               Design tokens for non-CSS consumers (three.js, manifest)
store/                  Zustand stores: auth, couple (per page), toasts, world (HUD state only)
supabase/tests/         Database security tests (real migrations in PGlite)
public/                 Icons, service worker, offline page (models/textures/audio later)
supabase/migrations/    SQL migrations (Supabase CLI format)
docs/                   Architecture documentation
```

## Documentation

- [Authentication & pairing](docs/auth-and-pairing.md) — flow, security model, setup, dev workflow, acceptance checks
- [Characters](docs/characters.md) — full-body characters, studio, sources (designed, gallery, import, MetaPerson), security
- [World](docs/world.md) — living room, camera, movement, interactions, avatars, presence, performance
- [Architecture](docs/architecture.md) — layers, state, realtime, services, 3D, PWA, security, performance
- [Game architecture](docs/game-architecture.md) — registry, categories, engine, server authority, adding a game
- [Database](docs/database.md) — Supabase clients, migration conventions, RLS strategy
- [Design system](docs/design-system.md) — palette, typography, layout, motion
- [Performance](docs/performance.md) — quality tiers, adaptive quality, measurements, budgets, device testing, rules for new features

## Deployment

- **Web app** → Vercel. Set the env vars above in the project settings (Production), then redeploy.
  - `vercel.json` pins the server functions to `dub1` (Dublin), next to the Supabase project (AWS eu-west-1). Every API call makes several database round trips, so keeping them in the same region matters.
  - Supabase → Authentication → URL Configuration: the Site URL and redirect URLs must include the Vercel domain (`https://<app>.vercel.app/**`), or Google sign-in returns to the wrong place.
  - Apply every file in `supabase/migrations/` (in order) in the SQL editor.
  - Check a deployment from a signed-in browser at `/api/diagnostics`: it reports whether the server key and TURN relay are configured (true/false only).
- **Voice** works browser-to-browser. Between phones on mobile data it needs a TURN relay: set `METERED_TURN_APP` and `METERED_TURN_API_KEY` (Metered Open Relay, free 20 GB/month, no card), or the Cloudflare pair.
- **Phones**: works upright and sideways; `/dev/hud` (development only) previews the HUD and games at any size without signing in.
- **Multiplayer server** (future) → Render, as a separate Node service running Colyseus.
