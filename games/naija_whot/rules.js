import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { DECK, SHAPES, WHOT, cardPoints, parseCard } from "./cards";

/**
 * Naija Whot — two players, server-authoritative, hidden hands. The rules
 * chosen with the couple (docs/game-architecture.md → Naija Whot):
 *
 * Before the deal (phase "settings"), either player can switch Pick Two, Pick
 * Three and Suspension on or off and choose the "tender" (what happens when the
 * market finishes); either player then deals. 6 cards each; the call card is
 * turned from the market (a Whot is turned again, and no special counts at the start).
 *
 * Play: match the call card's shape or number, or play a Whot (20) any time and
 * name the shape. If you can't (or don't want to) play, go to market: draw one
 * and your turn ends.
 *   1  Hold On         you play again
 *   2  Pick Two        (setting) your partner picks 2 — or blocks with a 2,
 *                      which cancels it: nobody picks, and play carries on
 *                      (it's your turn again). Only a 2 blocks a 2.
 *   5  Pick Three      (setting) the same with 3s; only a 5 blocks a 5.
 *   8  Suspension      (setting) your partner misses a turn: you play again
 *   14 General Market  your partner picks 1 from market; you play again
 *   20 Whot            wild; you name the shape your partner must play
 * Picking a penalty uses up the picker's turn, so the turn comes back.
 * A switched-off special is an ordinary card.
 *
 * Check up: playing your last card wins at once — no counting.
 * Tender (setting) — when the market runs out:
 *   "count"     the game ends; hands are counted (stars double, Whot = 20) and
 *               the lower total wins (equal totals are a draw)
 *   "reshuffle" the played cards (except the call card) are shuffled into a
 *               new market and play goes on
 *
 * Authority: the server shuffles (ctx.random), deals, owns the market order
 * and both hands. Clients send intents only:
 *   settings { key, value } · deal {} · play { cardId, shape?, turn } · market { turn }
 * `turn` is the move counter the client has seen; a resend is refused quietly.
 * view() shows a player their own hand and only the COUNT of their partner's.
 */
export const DEAL = 6;
export const DEFAULT_SETTINGS = Object.freeze({ pickTwo: true, pickThree: true, suspension: true, tender: "count" });
const TOGGLES = ["pickTwo", "pickThree", "suspension"];
const TENDERS = ["count", "reshuffle"];

const other = (state, playerId) => state.players.find((id) => id !== playerId);

/** What a played card does under these settings. */
export function effectOf(card, settings) {
  if (card.shape === WHOT) return "whot";
  if (card.number === 1) return "hold_on";
  if (card.number === 2 && settings.pickTwo) return "pick_two";
  if (card.number === 5 && settings.pickThree) return "pick_three";
  if (card.number === 8 && settings.suspension) return "suspension";
  if (card.number === 14) return "general_market";
  return null;
}

/** Can `cardId` be played on the current table? */
export function canPlay(state, cardId) {
  const card = parseCard(cardId);
  if (!card) return false;
  if (state.pending) return card.shape !== WHOT && card.number === state.pending.number; // only a 2 blocks a 2, a 5 a 5
  if (card.shape === WHOT) return true;
  if (state.requestedShape) return card.shape === state.requestedShape;
  const top = parseCard(state.pile.at(-1));
  return card.shape === top.shape || card.number === top.number;
}

/**
 * Draws `count` cards for `playerId`. Returns the new state; when the market
 * runs out under the "count" tender, the state is marked ended.
 */
function drawCards(state, playerId, count, random) {
  let market = [...state.market];
  let pile = [...state.pile];
  const hand = [...state.hands[playerId]];
  let reshuffles = state.reshuffles;
  let exhausted = false;
  for (let i = 0; i < count; i += 1) {
    if (!market.length && state.settings.tender === "reshuffle" && pile.length > 1) {
      market = random.shuffle(pile.slice(0, -1));
      pile = pile.slice(-1);
      reshuffles += 1;
    }
    if (!market.length) {
      exhausted = true;
      break;
    }
    hand.push(market.pop());
  }
  const next = { ...state, market, pile, reshuffles, hands: { ...state.hands, [playerId]: hand } };
  if (!market.length && state.settings.tender === "count") return { ...next, ended: { by: "tender" } };
  // Reshuffle with nothing left to reshuffle (every other card is in a hand):
  // the market is truly finished, so count — otherwise both would pass forever.
  if (exhausted) return { ...next, ended: { by: "tender" } };
  return next;
}

const rules = {
  setup({ playerIds, random }) {
    return {
      phase: "settings",
      players: [...playerIds],
      first: playerIds[random.int(0, 1)],
      settings: { ...DEFAULT_SETTINGS },
      hands: Object.fromEntries(playerIds.map((id) => [id, []])),
      market: [],
      pile: [],
      current: null,
      pending: null, // { number: 2 | 5, count }
      requestedShape: null,
      turn: 0,
      reshuffles: 0,
      last: null, // public description of the last move
      ended: null,
    };
  },

  validate(state, action) {
    const { playerId, type } = action;
    const payload = action.payload ?? {};
    if (!state.players.includes(playerId)) return gameError(GAME_ERROR.NOT_A_PLAYER, "You're not playing this game.");
    if (state.ended) return gameError("game_over", "This game is over.");
    if (type === "settings") {
      if (state.phase !== "settings") return gameError("already_dealt", "The cards are already dealt.");
      if (TOGGLES.includes(payload.key)) return typeof payload.value === "boolean" ? null : gameError(GAME_ERROR.MALFORMED_ACTION, "Turn it on or off.");
      if (payload.key === "tender") return TENDERS.includes(payload.value) ? null : gameError(GAME_ERROR.MALFORMED_ACTION, "Choose count or reshuffle.");
      return gameError(GAME_ERROR.MALFORMED_ACTION, "That setting doesn't exist.");
    }
    if (type === "deal") return state.phase === "settings" ? null : gameError("already_dealt", "The cards are already dealt.");
    if (type !== "play" && type !== "market") return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    if (state.phase !== "playing") return gameError("not_dealt", "Deal the cards first.");
    if (Number.isInteger(payload.turn) && payload.turn !== state.turn) return gameError("already_played", "That move was already made.");
    if (state.current !== playerId) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    if (type === "market") return null;
    const card = parseCard(payload.cardId);
    if (!card) return gameError(GAME_ERROR.MALFORMED_ACTION, "That card doesn't exist.");
    if (!state.hands[playerId].includes(card.id)) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That card isn't in your hand.");
    if (!canPlay(state, card.id)) {
      if (state.pending) return gameError(GAME_ERROR.ILLEGAL_ACTION, state.pending.number === 2 ? "Only a 2 can block a Pick Two — or go to market." : "Only a 5 can block a Pick Three — or go to market.");
      if (state.requestedShape) return gameError(GAME_ERROR.ILLEGAL_ACTION, `They asked for ${state.requestedShape}s — play one or a Whot, or go to market.`);
      return gameError(GAME_ERROR.ILLEGAL_ACTION, "That card doesn't match the shape or number.");
    }
    if (card.shape === WHOT && !SHAPES.includes(payload.shape)) return gameError("choose_shape", "Name the shape you want.");
    return null;
  },

  apply(state, action, { random }) {
    const { playerId, type } = action;
    const payload = action.payload ?? {};
    if (type === "settings") return { ...state, settings: { ...state.settings, [payload.key]: payload.value } };

    if (type === "deal") {
      const deck = random.shuffle(DECK);
      const hands = Object.fromEntries(state.players.map((id) => [id, []]));
      for (let round = 0; round < DEAL; round += 1) for (const id of state.players) hands[id].push(deck.pop());
      // The call card: never a Whot (turned again), and no special counts at the start.
      let callIndex = deck.length - 1;
      while (parseCard(deck[callIndex]).shape === WHOT) callIndex -= 1;
      const [call] = deck.splice(callIndex, 1);
      return { ...state, phase: "playing", hands, market: deck, pile: [call], current: state.first, turn: 1, last: { type: "deal", by: playerId } };
    }

    const opponent = other(state, playerId);
    const turn = state.turn + 1;

    if (type === "market") {
      const count = state.pending?.count ?? 1;
      const drawn = drawCards({ ...state, pending: null }, playerId, count, random);
      const got = drawn.hands[playerId].length - state.hands[playerId].length;
      // Picking (a penalty or a normal market) ends the turn.
      return { ...drawn, current: opponent, turn, last: { type: state.pending ? "pick" : "market", by: playerId, count: got, penalty: Boolean(state.pending) } };
    }

    // play
    const card = parseCard(payload.cardId);
    const hand = state.hands[playerId].filter((id) => id !== card.id);
    let next = { ...state, hands: { ...state.hands, [playerId]: hand }, pile: [...state.pile, card.id], turn, requestedShape: null };
    const effect = effectOf(card, state.settings);
    const last = { type: "play", by: playerId, cardId: card.id, effect };

    if (!hand.length) return { ...next, pending: null, last: { ...last, checkUp: true }, ended: { by: "check_up", winnerId: playerId } };

    switch (effect) {
      case "hold_on":
      case "suspension":
        return { ...next, pending: null, current: playerId, last };
      case "general_market": {
        next = drawCards({ ...next, pending: null }, opponent, 1, random);
        return { ...next, current: playerId, last: { ...last, count: next.hands[opponent].length - state.hands[opponent].length } };
      }
      case "pick_two":
      case "pick_three": {
        // A block cancels the pick: nobody picks, and play carries on.
        if (state.pending) return { ...next, pending: null, current: opponent, last: { ...last, blocked: true } };
        const pending = { number: card.number, count: effect === "pick_two" ? 2 : 3 };
        return { ...next, pending, current: opponent, last: { ...last, pending: pending.count } };
      }
      case "whot":
        return { ...next, pending: null, requestedShape: payload.shape, current: opponent, last: { ...last, shape: payload.shape } };
      default:
        return { ...next, pending: null, current: opponent, last };
    }
  },

  getResult(state) {
    if (!state.ended) return null;
    if (state.ended.by === "check_up") {
      return {
        outcome: "win",
        winnerId: state.ended.winnerId,
        summary: { headline: "Check up! 🃏", reason: "check_up", lines: { winner: "You played your last card first.", loser: "{winner} checked up first." } },
      };
    }
    const totals = Object.fromEntries(state.players.map((id) => [id, state.hands[id].reduce((sum, cardId) => sum + cardPoints(cardId), 0)]));
    const [a, b] = state.players;
    const scores = { [a]: totals[a], [b]: totals[b] };
    if (totals[a] === totals[b]) return { outcome: "draw", scores, summary: { headline: "Tender — it's a tie", reason: "tender", line: `You both counted ${totals[a]}.`, totals } };
    const winnerId = totals[a] < totals[b] ? a : b;
    return {
      outcome: "win",
      winnerId,
      scores,
      summary: { headline: "Tender — cards counted", reason: "tender", totals, lines: { winner: `The market finished and your cards counted lower (${totals[winnerId]} vs ${totals[other(state, winnerId)]}).`, loser: `The market finished; {winner} counted lower (${totals[winnerId]} vs ${totals[other(state, winnerId)]}).` } },
    };
  },

  view(state, playerId) {
    const opponent = other(state, playerId);
    const myHand = state.hands[playerId] ?? [];
    const myTurn = state.phase === "playing" && !state.ended && state.current === playerId;
    const revealed = Boolean(state.ended); // hands are shown when the game ends (counting)
    return {
      phase: state.ended ? "finished" : state.phase,
      settings: state.settings,
      first: state.first,
      current: state.current,
      turn: state.turn,
      hand: myHand,
      playable: myTurn ? myHand.filter((id) => canPlay(state, id)) : [],
      partnerCount: state.hands[opponent]?.length ?? 0,
      partnerHand: revealed ? state.hands[opponent] : null,
      top: state.pile.at(-1) ?? null,
      pileCount: state.pile.length,
      marketCount: state.market.length,
      pending: state.pending,
      requestedShape: state.requestedShape,
      reshuffles: state.reshuffles,
      // Public record of the last move: played cards and how MANY were drawn — never which.
      last: state.last,
      ended: state.ended,
    };
  },
};

export default rules;
