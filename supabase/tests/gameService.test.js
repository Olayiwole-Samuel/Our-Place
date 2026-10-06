import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameSessionService } from "@/lib/game/sessions.server";
import { createAdminAdapter } from "./adminAdapter";
import { createTestDatabase, rpc, signUp } from "./db";

// The game authority end to end: the real service + real Tic Tac Toe rules +
// the real migrations. This is exactly what the API routes run.
let db;
let service;
let n = 0;
const newUser = () => signUp(db, { email: `svc${++n}@example.test`, name: `Svc ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};
const errorOf = (promise) =>
  promise.then(
    () => null,
    (error) => error.code,
  );

/** Creates a started Tic Tac Toe session; returns ids and who moves first. */
async function startedGame() {
  const { a, b } = await pair();
  const { id } = await service.create(a, "tic_tac_toe");
  await service.join(b, id);
  await service.ready(a, id, true);
  const session = await service.ready(b, id, true);
  const { view } = await service.view(a, id);
  const first = view.turn.order[view.turn.index];
  return { a, b, id, session, view, first, second: first === a ? b : a };
}

beforeAll(async () => {
  db = await createTestDatabase();
  service = createGameSessionService({ admin: createAdminAdapter(db) });
}, 60_000);
afterAll(() => db?.close());

describe("game authority (server)", () => {
  it("only launchable registry games can be created", async () => {
    const { a } = await pair();
    expect(await errorOf(service.create(a, "chess"))).toBe("game_unavailable"); // coming soon
    expect(await errorOf(service.create(a, "truth_or_dare"))).toBe("game_unavailable"); // 18+ locked
    expect(await errorOf(service.create(a, "not_a_game"))).toBe("game_unavailable");
    expect(await errorOf(service.create(a, { id: "tic_tac_toe" }))).toBe("invalid_request");
    expect(await errorOf(service.create(await newUser(), "tic_tac_toe"))).toBe("not_paired");
  });

  it("both ready → the server sets the game up and both players get a view", async () => {
    const { a, b, session, view, first } = await startedGame();
    expect(session).toMatchObject({ status: "active", players: [a, b], version: 1 });
    expect(view.cells).toEqual(Array(9).fill(null));
    expect([a, b]).toContain(first);
    expect(view.marks[first]).toBe("X");
  });

  it("validates every move: turn order, legality, malformed actions", async () => {
    const { id, first, second } = await startedGame();
    expect(await errorOf(service.action(second, id, { type: "place", payload: { cell: 0 } }))).toBe("rejected");
    const moved = await service.action(first, id, { type: "place", payload: { cell: 4 } });
    expect(moved.view.cells[4]).toBe(first);
    expect(moved.session.version).toBe(2);
    expect(await errorOf(service.action(second, id, { type: "place", payload: { cell: 4 } }))).toBe("rejected"); // taken
    expect(await errorOf(service.action(second, id, { type: "place", payload: { cell: 99 } }))).toBe("rejected");
    expect(await errorOf(service.action(second, id, { type: "<script>", payload: {} }))).toBe("invalid_request");
    expect(await errorOf(service.action(second, id, { type: "place", payload: { cell: 1, junk: "x".repeat(3000) } }))).toBe("invalid_request");
    expect(await errorOf(service.action(second, id, { type: "place", payload: { cell: 1 }, version: 1 }))).toBe("conflict"); // stale client
  });

  it("the client can't spoof the player or declare a winner", async () => {
    const { id, first, second } = await startedGame();
    // A forged playerId / winner in the body is ignored: the verified user acts.
    const result = await errorOf(service.action(second, id, { type: "place", payload: { cell: 0 }, playerId: first, winnerId: second, outcome: "win" }));
    expect(result).toBe("rejected"); // still second's move out of turn
    await service.action(first, id, { type: "place", payload: { cell: 0 }, winnerId: first });
    const { session } = await service.view(first, id);
    expect(session).toMatchObject({ status: "active", winnerId: null, result: null });
  });

  it("a win is derived from the board by the server, with streak eligibility from metadata", async () => {
    const { id, first, second } = await startedGame();
    const moves = [
      [first, 0],
      [second, 3],
      [first, 1],
      [second, 4],
      [first, 2],
    ];
    let last;
    for (const [player, cell] of moves) last = await service.action(player, id, { type: "place", payload: { cell } });
    expect(last.session).toMatchObject({ status: "completed", winnerId: first, streakEligible: true });
    expect(last.session.result).toMatchObject({ outcome: "win", winnerId: first, summary: { line: [0, 1, 2] } });
    expect(await errorOf(service.action(second, id, { type: "place", payload: { cell: 8 } }))).toBe("invalid_transition");
  });

  it("a draw has no winner and is not streak eligible", async () => {
    const { id, first, second } = await startedGame();
    // X O X / X O O / O X X  — no line
    const order = [
      [first, 0],
      [second, 1],
      [first, 2],
      [second, 4],
      [first, 3],
      [second, 5],
      [first, 7],
      [second, 6],
      [first, 8],
    ];
    let last;
    for (const [player, cell] of order) last = await service.action(player, id, { type: "place", payload: { cell } });
    expect(last.session).toMatchObject({ status: "completed", winnerId: null, streakEligible: false, result: { outcome: "draw" } });
  });

  it("other couples can't view, join, act in or leave a session", async () => {
    const { id } = await startedGame();
    const outsider = (await pair()).a;
    expect(await errorOf(service.view(outsider, id))).toBe("not_found");
    expect(await errorOf(service.join(outsider, id))).toBe("not_found");
    expect(await errorOf(service.action(outsider, id, { type: "place", payload: { cell: 0 } }))).toBe("not_found");
    expect(await errorOf(service.leave(outsider, id))).toBe("not_found");
  });

  it("leaving mid-game abandons it; the couple can start another", async () => {
    const { a, id } = await startedGame();
    expect((await service.leave(a, id)).status).toBe("abandoned");
    expect((await service.current(a)).session).toMatchObject({ id, status: "abandoned" }); // shown briefly as finished
    expect((await service.create(a, "tic_tac_toe")).status).toBe("waiting");
  });

  it("current() restores the open session and my view after a reconnect", async () => {
    const { a, b, id, first } = await startedGame();
    await service.action(first, id, { type: "place", payload: { cell: 8 } });
    for (const user of [a, b]) {
      const { session, view } = await service.current(user);
      expect(session).toMatchObject({ id, status: "active", version: 2 });
      expect(view.cells[8]).toBe(first);
    }
  });
});
