import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { IMAGE_IDS } from "./images";
import { DIFFICULTIES, drawEdges, tableBounds } from "./shapes";

/**
 * Jigsaw Puzzle — cooperative: both partners solve the same puzzle at once.
 * The server owns the puzzle: piece shapes (tabs), the scramble, every piece's
 * position, which pieces are joined, which are in place, and who is holding
 * what. Clients send intents only:
 *
 *   configure { image?, difficulty? }   before starting (either player)
 *   start {}                            cut and scatter the pieces
 *   grab { piece }                      "I'm moving this" — locks its group for 20 s
 *   drop { piece, x, y }                put the group down with that piece at (x, y)
 *   release { piece }                   let go without moving
 *   restart {}                          back to choosing (the client confirms first)
 *
 * Snapping is decided HERE, never by a client's claim: after a drop, the
 * group snaps into the frame when the piece is within SNAP of its true place
 * (then it's locked in place), or joins a neighbouring piece/group whose
 * relative position matches within SNAP. Two players can't move the same group
 * at once: a group held by one is refused to the other until it's dropped,
 * released, or the hold expires.
 *
 * Done when every piece is in place → outcome "completed" (no winner).
 */
export const SNAP = 0.3;
export const HOLD_MS = 20_000;

const pieceCount = ({ cols, rows }) => cols * rows;
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round = (n) => Math.round(n * 1000) / 1000;

function heldByOther(state, group, playerId, now) {
  const hold = state.holds[group];
  return Boolean(hold && hold.by !== playerId && hold.until > now);
}

/** Moves every piece of `group` by (dx, dy). */
function shift(pieces, members, dx, dy) {
  for (const index of members) pieces[index] = { ...pieces[index], x: round(pieces[index].x + dx), y: round(pieces[index].y + dy) };
}

/**
 * After a drop: frame snap, then neighbour joins (repeated, so one drop can
 * join several groups). Mutates the given copies; returns { joined, placed }.
 */
export function settle(grid, pieces, startGroup) {
  let group = startGroup;
  let joined = 0;
  let placed = false;
  const members = () => pieces.map((p, i) => (p.group === group ? i : -1)).filter((i) => i >= 0);

  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    const mine = members();
    // Into the frame?
    if (!pieces[mine[0]].placed) {
      const close = mine.find((i) => Math.hypot(pieces[i].x - pieces[i].col, pieces[i].y - pieces[i].row) < SNAP);
      if (close !== undefined) {
        for (const i of mine) pieces[i] = { ...pieces[i], x: pieces[i].col, y: pieces[i].row, placed: true };
        placed = true;
        changed = true;
      }
    }
    // Next to a matching neighbour?
    outer: for (const i of members()) {
      const p = pieces[i];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const col = p.col + dc;
        const row = p.row + dr;
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
        const n = row * grid.cols + col;
        const neighbour = pieces[n];
        if (neighbour.group === group) continue;
        const ex = neighbour.x - dc;
        const ey = neighbour.y - dr;
        if (Math.hypot(p.x - ex, p.y - ey) >= SNAP) continue;
        if (pieces[i].placed && neighbour.placed) continue; // both fixed already (shouldn't differ)
        // Align: the group just dropped snaps onto the one lying still.
        const theirs = pieces.map((q, k) => (q.group === neighbour.group ? k : -1)).filter((k) => k >= 0);
        shift(pieces, members(), ex - p.x, ey - p.y);
        const nowPlaced = neighbour.placed || pieces[i].placed;
        const mergedInto = Math.min(group, neighbour.group);
        for (const k of [...members(), ...theirs]) pieces[k] = { ...pieces[k], group: mergedInto, placed: nowPlaced || pieces[k].placed };
        if (nowPlaced) for (const k of [...members()]) pieces[k] = { ...pieces[k], x: pieces[k].col, y: pieces[k].row };
        group = mergedInto;
        joined += 1;
        changed = true;
        break outer;
      }
    }
    if (!changed) break;
  }
  return { group, joined, placed: placed || pieces[members()[0]].placed };
}

function scatter(grid, random) {
  const bounds = tableBounds(grid);
  const pieces = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      let x;
      let y;
      // Never start a piece right on (or next to) its own place.
      do {
        x = round(bounds.minX + random.next() * (bounds.maxX - bounds.minX));
        y = round(bounds.minY + random.next() * (bounds.maxY - bounds.minY));
      } while (Math.hypot(x - col, y - row) < 1.2);
      pieces.push({ col, row, x, y, group: row * grid.cols + col, placed: false });
    }
  }
  return pieces;
}

const rules = {
  setup({ playerIds }) {
    return { phase: "choose", players: [...playerIds], image: "builtin:lagos_sunset", difficulty: "medium", grid: null, edges: null, pieces: [], holds: {}, moves: 0, lastBy: null, completedAt: null };
  },

  validate(state, action, { now }) {
    const { playerId, type } = action;
    const payload = action.payload ?? {};
    if (!state.players.includes(playerId)) return gameError(GAME_ERROR.NOT_A_PLAYER, "You're not in this puzzle.");
    if (state.completedAt) return gameError("game_over", "The puzzle is finished.");
    switch (type) {
      case "configure":
        if (state.phase !== "choose") return gameError("already_started", "The puzzle has started.");
        if (payload.image !== undefined && !IMAGE_IDS.includes(payload.image)) return gameError(GAME_ERROR.MALFORMED_ACTION, "That picture isn't available.");
        if (payload.difficulty !== undefined && !DIFFICULTIES[payload.difficulty]) return gameError(GAME_ERROR.MALFORMED_ACTION, "Choose easy, medium or hard.");
        return null;
      case "start":
        return state.phase === "choose" ? null : gameError("already_started", "The puzzle has started.");
      case "restart":
        return state.phase === "playing" ? null : gameError("already_restarted", "Already choosing a new puzzle.");
      case "grab":
      case "drop":
      case "release": {
        if (state.phase !== "playing") return gameError("not_started", "Start the puzzle first.");
        const piece = state.pieces[payload.piece];
        if (!Number.isInteger(payload.piece) || !piece) return gameError(GAME_ERROR.MALFORMED_ACTION, "That piece doesn't exist.");
        if (piece.placed) return gameError("already_placed", "That piece is already in place.");
        if (heldByOther(state, piece.group, playerId, now)) return gameError("held", "Your partner is moving that piece.");
        if (type === "drop" && (!finite(payload.x) || !finite(payload.y))) return gameError(GAME_ERROR.MALFORMED_ACTION, "Where should it go?");
        return null;
      }
      default:
        return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    }
  },

  apply(state, action, { random, now }) {
    const { playerId, type } = action;
    const payload = action.payload ?? {};
    switch (type) {
      case "configure":
        return { ...state, image: payload.image ?? state.image, difficulty: payload.difficulty ?? state.difficulty };
      case "start": {
        const { cols, rows } = DIFFICULTIES[state.difficulty];
        const grid = { cols, rows };
        return { ...state, phase: "playing", grid, edges: drawEdges(grid, random), pieces: scatter(grid, random), holds: {}, moves: 0, lastBy: playerId };
      }
      case "restart":
        return { ...state, phase: "choose", grid: null, edges: null, pieces: [], holds: {}, moves: 0, lastBy: playerId };
      case "grab": {
        const group = state.pieces[payload.piece].group;
        // One hold per player: grabbing something else lets go of the last thing.
        const holds = Object.fromEntries(Object.entries(state.holds).filter(([, hold]) => hold.by !== playerId && hold.until > now));
        return { ...state, holds: { ...holds, [group]: { by: playerId, until: now + HOLD_MS } } };
      }
      case "release": {
        const holds = { ...state.holds };
        delete holds[state.pieces[payload.piece].group];
        return { ...state, holds };
      }
      case "drop": {
        const pieces = [...state.pieces];
        const moved = pieces[payload.piece];
        const bounds = tableBounds(state.grid);
        const x = clamp(payload.x, bounds.minX, bounds.maxX);
        const y = clamp(payload.y, bounds.minY, bounds.maxY);
        const members = pieces.map((p, i) => (p.group === moved.group ? i : -1)).filter((i) => i >= 0);
        shift(pieces, members, x - moved.x, y - moved.y);
        const { joined, placed } = settle(state.grid, pieces, moved.group);
        const holds = Object.fromEntries(Object.entries(state.holds).filter(([group, hold]) => hold.by !== playerId && hold.until > now && Number(group) !== moved.group));
        const done = pieces.every((p) => p.placed);
        return { ...state, pieces, holds, moves: state.moves + 1, lastBy: playerId, lastDrop: { by: playerId, piece: payload.piece, joined, placed }, completedAt: done ? now : null };
      }
      default:
        return state;
    }
  },

  getResult(state) {
    if (!state.completedAt) return null;
    const count = pieceCount(state.grid);
    return { outcome: "completed", summary: { headline: "Puzzle complete! 🧩", line: `You finished the ${count}-piece puzzle together in ${state.moves} moves.` } };
  },

  view(state, playerId, { now }) {
    const placed = state.pieces.filter((p) => p.placed).length;
    return {
      phase: state.completedAt ? "finished" : state.phase,
      image: state.image,
      difficulty: state.difficulty,
      grid: state.grid,
      edges: state.edges,
      pieces: state.pieces,
      // Live holds only, from this player's point of view.
      holds: Object.fromEntries(Object.entries(state.holds).filter(([, hold]) => hold.until > now).map(([group, hold]) => [group, hold.by === playerId ? "me" : "partner"])),
      progress: { placed, total: state.pieces.length },
      moves: state.moves,
      lastBy: state.lastBy,
      lastDrop: state.lastDrop ?? null,
    };
  },
};

export default rules;
