import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameSessionService } from "@/lib/game/sessions.server";
import { createAdminAdapter } from "./adminAdapter";
import { createTestDatabase, rpc, signUp } from "./db";

// Chess, Naija Whot, Scrabble and the Jigsaw end to end: the real game
// authority (what the API routes run) + the real rules + the real migrations.
let db;
let service;
let n = 0;
const newUser = () => signUp(db, { email: `new${++n}@example.test`, name: `New ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  await rpc.join(db, b, code);
  return { a, b };
};
const errorOf = (promise) =>
  promise.then(
    () => null,
    (error) => error.detail?.code ?? error.code,
  );

async function started(gameId) {
  const { a, b } = await pair();
  const { id } = await service.create(a, gameId);
  await service.join(b, id);
  await service.ready(a, id, true);
  await service.ready(b, id, true);
  return { a, b, id };
}

beforeAll(async () => {
  db = await createTestDatabase();
  service = createGameSessionService({ admin: createAdminAdapter(db) });
}, 60_000);
afterAll(() => db?.close());

describe("new games through the game authority", () => {
  it("Chess: only the side to move can move; a resent move isn't applied twice; reload restores the board", async () => {
    const { a, b, id } = await started("chess");
    const { view } = await service.view(a, id);
    const white = view.seats.w;
    const black = white === a ? b : a;
    expect(await errorOf(service.action(black, id, { type: "move", payload: { from: "e7", to: "e5", ply: 0 } }))).toBe("not_your_turn");
    await service.action(white, id, { type: "move", payload: { from: "e2", to: "e4", ply: 0 } });
    expect(await errorOf(service.action(white, id, { type: "move", payload: { from: "e2", to: "e4", ply: 0 } }))).toBe("already_moved");
    const reloaded = await service.current(black);
    expect(reloaded.view.history).toEqual(["e4"]);
    expect(reloaded.view.turn).toBe(black);
  });

  it("Naija Whot: each player sees only their own hand — never the partner's cards or the market", async () => {
    const { a, b, id } = await started("naija_whot");
    await service.action(a, id, { type: "settings", payload: { key: "tender", value: "reshuffle" } });
    await service.action(b, id, { type: "deal", payload: {} });
    const { view: va } = await service.view(a, id);
    const { view: vb } = await service.view(b, id);
    expect(va.hand).toHaveLength(6);
    expect(vb.hand).toHaveLength(6);
    expect(va.partnerCount).toBe(6);
    for (const card of vb.hand) expect(JSON.stringify(va)).not.toContain(`"${card}"`);
    expect(va).not.toHaveProperty("market");
    expect(va.settings.tender).toBe("reshuffle");
    // A client can't play a card it doesn't hold.
    const mover = va.current === a ? a : b;
    const notMine = (mover === a ? vb : va).hand[0];
    expect(await errorOf(service.action(mover, id, { type: "play", payload: { cardId: notMine, turn: va.turn } }))).toBe("illegal_action");
  });

  it("Scrabble: racks stay private; scores come from the server, not the client", async () => {
    const { a, b, id } = await started("scrabble");
    const { view: va } = await service.view(a, id);
    const { view: vb } = await service.view(b, id);
    expect(va.rack).toHaveLength(7);
    expect(va.partnerTiles).toBe(7);
    for (const tile of vb.rack) expect(JSON.stringify(va)).not.toContain(`"${tile.id}"`);
    expect(va).not.toHaveProperty("bag");
    const mover = va.current;
    // A pass with a made-up score: the score field is ignored, and the turn moves on.
    await service.action(mover, id, { type: "pass", payload: { turn: va.turn, score: 999 } });
    const after = await service.view(a, id);
    expect(after.view.scores[mover]).toBe(0);
    expect(after.view.current).not.toBe(mover);
  });

  it("Jigsaw: both partners move pieces; holds and snapping come from the server; other couples are refused", async () => {
    const { a, b, id } = await started("jigsaw_puzzle");
    await service.action(a, id, { type: "configure", payload: { difficulty: "easy" } });
    await service.action(b, id, { type: "start", payload: {} });
    let { view } = await service.view(a, id);
    expect(view.pieces).toHaveLength(12);
    await service.action(a, id, { type: "grab", payload: { piece: 0 } });
    expect(await errorOf(service.action(b, id, { type: "grab", payload: { piece: 0 } }))).toBe("held");
    await service.action(a, id, { type: "drop", payload: { piece: 0, x: 0.1, y: -0.1 } });
    ({ view } = await service.view(b, id));
    expect(view.pieces[0]).toMatchObject({ x: 0, y: 0, placed: true });
    expect(view.progress.placed).toBe(1);
    const outsider = await newUser();
    expect(await errorOf(service.view(outsider, id))).toBe("not_paired");
  });
});
