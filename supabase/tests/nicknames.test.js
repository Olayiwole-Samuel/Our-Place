import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Partner nicknames against the real migrations: each partner sets only their
// own name for the other, through set_partner_nickname() only.
let db;
let a;
let b;
let loner;

const call = (userId, sql, params = []) => as(db, userId, async (tx) => (await tx.query(sql, params)).rows);
const fails = (promise) =>
  promise.then(
    () => null,
    (error) => error.message,
  );
const nicknameOf = async (userId) => (await db.query("select partner_nickname from public.couple_members where user_id = $1", [userId])).rows[0]?.partner_nickname ?? null;

beforeAll(async () => {
  db = await createTestDatabase();
  a = await signUp(db, { email: "nick-a@example.test", name: "Arnold A" });
  b = await signUp(db, { email: "nick-b@example.test", name: "King B" });
  loner = await signUp(db, { email: "nick-c@example.test", name: "Solo C" });
  const { code } = await rpc.createInvite(db, a);
  await rpc.join(db, b, code);
}, 60_000);
afterAll(() => db?.close());

describe("partner nicknames", () => {
  it("you set what you call your partner — tidied, on your row only", async () => {
    const [{ set_partner_nickname: saved }] = await call(a, "select public.set_partner_nickname($1)", ["  My   King  "]);
    expect(saved).toBe("My King");
    expect(await nicknameOf(a)).toBe("My King");
    expect(await nicknameOf(b)).toBeNull(); // your partner's own setting is untouched
  });

  it("both partners can read the couple's rows (it's yours, not a secret from them)", async () => {
    const rows = await call(b, "select user_id, partner_nickname from public.couple_members order by slot");
    expect(rows.find((row) => row.user_id === a).partner_nickname).toBe("My King");
  });

  it("clearing goes back to their account name; too long is refused", async () => {
    expect(await fails(call(a, "select public.set_partner_nickname($1)", ["x".repeat(31)]))).toMatch(/pairing:invalid_request/);
    expect(await nicknameOf(a)).toBe("My King");
    await call(a, "select public.set_partner_nickname($1)", [""]);
    expect(await nicknameOf(a)).toBeNull();
  });

  it("only through the function: no direct writes, not unpaired, not signed out", async () => {
    expect(await fails(call(a, "update public.couple_members set partner_nickname = 'Hacked' where user_id = $1", [b]))).toMatch(/permission denied/);
    expect(await fails(call(loner, "select public.set_partner_nickname('Babe')"))).toMatch(/pairing:not_paired/);
    expect(await fails(call(null, "select public.set_partner_nickname('Babe')"))).toMatch(/permission denied/);
  });
});
