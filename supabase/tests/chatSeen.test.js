import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Chat "Seen" against the real migrations: each of you moves your own "seen up
// to" moment forward only; the couple can read both, nobody else can.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `seen${++n}@example.test`, name: `Seen ${n}` });
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

describe("chat seen", () => {
  it("moves forward only, never past now, and the partner can read it", async () => {
    const [{ created_at: first }] = await call(a, "select created_at from public.send_message('one')");
    const [{ created_at: second }] = await call(a, "select created_at from public.send_message('two')");
    await call(b, "select public.mark_chat_seen($1)", [second]);
    await call(b, "select public.mark_chat_seen($1)", [first]); // older: ignored
    const [row] = await call(a, "select seen_until from public.chat_reads where user_id = $1", [b]);
    expect(new Date(row.seen_until).getTime()).toBe(new Date(second).getTime());
    await call(b, "select public.mark_chat_seen(now() + interval '1 day')");
    const [later] = await call(a, "select seen_until <= now() as ok from public.chat_reads where user_id = $1", [b]);
    expect(later.ok).toBe(true);
    expect(await call(stranger, "select * from public.chat_reads")).toEqual([]);
    expect(await fails(call(stranger, "select public.mark_chat_seen(now())"))).toMatch(/chat:not_paired/);
    expect(await fails(call(a, "insert into public.chat_reads (user_id, couple_id, seen_until) select $1, couple_id, now() from public.couple_members where user_id = $1", [a]))).toMatch(/permission denied/);
  });
});
