"use client";

import { create } from "zustand";
import { logConnection } from "@/lib/diagnostics/connectionLog";
import { nextPosition, previousPosition, musicPosition, playNext, shuffleQueue, unshuffleQueue } from "@/lib/music/queue";
import { parseYouTube } from "@/lib/room/watch";
import { useRoomStore } from "./roomStore";

/**
 * Music for the two of you (supabase/migrations/20261031000000_music.sql):
 *
 *   available   the music tables exist (false before the migration → the panel says so)
 *   tracks      your songs: Map id → { id, spotifyId, youtubeId, title, artist, imageUrl, durationS, addedBy }
 *   order       song ids, newest first
 *   playlists   [{ id, name, trackIds }] (shared, either of you edits)
 *   music       the shared player: { queue, position, playing, atSeconds, updatedAt, updatedBy, version,
 *               shuffle, repeat, playlistId, ourSong } | null
 *   spotify     { connected, userId, displayName } — whoever connected their Spotify for picking songs
 *   dancing     you're dancing (local; your character dances while a song plays — your partner sees it)
 *   muted       this device only
 *   volume      music volume on this device, 0–100 (remembered; never shared)
 *   duration    the playing song's length in seconds (from the player, else Spotify's), 0 = unknown
 *
 * The room store opens and closes it (it shares the couple's lobby topic:
 * areas "music", "tracks", "playlists", "spotify" re-read from the database).
 */
export const MUSIC_AREAS = new Set(["music", "tracks", "playlists", "spotify"]);

const initial = { available: true, tracks: new Map(), order: [], playlists: [], music: null, spotify: null, dancing: false, muted: false, panelTab: "now", flash: null, duration: 0, volume: savedVolume() };
let ctx = null; // { supabase, userId }

const VOLUME_KEY = "our-place:music-volume";
function savedVolume() {
  try {
    const value = Number(globalThis.localStorage?.getItem(VOLUME_KEY));
    return Number.isFinite(value) && value >= 0 && value <= 100 && globalThis.localStorage.getItem(VOLUME_KEY) !== null ? value : 80;
  } catch {
    return 80;
  }
}

const codeOf = (error) => error?.message?.match(/room:([a-z_]+)/)?.[1] ?? "unknown";

const toTrack = (row) => ({
  id: row.id,
  spotifyId: row.spotify_id ?? null,
  youtubeId: row.youtube_id ?? null,
  title: row.title,
  artist: row.artist ?? "",
  imageUrl: row.image_url ?? null,
  durationS: row.duration_s ?? null,
  addedBy: row.added_by ?? null,
});

const toMusic = (row) =>
  row && {
    queue: row.queue ?? [],
    position: Number(row.position ?? 0),
    playing: Boolean(row.playing),
    atSeconds: Number(row.at_seconds ?? 0),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    version: Number(row.version ?? 0),
    shuffle: Boolean(row.shuffle),
    repeat: row.repeat ?? "all",
    playlistId: row.playlist_id ?? null,
    ourSong: row.our_song ?? null,
  };

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: data.error ?? { code: "unknown", message: "Something went wrong. Try again." } };
  return { data };
}

export const useMusicStore = create((set, get) => ({
  ...initial,

  open({ supabase, userId }) {
    ctx = { supabase, userId };
    Promise.all([...MUSIC_AREAS].map((area) => get().refresh(area)));
  },

  close() {
    ctx = null;
    set({ ...initial, muted: get().muted, volume: get().volume });
  },

  async refresh(area) {
    const here = ctx;
    if (!here) return;
    const { supabase } = here;
    try {
      if (area === "tracks") {
        const { data, error } = await supabase.from("couple_tracks").select("id, spotify_id, youtube_id, title, artist, image_url, duration_s, added_by, created_at").order("created_at", { ascending: false }).limit(5000);
        if (here !== ctx) return;
        if (error) return set({ available: false });
        set({ available: true, tracks: new Map(data.map((row) => [row.id, toTrack(row)])), order: data.map((row) => row.id) });
      } else if (area === "playlists") {
        const [{ data: lists, error }, { data: items }] = await Promise.all([
          supabase.from("couple_playlists").select("id, name, created_at").order("created_at"),
          supabase.from("couple_playlist_tracks").select("playlist_id, track_id, position").order("position"),
        ]);
        if (error || here !== ctx) return;
        set({ playlists: lists.map((p) => ({ id: p.id, name: p.name, trackIds: (items ?? []).filter((i) => i.playlist_id === p.id).map((i) => i.track_id) })) });
      } else if (area === "music") {
        const { data, error } = await supabase.from("couple_music").select("*").maybeSingle();
        if (!error && here === ctx) get().receive(data);
      } else if (area === "spotify") {
        const { data, error } = await supabase.rpc("spotify_status");
        const row = Array.isArray(data) ? data[0] : data;
        if (!error && here === ctx) set({ spotify: row?.connected ? { connected: true, userId: row.user_id, displayName: row.display_name } : { connected: false } });
      }
    } catch (error) {
      logConnection("music", `couldn't load ${area}: ${error?.message ?? error}`);
    }
  },

  /** A player state from the database — newer versions only. */
  receive(row) {
    const next = toMusic(row);
    const current = get().music;
    if (current && next && next.version < current.version) return;
    if (current && next && next.version === current.version && next.ourSong === current.ourSong) return;
    set({ music: next });
  },

  // ── The shared player ────────────────────────────────────────────────────
  /** Writes the player (merging into the current state). Returns an error code or null. */
  async setMusic(change) {
    if (!ctx) return "unavailable";
    const base = get().music ?? { queue: [], position: 0, playing: false, atSeconds: 0, shuffle: false, repeat: "all", playlistId: null };
    const next = { ...base, ...change };
    const sentAt = Date.now();
    const { data, error } = await ctx.supabase.rpc("set_music", {
      queue: next.queue,
      position: next.queue.length ? Math.min(next.position, next.queue.length - 1) : 0,
      playing: Boolean(next.playing),
      at_seconds: Math.max(0, next.atSeconds || 0),
      shuffle: Boolean(next.shuffle),
      repeat: next.repeat ?? "all",
      playlist_id: next.playlistId ?? null,
    });
    if (error) return codeOf(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      const skew = Date.parse(row.updated_at) - (sentAt + Date.now()) / 2;
      if (Number.isFinite(skew)) {
        const room = useRoomStore.getState();
        useRoomStore.setState({ skewMs: room.skewMs === null ? skew : Math.round(room.skewMs * 0.5 + skew * 0.5) });
      }
      get().receive(row);
    }
    return null;
  },

  now() {
    return musicPosition(get().music, { skewMs: useRoomStore.getState().skewMs ?? 0 });
  },

  /** Play a list of songs from one of them (a playlist, your library, one song). */
  playList(trackIds, startId = trackIds[0], playlistId = null) {
    const music = get().music;
    let queue = [...trackIds];
    let position = Math.max(0, queue.indexOf(startId));
    if (music?.shuffle) ({ queue, position } = shuffleQueue(queue, position));
    return get().setMusic({ queue, position, playing: true, atSeconds: 0, playlistId });
  },

  toggle() {
    const music = get().music;
    if (!music?.queue.length) return null;
    return get().setMusic({ playing: !music.playing, atSeconds: get().now() });
  },

  next({ manual = true } = {}) {
    const music = get().music;
    const position = nextPosition(music, { manual });
    if (position === null) return get().setMusic({ playing: false, atSeconds: 0 });
    return get().setMusic({ position, atSeconds: 0, playing: true });
  },

  previous() {
    const music = get().music;
    const position = previousPosition(music, get().now());
    if (position === null) return null;
    return get().setMusic({ position, atSeconds: 0, playing: true });
  },

  seek(seconds) {
    const duration = get().duration;
    const end = duration > 1 ? duration - 1 : Infinity;
    return get().setMusic({ atSeconds: Math.min(end, Math.max(0, seconds)) });
  },

  /** A few seconds back (negative) or forward, for both of you. */
  skipBy(seconds) {
    return get().seek(get().now() + seconds);
  },

  jump(position) {
    return get().setMusic({ position, atSeconds: 0, playing: true });
  },

  setShuffle(on) {
    const music = get().music;
    if (!music) return get().setMusic({ shuffle: on });
    const playlist = get().playlists.find((p) => p.id === music.playlistId);
    const order = on ? shuffleQueue(music.queue, music.position) : unshuffleQueue(music.queue, music.position, playlist?.trackIds ?? get().order.slice().reverse());
    return get().setMusic({ ...order, shuffle: on, atSeconds: get().now() });
  },

  setRepeat(repeat) {
    return get().setMusic({ repeat, atSeconds: get().now() });
  },

  /** Play this song next (or now, if nothing's on). */
  queueNext(trackId) {
    const music = get().music;
    if (!music?.queue.length) return get().playList([trackId]);
    return get().setMusic({ ...playNext(music.queue, music.position, trackId), atSeconds: get().now() });
  },

  /** Play this song now (it goes in right after the current one, so the queue carries on after it). */
  playNow(trackId) {
    const music = get().music;
    if (!music?.queue.length) return get().playList([trackId]);
    const { queue, position } = playNext(music.queue, music.position, trackId);
    return get().setMusic({ queue, position: Math.min(position + 1, queue.length - 1), atSeconds: 0, playing: true });
  },

  removeFromQueue(index) {
    const music = get().music;
    if (!music || index === music.position) return null;
    const queue = music.queue.filter((_, i) => i !== index);
    return get().setMusic({ queue, position: index < music.position ? music.position - 1 : music.position, atSeconds: get().now() });
  },

  async setOurSong(trackId) {
    if (!ctx) return "unavailable";
    const { error } = await ctx.supabase.rpc("set_our_song", { track_id: trackId });
    if (error) return codeOf(error);
    set({ music: get().music ? { ...get().music, ourSong: trackId } : get().music });
    return null;
  },

  // ── Your songs ───────────────────────────────────────────────────────────
  /** Adds a Spotify song to your library (or finds the one you have). → { track } | { error } */
  async addSpotify(song) {
    if (!ctx) return { error: "unavailable" };
    const { data, error } = await ctx.supabase.rpc("add_track", { spotify_id: song.spotifyId, youtube_id: null, title: song.title || "Untitled", artist: song.artist ?? "", image_url: song.imageUrl ?? null, duration_s: song.durationS ?? null });
    if (error) return { error: codeOf(error) };
    const track = toTrack(Array.isArray(data) ? data[0] : data);
    set({ tracks: new Map(get().tracks).set(track.id, track), order: get().order.includes(track.id) ? get().order : [track.id, ...get().order] });
    return { track };
  },

  /** Adds a song from a YouTube link. → { track } | { error } */
  async addYouTube(link) {
    if (!ctx) return { error: "unavailable" };
    const id = parseYouTube(link);
    if (!id) return { error: "not_youtube" };
    const { data: info } = await api(`/api/room/youtube?id=${id}`);
    if (info && info.embeddable === false) return { error: "not_embeddable" };
    const { data, error } = await ctx.supabase.rpc("add_track", { spotify_id: null, youtube_id: id, title: info?.title || "YouTube song", artist: "", image_url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, duration_s: null });
    if (error) return { error: codeOf(error) };
    const track = toTrack(Array.isArray(data) ? data[0] : data);
    set({ tracks: new Map(get().tracks).set(track.id, track), order: get().order.includes(track.id) ? get().order : [track.id, ...get().order] });
    return { track };
  },

  async removeTrack(trackId) {
    if (!ctx) return "unavailable";
    const { error } = await ctx.supabase.rpc("remove_track", { track_id: trackId });
    return error ? codeOf(error) : null;
  },

  /** The YouTube video for a song — looked up (and saved) the first time it plays. → { youtubeId } | { error } */
  async ensureMatched(trackId) {
    const track = get().tracks.get(trackId);
    if (track?.youtubeId) return { youtubeId: track.youtubeId };
    const { data, error } = await api("/api/music/match", { method: "POST", body: { trackId } });
    if (error) return { error };
    const latest = get().tracks.get(trackId);
    if (latest) set({ tracks: new Map(get().tracks).set(trackId, { ...latest, youtubeId: data.youtubeId }) });
    return { youtubeId: data.youtubeId };
  },

  /** The song's video refused to play: find another (skipping the ones that failed). → { youtubeId } | { error } */
  async rematch(trackId, failed) {
    const { data, error } = await api("/api/music/match", { method: "POST", body: { trackId, failed } });
    if (error) return { error };
    const latest = get().tracks.get(trackId);
    if (latest) set({ tracks: new Map(get().tracks).set(trackId, { ...latest, youtubeId: data.youtubeId }) });
    return { youtubeId: data.youtubeId };
  },

  // ── Playlists ────────────────────────────────────────────────────────────
  async savePlaylist(playlistId, name) {
    if (!ctx) return { error: "unavailable" };
    const { data, error } = await ctx.supabase.rpc("save_playlist", { playlist_id: playlistId, name });
    if (error) return { error: codeOf(error) };
    await get().refresh("playlists");
    return { id: data };
  },

  async editPlaylist(playlistId, { add = null, remove = null }) {
    if (!ctx) return "unavailable";
    const { error } = await ctx.supabase.rpc("playlist_tracks", { playlist_id: playlistId, add, remove });
    if (error) return codeOf(error);
    await get().refresh("playlists");
    return null;
  },

  // ── Spotify (picking songs) ──────────────────────────────────────────────
  connectSpotify() {
    window.location.assign("/api/music/spotify/login");
  },
  async disconnectSpotify() {
    await api("/api/music/spotify/callback", { method: "DELETE", body: {} });
    await get().refresh("spotify");
  },
  searchSpotify: (query) => api(`/api/music/spotify?search=${encodeURIComponent(query)}`),
  spotifyPlaylists: () => api("/api/music/spotify?playlists=1"),
  spotifyPlaylist: (id) => api(`/api/music/spotify?playlist=${encodeURIComponent(id)}`),
  async importPlaylist(spotifyPlaylistId, name) {
    const result = await api("/api/music/import", { method: "POST", body: { spotifyPlaylistId, name } });
    if (!result.error) await Promise.all([get().refresh("tracks"), get().refresh("playlists")]);
    return result;
  },

  // ── This device ──────────────────────────────────────────────────────────
  setDancing: (dancing) => set({ dancing }),
  setMuted: (muted) => set({ muted }),
  /** Music volume on this phone only (0–100). */
  setVolume(volume) {
    const value = Math.round(Math.min(100, Math.max(0, Number(volume) || 0)));
    set({ volume: value, muted: value === 0 ? get().muted : false });
    try {
      globalThis.localStorage?.setItem(VOLUME_KEY, String(value));
    } catch {
      // private mode: just for this visit
    }
  },
  setPanelTab: (panelTab) => set({ panelTab }),
  setFlash: (flash) => set({ flash }),
}));

/** The song that's on (or null). */
export const currentTrack = (state) => {
  const music = state.music;
  if (!music?.queue.length) return null;
  return state.tracks.get(music.queue[music.position]) ?? null;
};
