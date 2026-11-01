import "server-only";

/**
 * Spotify, for PICKING songs: one of you signs in (Authorization Code flow),
 * and the server keeps that account's tokens (public.couple_spotify, server
 * only) to search, read your playlists and your liked songs. Nothing is ever
 * played through Spotify — playback is YouTube, for both of you
 * (lib/music/youtube.server.js) — so only the person who connects needs an
 * account, and Premium isn't needed for this part.
 *
 * Environment (SERVER ONLY):
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET   from developer.spotify.com → your app
 * The app's Redirect URIs must include <site>/api/music/spotify/callback
 * (e.g. https://our-place-tau.vercel.app/api/music/spotify/callback, and
 * http://127.0.0.1:3000/api/music/spotify/callback for local development).
 *
 * Spotify's Development Mode (2026 rules): the app owner needs Premium, up to
 * five Spotify accounts may sign in (added under the app's User Management),
 * search returns at most 10 results a page, and only playlists you own or
 * collaborate on can be read (GET /playlists/{id}/items). Refresh tokens last
 * 180 days — after that, Connect Spotify again.
 */
const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
export const SPOTIFY_SCOPES = ["playlist-read-private", "playlist-read-collaborative", "user-library-read"];

export class SpotifyError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "SpotifyError";
    this.code = code; // not_configured | not_connected | spotify_unavailable | spotify_denied
  }
}

export function spotifyConfig(env = process.env) {
  const clientId = String(env.SPOTIFY_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.SPOTIFY_CLIENT_SECRET ?? "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const redirectUri = (origin) => `${origin}/api/music/spotify/callback`;

export function authorizeUrl({ origin, state, config = spotifyConfig() }) {
  if (!config) throw new SpotifyError("not_configured");
  const params = new URLSearchParams({ client_id: config.clientId, response_type: "code", redirect_uri: redirectUri(origin), scope: SPOTIFY_SCOPES.join(" "), state, show_dialog: "true" });
  return `${ACCOUNTS}/authorize?${params}`;
}

async function tokenRequest(body, config) {
  const response = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}` },
    body: new URLSearchParams(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new SpotifyError(data.error === "invalid_grant" ? "not_connected" : "spotify_unavailable", data.error_description ?? data.error ?? `token ${response.status}`);
  return data;
}

/** The code from the callback → { accessToken, refreshToken, expiresAt }. */
export async function exchangeCode({ code, origin, config = spotifyConfig() }) {
  if (!config) throw new SpotifyError("not_configured");
  const data = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) }, config);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString() };
}

async function get(path, accessToken) {
  const response = await fetch(path.startsWith("http") ? path : `${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (response.status === 401) throw new SpotifyError("not_connected", "token rejected");
  if (response.status === 403) throw new SpotifyError("spotify_denied", "Spotify refused (is this account added to the app's users?)");
  if (!response.ok) throw new SpotifyError("spotify_unavailable", `spotify ${response.status}`);
  return response.json();
}

export async function profile(accessToken) {
  const me = await get("/me", accessToken);
  return { id: me.id, displayName: String(me.display_name || me.id || "Spotify").slice(0, 80) };
}

/**
 * A working access token for this couple's Spotify — refreshed (and saved)
 * when it's about to expire. `admin` is the service-role Supabase client.
 */
export async function accessTokenFor(admin, coupleId, config = spotifyConfig()) {
  if (!config) throw new SpotifyError("not_configured");
  const { data, error } = await admin.from("couple_spotify").select("refresh_token, access_token, expires_at").eq("couple_id", coupleId).maybeSingle();
  if (error) throw new SpotifyError("spotify_unavailable", error.message);
  if (!data) throw new SpotifyError("not_connected");
  if (data.access_token && data.expires_at && Date.parse(data.expires_at) > Date.now() + 30_000) return data.access_token;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token }, config);
  await admin
    .from("couple_spotify")
    .update({ access_token: fresh.access_token, expires_at: new Date(Date.now() + (fresh.expires_in - 60) * 1000).toISOString(), ...(fresh.refresh_token ? { refresh_token: fresh.refresh_token } : {}) })
    .eq("couple_id", coupleId);
  return fresh.access_token;
}

/** A Spotify track → the shape Our Place stores (public.couple_tracks / add_track). */
export function toTrack(item) {
  if (!item || item.type !== "track" || !item.id || item.is_local) return null;
  const images = item.album?.images ?? [];
  const image = images.find((i) => i.width && i.width <= 320) ?? images.at(-1) ?? images[0];
  return {
    spotifyId: item.id,
    title: String(item.name ?? "").slice(0, 200),
    artist: (item.artists ?? []).map((a) => a.name).filter(Boolean).join(", ").slice(0, 200),
    imageUrl: image?.url?.startsWith("https://") ? image.url : null,
    durationS: item.duration_ms ? Math.max(1, Math.round(item.duration_ms / 1000)) : null,
  };
}

/** Up to 20 songs: two pages of 10 (Development Mode's maximum per request). */
export async function searchTracks(accessToken, query) {
  const page = (offset) => get(`/search?${new URLSearchParams({ q: query, type: "track", limit: "10", offset: String(offset) })}`, accessToken);
  const [first, second] = await Promise.all([page(0), page(10).catch(() => null)]);
  const seen = new Set();
  return [...(first.tracks?.items ?? []), ...(second?.tracks?.items ?? [])]
    .map(toTrack)
    .filter((track) => track && !seen.has(track.spotifyId) && seen.add(track.spotifyId));
}

/** Your playlists that Spotify lets us read: ones you made or collaborate on. */
export async function myPlaylists(accessToken) {
  const [me, data] = await Promise.all([get("/me", accessToken), get("/me/playlists?limit=50", accessToken)]);
  return (data.items ?? [])
    .filter((p) => p && (p.owner?.id === me.id || p.collaborative))
    .map((p) => ({ id: p.id, name: String(p.name ?? "").slice(0, 100), count: p.items?.total ?? p.tracks?.total ?? 0, imageUrl: p.images?.[0]?.url ?? null }));
}

/** Up to `max` songs of a playlist (or your Liked Songs with id "liked"), following Spotify's pages. */
export async function playlistTracks(accessToken, playlistId, max = 200) {
  let url = playlistId === "liked" ? `${API}/me/tracks?limit=50` : `${API}/playlists/${encodeURIComponent(playlistId)}/items?limit=50`;
  const tracks = [];
  while (url && tracks.length < max) {
    const page = await get(url, accessToken);
    for (const entry of page.items ?? []) {
      const track = toTrack(entry.track ?? entry.item);
      if (track) tracks.push(track);
    }
    url = page.next;
  }
  return tracks.slice(0, max);
}
