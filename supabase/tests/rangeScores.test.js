import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// The range's scores, against the real migrations.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `range${++n}@example.test`, name: `Range ${n}` });
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

let couple;
let other;
beforeAll(async () => {
  db = await createTestDatabase();
  couple = await pair();
  other = await pair();
}, 60_000);
afterAll(() => db?.close());

describe("range scores", () => {
  it("saves a round for the couple to see — and nobody else", async () => {
    const [round] = await call(couple.a, "select * from public.record_range_score(240, 20, 26, 9)");
    expect(round).toMatchObject({ user_id: couple.a, score: 240, hits: 20, shots: 26, best_streak: 9 });
    expect(await call(couple.b, "select score from public.couple_range_scores")).toEqual([{ score: 240 }]);
    expect(await call(other.a, "select score from public.couple_range_scores")).toEqual([]);
  });

  it("refuses impossible scores, a flood of rounds, and writing directly", async () => {
    expect(await fails(call(couple.b, "select public.record_range_score(1000, 5, 5, 5)"))).toMatch(/room:invalid/); // > 60 a hit
    expect(await fails(call(couple.b, "select public.record_range_score(50, 6, 5, 0)"))).toMatch(/room:invalid/); // more hits than shots
    expect(await fails(call(couple.a, "select public.record_range_score(10, 1, 1, 1)"))).toMatch(/room:rate_limited/); // just played
    expect(await fails(call(couple.a, "insert into public.couple_range_scores (couple_id, user_id, score, hits, shots) values ($1, $2, 9999, 200, 200)", [couple.coupleId, couple.a]))).toMatch(/permission denied/);
  });
});

describe("picture frames", () => {
  it("hangs your own photos in frames, for the couple only", async () => {
    const [mine] = (await db.query("insert into public.couple_memories (couple_id, uploader_id, path) values ($1, $2, $3) returning id", [couple.coupleId, couple.a, `${couple.coupleId}/f1.webp`])).rows;
    const [theirs] = (await db.query("insert into public.couple_memories (couple_id, uploader_id, path) values ($1, $2, $3) returning id", [other.coupleId, other.a, `${other.coupleId}/f2.webp`])).rows;
    await call(couple.b, "select public.set_frame('hall_art_left_0', $1)", [mine.id]);
    expect(await call(couple.a, "select frame_id, memory_id from public.couple_frames")).toEqual([{ frame_id: "hall_art_left_0", memory_id: mine.id }]);
    expect(await call(other.a, "select * from public.couple_frames")).toEqual([]);
    expect(await fails(call(couple.a, "select public.set_frame('hall_art_left_1', $1)", [theirs.id]))).toMatch(/room:invalid/); // not your photo
    expect(await fails(call(couple.a, "select public.set_frame('Bad Frame!', $1)", [mine.id]))).toMatch(/room:invalid/);
    await call(couple.a, "select public.set_frame('hall_art_left_0', null)");
    expect(await call(couple.a, "select * from public.couple_frames")).toEqual([]);
  });
});
