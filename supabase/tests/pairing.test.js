import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Every test runs the real migrations in real Postgres (PGlite). Each test creates
// its own users, so tests are independent within the shared database.
let db;
let n = 0;
const newUser = (name = "User") => {
  n += 1;
  return signUp(db, { email: `user${n}@example.test`, name: `${name} ${n}`, picture: "https://example.test/p.png" });
};
const pair = async () => {
  const a = await newUser("A");
  const b = await newUser("B");
  const { code } = await rpc.createInvite(db, a);
  const coupleId = await rpc.join(db, b, code);
  return { a, b, code, coupleId };
};
const select = (userId, sql, params) => as(db, userId, async (tx) => (await tx.query(sql, params)).rows);

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);
afterAll(() => db?.close());

describe("profiles", () => {
  it("creates a users row from the Google identity on sign-up", async () => {
    const id = await signUp(db, { email: "ada@example.test", name: "Ada Lovelace", picture: "https://lh3.example/p.png" });
    const [profile] = await select(id, "select id, display_name, avatar_url from public.users where id = $1", [id]);
    expect(profile).toEqual({ id, display_name: "Ada Lovelace", avatar_url: "https://lh3.example/p.png" });
  });

  it("syncs profile changes and falls back to the email name", async () => {
    const id = await signUp(db, { email: "grace@example.test" });
    let [profile] = await select(id, "select display_name, avatar_url from public.users where id = $1", [id]);
    expect(profile).toEqual({ display_name: "grace", avatar_url: null });
    await db.query("update auth.users set raw_user_meta_data = $2 where id = $1", [id, JSON.stringify({ name: "Grace" })]);
    [profile] = await select(id, "select display_name from public.users where id = $1", [id]);
    expect(profile.display_name).toBe("Grace");
  });

  it("rejects non-https picture URLs", async () => {
    const id = await signUp(db, { email: "x@example.test", picture: "javascript:alert(1)" });
    const [profile] = await select(id, "select avatar_url from public.users where id = $1", [id]);
    expect(profile.avatar_url).toBeNull();
  });
});

describe("create_couple_invite", () => {
  it("issues a six-character code from the unambiguous alphabet", async () => {
    const a = await newUser();
    const invite = await rpc.createInvite(db, a);
    expect(invite.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(new Date(invite.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("is idempotent while the invite is active", async () => {
    const a = await newUser();
    const first = await rpc.createInvite(db, a);
    const second = await rpc.createInvite(db, a);
    expect(second.code).toBe(first.code);
  });

  it("replaces an expired invite with a new code", async () => {
    const a = await newUser();
    const first = await rpc.createInvite(db, a);
    await db.query("update public.couple_invites set expires_at = now() - interval '1 minute' where code = $1", [first.code]);
    const second = await rpc.createInvite(db, a);
    expect(second.code).not.toBe(first.code);
    const [{ status }] = (await db.query("select status from public.couple_invites where code = $1", [first.code])).rows;
    expect(status).toBe("expired");
  });

  it("generates distinct random codes", async () => {
    const codes = new Set();
    for (let i = 0; i < 40; i++) codes.add((await rpc.createInvite(db, await newUser())).code);
    expect(codes.size).toBe(40);
  });

  it("refuses already-paired users", async () => {
    const { a, b } = await pair();
    await expect(rpc.createInvite(db, a)).rejects.toThrow("pairing:already_paired");
    await expect(rpc.createInvite(db, b)).rejects.toThrow("pairing:already_paired");
  });

  it("refuses unauthenticated callers", async () => {
    await expect(rpc.createInvite(db, null)).rejects.toThrow(/permission denied/);
  });
});

describe("join_couple", () => {
  it("pairs exactly the inviter and the joiner", async () => {
    const { a, b, coupleId } = await pair();
    const [couple] = (await db.query("select user1_id, user2_id from public.couples where id = $1", [coupleId])).rows;
    expect(couple).toEqual({ user1_id: a, user2_id: b });
    const members = (await db.query("select user_id, slot from public.couple_members where couple_id = $1 order by slot", [coupleId])).rows;
    expect(members).toEqual([{ user_id: a, slot: 1 }, { user_id: b, slot: 2 }]);
  });

  it("normalises lowercase, spaces and dashes", async () => {
    const a = await newUser();
    const b = await newUser();
    const { code } = await rpc.createInvite(db, a);
    const messy = ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `;
    await expect(rpc.join(db, b, messy)).resolves.toBeTruthy();
  });

  it("prevents self-pairing", async () => {
    const a = await newUser();
    const { code } = await rpc.createInvite(db, a);
    await expect(rpc.join(db, a, code)).rejects.toThrow("pairing:self_pair");
  });

  it("rejects malformed and unknown codes", async () => {
    const b = await newUser();
    await expect(rpc.join(db, b, "ABC")).rejects.toThrow("pairing:invalid_code");
    await expect(rpc.join(db, b, "A0O1IL")).rejects.toThrow("pairing:invalid_code");
    await expect(rpc.join(db, b, "'; drop table public.couples; --")).rejects.toThrow("pairing:invalid_code");
    await expect(rpc.join(db, b, "ZZZZZZ")).rejects.toThrow("pairing:invalid_code");
  });

  it("never lets a used invite be reused (third user)", async () => {
    const { code } = await pair();
    const c = await newUser("C");
    await expect(rpc.join(db, c, code)).rejects.toThrow("pairing:invite_unavailable");
  });

  it("rejects expired invites", async () => {
    const a = await newUser();
    const b = await newUser();
    const { code } = await rpc.createInvite(db, a);
    await db.query("update public.couple_invites set expires_at = now() - interval '1 second' where code = $1", [code]);
    await expect(rpc.join(db, b, code)).rejects.toThrow("pairing:invite_unavailable");
  });

  it("refuses joiners who are already paired", async () => {
    const { a } = await pair();
    const c = await newUser();
    const { code } = await rpc.createInvite(db, c);
    await expect(rpc.join(db, a, code)).rejects.toThrow("pairing:already_paired");
  });

  it("handles crossed invites: A and B both invite, only one pairing wins", async () => {
    const a = await newUser();
    const b = await newUser();
    const aInvite = await rpc.createInvite(db, a);
    const bInvite = await rpc.createInvite(db, b);
    await rpc.join(db, b, aInvite.code);
    // A trying B's invite now fails: A is paired, and B's own invite was revoked on joining.
    await expect(rpc.join(db, a, bInvite.code)).rejects.toThrow("pairing:already_paired");
    const c = await newUser();
    await expect(rpc.join(db, c, bInvite.code)).rejects.toThrow("pairing:invite_unavailable");
  });

  it("reports a complete couple if an inviter somehow paired elsewhere", async () => {
    const a = await newUser();
    const { code } = await rpc.createInvite(db, a);
    const other = await newUser();
    const otherInvite = await rpc.createInvite(db, other);
    // Simulate a stale active invite: A joins someone else while A's invite is re-activated.
    await rpc.join(db, a, otherInvite.code);
    await db.query("update public.couple_invites set status = 'active' where code = $1", [code]);
    const c = await newUser();
    await expect(rpc.join(db, c, code)).rejects.toThrow("pairing:couple_complete");
  });

  it("refuses unauthenticated callers", async () => {
    const a = await newUser();
    const { code } = await rpc.createInvite(db, a);
    await expect(rpc.join(db, null, code)).rejects.toThrow(/permission denied/);
  });

  it("throttles invite-code guessing after 10 failures in 15 minutes", async () => {
    const guesser = await newUser();
    const a = await newUser();
    const { code } = await rpc.createInvite(db, a);
    for (let i = 0; i < 10; i++) await expect(rpc.join(db, guesser, "ZZZZZZ")).rejects.toThrow("pairing:invalid_code");
    // Even the correct code is refused while throttled.
    await expect(rpc.join(db, guesser, code)).rejects.toThrow("pairing:rate_limited");
    // Attempts age out.
    await db.query("update private.pairing_attempts set attempted_at = now() - interval '16 minutes' where user_id = $1", [guesser]);
    await expect(rpc.join(db, guesser, code)).resolves.toBeTruthy();
  });

  it("records failed attempts even though the join was refused", async () => {
    const b = await newUser();
    await expect(rpc.join(db, b, "ZZZZZZ")).rejects.toThrow();
    const { rows } = await db.query("select reason from private.pairing_attempts where user_id = $1", [b]);
    expect(rows).toEqual([{ reason: "invalid_code" }]);
  });

  it("has no parameter through which a user id or couple id can be forged", async () => {
    const { rows } = await db.query(
      "select pg_get_function_identity_arguments(p.oid) as args from pg_proc p where p.proname in ('join_couple','create_couple_invite') order by p.proname",
    );
    expect(rows.map((r) => r.args)).toEqual(["", "invite_code text"]);
  });
});

describe("row level security: couple isolation", () => {
  it("members see their own couple, members and partner profile", async () => {
    const { a, b, coupleId } = await pair();
    expect(await select(a, "select id from public.couples")).toEqual([{ id: coupleId }]);
    expect((await select(b, "select user_id from public.couple_members order by slot")).map((r) => r.user_id)).toEqual([a, b]);
    expect((await select(a, "select id from public.users order by id")).map((r) => r.id).sort()).toEqual([a, b].sort());
  });

  it("couple A can never read couple B's rows", async () => {
    const one = await pair();
    const two = await pair();
    expect(await select(one.a, "select id from public.couples where id = $1", [two.coupleId])).toEqual([]);
    expect(await select(one.a, "select user_id from public.couple_members where couple_id = $1", [two.coupleId])).toEqual([]);
    expect(await select(one.a, "select id from public.users where id in ($1, $2)", [two.a, two.b])).toEqual([]);
  });

  it("unpaired users see only themselves", async () => {
    const lonely = await newUser();
    await pair();
    expect(await select(lonely, "select id from public.users")).toEqual([{ id: lonely }]);
    expect(await select(lonely, "select id from public.couples")).toEqual([]);
  });

  it("invites are visible only to their creator (no code enumeration)", async () => {
    const a = await newUser();
    const snoop = await newUser();
    const { code } = await rpc.createInvite(db, a);
    expect((await select(a, "select code from public.couple_invites")).map((r) => r.code)).toEqual([code]);
    expect(await select(snoop, "select code from public.couple_invites")).toEqual([]);
  });

  it("does not expose a partner's email", async () => {
    const { a } = await pair();
    await expect(select(a, "select email from public.users")).rejects.toThrow(/permission denied/);
  });

  it("anonymous requests read nothing", async () => {
    await pair();
    for (const table of ["users", "couples", "couple_members", "couple_invites"]) {
      await expect(select(null, `select 1 from public.${table}`)).rejects.toThrow(/permission denied/);
    }
  });
});

describe("forged writes from a modified client", () => {
  it("cannot insert a couple, membership or invite directly", async () => {
    const a = await newUser();
    const c = await newUser();
    const { coupleId } = await pair();
    await expect(select(c, "insert into public.couples (user1_id, user2_id, invite_code) values ($1, $2, 'AAAAAA')", [a, c])).rejects.toThrow(/permission denied/);
    await expect(select(c, "insert into public.couple_members (user_id, couple_id, slot) values ($1, $2, 2)", [c, coupleId])).rejects.toThrow(/permission denied/);
    await expect(select(c, "insert into public.couple_invites (code, created_by) values ('BBBBBB', $1)", [a])).rejects.toThrow(/permission denied/);
  });

  it("cannot modify or delete pairing data", async () => {
    const { a, coupleId } = await pair();
    const c = await newUser();
    await expect(select(a, "update public.couples set user2_id = $1 where id = $2", [c, coupleId])).rejects.toThrow(/permission denied/);
    await expect(select(a, "delete from public.couple_members where couple_id = $1", [coupleId])).rejects.toThrow(/permission denied/);
    await expect(select(a, "update public.users set display_name = 'x' where id = $1", [a])).rejects.toThrow(/permission denied/);
  });

  it("cannot call internal helpers or bypass the throttle", async () => {
    const a = await newUser();
    const b = await newUser();
    const { code } = await rpc.createInvite(db, b);
    await expect(select(a, "select private.generate_invite_code()")).rejects.toThrow(/permission denied/);
    await expect(select(a, "select * from private.try_join_couple($1, $2)", [a, code])).rejects.toThrow(/permission denied/);
    await expect(select(a, "delete from private.pairing_attempts")).rejects.toThrow(/permission denied/);
  });
});

describe("database constraints (hold even if application logic were bypassed)", () => {
  // Run as the superuser to prove the schema itself forbids these states.
  const attempt = (sql, params) => db.transaction((tx) => tx.query(sql, params));

  it("forbids a user in two couples", async () => {
    const { a } = await pair();
    const c = await newUser();
    await expect(
      attempt(
        `with c as (insert into public.couples (user1_id, user2_id, invite_code) values ($1, $2, 'CCCCCC') returning id)
         insert into public.couple_members (user_id, couple_id, slot) select $1, id, 1 from c union all select $2, id, 2 from c`,
        [a, c],
      ),
    ).rejects.toThrow(/duplicate key|unique/);
  });

  it("forbids a third member", async () => {
    const { coupleId } = await pair();
    const c = await newUser();
    await expect(attempt("insert into public.couple_members (user_id, couple_id, slot) values ($1, $2, 3)", [c, coupleId])).rejects.toThrow(/check/);
    await expect(attempt("insert into public.couple_members (user_id, couple_id, slot) values ($1, $2, 2)", [c, coupleId])).rejects.toThrow(/duplicate key|unique/);
  });

  it("forbids self-couples", async () => {
    const a = await newUser();
    await expect(attempt("insert into public.couples (user1_id, user2_id, invite_code) values ($1, $1, 'DDDDDD')", [a])).rejects.toThrow(/couples_distinct_partners/);
  });

  it("forbids a couple without its two members", async () => {
    const a = await newUser();
    const b = await newUser();
    await expect(attempt("insert into public.couples (user1_id, user2_id, invite_code) values ($1, $2, 'EEEEEE')", [a, b])).rejects.toThrow(/inconsistent/);
  });

  it("forbids duplicate and malformed invite codes", async () => {
    const a = await newUser();
    const b = await newUser();
    const { code } = await rpc.createInvite(db, a);
    await expect(attempt("insert into public.couple_invites (code, created_by) values ($1, $2)", [code, b])).rejects.toThrow(/duplicate key|unique/);
    await expect(attempt("insert into public.couple_invites (code, created_by) values ('abc123', $1)", [b])).rejects.toThrow(/check/);
  });

  it("forbids two active invites for one user", async () => {
    const a = await newUser();
    await rpc.createInvite(db, a);
    await expect(attempt("insert into public.couple_invites (code, created_by) values ('FFFFFF', $1)", [a])).rejects.toThrow(/duplicate key|unique/);
  });
});
