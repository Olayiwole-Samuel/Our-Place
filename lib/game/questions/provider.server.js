import "server-only";
import { NEVER_HAVE_I_EVER } from "./neverHaveIEver";
import { STORY_STARTERS, THIS_OR_THAT_QUESTIONS } from "./talk";
import { DARE_PROMPTS, ROULETTE_PROMPTS, SPICY_WYR_QUESTIONS, TRUTH_PROMPTS } from "./spicy";
import { validatePrompt, validateQuestion } from "./validate";
import { WOULD_YOU_RATHER_QUESTIONS } from "./wouldYouRather";

/**
 * Question provider — where conversation games get their prompts. Server-only.
 *
 *   draw({ gameId, coupleId, count, random }) → validated questions
 *
 * Order of sources (the extension point for AI generation):
 *   1. curated bank for the game (lib/game/questions/*), questions this couple
 *      hasn't been given yet (public.question_usage), in server-random order
 *   2. [future] an AI generator (Gemini, server-side only) when the unseen bank
 *      runs low — it must return structured { optionA, optionB }, pass
 *      validateQuestion, be stored, and only then be returned
 *   3. when everything has been seen, the least-recently used come back first
 *
 * Every question is validated before it's returned. The client never supplies
 * questions or prompts. If usage tracking is unavailable (e.g. the migration
 * isn't applied yet), questions are still served — just without cross-session
 * de-duplication — and the reason is reported once in the server log.
 */
const BANKS = {
  would_you_rather: WOULD_YOU_RATHER_QUESTIONS,
  never_have_i_ever: NEVER_HAVE_I_EVER,
  this_or_that: THIS_OR_THAT_QUESTIONS,
  story_builder: STORY_STARTERS,
  // 18+ (only reachable once both of you have opted in — lib/game/gating.js)
  would_you_rather_spicy: SPICY_WYR_QUESTIONS,
  truth_or_dare_truth: TRUTH_PROMPTS,
  truth_or_dare_dare: DARE_PROMPTS,
  ...Object.fromEntries(Object.entries(ROULETTE_PROMPTS).map(([level, prompts]) => [`question_roulette_${level}`, prompts])),
};

/** Two-option questions ({ optionA, optionB }) or single prompts ({ text }). */
const validate = (raw) => (raw && typeof raw === "object" && "text" in raw ? validatePrompt(raw) : validateQuestion(raw));

export class QuestionsUnavailableError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "QuestionsUnavailableError";
  }
}

let warnedNoUsage = false;

export function createQuestionProvider({ admin, generators = {} }) {
  async function seen(gameId, coupleId) {
    const { data, error } = await admin.from("question_usage").select("question_id, used_at").eq("couple_id", coupleId).eq("game_id", gameId);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.question_id, Date.parse(row.used_at) || 0]));
  }

  async function record(gameId, coupleId, ids) {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("question_usage")
      .upsert(ids.map((questionId) => ({ couple_id: coupleId, game_id: gameId, question_id: questionId, used_at: now })), { onConflict: "couple_id,game_id,question_id" });
    if (error) throw error;
  }

  return {
    async draw({ gameId, coupleId, count, random }) {
      const bank = (BANKS[gameId] ?? []).map(validate).filter(Boolean);
      let usage = null;
      try {
        usage = await seen(gameId, coupleId);
      } catch (error) {
        if (!warnedNoUsage) {
          warnedNoUsage = true;
          console.warn("[our-place] question_usage unavailable; serving questions without de-duplication:", error?.message);
        }
      }
      const unseen = random.shuffle(bank.filter((q) => !usage?.has(q.id)));
      let picked = unseen.slice(0, count);

      if (picked.length < count && generators[gameId]) {
        // Future: AI top-up. Generated content is validated like everything else.
        const generated = (await generators[gameId]({ count: count - picked.length, avoid: picked.map((q) => q.id) })).map(validate).filter(Boolean);
        picked = [...picked, ...generated].slice(0, count);
      }
      if (picked.length < count) {
        const pickedIds = new Set(picked.map((q) => q.id));
        const leastRecent = bank.filter((q) => !pickedIds.has(q.id)).sort((a, b) => (usage?.get(a.id) ?? 0) - (usage?.get(b.id) ?? 0));
        picked = [...picked, ...leastRecent].slice(0, count);
      }
      if (picked.length === 0) throw new QuestionsUnavailableError("no_questions");

      if (usage) {
        try {
          await record(gameId, coupleId, picked.map((q) => q.id));
        } catch (error) {
          console.warn("[our-place] couldn't record question usage:", error?.message);
        }
      }
      return picked;
    },
  };
}
