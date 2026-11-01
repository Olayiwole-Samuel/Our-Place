import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// The bedroom against the real migrations: sleep sounds, goodnights and the
// wish jar (secret unless shared).
let db;
let n = 0;
const newUser = () => signUp(db, { email: `bed${++n}@example.test`, name: `Bed ${n}` });
const call = (userId, sql, params = []) => as(db, userId, async (tx) => (await tx.query(sql, params)).rows);
const fails = (promise) =>
  promise.then(
    () => null,
    (error) => error.message,
  );

let a;
let b;
let stranger;
beforeAll(async () => {
  db = await createTestDatabase();
  a = await newUser();
  b = await newUser();
  stranger = await newUser();
  const { code } = await rpc.createInvite(db, a);
  await rpc.join(db, b, code);
}, 60_000);
afterAll(() => db?.close());

describe("the bedroom", () => {
  it("plays a sleep sound for both, with a timer", async () => {
    const [row] = await call(a, "select * from public.set_sleep_sound('rain', 30)");
    expect(row).toMatchObject({ sound: "rain", minutes: 30, updated_by: a });
    expect((await call(b, "select sound from public.couple_bedroom"))[0].sound).toBe("rain");
    await call(b, "select public.set_sleep_sound(null)");
    expect((await call(a, "select sound, started_at from public.couple_bedroom"))[0]).toEqual({ sound: null, started_at: null });
    expect(await fails(call(a, "select public.set_sleep_sound('disco')"))).toMatch(/room:invalid/);
    expect(await call(stranger, "select * from public.couple_bedroom")).toEqual([]);
  });

  it("says goodnight once a night, keeping the note", async () => {
    await call(b, "select public.say_goodnight('sweet dreams')");
    await call(b, "select public.say_goodnight(null)"); // again: the note stays
    await call(a, "select public.say_goodnight('  night   night ')");
    const rows = await call(a, "select user_id, note from public.couple_goodnights order by said_at");
    expect(rows).toEqual([
      { user_id: b, note: "sweet dreams" },
      { user_id: a, note: "night night" },
    ]);
    expect(await fails(call(a, "select public.say_goodnight($1)", ["x".repeat(141)]))).toMatch(/room:invalid/);
  });

  it("keeps wishes secret unless shared", async () => {
    await call(a, "select public.make_wish('a house by the sea')");
    expect(await fails(call(a, "select public.make_wish('again so soon')"))).toMatch(/room:rate_limited/);
    await call(b, "select public.make_wish('a puppy', true)");
    const seenByB = await call(b, "select user_id, wish, shared from public.wish_jar() order by created_at");
    expect(seenByB).toEqual([
      { user_id: a, wish: null, shared: false }, // a's secret
      { user_id: b, wish: "a puppy", shared: true },
    ]);
    const [mine] = await call(a, "select id, wish from public.wish_jar() where user_id = $1", [a]);
    expect(mine.wish).toBe("a house by the sea");
    await call(a, "select public.update_wish($1, true)", [mine.id]);
    expect((await call(b, "select wish from public.wish_jar() where user_id = $1", [a]))[0].wish).toBe("a house by the sea");
    await call(b, "select public.update_wish($1, null, true)", [mine.id]); // not b's to delete
    expect(await call(a, "select count(*)::int as n from public.wish_jar()")).toEqual([{ n: 2 }]);
    expect(await fails(call(a, "select * from public.couple_wishes"))).toMatch(/permission denied/);
    expect(await call(stranger, "select * from public.wish_jar()")).toEqual([]);
  });
});
