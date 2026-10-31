import { accessTokenFor, myPlaylists, playlistTracks, searchTracks } from "@/lib/music/spotify.server";
import { musicError, musicRoute } from "@/lib/music/route.server";

export const dynamic = "force-dynamic";

const PLAYLIST_ID = /^([A-Za-z0-9]{10,40}|liked)$/;

/**
 * Browse Spotify with the couple's connected account:
 *   GET ?search=<words>     up to 20 songs
 *   GET ?playlists=1        your playlists
 *   GET ?playlist=<id>      a playlist's songs ("liked" = your Liked Songs), up to 200
 * Returns songs as { spotifyId, title, artist, imageUrl, durationS }.
 */
export const GET = musicRoute(async ({ request, coupleId, admin }) => {
  const params = new URL(request.url).searchParams;
  const token = await accessTokenFor(admin, coupleId);
  if (params.has("search")) {
    const query = params.get("search").trim().slice(0, 100);
    return { tracks: query ? await searchTracks(token, query) : [] };
  }
  if (params.has("playlists")) return { playlists: await myPlaylists(token) };
  const playlist = params.get("playlist") ?? "";
  if (PLAYLIST_ID.test(playlist)) return { tracks: await playlistTracks(token, playlist) };
  return musicError("invalid_request");
});
