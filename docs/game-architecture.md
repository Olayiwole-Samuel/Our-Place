# Game architecture

Our Place hosts fundamentally different experiences — Ludo, Scrabble, a realtime target range, a co-op jigsaw, Would You Rather, drawing, watch-together. The game system therefore assumes nothing about turns, boards, winners or scores. All of it lives in `lib/game/` and is pure JavaScript shared by the web client, the future Colyseus server and tests.

**Current state:** the full product roster (≈80 games, ten categories) is registered in `lib/game/catalog.js`. Seven games are implemented end to end (Chess, Naija Whot, Scrabble and the Jigsaw Puzzle were added on 2026-10-19 — see their sections below):
- **Tic Tac Toe**, the platform test (turn-based, competitive).
- **Would You Rather** (Phase 6A): the reference conversation game — no winner.
- **Naija Ludo** (Phase 6B): the reference state-heavy, turn-based competitive game — two dice, kills (the killer goes home), double-six rolls, a winner and win streaks.

On 2026-10-30 six more arrived: **Connect 4**, **Checkers**, **Memory**, and three 18+ games — **Truth or Dare**, **Would You Rather — Spicy** and **Question Roulette** — then four more: **Reversi**, **Battleship**, **Hangman** and **Never Have I Ever**, and the rest of Talk & Party: **Two Truths and a Lie**, **Daily Question**, **This or That** and **Story Builder** (sections below). Every Talk & Party and Board & Strategy game is playable.

Every other game is honestly `coming_soon` (shown as such in the menu; the server refuses to start it). Flirty / Spicy games are 18+, off by default and `locked` until BOTH partners switch them on (`couple_members.mature_opt_in`, `set_mature_opt_in()`, migration `20261029000000_mature_opt_in.sql`; the switch is at the top of Flirty / Spicy, and the game server checks both rows before it starts one).

## Concepts

```text
Game Registry      lib/game/registry.js + catalog.js    which games exist
      ↓
Game Definition    lib/game/definition.js               what a game IS (metadata)
      ↓
Game Session       lib/game/engine.js                   one match between the couple
      ↓
Realtime State     game-specific, held by the server    whatever shape the game needs
      ↓
Validated Result   lib/game/result.js                   tagged outcome, checked against the definition
      ↓
Persistence        game_sessions / win_streaks       written by the server only
```

## Categories — `lib/game/categories.js`

Ten categories as data: `talk_party`, `board_strategy`, `card_games`, `trivia_quiz`, `co_op`, `quick_casual`, `puzzle`, `word_games`, `flirty_spicy`, `chill_create`. Each has `name`, `description`, `order` (menu position) and `mature` (`flirty_spicy` will require a couple-level opt-in).

Adding a category = adding one entry. The menu renders from `registry.groupByCategory()`, which omits empty categories, so neither the menu nor the engine changes.

## Definitions — `lib/game/definition.js`

```js
defineGame({
  id: "ludo",                     // snake_case, stable (persisted)
  name: "Ludo",
  category: "board_strategy",
  mode: "competitive",            // competitive | cooperative | conversation | creative
  multiplayer: "turn_based",      // turn_based | realtime
  authority: "server",            // server | relay   (default server)
  minPlayers: 2, maxPlayers: 2,   // max is hard-capped at 2
  winStreakEligible: true,        // required, explicit
  capabilities: ["score_based"],  // timed, score_based, ai_generated, voice_enabled,
                                  // spectator_free, hidden_information
  loadClient: () => import("@/games/ludo/client"),
  loadRules:  () => import("@/games/ludo/rules"),
});
```

Validation rules enforced at definition time:

- Unknown categories, modes, models or capabilities are rejected.
- `maxPlayers` cannot exceed 2.
- `winStreakEligible` must be declared and is only allowed for `competitive` games. It belongs to the **game**, not the category: Target Range may be eligible while another `quick_casual` game is not.
- Competitive games must use `authority: "server"`.

`getCapabilities(definition)` returns declared flags plus implied ones (`turn_based`/`realtime`, `competitive`/`cooperative`/`conversation`, `win_streak_eligible`). UI and server branch on capabilities, never on game ids.

### Metadata at a glance

| Field | Meaning |
| --- | --- |
| `id`, `name`, `description`, `icon` | identity and the game card (icon falls back to the category's emoji) |
| `category` | one of the ten locked categories (`lib/game/categories.js`: 💬 ♟️ 🃏 🧠 🤝 ⚡ 🧩 🔤 🔥 🎨) |
| `mode`, `multiplayer`, `authority` | competitive / cooperative / conversation / creative · turn_based / realtime · server / relay |
| `minPlayers`, `maxPlayers` | 1–2 (Our Place is exactly two people) |
| `capabilities` | declared flags (timed, score_based, ai_generated, voice_enabled, hidden_information…); `capabilityFlags(def)` returns them as named booleans (`turnBased`, `realtime`, `cooperative`, `competitive`, `conversation`, `creative`, `timed`, `scoreBased`, `hiddenInformation`, `aiGenerated`, `voiceEnabled`, `winStreakEligible`) |
| `winStreakEligible` | explicit; only competitive, never 18+ |
| `status` | `available` (implemented) · `coming_soon` · `locked` · `disabled` |
| `space` | `overlay` (a panel over the living room) or a dedicated room (`range_room`…) |
| `performanceProfile` | `light` · `medium` · `heavy` (heavy requires its own space) — see [performance.md](performance.md) |
| `loadClient`, `loadRules` | lazy `import()`s, required only when `available` |

`gameRequirements(def)` derives routing facts:
- `needsRealtimeServer`: realtime play needs the planned game server (Colyseus).
- `needsAi`
- `is3d`
- `needsRoom`

`defineGame` rejects any impossible combination with a clear error, for example:
- unknown categories, modes or capabilities
- more than 2 players
- an available game without its loaders
- a streak-eligible game that isn't competitive, or is 18+
- a heavy game shown as an overlay

### Gameplay models covered

| Example | mode | multiplayer | authority | Win-streak |
| --- | --- | --- | --- | --- |
| Ludo, Chess, Connect 4 | competitive | turn_based | server | ✓ |
| Scrabble | competitive | turn_based | server (+ `hidden_information`) | ✓ |
| Target Range, reaction games | competitive | realtime | server (+ `timed`, `score_based`) | ✓ (if declared) |
| Jigsaw, co-op challenges | cooperative | realtime | server | ✗ |
| Would You Rather, Daily Question | conversation | realtime | server | ✗ |
| Drawing, Music Room, Watch Together | creative | realtime | relay | ✗ |

These combinations are exercised by `lib/game/registry.test.js`.

## Game-specific state

There is no universal state schema. Each game's rules module owns its state shape — Ludo keeps `board/pieces/dice`, Scrabble keeps `board/racks/bag`, Target Range keeps `round/targets/timer/hits/combo`, Would You Rather keeps `question/responses/round`. The engine stores it opaquely in `session.state`; in Postgres it will be a `jsonb` column validated by the game's own rules.

## Rules modules and the engine — `lib/game/engine.js`

Each game exports a rules object:

```js
export default {
  setup(ctx) { return initialState },                 // required
  validate(state, action, ctx) { return null | err }, // required — legality
  apply(state, action, ctx) { return nextState },     // required — pure
  tick(state, ctx) { return nextState },              // optional — realtime (ctx.deltaMs)
  getResult(state, ctx) { return null | result },     // optional — end detection
  view(state, playerId, ctx) { return visibleState }, // optional — hidden information
};
```

`ctx = { playerIds, options, random, now, deltaMs? }`.

Engine functions (all pure — they return new sessions):

| Function | Does |
| --- | --- |
| `createSession` | Validates player count/uniqueness, calls `setup` |
| `applyPlayerAction` | Rejects if session ended, player not in session, or action malformed; then `validate` → `apply` → `getResult` |
| `tickSession` | Advances realtime games (timers, spawns); no-op without `tick` |
| `abandonSession` | Ends early with outcome `abandoned` |
| `getPlayerView` | Per-player state (e.g. hides the partner's Scrabble rack) |

Turn order is an **optional helper** (`lib/game/turns.js`: `createTurnOrder`, `requireTurn`, `advanceTurn`). Realtime and conversation games ignore it.

## Results — `lib/game/result.js`

A result is a tagged outcome, not a `winnerId` field:

| Outcome | Valid for | Notes |
| --- | --- | --- |
| `win` | competitive | `winnerId` must be a session player |
| `draw` | competitive | |
| `completed` | cooperative, conversation, creative | |
| `failed` | cooperative | e.g. timer expired |
| `abandoned` | all | never counts toward streaks |

`normalizeResult` rejects outcomes that don't fit the game's mode (a conversation game cannot declare a winner). `countsTowardWinStreak(definition, result)` is true only for `win` in a `winStreakEligible` game.

## Sessions, state and results (Phase 5)

Session statuses (database values) and what the product calls them:

| Product state | `game_sessions.status` |
| --- | --- |
| Lobby (waiting for partner / ready) | `waiting` (creator joined), `ready` (both ready, starting) |
| Starting | `ready` → the server's setup → `active` |
| Active | `active` |
| Paused | `paused` (reserved; no transition yet) |
| Finished | `completed` |
| Abandoned | `abandoned` (someone left mid-game, or 6 h without activity) |
| Cancelled | `cancelled` (left before the start) |


| Concept | Lives in | Who writes |
| --- | --- | --- |
| Game **Definition** | `lib/game/catalog.js` (code) | developers |
| Game **Session** | `public.game_sessions` row: `couple_id`, `game_id`, `status`, `players[]`, `ready[]`, timestamps | `game_*` database functions, called by the server only |
| Game **State** | `game_sessions.state` (jsonb) + `seed` | the server's engine — **never readable by clients** (column grants), because games may hold hidden information |
| Game **Result** | `game_sessions.result` (normalized outcome), `winner_id`, `streak_eligible` | the server's engine, from the state |

Lifecycle: `waiting` (creator joined) → partner joins → both `ready` → the server runs `rules.setup` with server randomness → `active` → actions → `completed`; leaving gives `cancelled` (before start) or `abandoned` (during play, never counts toward streaks). `created` and `paused` exist in the schema for later use. One open session per couple (unique index); sessions untouched for 6 hours expire.

### Server authority (`lib/game/sessions.server.js`)

All game endpoints run in Next.js route handlers (`app/api/games/sessions/...`):

| Request | Server does |
| --- | --- |
| `POST /api/games/sessions { gameId }` | registry check (exists + launchable for this couple) → `game_create_session` |
| `POST …/:id/join` | `game_join_session` (only the couple's partner; max two) |
| `POST …/:id/ready { ready }` | `game_set_ready`; when both are ready the engine sets the game up and `game_start_session` stores it (concurrency-safe) |
| `POST …/:id/action { type, payload, version? }` | `game_note_action` (membership + rate limit) → engine `validate`/`apply`/`getResult` as the **verified** user (any `playerId`/`winnerId` in the body is ignored) → `game_commit_state` (optimistic concurrency on `state_version`) |
| `POST …/:id/leave` | `game_leave_session` |
| `GET …/:id`, `GET …/current` | summary + **this player's** view (`rules.view`) — also used after every live event and on reconnect |

Identity always comes from Supabase Auth in the route; every database function re-derives the user's couple from `couple_members` and refuses other couples' sessions (`game:not_found`, so their existence isn't revealed). Winners, scores and streak eligibility are computed by the engine from state; `streak_eligible` is true only for a `win` in a `winStreakEligible` game. Rate limits: 6 creates/min, 30 ready toggles/min, 40 actions/10 s per user; action payloads ≤ 2 KB; state ≤ 256 KB.

### Realtime boundary (Supabase vs Colyseus)

```text
Our Place game system
├── Supabase (persistent):  game_sessions rows — who, which game, status, result, history
├── Next.js routes (authority for turn-based, conversation, cooperative-turn games):
│       engine validate/apply/getResult, state stored server-only in game_sessions.state
└── Colyseus (planned, realtime games): server tick loop (engine.tick), rapid state in memory;
        writes only the session row (start, result) back to Supabase
```

**Realtime games** (Target Range, reaction games) need a server tick loop, which request/response routes can't provide. The engine already supports `tick`, and the wire protocol is defined (`lib/game/protocol.js`). Running them requires the Colyseus server (`NEXT_PUBLIC_COLYSEUS_URL`, reserved). Until then they stay `coming_soon`; `gameRequirements(def).needsRealtimeServer` tells the platform which games are affected. Rapidly changing realtime state must never be written to Supabase per tick.

**Game history** (later UI): `game_sessions` already holds game, players, status, result, `winner_id`, `streak_eligible` and timestamps per session, and has an index for listing a couple's sessions newest first.

### Live sync

A trigger broadcasts a compact event (`{ event, id, gameId, status, players, ready, version, createdBy }` — never state) on the couple's private `games` topic after every change. Clients can't write that topic (RLS), so events can't be forged. The client then re-fetches its own authoritative view (`store/gameStore.js` ignores responses older than what it shows). On reconnect it re-fetches too — stale local state is never trusted.

## In-world game menu and game shell

- **Menu** (`components/lobby/games/GameMenu.jsx`): a vertical rail of the ten categories on the right edge of the living room (one column on tall screens, two columns of five on short landscape phones). A category opens a drawer to its left; each game card shows name, one line, human labels ("2 Players · Turn Based", "🔥 Streak") and its real availability. The in-world game corner opens the menu too. Only metadata is in the lobby bundle; a game's code loads on selection (and is pre-fetched on hover/focus).
- **Stage / shell** (`components/lobby/games/GameStage.jsx`): invite ("King wants to play…" → Join / Not now), launch (both players, ready states, "Waiting for…", "…isn't here yet"), the game itself, and the result (Play again / Return to Our Place). It floats over the room: the room, both characters, chat, voice and emotes stay present (they are the Phase 4 systems in the HUD). Movement keys and the joystick pause while a game is open. A win makes the winner's character dance through the normal emote pipeline.
- **A game's client** receives `{ view, me, partner, names, profiles, status, result, busy, act(type, payload), hints }` and renders only the game. `hints` is `{ send(hint), subscribe(listener) }`: small, cosmetic, live messages to the partner's client over the couple's private presence channel (the Jigsaw uses it to show a piece being dragged). Hints never change game state; only `act` does.
- **How to play** (`lib/game/guides.js`, `components/lobby/games/GameGuide.jsx`): every playable game has a guide (goal, rules as Our Place plays them, screen controls, tips), opened from the ? beside a game in the menu, on the launch screen, and in the game header. A test requires a guide for every available game.
- **Errors and loading:**
  - "Setting up your game…" while a game's code loads.
  - "We couldn't open this game." with Retry and Return to Our Place if its code fails.
  - "Something went wrong starting the game." if the session can't start.
  - "…isn't here yet." when the partner is away.
  - Raw errors are never shown.
- **Cleanup:**
  - Leaving the room closes the one `games` channel and clears game state.
  - The drawer's key listener is removed when it closes.
  - Movement input resumes when the game closes.
  - Chat, voice, emotes, presence and the couple session are never touched by games.

### Game spaces

`definition.space` is `"overlay"` (default) or a dedicated room id (`range_room` for Target Range, `music_room`, `watch_room`). Dedicated rooms are future scenes loaded like the living room; the field is in place so the shell can route to them without changing the menu or sessions.

## Dynamic loading — `lib/game/loader.js`

Definitions hold `import()` loaders, so webpack emits one chunk per game. Nothing game-specific is in the initial bundle:

```text
Open lobby → load lobby → open game menu → select Ludo → loadGameClient(ludo) → Ludo chunk (+ its assets)
```

`loadGameClient` caches the promise (instant reopen) and drops failures so they can be retried; `preloadGameClient` warms a chunk on hover/focus.

## Would You Rather (Phase 6A) — the conversation-game pattern

**Definition** (`lib/game/catalog.js`):
- `talk_party`, mode `conversation`, multiplayer `realtime` (event-driven, so no realtime server is needed), `winStreakEligible: false`
- `sessionDefaults: { rounds: 10 }` — applied by the server; clients can't set session options
- Not labelled AI-generated: today's questions are curated. The flag returns when the AI provider really exists.

**Rules** (`games/would_you_rather/rules.js`) — state is server-only:

```text
{ rounds, round, deck[], answers: { [player]: "A"|"B"|null }, next: { [player]: bool },
  phase: "answering" | "revealing" | "finished", history: [{ questionId, answers }] }

answering ──both answered──▶ revealing ──both tapped Next──▶ answering (round + 1)
    │                            │                    └── after the last round ──▶ finished
    └────────── finish (either player) ─────────────────────────────────────────▶ finished
```

| Action (intent) | Allowed when | Rejected with |
| --- | --- | --- |
| `answer { choice: "A"\|"B" }` | answering, not yet answered | `malformed_action` (bad choice), `already_answered` (locked; a double tap), `round_over` (after the reveal) |
| `next {}` | revealing | `not_revealed`, `already_ready` (double tap) |
| `finish {}` | any time before finished | — |

- **Privacy** (`view`): a player sees their own answer and only *whether* the partner answered. Both answers appear together at the reveal, and never if the game ends early with one unrevealed. Future questions are never sent.
- **Result:** `{ outcome: "completed", summary: { headline: "That was fun ❤️", line, rounds } }` — no winner, no scores. `streak_eligible` is false: a completed Would You Rather never touches streaks.
- **Duplicate taps:** codes starting with `already_` mean "already done". The client refreshes quietly instead of showing an error, and the server state is never corrupted.

**Questions** (`lib/game/questions/`):
- `validate.js` checks every question from any source:
  - id format, both options present, ≤ 120 characters
  - no markup or control characters, options not identical
- `wouldYouRather.js` — 60 curated questions with stable ids.
- `provider.server.js` — `draw({ gameId, coupleId, count, random })`:
  1. unseen questions first (`public.question_usage`, server-only, per couple and game), in server-random order
  2. **[extension point]** AI generators per game: server-side only, must return `{ optionA, optionB }`, validated and stored before use
  3. then the least recently used
  - If usage tracking is unavailable, questions are still served without de-duplication, and this is logged.
- Migration: `20261010000000_question_usage.sql`.

**Server hook** — any game's rules may export `async prepare({ coupleId, playerIds, options, random, services })`.
- The server runs it once, when both players are ready and before `setup`, and merges the result into `options`.
- `services.questions` is the provider.
- If it fails, the session is cancelled (not left "starting") and players see "We couldn't get the next question." with Try again / Return to Our Place.

**Shell integration:**
- The game's result `summary.headline`/`line` become the finish screen ("That was fun ❤️").
- Chat, voice and emotes are the room's own systems, so they keep working during play.
- Movement pauses while the game is open.

**Reusing it — e.g. Never Have I Ever:** add a question bank (`lib/game/questions/neverHaveIEver.js`) and register it in the provider's `BANKS`. Then write rules with `prepare` (draw), the same answer/reveal/next phases (with different choices), `view` for privacy and a `completed` result, plus a client and a catalog entry. No platform changes are needed.

## Naija Ludo (Phase 6B) — the state-heavy turn-based pattern

**Definition** (`lib/game/catalog.js`, id `ludo`): `board_strategy`, mode `competitive`, multiplayer `turn_based`, `winStreakEligible: true`, `layout: "board"` (the shell gives boards a wider, board-first stage), no session options. Loaders: `@/games/ludo/client` and `@/games/ludo/rules`, both lazy.

**Files** (`games/ludo/`):

| File | Runs on | What it is |
| --- | --- | --- |
| `board.js` | both | the logical board: progress model and start tiles — no pixels |
| `rules.js` | server | `setup / validate / apply / getResult / view` + `hop` (one die, path-checked), `capturesAt`, `getMoveOptions` |
| `layout.js` | client | logical positions → 15×15 board coordinates (the only place with geometry) |
| `client.jsx` | client | the board, dice, pieces, choices, animations |

**Board:**
- Two players, four pieces each (`A1–A4` pink, `B1–B4` blue), all starting in the yard.
- One shared loop of 52 squares. A's start tile is square 0 and B's is square 26.
- A piece's position is its progress: `-1` yard · `0–50` track (square = `(start + progress) % 52`) · `51–55` private home lane · `56` home. The yard and home are different states.

**Rules (exactly what `rules.js` does):**
1. **Two dice per roll**, thrown by the server (`ctx.random`). They are movement resources for the turn, `dice: [{ value, used }, { value, used }]`.
2. **Using dice**: `move { pieceId, use }`, where `use` is `"die0"`, `"die1"` or `"both"`.
   - Split: one die on one piece, the other die on another (or the same) piece, in either order.
   - Combine: both dice on one piece. This is allowed whether one piece or several are out.
   - A spent die can't be used again.
3. **Leaving the yard** needs a 6. The piece lands on its start tile and the whole 6 is used. Nobody is forced to bring a piece out: a 6 can move a piece that is already out. Combined dice can bring a piece out with the 6 and run it on with the other die (6 + 3 from the yard → progress 3).
4. **Combined moves are two hops**: one die, then the other. Only the final landing kills; passing over a piece doesn't.
5. **No houses, barriers or safe squares** (Naija Ludo): pieces of either player may share or pass any square. Your own pieces may stack.
6. **Kill**: landing exactly on opponent pieces (one or more) sends them to the yard **and takes the killing piece straight home** (it leaves the board and counts as home; a kill can win the game). A kill earns **no bonus roll**. `lastMove.to` is the square it landed on, so the board can show the walk there before the piece steps off to home. Entering with a 6 onto an opponent on your start tile is a kill too.
7. **Home** is by exact count (no overshoot). A single die can take a piece home while the other die moves another piece.
8. **Double six** (6+6) is used like any roll, including bringing two pieces out or any other allocation, and then earns a **bonus roll** of two fresh dice.
9. **Consecutive double sixes** keep earning rolls with no limit. `doubleSixes` counts the run, for display only.
10. **Unusable dice** are forfeited automatically (`forfeited`). If neither die can be used, the turn resolves at once: an owed bonus roll is taken, otherwise the turn passes. A game can never get stuck.
11. **Win**: all four pieces home. Result `{ outcome: "win", winnerId, scores: null, summary: { headline: "Home Sweet Home 🏆", line, lines: { winner, loser } } }`; the shell shows the line for the side the viewer is on.
12. **Fly rule**: in the physical game a die can fly off the board. Digital dice can't, so there is no random "fly" event and every roll counts.

**State** (server-only; JSON in `game_sessions.state`):

```text
{ seats: [playerA, playerB], pieces: { A1: progress, … B4 }, current: playerId,
  phase: "awaiting_roll" | "awaiting_move" | "finished",
  dice: [{ value, used }, { value, used }] | null, rolls, moves, turn,
  doubleSixes, bonus: ["double_six"], extraRoll,
  lastRoll: { number, by, values, doubleSix, doubleSixes, outcome: "play"|"no_move"|"three_double_sixes" },
  lastMove: { number, roll, by, pieceId, use, values, from, to, hops, captured: [{ pieceId, from }], home, enters },
  forfeited, captures: { [playerId]: n }, winnerId }
```

| Action (intent) | Allowed when | Rejected with |
| --- | --- | --- |
| `roll {}` | your turn, `awaiting_roll` | `not_your_turn`, `already_rolled` (a double tap) |
| `move { pieceId, use }` | your turn, `awaiting_move`, those dice unused, and the server lists that option | `malformed_action`, `roll_first`, `illegal_action` (opponent's piece, a spent die, a blocked or overshooting path), `already_moved` (the same move again) |

**Authority:**
- The client sends only `roll`, or `pieceId` plus which dice to use.
- Dice values, paths, destinations, kills, bonus rolls, the double-six count, turn order and the winner are computed by `apply`. Any `values`, `to`, `captures`, `bonus` or `winnerId` in a payload is ignored.
- Concurrent or duplicate requests are refused by the rules (`already_*`, quiet in the client) or by the version check (`conflict`).

**View:** Ludo has no hidden information, so `view` returns the board, dice (with `used`), the server's `options` for the current dice (equal dice listed once), `bonus`, `extraRoll`, `doubleSixes`, `lastRoll`, `lastMove` (with `hops`), `forfeited`, `winnerId` and `mySeat`. The seed and RNG never leave the server.

**Client:**
- Each player sees their own yard bottom-left (seat B's board is drawn turned 180°); the logical board is the same.
- Your corner holds your two dice. On your turn the whole corner is the Roll button, and the dice shake briefly before the server's values land.
- Pieces that can use the dice breathe and are buttons (with a larger hit area). Tap one: if the server lists one option it moves at once; if several (e.g. 5, 3 or 8), a small choice appears at the piece. The single dice sit above and below it and the combined total beside it, with 💥 when that option kills. Hover or focus previews the landing square.
- "5 used · 3 left" shows what's been spent.
- Pieces walk the server's `hops`; a killed piece pops and returns to the yard. A move from before a reload isn't replayed, and reduced motion jumps straight to the position.
- Keyboard: `R`/Space rolls, `1–4` taps a piece, Escape closes a choice.
- Dice and kill sounds go through `lib/ui/sounds.js`.

**Reconnect:** a reload restores the exact state from `current()`: dice used and remaining, options, pending bonus rolls and the turn. Resending a move after a reload is refused as `already_moved`.

### The personalised board (couple photos)

Like the picture panels of a physical Naija Ludo board, the couple's own photos are printed into the board:

| Zone (viewer's frame) | Photo |
| --- | --- |
| your yard (bottom-left) | your portrait — your pieces wait on it |
| your partner's yard (top-right) | your partner's portrait |
| the two free corners (diagonal) | the two different "together" photos; the dice tray sits on them |

The together photos are fixed to the physical board: seat B sees them swapped because the board is turned.

- **Separate layer.** `games/ludo/PhotoLayer.jsx` is pure presentation, and the rules know nothing about photos.
  - It is memoised and takes only strings, so dice, moves, turns and kills never re-render or reload it.
  - Zones are in board units (percentages of the 15×15 grid), so they scale and move with the board.
  - A test proves no zone overlaps a track square, lane or the home centre.
- **Data.** `GET /api/couple/photos` returns `{ togetherA, togetherB, partners: [{ userId, slot, url }] }`. It is fetched once (`lib/couple/photos.js`, cached for about 50 minutes, the life of the signed URLs).
  - Partner A and B are `couple_members.slot` 1 and 2, and portraits are matched by user id.
  - The couple comes from the session through RLS. No couple id is ever sent.
- **Customise board** (`games/ludo/Customise.jsx`, a button in the Ludo side panel): a small map of the four spots, laid out as they sit on the board.
  - Tap a spot to choose its picture. The image is centre-cropped and resized on the device (≤ 720 px square, WebP, or JPEG where WebP encoding isn't supported) before upload. Each spot also has Remove.
  - The board updates as soon as a photo is saved. The partner's board shows the change the next time Ludo opens.
- **Fallbacks.** Portrait → Google profile picture (requested board-sized) → the character thumbnail → an initial. A missing together photo shows an Our Place mark. An image that fails to load gives way to its fallback, so there is never a broken image.

## Couple photos (Phase 6B) — `lib/couple/photos.server.js`

`20261012000000_couple_photos.sql`:
- `couple_photos (couple_id, slot: together_a | together_b | portrait, user_id, path)`: one row per together slot, one portrait per partner.
- Files are kept in the private `couple-photos` bucket at `<couple_id>/…`, and a database check requires every path to be in its couple's folder.
- Members can read their couple's rows and objects (RLS uses `current_couple_id()`) and get images as one-hour signed URLs. Only the server writes.

`PUT /api/couple/photos/:slot { image: "data:image/webp;base64,…" }` and `DELETE /api/couple/photos/:slot`:
- The server accepts only JPG, PNG or WebP, checked by MIME type and magic bytes, up to 1.5 MB (clients send board-sized images).
- It stores the image in the caller's couple folder and replaces the slot, removing the old file.
- `whose` is `"mine"` or `"partner"` for portraits. "Partner" is resolved on the server from couple membership; a user id is never accepted from the request. Either partner may set any of the couple's four spots.

## Win streaks (Phase 6B)

`20261011000000_win_streaks.sql`: `win_streaks (couple_id, game_id, user_id, current, best, last_session)`.
- A trigger on `game_sessions` fires once, when a session becomes `completed` with `streak_eligible = true` (a `win` in a `winStreakEligible` game, set by the engine). The winner gets `current + 1` (and `best` is kept); the other player's `current` resets to 0.
- Draws, conversation games (Would You Rather) and abandoned or cancelled games never touch streaks.
- Clients can read their couple's rows and never write them. No game code writes streaks either.
- The finish screen shows "🔥 N wins in a row": the session summary carries `streaks` for completed, eligible sessions.

## Adding a game (e.g. Chess)

1. `games/chess/rules.js` — pure rules (`setup`, `validate`, `apply`, `getResult`, optional `view`/`tick`); no browser APIs (it runs on the server). Use `lib/game/turns.js` for turn order and `ctx.random` for anything random.
2. `games/chess/client.jsx` — default-export a component taking `{ view, me, partner, names, profiles, status, result, busy, act }`. Load heavy assets lazily inside it. Board games set `layout: "board"` in the definition and follow Ludo's split: a logical board module shared with the rules, and a client-only layout module.
3. Test the rules with the engine (patterns: `lib/game/engine.test.js`, `supabase/tests/gameService.test.js`).
4. In `lib/game/catalog.js`, add `status: "available"` plus the two loaders to the existing `chess` entry.

Nothing else changes: menu, sessions, API, realtime, shell, results and streak eligibility all come from the platform.


## Chess, Naija Whot, Scrabble, Jigsaw (2026-10-19)

All four use the platform unchanged: catalog entry + `games/<id>/rules.js` (server) + `client.jsx`. Hidden state lives only in `game_sessions.state`; `view()` decides what each player sees. Every action carries the client's move counter (`ply` / `turn`), so a resent action is refused with an `already_*` code (quiet in the client) and never applied twice. End-to-end tests through the real authority and migrations: `supabase/tests/newGames.test.js`.

**Chess** (`games/chess/`): rules from **chess.js 1.4** (BSD-2-Clause) — legal moves, check, mate, stalemate, castling, en passant, promotion, threefold repetition, 50-move rule, insufficient material. State keeps the UCI move list and is replayed so repetition is exact. Colours are drawn by the server. Actions: `move { from, to, promotion?, ply }`, `offer_draw`, `accept_draw`, `decline_draw`, `resign`. The view lists the side to move's legal targets, so the board only offers moves the server accepts.

**Naija Whot** (`games/naija_whot/`): the 54-card Nigerian pack; rules agreed with the couple — 6 cards each; 1 Hold on, 2 Pick two, 5 Pick three, 8 Suspension, 14 General market, 20 Whot (wild, request a shape); a 2 is blocked only by a 2 and a 5 only by a 5, and a block cancels the pick (nobody picks; play carries on with the player who dropped it); picking uses the picker's turn; playing your last card is check up (instant win). Settings before the deal (either player): Pick two / Pick three / Suspension on or off, and the **tender** — when the market runs out, `count` (game ends, lower hand total wins, stars ×2, Whot 20) or `reshuffle`. The server shuffles and deals; a player's view has their hand, the partner's card COUNT, and only how many cards someone drew.

**Scrabble** (`games/scrabble/`): standard 15×15 premium layout, 100 tiles (2 blanks), 7-tile racks, bingo +50, exchange (bag ≥ 7), pass, game end by going out (rack values transfer) or six scoreless turns (each loses their rack value), resign. Placement + scoring are pure (`scoring.js`, shared with the client for a points preview); the server re-runs them with the **ENABLE word list** (public domain, ~170k words, `words.js`, server-only — never sent to browsers, no outside service). Racks and the bag order are private.

**Jigsaw Puzzle** (`games/jigsaw_puzzle/`, cooperative): built-in illustrations (`public/puzzles/*.svg`, drawn for Our Place) or the couple's "together" photos — the server stores only the picture id; each browser loads a photo with its own signed URL. 12 / 24 / 48 pieces with real jigsaw tabs drawn by the server. Actions: `configure`, `start`, `grab` (20 s hold so two hands never move one group), `drop { piece, x, y }`, `release`, `restart`. The server decides every snap (into the frame within 0.3 of a piece, or joining a matching neighbour) and completion (`completed`, no winner, never streaks). Drags are shown live to the partner through `hints` (≤ 10/s); only drops are persisted.

**Connect 4** (`games/connect_4/`): 7×6, gravity drop, four in a row (any direction) wins, a full board draws. Red is drawn by the server. Action: `drop { column }`.

**Checkers** (`games/checkers/`): English draughts, 8×8. Men move diagonally forward, kings both ways; jumping is compulsory and a multi-jump continues with the same piece in the same turn (`state.chain`); crowning ends the move. Win when the other side has no piece or no move; 40 moves each with no capture or crowning is a draw; resign. Dark (moves first) is drawn by the server. Actions: `move { from, to }` (one step or one jump), `resign`. The view lists the mover's legal moves.

**Memory** (`games/memory_concentration/`): 12 pairs shuffled by the server; flip two — a pair is yours and you go again, a miss passes the turn. A view only carries the faces of cards that are face up. Most pairs wins. Action: `flip { index }`.

**18+ conversation games** (no winner, never streaks; content in `lib/game/questions/spicy.js`, served by the question provider and tracked in `question_usage` like Would You Rather):
- **Truth or Dare** (`games/truth_or_dare/`): alternate turns; `choose { kind }` shows a prompt to both, then `done` or `chicken`; the partner may `react { emoji }`. 12 turns.
- **Would You Rather — Spicy** (`games/would_you_rather_spicy/`): Would You Rather's rules (`createWouldYouRatherRules`) with the spicy bank.
- **Question Roulette** (`games/question_roulette/`): where the wheel lands (Flirty / Spicy / Hot / Wild card) is drawn in `prepare` and revealed only by `spin`; then `answered` or `pass`, partner reactions. 10 spins.

**Reversi** (`games/reversi/`): 8×8, standard opening; a move must flip at least one line; no move → the turn passes; game over when neither can move, more discs wins. Actions: `place { square }`, `resign`.

**Battleship** (`games/battleship/`): 10×10, fleet 5-4-3-3-2 laid out by the server (ships never touch; `shuffle` re-lays yours), `ready` from both starts the battle, then alternate `fire { cell }`; `resign`. A view has your fleet and your own shots only — an enemy ship's squares appear once it's sunk.

**Hangman** (`games/hangman/`): you set words for each other. Rounds alternate setter/guesser (4 by default): `set { word, hint? }` (letters and spaces, 3–20), `guess { letter }`, `solve { word }`, `next`, `finish`. Six misses hangs. Solved → guesser scores 7 − misses; hanged → setter scores 3. The guesser's view has only the found letters.

**Never Have I Ever** (`games/never_have_i_ever/`, conversation): statements from `lib/game/questions/neverHaveIEver.js`; both answer `have` / `never` in secret, revealed together; ten fingers each, "have" puts one down; 15 rounds or until someone's out of fingers.

**The rest of Talk & Party** (conversation games, no winner; content in `lib/game/questions/talk.js`; typed text is cleaned by `lib/game/text.js` and always rendered as plain text):
- **Two Truths and a Lie** (`games/two_truths_and_a_lie/`): rounds alternate teller/guesser (4); `write { statements[3], lie }` — the server shuffles them and keeps the lie out of the guesser's view — then `guess { index }`, `next`.
- **Daily Question** (`games/daily_question/`): one question a day per couple, picked from the couple id and the Lagos date (the same all day); `answer { text }` (≤ 280, both revealed together), up to two bonus questions with `more`.
- **This or That** (`games/this_or_that/`): `pick { choice }`; when both have picked, the next pair appears at once and the view's `last` reveals the pair you just did. 12 pairs.
- **Story Builder** (`games/story_builder/`): a server-picked opening line, then `add { text }` (≤ 160) in turns; `end` after 6 lines, or it ends at 16.

Try any of them on their real rules, both seats on one screen: `/dev/games?game=checkers` (development only).
