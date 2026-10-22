import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DECOR_ITEMS } from "@/lib/room/decor";
import { as, createTestDatabase, rpc, signUp } from "./db";

// The dog and decorating, against the real migrations.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `pet${++n}@example.test`, name: `Pet ${n}` });
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
const hearts = async (userId) => (await call(userId, "select public.couple_hearts() as h"))[0].h;

let couple;
let other;
beforeAll(async () => {
  db = await createTestDatabase();
  couple = await pair();
  other = await pair();
}, 60_000);
afterAll(() => db?.close());

describe("the dog", () => {
  it("can be named and asked to do things; both of you see the same moment", async () => {
    const [named] = await call(couple.a, "select * from public.name_pet('  Snowy ')");
    expect(named).toMatchObject({ name: "Snowy", kind: "maltese_mix" });
    const [fed] = await call(couple.b, "select * from public.pet_do('feed', $1::jsonb)", [JSON.stringify({ start: { x: 0, z: 1 } })]);
    expect(fed).toMatchObject({ action: "feed", action_by: couple.b, action_data: { start: { x: 0, z: 1 } } });
    expect(fed.fed_at).toBeTruthy();
    expect(await call(couple.a, "select name, action from public.couple_pets")).toEqual([{ name: "Snowy", action: "feed" }]);
    expect(await call(other.a, "select * from public.couple_pets")).toEqual([]);
  });

  it("refuses unknown tricks, junk data, bad names and a flood of taps", async () => {
    expect(await fails(call(couple.a, "select public.pet_do('fly')"))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "select public.pet_do('sit', $1::jsonb)", [JSON.stringify({ junk: "x".repeat(500) })]))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "select public.name_pet('')"))).toMatch(/room:invalid/);
    await db.query("update public.couple_pets set action_at = now() where couple_id = $1", [couple.coupleId]);
    expect(await fails(call(couple.a, "select public.pet_do('sit')"))).toMatch(/room:rate_limited/);
    expect(await fails(call(couple.a, "update public.couple_pets set name = 'Hack'"))).toMatch(/permission denied/);
  });
});

describe("decorating with hearts", () => {
  it("earns hearts from time together and spends them on unlocks", async () => {
    const start = await hearts(couple.a);
    expect(start).toMatchObject({ spent: 0 });
    expect(start.balance).toBe(start.earned);
    // Earn: a day you were both here, a memory, a note.
    await db.query("insert into public.couple_visits (couple_id, user_id, day) values ($1, $2, current_date), ($1, $3, current_date) on conflict do nothing", [couple.coupleId, couple.a, couple.b]);
    await db.query("insert into public.couple_notes (couple_id, author_id, body) values ($1, $2, 'hi')", [couple.coupleId, couple.a]);
    const earned = await hearts(couple.b);
    expect(earned.parts).toMatchObject({ days: 20, notes: 5 });

    // Not enough for an aquarium (300)…
    expect(await fails(call(couple.a, "select public.unlock_decor('aquarium')"))).toMatch(/room:not_enough_hearts/);
    // …enough for a cactus (40)? Give the couple a few finished games first.
    for (let i = 0; i < 5; i++) await db.query("insert into public.game_sessions (couple_id, game_id, status, created_by, players, started_at, finished_at) values ($1, 'tic_tac_toe', 'completed', $2, $3, now(), now())", [couple.coupleId, couple.a, [couple.a, couple.b]]);
    const [{ unlock_decor: after }] = await call(couple.a, "select public.unlock_decor('cactus')");
    expect(after.spent).toBe(40);
    // Unlocking twice doesn't charge twice.
    const [{ unlock_decor: again }] = await call(couple.b, "select public.unlock_decor('cactus')");
    expect(again.spent).toBe(40);
  });

  it("places, moves and removes things — free ones at once, locked ones only once unlocked", async () => {
    const [rug] = await call(couple.a, "select * from public.place_decor('round_rug', 1, 2, 0)");
    expect(rug).toMatchObject({ item: "round_rug", x: 1, z: 2, placed_by: couple.a });
    expect(await fails(call(couple.a, "select public.place_decor('armchair', 0, 0, 0)"))).toMatch(/room:locked/);
    const [cactus] = await call(couple.b, "select * from public.place_decor('cactus', -2, 3, 0.78)");
    const [moved] = await call(couple.a, "select * from public.move_decor($1, -1, 3, 1.57)", [cactus.id]);
    expect(moved).toMatchObject({ x: -1, rotation: 1.57 });
    expect(await fails(call(couple.a, "select public.place_decor('cactus', 9, 0, 0)"))).toMatch(/room:invalid/);
    expect(await fails(call(couple.a, "select public.place_decor('rocket', 0, 0, 0)"))).toMatch(/room:invalid/);
    // One dog house per room.
    await call(couple.a, "select public.place_decor('dog_house', 3, 3, 0)");
    expect(await fails(call(couple.a, "select public.place_decor('dog_house', -3, 3, 0)"))).toMatch(/room:too_many/);
    // Another couple can't see or touch any of it.
    expect(await call(other.a, "select id from public.couple_decor")).toEqual([]);
    expect(await call(other.a, "select * from public.move_decor($1, 0, 0, 0)", [rug.id]).catch((e) => e.message)).toMatch(/room:invalid/);
    await call(other.a, "select public.remove_decor($1)", [rug.id]);
    expect(await call(couple.a, "select count(*)::int as n from public.couple_decor")).toEqual([{ n: 3 }]);
    await call(couple.b, "select public.remove_decor($1)", [rug.id]);
    expect(await call(couple.a, "select count(*)::int as n from public.couple_decor")).toEqual([{ n: 2 }]);
  });

  it("charges exactly the prices the app shows", () => {
    const sql = readFileSync("supabase/migrations/20261023000000_pet_and_decor.sql", "utf8");
    const rules = Object.fromEntries([...sql.matchAll(/\('([a-z_]+)', (\d+), (\d+)\)/g)].map((m) => [m[1], { cost: Number(m[2]), max: Number(m[3]) }]));
    for (const entry of DECOR_ITEMS) expect(rules[entry.id], entry.id).toEqual({ cost: entry.cost, max: entry.max });
    expect(Object.keys(rules).sort()).toEqual(DECOR_ITEMS.map((entry) => entry.id).sort());
  });
});
