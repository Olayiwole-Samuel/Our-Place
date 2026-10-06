import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { HOME, SEATS, START_SQUARES, YARD, isPieceId, isSafeSquare, pieceIds, seatOfPiece, squareOf } from "./board";

/**
 * Naija Ludo — two players, two dice, server-authoritative. Pure rules run by
 * the server (lib/game/sessions.server.js); clients only send intents:
 *   roll {}                                   the SERVER rolls both dice
 *   move { pieceId, use: "die0"|"die1"|"both" }  which of the rolled dice to spend on which piece
 * Destinations, paths, captures, bonus rolls, turn order and the winner are all
 * computed here. Anything else in a payload (dice values, a destination, a
 * capture, a winner) is ignored.
 *
 * Rules (docs/game-architecture.md → Naija Ludo):
 * - Every roll throws two dice. They are movement resources: spend one die on
 *   a piece, the other on another (split), or both on one piece (combine).
 * - A yard piece comes out only with a 6, onto its start tile. A 6 may instead
 *   move a piece already out — nobody is forced to bring a piece out.
 * - A combined move is two hops (one die, then the other, in whichever order
 *   is legal). Each hop obeys the normal path rules, so a total can't jump a
 *   house, and a yard piece can come out with the 6 and run on with the other die.
 *   Only the final landing kills.
 * - House: two or more pieces of one player on the same track square. The
 *   opponent can neither land on nor pass through it — except a house on its
 *   owner's START tile, which a hop made with a 6 may pass (never land on).
 * - Kill: landing exactly on a lone opponent piece on a non-safe square sends it
 *   back to the yard and earns a bonus roll. Safe squares protect lone pieces.
 * - Home is by exact count (no overshoot); a single die can take a piece home.
 * - Double six (6+6) earns a bonus roll once the dice are used. Bonus rolls
 *   stack: a double six and a kill in the same roll earn two more rolls.
 * - Three double sixes in a row (counted across consecutive rolls of one turn):
 *   the third 6+6 is void and the turn passes at once (Variant A — "the turn is
 *   cancelled"). Moves already made stand; pending bonus rolls are dropped.
 * - Dice that can't legally be used are forfeited automatically; if none can be
 *   used the turn resolves by itself (bonus roll if one is owed, else next player).
 * - The physical "fly" rule (a die leaving the board) can't happen with digital
 *   dice, so there is no random cancelled roll.
 * - First to bring all four pieces home wins.
 *
 * State (server-only; each player gets view()):
 *   { seats, pieces: { A1: progress, … }, current, phase: "awaiting_roll" |
 *     "awaiting_move" | "finished", dice: [{ value, used }, { value, used }] | null,
 *     rolls, moves, turn, doubleSixes, bonus: ["double_six" | "capture"],
 *     extraRoll, lastRoll, lastMove, forfeited, captures: { [playerId]: n }, winnerId }
 */
export const USES = Object.freeze(["die0", "die1", "both"]);
const dieIndexes = { die0: [0], die1: [1], both: [0, 1] };

const seatOf = (state, playerId) => state.seats.indexOf(playerId);
const otherPlayer = (state, playerId) => state.seats.find((id) => id !== playerId);

/** Pieces of `seat` standing on absolute track square `square`. */
export function piecesOn(state, seat, square) {
  return pieceIds(seat).filter((id) => squareOf(seat, state.pieces[id]) === square);
}

/** True when `seat` has a house (2+ pieces) on `square`. */
export const isHouse = (state, seat, square) => piecesOn(state, seat, square).length >= 2;

/**
 * One die's hop for a `seat` piece at progress `from`, or null when illegal.
 * Checks every square passed and the landing square. Returns { to, path }.
 */
export function hop(state, seat, from, value) {
  const opponent = 1 - seat;
  const blockedLanding = (square) => square !== null && isHouse(state, opponent, square);
  if (from === YARD) {
    if (value !== 6) return null;
    return blockedLanding(squareOf(seat, 0)) ? null : { to: 0, path: [0] };
  }
  if (from >= HOME) return null;
  const to = from + value;
  if (to > HOME) return null; // exact count home
  const path = [];
  for (let p = from + 1; p <= to; p += 1) {
    path.push(p);
    const square = squareOf(seat, p);
    if (square === null || !isHouse(state, opponent, square)) continue;
    if (p === to) return null; // never land on a house
    // Passing a house: only a house on its owner's start tile, and only with a 6.
    if (!(square === START_SQUARES[opponent] && value === 6)) return null;
  }
  return { to, path };
}

/** Opponent pieces killed by a `seat` piece landing on progress `to`. */
export function capturesAt(state, seat, to) {
  const square = squareOf(seat, to);
  if (square === null || isSafeSquare(square)) return [];
  const victims = piecesOn(state, 1 - seat, square);
  return victims.length === 1 ? victims : []; // a house can't be landed on (hop() refuses)
}

/**
 * Every legal way the current player can spend the remaining dice:
 * [{ pieceId, use, values, from, to, hops, captures, enters }].
 */
export function getMoveOptions(state, playerId = state.current) {
  if (state.phase !== "awaiting_move" || state.current !== playerId) return [];
  const seat = seatOf(state, playerId);
  const free = state.dice.map((die, i) => (die.used ? null : i)).filter((i) => i !== null);
  const options = [];
  for (const pieceId of pieceIds(seat)) {
    const from = state.pieces[pieceId];
    for (const i of free) {
      const step = hop(state, seat, from, state.dice[i].value);
      if (step) options.push(option(state, seat, pieceId, `die${i}`, [state.dice[i].value], from, step.to, step.path));
    }
    if (free.length === 2) {
      for (const [first, second] of [
        [0, 1],
        [1, 0],
      ]) {
        const a = hop(state, seat, from, state.dice[first].value);
        const b = a && hop(state, seat, a.to, state.dice[second].value);
        if (b) {
          options.push(option(state, seat, pieceId, "both", [state.dice[first].value, state.dice[second].value], from, b.to, [...a.path, ...b.path]));
          break;
        }
      }
    }
  }
  return options;
}

function option(state, seat, pieceId, use, values, from, to, hops) {
  return { pieceId, use, values, from, to, hops, captures: capturesAt(state, seat, to), enters: from === YARD };
}

export const hasWon = (state, playerId) => pieceIds(seatOf(state, playerId)).every((id) => state.pieces[id] >= HOME);

/** No more usable dice: take an owed bonus roll, or pass the turn. */
function endOfDice(state) {
  const [reason, ...rest] = state.bonus;
  if (reason) return { ...state, phase: "awaiting_roll", dice: null, bonus: rest, extraRoll: reason };
  return passTurn(state);
}

function passTurn(state) {
  return {
    ...state,
    phase: "awaiting_roll",
    dice: null,
    current: otherPlayer(state, state.current),
    turn: state.turn + 1,
    doubleSixes: 0,
    bonus: [],
    extraRoll: null,
  };
}

const rules = {
  setup({ playerIds, random }) {
    const pieces = {};
    playerIds.forEach((_, seat) => pieceIds(seat).forEach((id) => (pieces[id] = YARD)));
    return {
      seats: [...playerIds],
      pieces,
      current: playerIds[random.int(0, playerIds.length - 1)],
      phase: "awaiting_roll",
      dice: null,
      rolls: 0,
      moves: 0,
      turn: 1,
      doubleSixes: 0,
      bonus: [],
      extraRoll: null,
      lastRoll: null,
      lastMove: null,
      forfeited: [],
      captures: Object.fromEntries(playerIds.map((id) => [id, 0])),
      winnerId: null,
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");

    if (type === "roll") {
      const last = state.lastRoll;
      // A repeated tap after that roll already resolved the turn by itself.
      if (state.current !== playerId && last?.by === playerId && last.number === state.rolls && last.outcome !== "play") {
        return gameError("already_rolled", "You've already rolled.");
      }
      if (state.current !== playerId) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
      if (state.phase === "awaiting_move") return gameError("already_rolled", "You've already rolled — use your dice.");
      return null;
    }

    if (type === "move") {
      const { pieceId, use } = action.payload ?? {};
      if (!isPieceId(pieceId) || !USES.includes(use)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Choose a piece and dice to use.");
      const diceFree = state.phase === "awaiting_move" && dieIndexes[use].every((i) => !state.dice[i].used);
      // The same move sent twice (a double tap, a retry after a reload).
      const last = state.lastMove;
      if (last?.by === playerId && last.roll === state.rolls && last.pieceId === pieceId && last.use === use && (state.current !== playerId || !diceFree)) {
        return gameError("already_moved", "That move is done.");
      }
      if (state.current !== playerId) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
      if (state.phase !== "awaiting_move") return gameError("roll_first", "Roll the dice first.");
      if (seatOfPiece(pieceId) !== seatOf(state, playerId)) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That's not your piece.");
      if (!diceFree) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That die is already used.");
      if (!getMoveOptions(state, playerId).some((o) => o.pieceId === pieceId && o.use === use)) {
        const total = dieIndexes[use].reduce((sum, i) => sum + state.dice[i].value, 0);
        return gameError(GAME_ERROR.ILLEGAL_ACTION, `That piece can't move ${total}.`);
      }
      return null;
    }

    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action, { random }) {
    const { type, playerId } = action;

    if (type === "roll") {
      const values = [random.int(1, 6), random.int(1, 6)]; // server-side, seeded per session and step
      const doubleSix = values[0] === 6 && values[1] === 6;
      const doubleSixes = doubleSix ? state.doubleSixes + 1 : 0;
      const rolls = state.rolls + 1;
      const lastRoll = { number: rolls, by: playerId, values, doubleSix, doubleSixes, outcome: "play" };
      if (doubleSixes >= 3) {
        // Third double six in a row: the roll is void and the turn is over.
        return passTurn({ ...state, rolls, forfeited: values, lastRoll: { ...lastRoll, outcome: "three_double_sixes" } });
      }
      const rolled = {
        ...state,
        phase: "awaiting_move",
        rolls,
        doubleSixes,
        extraRoll: null,
        forfeited: [],
        bonus: doubleSix ? [...state.bonus, "double_six"] : state.bonus,
        dice: values.map((value) => ({ value, used: false })),
        lastRoll,
      };
      if (getMoveOptions(rolled, playerId).length) return rolled;
      return endOfDice({ ...rolled, forfeited: values, lastRoll: { ...lastRoll, outcome: "no_move" } });
    }

    // move — everything below is computed here, never read from the payload.
    const { pieceId, use } = action.payload;
    const chosen = getMoveOptions(state, playerId).find((o) => o.pieceId === pieceId && o.use === use);
    const pieces = { ...state.pieces, [pieceId]: chosen.to };
    const captured = chosen.captures.map((id) => ({ pieceId: id, from: state.pieces[id] }));
    for (const victim of captured) pieces[victim.pieceId] = YARD;
    const dice = state.dice.map((die, i) => (dieIndexes[use].includes(i) ? { ...die, used: true } : die));
    const moves = state.moves + 1;
    const next = {
      ...state,
      pieces,
      dice,
      moves,
      forfeited: [],
      bonus: captured.length ? [...state.bonus, "capture"] : state.bonus,
      captures: { ...state.captures, [playerId]: state.captures[playerId] + captured.length },
      lastMove: {
        number: moves,
        roll: state.rolls,
        by: playerId,
        pieceId,
        use,
        values: chosen.values,
        from: chosen.from,
        to: chosen.to,
        hops: chosen.hops,
        captured,
        home: chosen.to >= HOME,
        enters: chosen.enters,
      },
    };
    if (hasWon(next, playerId)) return { ...next, phase: "finished", dice: null, bonus: [], winnerId: playerId };
    if (getMoveOptions(next, playerId).length) return next; // dice left to use
    return endOfDice({ ...next, forfeited: dice.filter((die) => !die.used).map((die) => die.value) });
  },

  getResult(state) {
    if (state.phase !== "finished" || !state.winnerId) return null;
    return {
      outcome: "win",
      winnerId: state.winnerId,
      summary: {
        headline: "Home Sweet Home 🏆",
        line: "All four pieces made it home.",
        lines: { winner: "You brought all four pieces home first.", loser: "{winner} brought all four home first." },
        turns: state.turn,
        captures: state.captures,
      },
    };
  },

  /**
   * What a player sees. Ludo has no hidden information, so this is the board
   * plus the server's move options for the current dice (so the client never
   * decides what is legal). Options that are identical (two equal dice) are listed once.
   */
  view(state, playerId) {
    const seen = new Set();
    const options = getMoveOptions(state).filter((o) => {
      const key = `${o.pieceId}:${o.use === "both" ? "both" : o.values[0]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      seats: state.seats.map((id, seat) => ({ playerId: id, seat, letter: SEATS[seat].letter })),
      mySeat: seatOf(state, playerId),
      pieces: { ...state.pieces },
      current: state.current,
      phase: state.phase,
      dice: state.dice ? state.dice.map((die) => ({ ...die })) : null,
      options,
      rolls: state.rolls,
      turn: state.turn,
      doubleSixes: state.doubleSixes,
      bonus: [...state.bonus],
      extraRoll: state.extraRoll,
      lastRoll: state.lastRoll,
      lastMove: state.lastMove,
      forfeited: [...state.forfeited],
      captures: { ...state.captures },
      winnerId: state.winnerId,
    };
  },
};

export default rules;
