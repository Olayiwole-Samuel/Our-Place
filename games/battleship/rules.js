import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Battleship — each of you hides a fleet on a 10×10 sea, then you take turns
 * firing at each other's sea. Sink every ship of your partner's to win.
 * Pure rules run by the server; hidden information: your view never contains
 * where your partner's ships are — only your own shots' hits and misses, and a
 * ship's squares once you've sunk it.
 *
 *   placing  the server lays out each fleet at random (ships never touch);
 *            `shuffle` lays yours out again, `ready` locks it in. When you're
 *            both ready, the battle starts (the first shooter is drawn).
 *   firing   `fire { cell }` (0–99) on your turn: hit, miss or sunk, then it's
 *            your partner's turn.
 *
 * Fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.
 * State: { phase, fleets: { [playerId]: [{ id, name, cells }] }, shots: { [shooter]: { [cell]: "hit"|"miss" } },
 *          ready, order, current, last, winner, resigned }
 */
export const SIZE = 10;
export const SHIPS = Object.freeze([
  { id: "carrier", name: "Carrier", length: 5 },
  { id: "battleship", name: "Battleship", length: 4 },
  { id: "cruiser", name: "Cruiser", length: 3 },
  { id: "submarine", name: "Submarine", length: 3 },
  { id: "destroyer", name: "Destroyer", length: 2 },
]);
const FLEET_CELLS = SHIPS.reduce((n, s) => n + s.length, 0);

/** A random fleet: straight ships, inside the sea, never overlapping or touching. */
export function randomFleet(random) {
  for (;;) {
    const taken = new Set();
    const near = new Set();
    const fleet = [];
    let ok = true;
    for (const ship of SHIPS) {
      let placed = null;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const across = random.next() < 0.5;
        const row = random.int(0, across ? SIZE - 1 : SIZE - ship.length);
        const col = random.int(0, across ? SIZE - ship.length : SIZE - 1);
        const cells = Array.from({ length: ship.length }, (_, i) => (across ? row * SIZE + col + i : (row + i) * SIZE + col));
        if (cells.every((c) => !near.has(c))) placed = cells;
      }
      if (!placed) {
        ok = false;
        break;
      }
      for (const c of placed) {
        taken.add(c);
        const r = Math.floor(c / SIZE);
        const k = c % SIZE;
        for (let dr = -1; dr <= 1; dr++) for (let dk = -1; dk <= 1; dk++) if (r + dr >= 0 && r + dr < SIZE && k + dk >= 0 && k + dk < SIZE) near.add((r + dr) * SIZE + k + dk);
      }
      fleet.push({ id: ship.id, name: ship.name, cells: placed });
    }
    if (ok) return fleet;
  }
}

const opponentOf = (state, playerId) => state.order.find((id) => id !== playerId);
const isSunk = (ship, shots) => ship.cells.every((c) => shots[c] === "hit");
const hitsOn = (shots) => Object.values(shots).filter((s) => s === "hit").length;

const rules = {
  setup({ playerIds, random }) {
    return {
      phase: "placing",
      fleets: Object.fromEntries(playerIds.map((id) => [id, randomFleet(random)])),
      shots: Object.fromEntries(playerIds.map((id) => [id, {}])),
      ready: [],
      order: [...playerIds],
      current: null,
      last: null,
      winner: null,
      resigned: null,
      turns: 0,
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.winner) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "resign") return null;
    if (type === "shuffle" || type === "ready") {
      if (state.phase !== "placing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "The battle has already started.");
      if (state.ready.includes(playerId)) return gameError(GAME_ERROR.ILLEGAL_ACTION, "Your fleet is locked in.");
      return null;
    }
    if (type !== "fire") return gameError(GAME_ERROR.MALFORMED_ACTION, "That move wasn't understood.");
    if (state.phase !== "firing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "Get your fleet ready first.");
    if (state.current !== playerId) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    const cell = action.payload?.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE) return gameError(GAME_ERROR.MALFORMED_ACTION, "That square doesn't exist.");
    if (state.shots[playerId][cell]) return gameError(GAME_ERROR.ILLEGAL_ACTION, "You've already fired there.");
    return null;
  },

  apply(state, action, ctx) {
    const { type, playerId } = action;
    if (type === "resign") return { ...state, winner: opponentOf(state, playerId), resigned: playerId };
    if (type === "shuffle") return { ...state, fleets: { ...state.fleets, [playerId]: randomFleet(ctx.random) } };
    if (type === "ready") {
      const ready = [...state.ready, playerId];
      if (ready.length < state.order.length) return { ...state, ready };
      return { ...state, ready, phase: "firing", current: state.order[ctx.random.int(0, state.order.length - 1)] };
    }
    // fire
    const { cell } = action.payload;
    const target = opponentOf(state, playerId);
    const ship = state.fleets[target].find((s) => s.cells.includes(cell));
    const shots = { ...state.shots[playerId], [cell]: ship ? "hit" : "miss" };
    const sunk = ship && isSunk(ship, shots) ? ship.name : null;
    const allShots = { ...state.shots, [playerId]: shots };
    const last = { by: playerId, cell, hit: Boolean(ship), sunk };
    if (hitsOn(shots) === FLEET_CELLS) return { ...state, shots: allShots, last, winner: playerId, turns: state.turns + 1 };
    return { ...state, shots: allShots, last, current: target, turns: state.turns + 1 };
  },

  getResult(state) {
    if (!state.winner) return null;
    const scores = Object.fromEntries(state.order.map((id) => [id, hitsOn(state.shots[id])]));
    return { outcome: "win", winnerId: state.winner, scores, summary: { resigned: state.resigned } };
  },

  view(state, playerId) {
    const partner = opponentOf(state, playerId);
    const myShots = state.shots[playerId];
    const theirShots = state.shots[partner];
    const theirFleet = state.fleets[partner];
    const over = Boolean(state.winner);
    return {
      phase: state.phase,
      current: state.current,
      ready: state.ready,
      myFleet: state.fleets[playerId].map((ship) => ({ ...ship, sunk: isSunk(ship, theirShots) })),
      theirShots, // where your partner has fired on your sea
      myShots, // where you've fired on theirs
      // Their ships stay secret — except the ones you've sunk (and all of them when the game is over).
      sunkShips: theirFleet.filter((ship) => over || isSunk(ship, myShots)).map((ship) => ({ ...ship, sunk: isSunk(ship, myShots) })),
      afloat: { mine: state.fleets[playerId].filter((s) => !isSunk(s, theirShots)).length, theirs: theirFleet.filter((s) => !isSunk(s, myShots)).length },
      last: state.last,
      turns: state.turns,
      ended: over,
    };
  },
};

export default rules;
