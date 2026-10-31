import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Music against the real migrations: songs, playlists, the shared player, our
// song, and the Spotify tokens that only the server may read.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `music${++n}@example.test`, name: `Music ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};
const call = (userId, sql, params = []) => as(db, userId, async (tx) => (await tx.query(sql, params)).rows);
const fails = (promise) =>
  promise.then(
    () => null,
    (error) => error.message,
  );
const addSpotify = async (userId, spotifyId, title = "Essence") => (await call(userId, "select * from public.add_track($1, null, $2, 'Wizkid', null, 248)", [spotifyId, title]))[0];

let couple;
let other;
beforeAll(async () => {
  db = await createTestDatabase();
  couple = await pair();
  other = await pair();
}, 60_000);
afterAll(() => db?.close());

describe("songs", () => {
  it("adds a song once per couple, for the couple only", async () => {
    const first = await addSpotify(couple.a, "4wJ5Qq0jBN4ajy7ouZIV1c");
    const again = await addSpotify(couple.b, "4wJ5Qq0jBN4ajy7ouZIV1c");
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({ title: "Essence", artist: "Wizkid", duration_s: 248, youtube_id: null, added_by: couple.a });
    const [link] = await call(couple.b, "select * from public.add_track(null, 'dQw4w9WgXcQ', 'A YouTube song')");
    expect(link.youtube_id).toBe("dQw4w9WgXcQ");
    expect(await call(other.a, "select * from public.couple_tracks")).toEqual([]);
    expect(await fails(call(couple.a, "select public.add_track(null, null, 'Nothing')"))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "select public.add_track(null, 'bad id', 'x')"))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "insert into public.couple_tracks (couple_id, youtube_id, title) values ($1, 'dQw4w9WgXcQ', 'x')", [couple.coupleId]))).toMatch(/permission denied/);
  });
});

describe("playlists and the shared player", () => {
  it("makes playlists together and plays a queue for both", async () => {
    const one = await addSpotify(couple.a, "1aaaaaaaaaaaaaaaaaaaaa", "One");
    const two = await addSpotify(couple.a, "2bbbbbbbbbbbbbbbbbbbbb", "Two");
    const [{ save_playlist: playlistId }] = await call(couple.a, "select public.save_playlist(null, '  Late   night ')");
    await call(couple.b, "select public.playlist_tracks($1, $2::uuid[], null)", [playlistId, [one.id, two.id, one.id]]);
    const items = await call(couple.a, "select track_id from public.couple_playlist_tracks where playlist_id = $1 order by position", [playlistId]);
    expect(items.map((i) => i.track_id)).toEqual([one.id, two.id]);
    expect((await call(couple.b, "select name from public.couple_playlists"))[0].name).toBe("Late night");

    const [state] = await call(couple.b, "select * from public.set_music($1::uuid[], 1, true, 12.5, false, 'one', $2)", [[one.id, two.id], playlistId]);
    expect(state).toMatchObject({ position: 1, playing: true, at_seconds: 12.5, repeat: "one", playlist_id: playlistId, updated_by: couple.b, version: 1 });
    const [seen] = await call(couple.a, "select position, playing from public.couple_music");
    expect(seen).toEqual({ position: 1, playing: true });

    const [theirs] = (await call(other.a, "select * from public.add_track(null, 'abcdefghijk', 'Not yours')"));
    expect(await fails(call(couple.a, "select public.set_music($1::uuid[], 0, true, 0)", [[theirs.id]]))).toMatch(/room:invalid/); // someone else's song
    expect(await fails(call(couple.a, "select public.set_music($1::uuid[], 5, true, 0)", [[one.id]]))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "select public.playlist_tracks($1, $2::uuid[], null)", [playlistId, [theirs.id]]))).toMatch(/room:invalid/);

    await call(couple.a, "select public.set_our_song($1)", [two.id]);
    expect((await call(couple.b, "select our_song from public.couple_music"))[0].our_song).toBe(two.id);

    await call(couple.a, "select public.remove_track($1)", [one.id]);
    expect((await call(couple.b, "select queue from public.couple_music"))[0].queue).toEqual([two.id]);
    await call(couple.b, "select public.save_playlist($1, null)", [playlistId]);
    expect(await call(couple.a, "select * from public.couple_playlists")).toEqual([]);
  });
});

describe("Spotify tokens", () => {
  it("are for the server only; the couple sees just whether it's connected", async () => {
    await db.query("insert into public.couple_spotify (couple_id, user_id, display_name, refresh_token) values ($1, $2, 'King', 'secret-refresh')", [couple.coupleId, couple.a]);
    expect(await fails(call(couple.a, "select refresh_token from public.couple_spotify"))).toMatch(/permission denied/);
    expect(await call(couple.b, "select * from public.spotify_status()")).toEqual([{ connected: true, user_id: couple.a, display_name: "King" }]);
    expect(await call(other.a, "select * from public.spotify_status()")).toEqual([]);
  });
});
