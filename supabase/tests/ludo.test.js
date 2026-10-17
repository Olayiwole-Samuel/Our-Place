import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HOME, TRACK_LENGTH, YARD } from "@/games/ludo/board";
import { createGameSessionService } from "@/lib/game/sessions.server";
import { createAdminAdapter } from "./adminAdapter";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Naija Ludo end to end: the real service + Ludo rules + migrations
// (game_sessions, win_streaks) — exactly what the API routes run.
let db;
let service;
let n = 0;
const newUser = () => signUp(db, { email: `ludo${++n}@example.test`, name: `Ludo ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};
const errorOf = (promise) =>
  promise.then(
    () => null,
    (error) => error.detail?.code ?? error.code,
  );
const stateOf = async (id) => (await db.query("select state, state_version from public.game_sessions where id = $1", [id])).rows[0];
/** Test setup only: places server state (as the server itself would have it). */
const setState = async (id, patch) => {
  const { state } = await stateOf(id);
  await db.query("update public.game_sessions set state = $2 where id = $1", [id, JSON.stringify({ ...state, ...patch, pieces: { ...state.pieces, ...patch.pieces } })]);
};
const streaks = async (coupleId) =>
  Object.fromEntries((await db.query("select user_id, current, best from public.win_streaks where couple_id = $1 and game_id = 'ludo'", [coupleId])).rows.map((r) => [r.user_id, { current: r.current, best: r.best }]));
/** Long games exceed the per-user action rate limit; tests reset it between bursts. */
const resetRateLimit = () => db.query("delete from private.game_rate_events");
const letterOf = (seats, playerId) => (seats.indexOf(playerId) === 0 ? "A" : "B");
const freshDice = (values) => values.map((value) => ({ value, used: false }));

async function startedGame(couple) {
  const { a, b, coupleId } = couple ?? (await pair());
  const { id } = await service.create(a, "ludo");
  await service.join(b, id);
  await service.ready(a, id, true);
  await service.ready(b, id, true);
  const { view } = await service.view(a, id);
  const first = view.current;
  const { seats } = (await stateOf(id)).state;
  return { a, b, coupleId, id, first, second: first === a ? b : a, seats, mine: letterOf(seats, first), theirs: letterOf(seats, first === a ? b : a) };
}

/** Puts `winner` one die from winning, with the dice already rolled. */
async function oneMoveFromWinning(id, winner, seats) {
  const l = letterOf(seats, winner);
  await setState(id, {
    current: winner,
    phase: "awaiting_move",
    dice: freshDice([2, 1]),
    rolls: 40,
    lastRoll: { number: 40, by: winner, values: [2, 1], doubleSix: false, doubleSixes: 0, outcome: "play" },
    pieces: { [`${l}1`]: HOME, [`${l}2`]: HOME, [`${l}3`]: HOME, [`${l}4`]: 54 },
  });
  return `${l}4`;
}

beforeAll(async () => {
  db = await createTestDatabase();
  service = createGameSessionService({ admin: createAdminAdapter(db) });
}, 60_000);
afterAll(() => db?.close());

describe("Naija Ludo via the game authority", () => {
  it("a couple starts Ludo: same board for both, a server-chosen first player", async () => {
    const { a, b, id, first } = await startedGame();
    const forA = await service.view(a, id);
    const forB = await service.view(b, id);
    expect(forA.session).toMatchObject({ status: "active", gameId: "ludo" });
    expect(forA.view.pieces).toEqual(forB.view.pieces);
    expect(Object.values(forA.view.pieces).every((p) => p === YARD)).toBe(true);
    expect(forA.view).toMatchObject({ phase: "awaiting_roll", current: first, mySeat: 0, dice: null });
    expect(forB.view.mySeat).toBe(1);
  });

  it("non-members can't see or act; forged player and couple ids are ignored", async () => {
    const { id, first, second } = await startedGame();
    const outsider = await pair();
    expect(await errorOf(service.view(outsider.a, id))).toBe("not_found");
    expect(await errorOf(service.action(outsider.a, id, { type: "roll", payload: {} }))).toBe("not_found");
    // The second player claims to be the first: the verified user is still the second.
    expect(await errorOf(service.action(second, id, { type: "roll", payload: { playerId: first }, playerId: first, coupleId: outsider.coupleId }))).toBe("not_your_turn");
    expect(await errorOf(service.action(second, id, { type: "move", payload: { pieceId: "A1", use: "die0" }, playerId: first }))).toBe("not_your_turn");
    expect((await stateOf(id)).state.rolls).toBe(0);
  });

  it("the client can't choose the dice, a destination, a kill, a bonus, the opponent's piece or a spent die", async () => {
    const { id, first, mine, theirs } = await startedGame();
    await setState(id, { pieces: { [`${mine}1`]: 10, [`${mine}2`]: 30 } }); // any roll has a use
    const rolled = await service.action(first, id, { type: "roll", payload: { values: [6, 6], dieA: 6, dieB: 6 } });
    const { state } = await stateOf(id);
    expect(rolled.view.dice).toEqual(state.dice); // whatever the SERVER rolled
    expect(state.lastRoll.values).toEqual(state.dice.map((d) => d.value));
    expect(await errorOf(service.action(first, id, { type: "move", payload: { pieceId: `${theirs}1`, use: "die0" } }))).toBe("illegal_action");
    const before = state.pieces[`${mine}2`];
    const moved = await service.action(first, id, { type: "move", payload: { pieceId: `${mine}2`, use: "die0", to: HOME, captures: [`${theirs}1`], bonus: ["capture"], winnerId: first } });
    expect(moved.view.pieces[`${mine}2`]).toBe(before + state.dice[0].value);
    expect(moved.view.pieces[`${theirs}1`]).toBe(YARD);
    expect(moved.view.bonus).toEqual(state.dice[0].value === 6 && state.dice[1].value === 6 ? ["double_six"] : []);
    expect(moved.session).toMatchObject({ status: "active", winnerId: null });
    if (moved.view.phase === "awaiting_move" && moved.view.current === first) {
      expect(await errorOf(service.action(first, id, { type: "move", payload: { pieceId: `${mine}1`, use: "die0" } }))).toMatch(/illegal_action|already_moved/);
    }
  });

  it("server kills (killer home, no bonus) survive a reconnect", async () => {
    const { a, b, id, first, second, seats, mine, theirs } = await startedGame();
    const victimSquare = 15;
    const theirProgress = (victimSquare - (letterOf(seats, second) === "A" ? 0 : 26) + TRACK_LENGTH) % TRACK_LENGTH;
    const myStart = mine === "A" ? 0 : 26;
    await setState(id, {
      current: first,
      phase: "awaiting_move",
      dice: freshDice([5, 2]),
      rolls: 3,
      lastRoll: { number: 3, by: first, values: [5, 2], doubleSix: false, doubleSixes: 0, outcome: "play" },
      pieces: { [`${mine}1`]: (victimSquare - 5 - myStart + TRACK_LENGTH) % TRACK_LENGTH, [`${mine}2`]: 30, [`${theirs}1`]: theirProgress },
    });
    const killed = await service.action(first, id, { type: "move", payload: { pieceId: `${mine}1`, use: "die0" } });
    expect(killed.view.pieces[`${theirs}1`]).toBe(YARD);
    expect(killed.view.lastMove.captured).toEqual([{ pieceId: `${theirs}1`, from: theirProgress }]);
    expect(killed.view.pieces[`${mine}1`]).toBe(HOME);
    expect(killed.view.bonus).toEqual([]);
    for (const user of [a, b]) {
      const reloaded = await service.current(user);
      expect(reloaded.view).toMatchObject({ bonus: [], dice: killed.view.dice, pieces: killed.view.pieces, current: first });
    }
    const afterSecond = await service.action(first, id, { type: "move", payload: { pieceId: `${mine}2`, use: "die1" } });
    expect(afterSecond.view).toMatchObject({ current: second, phase: "awaiting_roll", extraRoll: null });
    expect((await service.current(second)).view.current).toBe(second);
  });

  it("duplicate requests don't corrupt state", async () => {
    const { id, first, mine } = await startedGame();
    await setState(id, { pieces: { [`${mine}1`]: 10, [`${mine}2`]: 30 } });
    const results = await Promise.allSettled([service.action(first, id, { type: "roll", payload: {} }), service.action(first, id, { type: "roll", payload: {} })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const code = results.find((r) => r.status === "rejected").reason;
    expect(["already_rolled", "conflict"]).toContain(code.detail?.code ?? code.code);
    expect((await stateOf(id)).state.rolls).toBe(1);

    await service.action(first, id, { type: "move", payload: { pieceId: `${mine}2`, use: "die0" } });
    const after = await stateOf(id);
    expect(await errorOf(service.action(first, id, { type: "move", payload: { pieceId: `${mine}2`, use: "die0" } }))).toBe("already_moved");
    expect((await stateOf(id)).state).toEqual(after.state);
    // A request based on an old view is refused.
    expect(await errorOf(service.action(first, id, { type: "roll", payload: {}, version: after.state_version - 1 }))).toBe("conflict");
  });

  it("refresh right after a roll restores the dice, the options and the turn", async () => {
    const { a, b, id, first, mine } = await startedGame();
    await setState(id, { pieces: { [`${mine}1`]: 10 } });
    const rolled = await service.action(first, id, { type: "roll", payload: {} });
    for (const user of [a, b]) {
      const reloaded = await service.current(user);
      expect(reloaded.view).toMatchObject({ phase: rolled.view.phase, current: rolled.view.current, dice: rolled.view.dice, pieces: rolled.view.pieces, options: rolled.view.options });
    }
  });

  it("plays a whole game with server dice to a server-derived winner", { timeout: 120_000 }, async () => {
    const { a, b, id } = await startedGame();
    let summary;
    for (let step = 0; step < 6000; step += 1) {
      if (step % 30 === 0) await resetRateLimit();
      const { state } = await stateOf(id);
      const player = state.current;
      let body = { type: "roll", payload: {} };
      if (state.phase === "awaiting_move") {
        const choice = (await service.view(player, id)).view.options.at(-1);
        body = { type: "move", payload: { pieceId: choice.pieceId, use: choice.use } };
      }
      summary = (await service.action(player, id, body)).session;
      if (summary.status !== "active") break;
    }
    expect(summary.status).toBe("completed");
    const { state } = await stateOf(id);
    const l = letterOf(state.seats, summary.winnerId);
    expect(["1", "2", "3", "4"].every((i) => state.pieces[l + i] === HOME)).toBe(true);
    const row = (await db.query("select status, winner_id, streak_eligible from public.game_sessions where id = $1", [id])).rows[0];
    expect(row).toEqual({ status: "completed", winner_id: summary.winnerId, streak_eligible: true });
    expect(await errorOf(service.action(a, id, { type: "roll", payload: {} }))).toBe("invalid_transition");
    expect(await errorOf(service.action(b, id, { type: "move", payload: { pieceId: "B1", use: "die0" } }))).toBe("invalid_transition");
  });
});

describe("win streaks (database, from completed sessions)", () => {
  it("winner +1, loser reset to 0; shown on the finish screen; best is kept", async () => {
    const couple = await pair();
    const { a, b, coupleId } = couple;

    const g1 = await startedGame(couple);
    let piece = await oneMoveFromWinning(g1.id, a, g1.seats);
    const won = await service.action(a, g1.id, { type: "move", payload: { pieceId: piece, use: "die0" } });
    expect(won.session).toMatchObject({ status: "completed", winnerId: a, streakEligible: true });
    expect(won.session.streaks).toEqual({ [a]: { current: 1, best: 1 }, [b]: { current: 0, best: 0 } });

    const g2 = await startedGame(couple);
    piece = await oneMoveFromWinning(g2.id, a, g2.seats);
    await service.action(a, g2.id, { type: "move", payload: { pieceId: piece, use: "die0" } });
    expect(await streaks(coupleId)).toEqual({ [a]: { current: 2, best: 2 }, [b]: { current: 0, best: 0 } });

    const g3 = await startedGame(couple);
    piece = await oneMoveFromWinning(g3.id, b, g3.seats);
    await service.action(b, g3.id, { type: "move", payload: { pieceId: piece, use: "die0" } });
    expect(await streaks(coupleId)).toEqual({ [a]: { current: 0, best: 2 }, [b]: { current: 1, best: 1 } });
  });

  it("abandoned games and Would You Rather never touch streaks", async () => {
    const couple = await pair();
    const g = await startedGame(couple);
    await service.leave(g.a, g.id);
    expect(await streaks(couple.coupleId)).toEqual({});

    const { id } = await service.create(couple.a, "would_you_rather");
    await service.join(couple.b, id);
    await service.ready(couple.a, id, true);
    await service.ready(couple.b, id, true);
    await service.action(couple.a, id, { type: "finish", payload: {} });
    const rows = (await db.query("select count(*)::int as n from public.win_streaks where couple_id = $1", [couple.coupleId])).rows[0].n;
    expect(rows).toBe(0);
  });

  it("clients can read their couple's streaks but never write them; other couples can't see them", async () => {
    const couple = await pair();
    const g = await startedGame(couple);
    const piece = await oneMoveFromWinning(g.id, couple.a, g.seats);
    await service.action(couple.a, g.id, { type: "move", payload: { pieceId: piece, use: "die0" } });
    expect((await as(db, couple.b, (tx) => tx.query("select user_id, current from public.win_streaks"))).rows).toHaveLength(2);
    const outsider = await pair();
    expect((await as(db, outsider.a, (tx) => tx.query("select * from public.win_streaks"))).rows).toHaveLength(0);
    await expect(as(db, couple.a, (tx) => tx.query("update public.win_streaks set current = 99"))).rejects.toThrow(/permission denied/);
    await expect(
      as(db, couple.a, (tx) => tx.query("insert into public.win_streaks (couple_id, game_id, user_id, current, best) values ($1, 'ludo', $2, 50, 50)", [couple.coupleId, couple.a])),
    ).rejects.toThrow(/permission denied/);
  });
});
