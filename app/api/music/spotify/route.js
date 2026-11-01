import { accessTokenFor, myPlaylists, playlistTracks, searchTracks, similarTracks } from "@/lib/music/spotify.server";
import { musicError, musicRoute } from "@/lib/music/route.server";

export const dynamic = "force-dynamic";

const PLAYLIST_ID = /^([A-Za-z0-9]{10,40}|liked)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Browse Spotify with the couple's connected account:
 *   GET ?search=<words>     up to 20 songs
 *   GET ?playlists=1        your playlists
 *   GET ?playlist=<id>      a playlist's songs ("liked" = your Liked Songs), up to 200
 *   GET ?radio=<song id>    up to 15 songs like one of your songs (its artists), for Song radio / Autoplay
 *                           (&exclude=<spotify ids, comma-separated> leaves out what's already queued)
 * Returns songs as { spotifyId, title, artist, imageUrl, durationS }.
 */
export const GET = musicRoute(async ({ request, supabase, coupleId, admin }) => {
  const params = new URL(request.url).searchParams;
  const token = await accessTokenFor(admin, coupleId);
  if (params.has("search")) {
    const query = params.get("search").trim().slice(0, 100);
    return { tracks: query ? await searchTracks(token, query) : [] };
  }
  if (params.has("playlists")) return { playlists: await myPlaylists(token) };
  if (params.has("radio")) {
    if (!UUID.test(params.get("radio"))) return musicError("invalid_request");
    // Read as the user (RLS): only one of your own songs.
    const { data: seed } = await supabase.from("couple_tracks").select("spotify_id, title, artist").eq("id", params.get("radio")).maybeSingle();
    if (!seed) return musicError("invalid_request");
    const exclude = String(params.get("exclude") ?? "")
      .split(",")
      .filter((id) => /^[A-Za-z0-9]{10,40}$/.test(id))
      .slice(0, 300);
    if (seed.spotify_id) exclude.push(seed.spotify_id);
    // A song from a YouTube link has no artist: borrow it from the best Spotify match of its title.
    const artist = seed.artist || (await searchTracks(token, seed.title.slice(0, 100)))[0]?.artist || "";
    return { tracks: await similarTracks(token, { title: seed.title, artist }, { exclude }) };
  }
  const playlist = params.get("playlist") ?? "";
  if (PLAYLIST_ID.test(playlist)) return { tracks: await playlistTracks(token, playlist) };
  return musicError("invalid_request");
});
