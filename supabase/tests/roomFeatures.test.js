import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// The living room's features against the real migrations: visits / streak /
// last seen, notes, memories, videos, the shared TV, trophies — RLS, the only
// write paths, validation and realtime announcements.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `room${++n}@example.test`, name: `Room ${n}` });
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
const visit = (userId, day) => db.query("insert into public.couple_visits (couple_id, user_id, day) select couple_id, user_id, $2 from public.couple_members where user_id = $1 on conflict do nothing", [userId, day]);
const days = (from, count) => Array.from({ length: count }, (_, i) => new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10));

let couple;
let other;

beforeAll(async () => {
  db = await createTestDatabase();
  couple = await pair();
  other = await pair();
}, 60_000);
afterAll(() => db?.close());

describe("visits, last seen and the together streak", () => {
  it("note_presence records today once per partner and refreshes last_at", async () => {
    await call(couple.a, "select public.note_presence('Africa/Lagos')");
    await call(couple.a, "select public.note_presence('Not/AZone')"); // unknown zone falls back, no error
    const rows = await call(couple.b, "select user_id, day from public.couple_visits");
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(couple.a);
    expect(await call(other.a, "select * from public.couple_visits")).toEqual([]); // another couple sees nothing
    expect(await fails(call(couple.a, "insert into public.couple_visits (couple_id, user_id, day) values ($1, $2, current_date)", [couple.coupleId, couple.a]))).toMatch(/permission denied/);
  });

  it("the streak counts only days BOTH were here, in a row, up to the latest day", async () => {
    const c = await pair();
    for (const day of days("2026-09-01", 5)) await visit(c.a, day); // a: 1–5 Sep
    for (const day of ["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-05"]) await visit(c.b, day); // b skipped the 3rd
    let [streak] = await call(c.a, "select * from public.couple_streak()");
    expect(streak).toMatchObject({ current_days: 2, best_days: 2, today_both: true });
    // Today only one of them has been in so far: yesterday's run still counts.
    await visit(c.a, "2026-09-06");
    [streak] = await call(c.b, "select * from public.couple_streak()");
    expect(streak).toMatchObject({ current_days: 2, today_both: false });
    // A full missed day breaks it.
    await visit(c.a, "2026-09-08");
    [streak] = await call(c.b, "select * from public.couple_streak()");
    expect(streak).toMatchObject({ current_days: 0, best_days: 2 });
  });
});

describe("notes", () => {
  it("partners add notes; only the author deletes; the partner marks them seen; the room hears about it", async () => {
    const [note] = await call(couple.a, "select * from public.add_note($1, 'pink')", ["  Miss you already ❤️  "]);
    expect(note).toMatchObject({ body: "Miss you already ❤️", color: "pink", author_id: couple.a, seen_at: null });
    expect(await fails(call(couple.a, "select public.add_note('   ')"))).toMatch(/room:empty/);
    expect(await fails(call(couple.a, "select public.add_note('hi', 'purple')"))).toMatch(/room:invalid/);
    await call(couple.b, "select public.delete_note($1)", [note.id]); // not the author: no effect
    expect(await call(couple.b, "select id from public.couple_notes")).toHaveLength(1);
    await call(couple.b, "select public.mark_notes_seen()");
    expect((await call(couple.a, "select seen_at from public.couple_notes"))[0].seen_at).not.toBeNull();
    expect(await call(other.a, "select * from public.couple_notes")).toEqual([]);
    await call(couple.a, "select public.delete_note($1)", [note.id]);
    expect(await call(couple.a, "select id from public.couple_notes")).toEqual([]);
    const events = (await db.query("select payload from realtime.messages where topic = $1 and event = 'room'", [`our-place:couple:${couple.coupleId}:lobby`])).rows;
    expect(events.map((e) => e.payload.area)).toEqual(expect.arrayContaining(["notes"]));
  });
});

describe("the shared TV", () => {
  it("accepts a YouTube id or the couple's own ready video, and stamps every change", async () => {
    const [first] = await call(couple.a, "select * from public.set_watch($1::jsonb, true, 0)", [JSON.stringify({ type: "youtube", id: "dQw4w9WgXcQ", title: "Song" })]);
    expect({ ...first, version: Number(first.version) }).toMatchObject({ playing: true, version: 1, updated_by: couple.a });
    const [paused] = await call(couple.b, "select * from public.set_watch($1::jsonb, false, 42.5)", [JSON.stringify(first.source)]);
    expect({ ...paused, version: Number(paused.version) }).toMatchObject({ playing: false, at_seconds: 42.5, version: 2, updated_by: couple.b });
    expect(await fails(call(couple.a, "select public.set_watch($1::jsonb, true, 0)", [JSON.stringify({ type: "youtube", id: "<script>" })]))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "select public.set_watch($1::jsonb, true, 0)", [JSON.stringify({ type: "video", id: "00000000-0000-4000-8000-000000000000" })]))).toMatch(/room:invalid/);
    // Another couple's video can't be played here.
    const [video] = (await db.query("insert into public.couple_videos (couple_id, uploader_id, kind, title, object_key, size_bytes, content_type, status) values ($1, $2, 'movie', 'Ours', $3, 10, 'video/mp4', 'ready') returning id", [other.coupleId, other.a, `${other.coupleId}/x.mp4`])).rows;
    expect(await fails(call(couple.a, "select public.set_watch($1::jsonb, true, 0)", [JSON.stringify({ type: "video", id: video.id })]))).toMatch(/room:invalid/);
    expect(await call(other.b, "select id, title from public.couple_videos")).toEqual([{ id: video.id, title: "Ours" }]);
    expect(await call(couple.a, "select id from public.couple_videos")).toEqual([]);
    // Stop: nothing playing.
    const [stopped] = await call(couple.a, "select * from public.set_watch(null, true, 0)");
    expect(stopped).toMatchObject({ source: null, playing: false });
  });

  it("clients can't read a video's storage key", async () => {
    expect(await fails(call(other.a, "select object_key from public.couple_videos"))).toMatch(/permission denied/);
  });
});

describe("memories, push and trophies", () => {
  it("memories are readable by the couple only and written by the server only", async () => {
    await db.query("insert into public.couple_memories (couple_id, uploader_id, path, caption) values ($1, $2, $3, 'Lekki')", [couple.coupleId, couple.a, `${couple.coupleId}/m1.webp`]);
    expect(await call(couple.b, "select caption from public.couple_memories")).toEqual([{ caption: "Lekki" }]);
    expect(await call(other.a, "select caption from public.couple_memories")).toEqual([]);
    expect(await fails(call(couple.a, "insert into public.couple_memories (couple_id, uploader_id, path) values ($1, $2, $3)", [couple.coupleId, couple.a, `${couple.coupleId}/m2.webp`]))).toMatch(/permission denied/);
  });

  it("push subscriptions are invisible to clients", async () => {
    expect(await fails(call(couple.a, "select * from public.push_subscriptions"))).toMatch(/permission denied/);
  });

  it("trophies count the couple's own history", async () => {
    const [{ couple_trophies: trophies }] = await call(couple.a, "select public.couple_trophies()");
    expect({ ...trophies, memories: Number(trophies.memories), games_played: Number(trophies.games_played) }).toMatchObject({ memories: 1, games_played: 0, wins: [] });
    expect(trophies.paired_at).toBeTruthy();
  });

  it("either partner sets the day you got together — for their couple only, never in the future", async () => {
    await call(couple.b, "select public.set_together_since('2026-03-06')");
    const [{ couple_trophies: mine }] = await call(couple.a, "select public.couple_trophies()");
    expect(mine.together_since).toBe("2026-03-06");
    const [{ couple_trophies: theirs }] = await call(other.a, "select public.couple_trophies()");
    expect(theirs.together_since).not.toBe("2026-03-06");
    expect(await fails(call(couple.a, "select public.set_together_since(current_date + 30)"))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "update public.couples set together_since = '2020-01-01'"))).toMatch(/permission denied/);
  });
});
