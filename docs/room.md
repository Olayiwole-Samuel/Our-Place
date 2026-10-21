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

## Phone notifications

Web Push with VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Each device turns them on
with a tap (account menu → Phone notifications). The server sends them only while the partner hasn't checked in for 3
minutes, at most one arrival every 20 minutes and one message alert every 20 seconds; the service worker skips them if Our
Place is open on screen. Android works in the browser; iPhone needs Our Place added to the Home Screen (iOS 16.4+).
