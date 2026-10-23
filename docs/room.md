# The living room's things

Everything here belongs to the two of you only: rows are read under RLS for your couple, written through
security-definer functions or the server, and every change is announced on your couple's private `lobby`
channel so both screens update. Migration: `supabase/migrations/20261013000000_room_features.sql`.
Browser state: `store/roomStore.js`. Panels: `components/lobby/room/`.

| Thing | Where in the room | What it does |
| --- | --- | --- |
| **Last here** | top-left, under your partner's name | "Last here 2 h ago" from `couple_visits` (each of you checks in on arrival, every 2 min while the room is open and visible, and when leaving). |
| **Streak 🔥** | next to your partner's name | Days in a row you were BOTH in Our Place (`couple_streak()`); greyed until you're both here today. |
| **Notes** | the felt board · Room button | Sticky notes for each other (`add_note`, author-only `delete_note`, `mark_notes_seen`). New ones show a badge. |
| **Memories** | the photo wall · Room button | Photos with captions and dates, resized on the phone (≤ 1600 px) and stored in the private `couple-memories` bucket. The newest five hang in the wall frames. |
| **Trophies** | the bookshelf · Room button | Milestones (time together, streaks, games, puzzles, memories, notes, messages) and game wins per game from `couple_trophies()`. |
| **TV** | the TV · Room button | Watch together in sync: YouTube links, your movies and your own videos. |
| **Phone notifications** | account menu, or the one-time prompt | When your partner arrives or messages you while you're away. |

## Watch together

- One shared state per couple (`couple_watch`): what's on, playing/paused, and the position, stamped by the database clock via `set_watch()`. Only our own controls change it, so play / pause / seek happen for both.
- Each screen computes the same moment (`lib/room/watch.js`: position + time since the change while playing, corrected for this device's clock) and re-syncs when it drifts by more than 1.5 s.
- YouTube: paste any link; the server fetches the title from YouTube's oEmbed. Videos that forbid embedding can't play.
- Uploads (movies and your own videos) go straight from the phone to a **private Backblaze B2 bucket**, in 16 MB pieces (S3 multipart), then the server checks every piece and completes the file; playback uses 6-hour signed links. Up to 5 GB per file. MP4 (H.264/AAC) plays everywhere; MKV only plays when its codecs are H.264/AAC.
- **Uploads always carry on where they stopped** (`lib/room/uploads.js`, `lib/room/videos.server.js`): Pause, closing the TV (it keeps going; a pill shows progress), a dropped connection (each piece retries; it resumes when you're back online) or closing the app keeps every piece sent. Pick the same file again — Resume on its row, or just Upload it again, on any device — and only the missing pieces go. The server finds the open upload from the video itself, so nothing depends on one browser's memory. Deleting an unfinished upload cancels it on B2 too.
- **Series**: episodes group into a folder per show, in order, from their file names ("Squid Game S01E03", "1x03", "Season 1 Episode 3", "Ep 3" — `lib/room/series.js`) or set by hand with the pencil (series, season, episode; needs `20261015000000_video_series.sql`). The player has Previous / Next episode.
- **The end**: when an episode ends, "Up next" counts down 8 s and plays the next one; a movie or clip starts again after 3 s. Cancel stays at the end (Watch again / Next episode). One screen makes the move — whoever changed the TV last; the other only if that didn't happen.
- **Slow connections**: if one screen is stuck loading for ~2 s it pauses the TV for both of you on the same frame and says so on the lobby topic (`tv-wait`); the other screen shows "Waiting for … their connection is slow" with *Keep watching without waiting*. Once 5 s are loaded (YouTube: after 7 s; at most 30 s) it carries on for both.
- Volume and full screen are per person.

### Setting up Backblaze (once)

1. backblaze.com → B2 Cloud Storage → create a **private** bucket; note its Endpoint (`s3.<region>.backblazeb2.com`).
2. Application Keys → add a key for that bucket with Read and Write.
3. Put `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`, `B2_ENDPOINT` in `.env` and in Vercel.
4. Run `node scripts/b2-cors.mjs` once so the website may upload to the bucket.

## Your dog

- A Maltese mix that lives in the room (`couple_pets`, one per couple), named together the first time you meet it. The model is **Shiba Inu by Quaternius (CC0, poly.pizza)**, recoloured cream-white with floppy ears and shorter legs (`components/3d/Pet/Dog.jsx`); its own clips (walk, gallop, idles, eating, flinches, a jump) play underneath, and sit / lie down / sleep are poses made by bending its bones (tune live in `/dev/dog`).
- **The same dog on both screens without streaming it**: where it is and what it's doing is a pure function of the server's clock (`lib/pet/behaviour.js`). Between requests it follows a seeded routine in 14-second moments — wander, sniff, look around, sit, lie down, nap in its bed or house, drink at its bowl, play by its toys, and sleep through the night (Lagos time) — walking around furniture on an A* path (`lib/pet/path.js`).
- **Requests** (`pet_do`: pet, treat, feed, fetch, sit, lie, come, sleep) carry where they happen (where the dog is, where you are, where the ball lands), so both screens play exactly the same timeline; a new request always takes over. Walk up to it and press *Play*, or Room → Dog: a bar along the bottom, so you can watch it.
- It remembers when it was last fed, petted and played with: hungry after 10 h, bored after 8 h, wants cuddles after 6 h.

## Decorating

- Room → **Decorate**: the room from above (drag to go round), a tray of things by kind (dog stuff, rugs, seats, tables, lights, plants, fun — `lib/room/decor.js`). Pick one, tap or drag on the floor to put it there (green = fine, pink = not here), Turn, Place. Tap anything you placed to move, turn or remove it. Things you place block walking (and the dog walks around them); only rugs can go under furniture.
- **Hearts**, earned together and computed by the database (`couple_hearts()`): 20 a day you were both here, 10 a finished game, 15 a memory photo, 5 a note, 1 per 10 messages, 50 a month together, 5 per day of your best streak. Some things are free; the rest unlock for good with hearts (`unlock_decor`). Prices live in `private.decor_rule()` and a test keeps them equal to the app's.
- Everything is saved (`couple_decor`, `couple_unlocks`) and appears on both screens at once (lobby topic, areas `decor` / `hearts` / `pet`). Needs `20261023000000_pet_and_decor.sql`.

## The house: hallway, game room, range

- The living room's door leads to a **hallway** (`lib/world/rooms/hallway.js`) with a door to the **game room**, the **range**, and two "coming soon" doors (bedroom, balcony). Rooms are data like the living room (`lib/world/rooms/*`, listed in `rooms/index.js`); `Room.jsx` draws each object `type` (new pieces: `components/3d/Rooms/RoomPieces.jsx`, `components/3d/Range/*`).
- **Moving**: walk up to a door and press Go — a short fade (`lib/world/travel.js`), and you're just inside the door you came through. Each of you can be in a different room: presence carries `room` with your pose (`lib/realtime/couplePresence.js`), your partner's character shows only when you share a room, and their status says where they are, with **Go** to join them. Your dog and the things you placed stay in the living room (the dog bar offers "Go to …" from elsewhere; Decorate takes you home first). Chat and voice work everywhere.
- **Game room**: the big screen opens the games menu, the arcade cabinets and the table open their kinds of games, a scoreboard shows your head-to-head record (`couple_trophies`), neon along the walls.
- **Range**: walk up to a lane and press Shoot — first-person at your lane, rules and Start, 3-2-1, then 45 seconds of targets popping up (plates, sliding movers, small gold ones worth double). Tap / click to shoot; bullseye 10 · middle 7 · edge 4, ×2 after 3 hits in a row, ×3 after 6 (`lib/range/targets.js`). Rounds are saved (`record_range_score`, migration `20261024000000_range_scores.sql`) and the board by the door shows both of your bests and the latest rounds; your partner sees your live score while you both shoot.
- **Picture frames** in the hallway show your memory photos: walk up and press Choose to pick which photo hangs in each frame; frames you haven't chosen show your newest photos (`lib/room/frames.js`, migration `20261024100000_wall_frames.sql`).

## Phone notifications

Web Push with VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Each device turns them on
with a tap (account menu → Phone notifications). The server sends them only while the partner hasn't checked in for 3
minutes, at most one arrival every 20 minutes and one message alert every 20 seconds; the service worker skips them if Our
Place is open on screen. Android works in the browser; iPhone needs Our Place added to the Home Screen (iOS 16.4+).
