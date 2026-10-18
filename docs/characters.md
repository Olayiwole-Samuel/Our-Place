# Characters

Every person in Our Place is a **full-body, rigged 3D humanoid**: head, face, hair, neck, torso, both arms and hands, pelvis, both legs and feet. They are driven by one skeleton and one animation controller, so the same character walks, sits and (from Phase 4) emotes in the living room, game rooms and the Range Room.

## Male / female characters (current)

Everyone is one of two realistic, motion-captured characters, **Male** or **Female**, from [Mixamo](https://www.mixamo.com) (free with an Adobe account; royalty-free use in projects). There is no personal designing or importing any more: you choose a look from the account menu (**Your character: Male / Female**), any time, also while a game is open, and your partner sees the change at once (a `character` broadcast on the presence channel makes them reload it). Until you choose, you appear as the default look (Male). `lib/character/looks.js` holds the rules. `/character` now redirects to the world.

Until the models are built, the gallery is empty and characters render as before.

### Getting the Mixamo files (once)

Sign in at mixamo.com and save every file into `assets-src/mixamo/` (git-ignored) with exactly these names.

**Characters** (Characters tab → pick one → Download → Format **FBX Binary (.fbx)**, Pose **T-pose**):

| File | Suggestion |
| --- | --- |
| `male.fbx` | any realistic clothed man, e.g. Remy |
| `female.fbx` | any realistic clothed woman, e.g. Jody or Kate |

**Animations** (Animations tab → search → Download → **FBX Binary**, **Without Skin**, 30 fps; tick **In Place** whenever it's offered):

| File | Search Mixamo for |
| --- | --- |
| `idle.fbx` (required) | Breathing Idle |
| `walk.fbx` (required) | Walking |
| `run.fbx` | Jogging |
| `sit.fbx` | Sitting Idle |
| `wave.fbx` | Waving |
| `laugh.fbx` | Laughing |
| `cry.fbx` | Crying |
| `kiss.fbx` | Blow A Kiss |
| `dance.fbx` | Hip Hop Dancing (or any dance) |
| `celebrate.fbx` | Victory |
| `angry.fbx` | Angry |
| `heart.fbx` | Thankful |

Then run `npm run characters:build`. It converts everything (FBX2glTF), compresses it (meshopt + WebP) into `public/models/characters/{male,female}.glb` and `public/models/animations/mixamo/*.glb`, and writes `lib/character/gallery.manifest.json`. Commit those outputs. Walk cycles play at the speed the character actually moves, so the feet don't slide.

## Earlier character sources (kept in code, no longer offered)

| Source (`characters.provider`) | Status | What it is |
| --- | --- | --- |
| `ourplace` — **Designed** | ✅ Works now, free | Built-in character, customised live in the Character Studio (face, body, hair, clothes, accessories). Also the universal **fallback**. |
| `library` — **Gallery** | ⏳ Pipeline ready; needs the free CC0 packs | Ready-made characters shipped with the app (Quaternius, CC0) with real animation clips. |
| `imported` — **Your own .glb** | ✅ Works now | Upload a rigged full-body humanoid (Mixamo, VRoid, Blender…). Validated server-side, stored privately. Tip: `npm run optimize:character -- "model.glb"` makes it ~70% smaller first (meshopt + WebP; both accepted). |
| `metaperson` — **From a photo** | ⏳ Built, switched off | Selfie → MetaPerson → full-body GLB. Turns on when `METAPERSON_CLIENT_ID/SECRET` are set. |

### Provider research (verified against provider docs, Oct 2026)

- **MetaPerson (Avatar SDK):** a selfie produces a full-body, fully rigged avatar with a humanoid, **Mixamo-compatible** skeleton and blendshapes, exported as GLB/glTF/FBX. Web integration works through the MetaPerson Creator iframe JS API (`authenticate`, `generate_avatar` with a base64 image, `set_export_parameters`, `model_exported` → temporary URL), or headlessly via the REST API.
  - **Auth:** OAuth2 `client_credentials` at `api.avatarsdk.com/o/token/`. The iframe accepts an `accessToken`, so the client secret stays on our server.
  - **Cost:** exports need the Pro plan (≈ $800/month) or the 7-day trial. The first avatar on the public site is free but can't be integrated.
  - **Export URLs are temporary**, so we copy models into our storage.
- **Avaturn:** similar capability; no permanent free plan (≈ $800/month).
- **Ready Player Me:** shut down on Jan 31, 2026.
- **Quaternius (CC0):** the free *Universal Base Characters* tier has 2 rigged humanoids and 5 hairstyles. The free *Universal Animation Library* tier has 45 clips on the same rig, including locomotion, sitting and emotes.

## Architecture

```text
Supabase auth → characters row (owner) ──► loadCharacters (server, RLS) ──► { config, model }
                                                                              │
                         ┌────────────────────────────────────────────────────┘
                         ▼
<Character character motion />   components/character/Character.jsx   (any space: lobby, studio, game rooms)
  ├─ model? → loadCharacterModel (cached by stable key) → validate full-body → normalise scale → clips
  │           any failure → built-in character from the same config (never an empty scene)
  └─ buildCharacter(config) → SkinnedMesh + Skeleton (lib/character/buildCharacter.js)
motion ref { anim: idle|walk|run|sit, speed, emote } → animation controller
```

| Module | Role |
| --- | --- |
| `lib/character/catalog.js` | Data-driven options: skin, hair and eye colours, face shapes, hairstyles, garments and accessories (with `unlock` reserved for future rewards) |
| `lib/character/schema.js` | The Our Place Character Model v1, `normalizeCharacterConfig` (single gatekeeper: unknown ids dropped, numbers clamped, slot rules), starting looks |
| `lib/character/rig.js` | Canonical humanoid bones (Mixamo-style), alias mapping for provider rigs, `isFullBodyHumanoid` |
| `lib/character/buildCharacter.js` | Built-in character: lathed torso, tapered limbs, sculpted head, garments cut from the body profile; parts skinned to bones and merged per material |
| `lib/character/animation.js` | `setState` / `playEmote` / `update`: procedural locomotion and 8 emotes on canonical bones, cross-faded |
| `lib/character/glb.js` | Server-side GLB inspection: magic/version, size, embedded resources only, supported extensions, skinned full-body humanoid, triangle budget |
| `lib/character/modelCache.js` | Client GLB cache (LRU, keyed by storage path, not signed URL), meshopt decoder, scale normalisation, shared clip libraries, per-instance skeleton and materials, disposal |
| `lib/character/server.js` · `sources.server.js` · `metaperson.server.js` | Server operations: load, save look, switch source, import, MetaPerson token and import |
| `store/characterStore.js` | One source of truth: saved `mine`, `partner`, studio `draft`, `save()` (succeeds only after the server confirms) |
| `components/studio/*` | Character Studio |

### The built-in character

- **Structure:** a real `THREE.SkinnedMesh` bound to a 21-bone `THREE.Skeleton`: Hips, Spine, Spine1, Neck, Head, Left/Right Shoulder, Arm, ForeArm, Hand, HandThumb1, Left/Right UpLeg, Leg, Foot.
- **Cost:** ≤ 15 draw calls and ≈ 18k triangles per character, about 40 ms to build. The studio throttles rebuilds while sliders are dragged.
- **Clothing is part of the mesh,** skinned to the same bones: garments are the body profile inflated, so they move with the limbs.
- **Body proportions are bounded** (height 1.52–1.90 m, build, shoulders). Tests show the hips land on the couch seat for both the shortest and the tallest body.

### Animation

| Character type | Animation |
| --- | --- |
| Built-in | Procedural idle, walk, run and sit, plus emotes (wave, laugh, cry, kiss, dance, celebrate, angry, heart) |
| Gallery | Shared clip library mapped onto the same names |
| Imported / MetaPerson | If the model ships `idle`/`walk` clips, those play by name. Otherwise the built-in controller drives the model through **retargeting** (`lib/character/retarget.js`): an invisible canonical skeleton is animated, and every mapped bone of the model gets the same character-space change of orientation, after a one-time rest-pose alignment (e.g. T-pose arms → down). The model's own walk, sit and all 7 emotes come from this, verified on Avaturn exports. |

## Character Studio (`/character`)

- **First time:** "Let's create you." → *Design your look* (starting looks), *Pick or import a 3D character*, or *Start from a photo* (enabled only when MetaPerson is configured). Then Save → Our Place.
- **Later:** account menu → **My character**.
- **Layout:** the full-body stage dominates; tabs are Character, Face, Body, Hair, Clothes and Accessories; edits preview live.
- **Draft vs saved:** "Save changes?" (Save / Discard / Keep editing) appears on leave, plus a browser unload guard.
- **Camera:** drag or one finger to orbit, scroll or pinch to zoom, all within limits. Presets are Full body / Upper / Face and Front / ¾ / Side, plus Reset view.
- **Accessibility:** tabs with arrow-key navigation; radios and labelled sliders; swatches show a check mark, not colour alone.

## Security and privacy

- **`characters`:** owner select, insert and update; partner select (presentation columns only).
  - `provider_ref` and `provider_state` are never readable through the API.
  - Clients can write only `config` (and `user_id` on insert, constrained to themselves).
  - Provider, model path and gallery id are **server-written**.
  - Model paths must sit in the owner's own folder. There's no delete.
- **Storage `character-models`:** private; owner and partner can read via short-lived signed URLs; only the server writes.
- **Imports:**
  - The browser uploads to a one-time signed slot `<uid>/upload-<uuid>.glb`.
  - The server validates the file, copies it to a fresh name and **always deletes the pending upload**.
  - Paths outside your own pending slot are refused.
- **MetaPerson:**
  - The secret stays server-side; only short-lived tokens reach the browser.
  - postMessage is restricted to MetaPerson's own origins.
  - The export download is allowlisted to avatarsdk.com over HTTPS (SSRF-safe).
  - **Selfies never touch Our Place:** they're encoded in the browser and sent straight to MetaPerson.

## Building the gallery

1. Download the free *Standard* tiers into `assets-src/` (git-ignored):
   - `Universal Base Characters[Standard].zip` — [quaternius.itch.io/universal-base-characters](https://quaternius.itch.io/universal-base-characters)
   - `Universal Animation Library[Standard].zip` — [quaternius.itch.io/universal-animation-library](https://quaternius.itch.io/universal-animation-library)
2. Run `npm run gallery:build`. It writes compressed models to `public/models/{characters,animations}` and `lib/character/gallery.manifest.json`.
3. Review the clip mapping it prints, then commit the outputs (CC0: no attribution required; credits are kept in the manifest).

## Turning on MetaPerson later

Set `METAPERSON_CLIENT_ID` and `METAPERSON_CLIENT_SECRET` (Client Access app, server-only) and redeploy. "Start from a photo" activates, and nothing else changes.
