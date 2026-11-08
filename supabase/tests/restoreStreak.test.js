import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// restore_streak(): fills the missed days between your last day together and
// yesterday, for both partners, so the together streak carries on.
let db;
let n = 0;
let today;
const newUser = () => signUp(db, { email: `restore${++n}@example.test`, name: `Restore ${n}` });
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
/** The day `offset` days from today (Lagos), as YYYY-MM-DD. */
const day = (offset) => new Date(Date.parse(today) + offset * 86_400_000).toISOString().slice(0, 10);
const both = async (c, offset) => {
  await visit(c.a, day(offset));
  await visit(c.b, day(offset));
};
const streakOf = async (userId) => (await call(userId, "select * from public.couple_streak()"))[0];

beforeAll(async () => {
  db = await createTestDatabase();
  const { rows } = await db.query("select to_char((now() at time zone 'Africa/Lagos')::date, 'YYYY-MM-DD') as today");
  today = rows[0].today;
}, 60_000);
afterAll(() => db?.close());

describe("restore_streak", () => {
  it("fills the missed days for both partners, so the old run carries on", async () => {
    const c = await pair();
    for (const offset of [-8, -7, -6, -5]) await both(c, offset); // 4 days together, then 4 missed
    await visit(c.a, day(0)); // a is here today
    expect(await streakOf(c.a)).toMatchObject({ current_days: 0, best_days: 4 });

    const [{ restore_streak: filled }] = await call(c.b, "select public.restore_streak('Africa/Lagos')");
    expect(filled).toBe(4);
    expect(await streakOf(c.a)).toMatchObject({ current_days: 8, best_days: 8, today_both: false });
    const [log] = await call(c.a, "select restored_by, to_char(from_day, 'YYYY-MM-DD') as from_day, to_char(to_day, 'YYYY-MM-DD') as to_day from public.couple_streak_restores");
    expect(log).toEqual({ restored_by: c.b, from_day: day(-4), to_day: day(-1) });

    // Nothing to restore any more.
    expect(await fails(call(c.a, "select public.restore_streak('Africa/Lagos')"))).toMatch(/streak:not_broken/);
  });

  it("refuses with no day together yet, or a gap over 30 days", async () => {
    const fresh = await pair();
    expect(await fails(call(fresh.a, "select public.restore_streak('Africa/Lagos')"))).toMatch(/streak:nothing_to_restore/);
    const old = await pair();
    await both(old, -40);
    expect(await fails(call(old.a, "select public.restore_streak('Africa/Lagos')"))).toMatch(/streak:too_long/);
  });

  it("only fills your own couple's days, and only through the function", async () => {
    const c = await pair();
    const other = await pair();
    await both(c, -5);
    await both(other, -5);
    await call(c.a, "select public.restore_streak('Africa/Lagos')");
    expect((await call(other.a, "select count(*)::int as n from public.couple_visits"))[0].n).toBe(2); // untouched
    expect(await call(other.a, "select * from public.couple_streak_restores")).toHaveLength(0);
    expect(await fails(call(c.a, "insert into public.couple_streak_restores (couple_id, restored_by, from_day, to_day) values ($1, $2, current_date, current_date)", [c.coupleId, c.a]))).toMatch(/permission denied/);
  });
});
