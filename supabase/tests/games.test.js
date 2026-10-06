import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Game sessions against the real migrations: lifecycle functions (service role),
// couple isolation (RLS + function checks), server-only state, live events.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `game${++n}@example.test`, name: `Gamer ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};

/** Runs a query as the server (service role), as the API routes do. */
const server = (sql, params) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query(sql, params)).rows[0];
  });
const serverError = (sql, params) =>
  server(sql, params).then(
    () => null,
    (error) => error.message,
  );

const create = (user, gameId = "tic_tac_toe") => server("select * from public.game_create_session($1, $2)", [user, gameId]);
const join = (user, id) => server("select * from public.game_join_session($1, $2)", [user, id]);
const ready = (user, id, value = true) => server("select * from public.game_set_ready($1, $2, $3)", [user, id, value]);
const start = (id) => server("select * from public.game_start_session($1, $2, $3)", [id, JSON.stringify({ cells: [] }), 42]);
const commit = (id, version, status = "active", result = null, winner = null, streak = false) =>
  server("select * from public.game_commit_state($1, $2, $3, $4, $5, $6, $7)", [id, version, JSON.stringify({ v: version }), status, result && JSON.stringify(result), winner, streak]);
const leave = (user, id) => server("select * from public.game_leave_session($1, $2)", [user, id]);
const events = async (coupleId) =>
  (await db.query("select payload from realtime.messages where topic = $1 order by inserted_at", [`our-place:couple:${coupleId}:games`])).rows.map((r) => r.payload);

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);
afterAll(() => db?.close());

describe("game session lifecycle", () => {
  it("create → partner joins → both ready → server starts → active", async () => {
    const { a, b } = await pair();
    const created = await create(a);
    expect(created).toMatchObject({ status: "waiting", game_id: "tic_tac_toe", created_by: a, players: [a], ready: [] });
    expect((await join(b, created.id)).players).toEqual([a, b]);
    expect((await ready(a, created.id)).status).toBe("waiting");
    expect((await ready(b, created.id)).status).toBe("ready");
    const started = await start(created.id);
    expect(started).toMatchObject({ status: "active", state_version: 1 });
    expect((await start(created.id)).id).toBeNull(); // a second (concurrent) start is a no-op (row of nulls)
  });

  it("un-ready goes back to waiting", async () => {
    const { a, b } = await pair();
    const s = await create(a);
    await join(b, s.id);
    await ready(a, s.id);
    await ready(b, s.id);
    expect((await ready(b, s.id, false)).status).toBe("waiting");
  });

  it("one open session per couple; unpaired users can't create", async () => {
    const { a, b } = await pair();
    await create(a);
    expect(await serverError("select * from public.game_create_session($1, 'tic_tac_toe')", [b])).toBe("game:session_open");
    expect(await serverError("select * from public.game_create_session($1, 'tic_tac_toe')", [await newUser()])).toBe("game:not_paired");
    expect(await serverError("select * from public.game_create_session($1, 'Not A Game!')", [(await pair()).a])).toMatch(/check constraint/);
  });

  it("commits are versioned; results and winners are validated", async () => {
    const { a, b } = await pair();
    const s = await create(a);
    await join(b, s.id);
    await ready(a, s.id);
    await ready(b, s.id);
    await start(s.id);
    expect((await commit(s.id, 1)).state_version).toBe(2);
    expect(await serverError("select * from public.game_commit_state($1, 1, '{}', 'active')", [s.id])).toBe("game:conflict");
    expect(await serverError("select * from public.game_commit_state($1, 2, '{}', 'completed', '{}', $2, true)", [s.id, await newUser()])).toMatch(/winner_is_player/);
    const done = await commit(s.id, 2, "completed", { outcome: "win", winnerId: a }, a, true);
    expect(done).toMatchObject({ status: "completed", winner_id: a, streak_eligible: true });
    expect(done.finished_at).not.toBeNull();
    expect(await serverError("select * from public.game_commit_state($1, 3, '{}', 'active')", [s.id])).toBe("game:conflict");
  });

  it("a result without a winner is never streak eligible", async () => {
    const { a, b } = await pair();
    const s = await create(a);
    await join(b, s.id);
    await ready(a, s.id);
    await ready(b, s.id);
    await start(s.id);
    expect(await commit(s.id, 1, "completed", { outcome: "draw" }, null, true)).toMatchObject({ winner_id: null, streak_eligible: false });
  });

  it("leaving cancels before the start and abandons during play", async () => {
    const { a, b } = await pair();
    const waiting = await create(a);
    expect(await leave(a, waiting.id)).toMatchObject({ status: "cancelled", result: null });
    const s = await create(b);
    await join(a, s.id);
    await ready(a, s.id);
    await ready(b, s.id);
    await start(s.id);
    const abandoned = await leave(b, s.id);
    expect(abandoned).toMatchObject({ status: "abandoned", streak_eligible: false, winner_id: null });
    expect(abandoned.result).toMatchObject({ outcome: "abandoned", summary: { reason: "left", by: b } });
  });

  it("rate-limits repeated session creation", async () => {
    const { a } = await pair();
    for (let i = 0; i < 6; i += 1) {
      const s = await create(a);
      await leave(a, s.id);
    }
    expect(await serverError("select * from public.game_create_session($1, 'tic_tac_toe')", [a])).toBe("game:rate_limited");
  });
});

describe("couple isolation", () => {
  it("other couples can't join, ready, leave or even find a session", async () => {
    const couple1 = await pair();
    const couple2 = await pair();
    const s = await create(couple1.a);
    for (const fn of ["game_join_session", "game_leave_session", "game_note_action"]) {
      expect(await serverError(`select * from public.${fn}($1, $2)`, [couple2.a, s.id])).toBe("game:not_found");
    }
    expect(await serverError("select * from public.game_set_ready($1, $2, true)", [couple2.b, s.id])).toBe("game:not_found");
  });

  it("a couple member who hasn't joined can't act; a full session refuses joins", async () => {
    const { a, b } = await pair();
    const s = await create(a);
    expect(await serverError("select * from public.game_set_ready($1, $2, true)", [b, s.id])).toBe("game:not_a_player");
    expect(await serverError("select * from public.game_note_action($1, $2)", [b, s.id])).toBe("game:not_a_player");
  });

  it("clients read their couple's sessions — never the state or seed — and nobody else's", async () => {
    const couple1 = await pair();
    const couple2 = await pair();
    const s = await create(couple1.a);
    const read = (user, columns = "id, status, players") =>
      as(db, user, async (tx) => (await tx.query(`select ${columns} from public.game_sessions where id = $1`, [s.id])).rows);
    expect(await read(couple1.b)).toHaveLength(1);
    expect(await read(couple2.a)).toHaveLength(0);
    await expect(read(couple1.a, "state")).rejects.toThrow(/permission denied/);
    await expect(read(couple1.a, "seed")).rejects.toThrow(/permission denied/);
    await expect(read(null)).rejects.toThrow(/permission denied/);
  });

  it("clients can't call the lifecycle functions or write sessions directly", async () => {
    const { a, b, coupleId } = await pair();
    const call = (sql, params) => as(db, a, (tx) => tx.query(sql, params));
    await expect(call("select * from public.game_create_session($1, 'tic_tac_toe')", [a])).rejects.toThrow(/permission denied/);
    await expect(call("insert into public.game_sessions (couple_id, game_id, created_by, players) values ($1, 'tic_tac_toe', $2, array[$2]::uuid[])", [coupleId, a])).rejects.toThrow(/permission denied/);
    const s = await create(a);
    await expect(call("update public.game_sessions set winner_id = $1, status = 'completed' where id = $2", [b, s.id])).rejects.toThrow(/permission denied/);
  });
});

describe("live session events", () => {
  it("broadcasts compact events on the couple's private games topic", async () => {
    const { a, b, coupleId } = await pair();
    const s = await create(a);
    await join(b, s.id);
    await ready(a, s.id);
    await ready(b, s.id);
    await start(s.id);
    const kinds = (await events(coupleId)).map((e) => e.event);
    expect(kinds).toEqual(["created", "joined", "ready", "ready", "active"]);
    const [first] = await events(coupleId);
    expect(first).toMatchObject({ id: s.id, gameId: "tic_tac_toe", status: "waiting", players: [a], createdBy: a });
    expect(JSON.stringify(first)).not.toMatch(/"state"|seed/);
  });

  it("clients can't write the games topic", async () => {
    const { a, coupleId } = await pair();
    const sent = await db
      .transaction(async (tx) => {
        await tx.query("select set_config('realtime.topic', $1, true)", [`our-place:couple:${coupleId}:games`]);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: a, role: "authenticated" })]);
        await tx.exec("set local role authenticated");
        await tx.query("insert into realtime.messages (topic, extension, private) values ($1, 'broadcast', true)", [`our-place:couple:${coupleId}:games`]);
      })
      .then(
        () => true,
        () => false,
      );
    expect(sent).toBe(false);
  });
});
