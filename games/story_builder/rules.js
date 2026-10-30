import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { cleanText } from "@/lib/game/text";

/**
 * Story Builder — a conversation game (no winner, no streak): write a story
 * together, one line each. The server picks an opening line (from
 * lib/game/questions/talk.js); you take turns adding the next line. After at
 * least six lines either of you can write "The end" — or it ends by itself at
 * the line limit (16 by default). The whole story shows at the end.
 *
 * Actions: add { text } (2–160 characters, your turn)  end {}  finish {}
 */
export const MAX_LINE = 160;
export const MIN_LINES = 6;
export const DEFAULT_LINES = 16;

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const [opening] = await services.questions.draw({ gameId: "story_builder", coupleId, count: 1, random });
    return { maxLines: Number.isInteger(options.maxLines) ? Math.min(40, Math.max(MIN_LINES, options.maxLines)) : DEFAULT_LINES, opening: { id: opening.id, text: opening.text } };
  },

  setup({ playerIds, options, random }) {
    return {
      opening: options.opening,
      maxLines: options.maxLines,
      lines: [],
      order: [...playerIds],
      current: playerIds[random.int(0, playerIds.length - 1)],
      ended: false,
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.ended) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This story is finished.");
    if (type === "finish") return null;
    if (type === "end") return state.lines.length >= MIN_LINES ? null : gameError(GAME_ERROR.ILLEGAL_ACTION, `Write at least ${MIN_LINES} lines first.`);
    if (type !== "add") return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    if (playerId !== state.current) return gameError(GAME_ERROR.NOT_YOUR_TURN, "Your partner is writing the next line.");
    if (!cleanText(action.payload?.text, MAX_LINE, 2)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Write a line — up to 160 characters.");
    return null;
  },

  apply(state, action) {
    const { type, playerId } = action;
    if (type === "finish" || type === "end") return { ...state, ended: true, endedBy: playerId };
    const lines = [...state.lines, { by: playerId, text: cleanText(action.payload.text, MAX_LINE, 2) }];
    return { ...state, lines, current: state.order.find((id) => id !== playerId), ended: lines.length >= state.maxLines };
  },

  getResult(state) {
    if (!state.ended) return null;
    const n = state.lines.length;
    return { outcome: "completed", summary: { headline: "The end 📖", line: n ? `A ${n + 1}-line story, written together` : "A story for another day", lines: n } };
  },

  view(state) {
    return { opening: state.opening, lines: state.lines, current: state.current, maxLines: state.maxLines, minLines: MIN_LINES, ended: state.ended };
  },
};

export default rules;
