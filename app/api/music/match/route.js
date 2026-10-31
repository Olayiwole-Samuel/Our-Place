import { readJson } from "@/lib/api/route";
import { findOnYouTube } from "@/lib/music/youtube.server";
import { musicError, musicRoute } from "@/lib/music/route.server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST { trackId } → { youtubeId } — finds a Spotify song on YouTube the first
 * time it's about to play, and saves the answer on the song (so it's only ever
 * looked up once). Songs added from a YouTube link already have it.
 */
export const POST = musicRoute(
  async ({ request, coupleId, admin }) => {
    const body = await readJson(request);
    if (!UUID.test(String(body?.trackId ?? ""))) return musicError("invalid_request");
    const { data: track } = await admin.from("couple_tracks").select("id, couple_id, youtube_id, title, artist, duration_s").eq("id", body.trackId).maybeSingle();
    if (!track || track.couple_id !== coupleId) return musicError("invalid_request");
    if (track.youtube_id) return { youtubeId: track.youtube_id };
    const found = await findOnYouTube({ title: track.title, artist: track.artist, durationS: track.duration_s });
    await admin.from("couple_tracks").update({ youtube_id: found.youtubeId }).eq("id", track.id).is("youtube_id", null);
    return { youtubeId: found.youtubeId };
  },
  { mutation: true },
);
