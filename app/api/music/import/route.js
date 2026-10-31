import { readJson } from "@/lib/api/route";
import { accessTokenFor, playlistTracks } from "@/lib/music/spotify.server";
import { musicError, musicRoute } from "@/lib/music/route.server";

export const dynamic = "force-dynamic";

const PLAYLIST_ID = /^([A-Za-z0-9]{10,40}|liked)$/;

/**
 * POST { spotifyPlaylistId, name } → { playlistId, added } — copies a Spotify
 * playlist (or your Liked Songs) into a shared Our Place playlist. Songs are
 * added as the signed-in user (RLS + the add_track / playlist functions);
 * nothing is looked up on YouTube until a song actually plays.
 */
export const POST = musicRoute(
  async ({ request, supabase, coupleId, admin }) => {
    const body = await readJson(request);
    const name = String(body?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!PLAYLIST_ID.test(String(body?.spotifyPlaylistId ?? "")) || !name) return musicError("invalid_request");
    const token = await accessTokenFor(admin, coupleId);
    const songs = await playlistTracks(token, body.spotifyPlaylistId, 200);
    const ids = [];
    for (const song of songs) {
      const { data, error } = await supabase.rpc("add_track", { spotify_id: song.spotifyId, youtube_id: null, title: song.title || "Untitled", artist: song.artist, image_url: song.imageUrl, duration_s: song.durationS });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row?.id) ids.push(row.id);
    }
    const { data: playlistId, error } = await supabase.rpc("save_playlist", { playlist_id: null, name });
    if (error) return musicError("unknown");
    if (ids.length) await supabase.rpc("playlist_tracks", { playlist_id: playlistId, add: [...new Set(ids)], remove: null });
    return { playlistId, added: ids.length };
  },
  { mutation: true },
);
