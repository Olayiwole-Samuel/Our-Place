import { readJson } from "@/lib/api/route";
import { findOnYouTube } from "@/lib/music/youtube.server";
import { musicError, musicRoute } from "@/lib/music/route.server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VIDEO = /^[A-Za-z0-9_-]{11}$/;

/**
 * POST { trackId, failed? } → { youtubeId } — finds a Spotify song on YouTube
 * the first time it's about to play, and saves the answer on the song (so it's
 * only ever looked up once). Songs added from a YouTube link already have it.
 *
 * `failed`: videos that refused to play for this song (up to 5). If the saved
 * one is among them, look again without them and save the new answer; if the
 * other screen already did that, the saved (new) one is returned as is.
 *
 * `youtubeId`: "play this one" — you chose the exact video for this song.
 */
export const POST = musicRoute(
  async ({ request, coupleId, admin }) => {
    const body = await readJson(request);
    if (!UUID.test(String(body?.trackId ?? ""))) return musicError("invalid_request");
    const failed = Array.isArray(body.failed) ? body.failed.filter((id) => VIDEO.test(String(id))).slice(0, 5) : [];
    const { data: track } = await admin.from("couple_tracks").select("id, couple_id, spotify_id, youtube_id, title, artist, duration_s").eq("id", body.trackId).maybeSingle();
    if (!track || track.couple_id !== coupleId) return musicError("invalid_request");
    if (body.youtubeId !== undefined) {
      if (!VIDEO.test(String(body.youtubeId))) return musicError("invalid_request");
      await admin.from("couple_tracks").update({ youtube_id: body.youtubeId }).eq("id", track.id);
      return { youtubeId: body.youtubeId };
    }
    if (track.youtube_id && !failed.includes(track.youtube_id)) return { youtubeId: track.youtube_id };
    if (!track.spotify_id) return musicError("not_found"); // a YouTube link: there's nothing else to try
    const found = await findOnYouTube({ title: track.title, artist: track.artist, durationS: track.duration_s }, { exclude: failed });
    const update = admin.from("couple_tracks").update({ youtube_id: found.youtubeId }).eq("id", track.id);
    await (track.youtube_id ? update.eq("youtube_id", track.youtube_id) : update.is("youtube_id", null));
    return { youtubeId: found.youtubeId };
  },
  { mutation: true },
);
