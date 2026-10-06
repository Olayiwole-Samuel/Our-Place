# The world: living room, presence and interactions

The 3D living room **is** the product's home screen. A paired couple lands on `/lobby` and is inside their room. This document covers how the world is built and how the partner's presence works.

## Route and entry

| Route | Who | What |
| --- | --- | --- |
| `/` | signed out / unpaired | Welcome or pairing. Paired couples are redirected to `/lobby` on the server. |
| `/lobby` | signed in **and** paired | The living room. Anyone else is redirected to `/` (server-side, from verified state). If Supabase is unreachable, a "couldn't connect" screen with retry. |

After the pairing celebration, the client hands off to `/lobby`. There is no intermediate dashboard.

## Structure

```text
components/lobby/Lobby.jsx          screen: world + HUD, presence + controls wiring
 ├─ WorldStage                      loading stages, error boundary, lazy 3D chunk
 │   └─ World (Canvas)              components/3d/World/World.jsx
 │       ├─ Lighting                time-of-day preset (lib/world/timeOfDay.js)
 │       ├─ Room                    room config → shell + objects (Room.jsx)
 │       │   └─ CameraOccluder      tall props fade when blocking the view
 │       ├─ LocalPlayer             input → collision → pose → presence send → interactions
 │       ├─ RemotePlayer            presence-driven, interpolated, arrival effect
 │       └─ ThirdPersonCamera       follow + orbit, clamped inside the room
 └─ HUD                             PartnerStatus, ConnectionStatus, AccountMenu,
                                    Joystick, InteractPrompt, ObjectCard, OnboardingHint,
                                    SeatedHint, CommsDock (emotes · chat · mic)
```

Pure logic lives in `lib/world/` and is unit-tested: collision, interpolation, interactions, partner presence, input, time of day, the room config, actions and the runtime.

### State: reactive vs per-frame

- **`store/worldStore.js` (Zustand)** holds only what the HUD re-renders on: `loadStage`, `connection`, `partner` (status machine), `interactionTarget`, `activeInteraction`, `seated`. No auth state, no game state.
- **The world runtime (`lib/world/runtime.js`)** holds everything that changes every frame, mutated directly with no React involvement: `localPose`, `partnerBuffer`, `input`, `camera.yaw`, `presence`.
- Couple identity (ids, partner profile, slot) comes from `useCoupleStore`, which the server verifies.

## Room configuration

`lib/world/rooms/livingRoom.js` describes the room as data:

- size and walkable bounds
- spawn points per couple slot
- `plantStage` and `lighting`
- `objects[]`: each has an `id`, `type`, `position`, `rotation`, and optionally a `collider`, an `interaction` and an `occluder`

`Room.jsx` maps each `type` to a component. **Room evolution** (a later phase) produces a different config: a higher plant stage, unlocked decorations, different lighting. A stored per-couple config would be merged over this default. No scene code changes.

**Scale:** metres, Y up. The room is 9 × 8 × 3.1 m. The player is ~1.55 m tall with a 0.28 m collision radius; the couch seat is 0.45 m high; doors are 2.1 m. Walkways are at least 0.7 m wide (a test checks that standing up from the couch lands in free space).

| Zone | Object | Future interaction |
| --- | --- | --- |
| Back wall, left | Photo wall (empty state: "Add your first memory") | View memories (Supabase Storage) |
| Back wall, right | Video screen ("Nothing playing yet") + media console | Watch together |
| Centre | Couch (two pink cushions), rug, coffee table | **Sit (works now)**, shared activities |
| Back-left corner | Plant (`stage` 0–3) | Room evolution |
| Left wall | Message board (one blank note), bookshelf (top shelf kept empty), window | Left messages, trophies |
| Right wall | Game corner (ten blue tiles = the ten categories), door | Game menu, room transitions |

**Future spaces** (Range Room, game rooms, watch room) are separate scenes with their own config, loaded the same way as `World`: a dynamic import, so nothing about them is in the living-room bundle. The door's `destination` field is where a transition attaches. *Target Range* is a game in the registry; the *Range Room* is the 3D space it runs in.

## Camera

Third-person, orbiting the local player at `runtime.camera.yaw` (drag anywhere on the world to look around).

- 2.9 m behind, 1.8 m high, looking at chest height.
- Eases toward its target (no snapping), with a fixed FOV of 55° and no shake.
- Clamped inside the walls and below the ceiling, so it never clips outside the room. Furniture that blocks the view fades (`CameraOccluder`).
- Pulls closer while seated.

## Movement and collision

- **Input:** keyboard (WASD / arrows) and the touch joystick write into one input object; movement is relative to the camera.
- **Speed:** 2.1 m/s; the avatar turns smoothly toward the direction of travel.
- **Collision:** circle vs axis-aligned boxes and circles on the floor plane, with push-out resolution (so you slide along furniture), then clamped to the walls. No physics engine. It's a few dozen float operations per frame and cannot be escaped by large steps (tested).

## Interactions

- **Data:** `{ id, type, label, verb, x, z, radius }`, derived from the room config.
- **Detection:** `findNearestInteractable` runs at **10 Hz**, not every frame. React state changes only when the nearest target changes. It's a linear scan (about 10 objects); a spatial grid is documented in the code for larger spaces.
- **Behaviour** comes from `components/lobby/interactionHandlers.js`:
  - `action`: the couch → **Sit** (real: your own seat, broadcast to your partner; move to stand).
  - `card`: an honest description of what will live there ("Coming soon"). Closes on Esc, ✕, or walking away.
- **UI:** a contextual button appears only when something is in reach (large on touch; shows an `E` hint on desktop).

## Characters

Players are full-body rigged characters rendered by the shared `<Character>` (see [characters.md](characters.md)). Emotes reach a character through the runtime (`runtime.emotes.local` / `.partner` = `{ name, id }`), which each player copies into its motion ref. The partner's speaking state (from Daily) draws a sky-blue ring at their feet, read per frame without React renders. `components/3d/Player/Avatar.jsx` adds only world touches: a blob shadow and an identity ring (green = you, pink = partner); the partner also has a name tag. The saved character comes from `useCharacterStore`; a partner without one yet appears as the default built-in character. Movement sets `motion.current = { anim, speed }` — sitting, walking and future emotes all go through the character's animation controller.

## Presence

**Channel:** one **private** Supabase Realtime channel per couple, `our-place:couple:<coupleId>:presence`. Joining or sending is authorized by RLS on `realtime.messages` (migration `20261005000000_realtime_couple_channels.sql`): only that couple's two members, resolved from their JWT, are admitted. Unpaired and anonymous clients are refused, and so is every other couple (tested in real Postgres). The client calls `realtime.setAuth()` before subscribing.

| Mechanism | Used for | Rate |
| --- | --- | --- |
| `presence.track` | Who's in the room + resting pose (so a late joiner sees where you stand) | On join, then at most 1/s and only when settled |
| `broadcast "pose"` | Streaming movement | **10 Hz** while moving; nothing while still |
| `broadcast "leave"` | Deliberate exit (tab closed, signed out) | Once |

**Payload:** `{ x, z, ry, anim }`, rounded to millimetres. There are no names, emails or tokens. Names and avatars come from the server-verified couple state, so a modified client can only move its own avatar. Incoming poses are **sanitised**: finite numbers only, clamped to the room, animation from an allow-list.

**Interpolation:** snapshots go into `createPoseBuffer`, which renders 150 ms in the past and blends between the two snapshots around that moment. It extrapolates at most 200 ms after the stream stops, then holds, and snaps on large jumps (sitting down). Receive-time stamps make it immune to clock skew.

**Partner status machine** (`lib/world/partnerPresence.js`):

| Status | Meaning | UI |
| --- | --- | --- |
| `unknown` | We're not connected, so we can't know | "Checking…" / "Can't check right now"; avatar hidden |
| `offline` | Connected, partner not present | "Not here yet" — the room stays fully usable |
| `online` | Presence confirms they're here | Avatar + "Here with you"; arrival → soft ring + "❤️ Sam's here." toast |
| `away` | Their connection dropped without a goodbye | Avatar dimmed + "reconnecting" for 10 s, then offline |

A deliberate leave is instant. Our own disconnect makes the partner `unknown` (never "online" by assumption), and reconnecting doesn't re-announce them. supabase-js rejoins channels automatically; on each `SUBSCRIBED` we re-track.

## Loading and errors

Loading stages map to real events: `engine` ("Loading your space", the 3D chunk) → `room` ("Preparing your space", canvas created) → `presence` ("Finding your person", first frame drawn) → `ready` (presence answered, or after 5 s so a bad connection never traps you). There are no fake percentages.

A WebGL or scene failure shows "We couldn't load your space" with **Try again**, and developer details outside production.

## HUD

The world fills the screen. Controls sit at the edges inside `safe-inset` and never cover the middle:

| Zone | Contents |
| --- | --- |
| Top-left | Partner + presence status |
| Top-right | Connection (Live / Connecting / Reconnecting / Offline) + account menu |
| Right | Reserved for the game category menu (marked in-world by the game corner) |
| Bottom-left | Joystick (touch devices) / wordmark (desktop) |
| Bottom-centre | Info card, first-visit hint (dismissed once, remembered locally), seated hint |
| Bottom-right | Interact button; then emotes · chat · mic (`components/lobby/comms/`). The chat panel floats above them, below the top-right controls; the emote tray opens to their left, clear of the joystick. |

## Performance

- **No downloads beyond code.** Every texture is procedural, drawn on a canvas at runtime (planks, rug, blob shadows, text), and every object is primitives. Total model and texture download: 0 bytes.
- **Code:** the 3D world is about 245 kB gzipped across lazy chunks, loaded only on `/lobby`. Supabase Realtime (~54 kB gz) loads after first paint.
- **Lights:** hemisphere + one directional + two point lights. Shadows and everything else scale by quality tier — see [performance.md](performance.md).
- **Materials and geometry:** shared material instances; the bookshelf's books are one instanced mesh (one draw call).
- **Adaptive quality:** tiers, render scale, frame caps and the governor are described in [performance.md](performance.md).
- **Per frame:** no React renders while moving; no per-frame allocations in the camera; interaction checks at 10 Hz; network sends at ≤ 10 Hz.
- **Future GLBs:** Draco/Meshopt compression, KTX2 textures ≤ 1k, ≤ 20k triangles per furniture piece; check with `gltf-transform inspect` before adding.

## Ambient audio (boundary only)

Nothing plays yet, because there are no audio assets. When ambience arrives it starts only after a user gesture (autoplay policy), with a mute control in the account menu and a volume preference in `localStorage`.

## Communication (Phase 4)

| System | Transport | Files |
| --- | --- | --- |
| Chat | Postgres `messages` + database broadcast on the private `chat` topic | `lib/chat/*`, `store/chatStore.js`, `components/lobby/comms/ChatPanel.jsx` |
| Emotes | `send_emote` RPC → database broadcast on the private `emotes` topic | `lib/emotes/emotes.js`, `components/lobby/comms/EmoteControl.jsx` |
| Voice (default) | Direct browser-to-browser WebRTC; signaling on the private `voice` topic | `lib/voice/peerVoiceSession.js`, `store/voiceStore.js` |
| Voice (optional) | Daily.co, one private 2-person room per couple, server-minted tokens (`NEXT_PUBLIC_VOICE_PROVIDER=daily`; the Daily account needs a payment method) | `lib/voice/voiceSession.js`, `app/api/voice/token/route.js` |

`components/lobby/useCoupleComms.js` opens chat + emotes once per mount (cleaned up on unmount) and acquires the shared voice session.

- **Chat:** latest 50 messages, then 50 more each time you scroll to the top. Ordered by `created_at` (µs) then id, never by arrival. Optimistic send with a client id: the saved row replaces it (deduplicated by id); failures show **Retry / Remove**. After a reconnect, rows newer than the newest one are read once (no polling). Unread count while closed (remembered per couple in `localStorage`) plus a short preview. Enter opens chat on desktop when nothing is interactable; Esc closes; Shift+Enter is a new line. The panel follows the mobile keyboard via `visualViewport`.
- **Voice:** by default the two browsers connect directly (WebRTC, encrypted; a public STUN server only helps them find each other; no audio passes through Supabase or any server). Without a TURN relay, some strict networks can't connect directly; the HUD then says "Couldn't connect voice on this network" with a retry. Either provider joins listening-only (no device access); the microphone is requested on the first mic tap and released when turned off. States: connecting, connected, reconnecting (Daily `network-connection`), disconnected/error (tap to retry; automatic retries at 2 s, 5 s and 15 s, and when the browser comes back online), permission denied, no device, unsupported browser, and audio blocked by autoplay (tap to hear). Partner connected/muted/speaking come from Daily participants and audio levels. Direct voice can't get stuck on "reconnecting":
  - When the signaling channel rejoins, voice reports available again, even if the call never dropped.
  - A call that stays disconnected for 8 s (for example, the partner's page vanished without saying goodbye) is torn down and re-handshaken.

  The session lingers 4 s after a space unmounts, so moving between spaces won't reconnect; page hide and sign-out leave immediately.
- **Emotes:** two taps (tray, then emote; 1–7 on the keyboard). The local character plays the emote at once; the broadcast can fail without affecting it. 1.5 s client cooldown, 1 s on the server. Standing still, an emote uses the whole body; while walking or seated, the legs keep the locomotion and the emote drives the upper body.
- **Presence notices:** "❤️ Sam is here" and "Sam left Our Place" appear as quiet lines in the chat feed. They come from the existing presence state machine and aren't saved. The arrival toast is kept.
- **Isolation:** emotes, chat and voice each sit in their own error boundary; none of them touches the R3F tree except through the runtime.
