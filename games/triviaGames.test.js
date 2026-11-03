import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { gameAvailability } from "@/lib/game/gating";
import { ABOUT_ME_PROMPTS, BLITZ_CATEGORIES, GENERAL_TRIVIA, GUESS_QUESTIONS, OUR_STORY_PROMPTS, SENTENCE_PROMPTS } from "@/lib/game/questions/trivia";
import { validatePrompt } from "@/lib/game/questions/validate";
import { createRandom } from "@/lib/game/random";
import categoryBlitz, { ROUND_MS } from "./category_blitz/rules";
import coupleTrivia from "./couple_trivia/rules";
import finishTheSentence from "./finish_the_sentence/rules";
import generalTrivia, { QUESTION_MS } from "./general_trivia/rules";
import guessMyAnswer from "./guess_my_answer/rules";
import howWell from "./how_well_do_you_know_me/rules";

/** Every Trivia & Quiz game. */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const other = (id) => (id === A ? B : A);
const BANKS = {
  general_trivia: GENERAL_TRIVIA,
  how_well_do_you_know_me: ABOUT_ME_PROMPTS,
  couple_trivia: OUR_STORY_PROMPTS,
  guess_my_answer: GUESS_QUESTIONS,
  finish_the_sentence: SENTENCE_PROMPTS,
  category_blitz: BLITZ_CATEGORIES,
};
const services = { questions: { draw: async ({ gameId, count }) => BANKS[gameId].slice(0, count) } };

async function harness(gameId, rules, rounds = 2) {
  const definition = gameRegistry.get(gameId);
  const options = { rounds, ...(await rules.prepare({ coupleId: "c", options: { rounds }, random: createRandom(1), services })) };
  let clock = 1_000_000;
  const start = () => createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], options, random: createRandom(1), now: clock });
  const act = (session, playerId, type, payload = {}) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(session.version + 3), now: clock });
  const ok = (result) => {
    expect(result.error ?? null).toBeNull();
    return result.session;
  };
  const code = (result) => result.error?.code;
  const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: clock });
  return { start, act, ok, code, view, options, tick: (ms) => (clock += ms) };
}

it("every Trivia & Quiz game is playable, with valid content", () => {
  for (const definition of gameRegistry.listByCategory("trivia_quiz")) expect(gameAvailability(definition).launchable, definition.id).toBe(true);
  const all = Object.values(BANKS).flat();
  expect(all.every((q) => validatePrompt(q))).toBe(true);
  expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
  expect(GENERAL_TRIVIA.length).toBeGreaterThanOrEqual(100);
  expect(GENERAL_TRIVIA.every((q) => q.options.length === 4 && q.answer === 0)).toBe(true);
  expect(GUESS_QUESTIONS.every((q) => q.options.length === 4)).toBe(true);
  expect(validatePrompt({ id: "x-1", text: "Q?", options: ["same", "SAME"] })).toBeNull();
  expect(validatePrompt({ id: "x-1", text: "Q?", options: ["a", "b"], answer: 5 })).toBeNull();
});

describe("write in secret, reveal together", () => {
  it("Finish the Sentence: secret until both answer; hearts for your partner", async () => {
    const { start, act, ok, code, view } = await harness("finish_the_sentence", finishTheSentence);
    let s = start();
    s = ok(act(s, A, "answer", { text: "you laughed" }));
    expect(view(s, B)).toMatchObject({ partnerAnswered: true, partnerAnswer: null });
    expect(code(act(s, A, "answer", { text: "again" }))).toBe("already_answered");
    s = ok(act(s, B, "answer", { text: "you sang" }));
    expect(view(s, B)).toMatchObject({ phase: "revealing", partnerAnswer: "you laughed" });
    s = ok(act(s, B, "heart"));
    expect(s.state.scores[A]).toBe(1);
    expect(view(s, A).partnerHeart).toBe(true);
    s = ok(act(s, A, "next"));
    s = ok(act(s, B, "next"));
    expect(s.state.round).toBe(2);
    s = ok(act(s, A, "finish"));
    expect(s.result).toMatchObject({ outcome: "completed", summary: { rounds: 1 } });
  });

  it("Couple Trivia: either of you marks a match; next waits for that", async () => {
    const { start, act, ok, code } = await harness("couple_trivia", coupleTrivia);
    let s = start();
    s = ok(act(s, A, "answer", { text: "Lagos" }));
    s = ok(act(s, B, "answer", { text: "lagos" }));
    expect(code(act(s, A, "next"))).toBe("illegal_action");
    expect(code(act(s, A, "heart"))).toBe("malformed_action");
    s = ok(act(s, B, "match", { same: true }));
    expect(code(act(s, A, "match", { same: false }))).toBe("already_marked");
    expect(s.state.matched).toBe(1);
    s = ok(act(s, A, "next"));
    s = ok(act(s, B, "next"));
    s = ok(act(s, A, "answer", { text: "x" }));
    s = ok(act(s, B, "answer", { text: "y" }));
    s = ok(act(s, A, "match", { same: false }));
    s = ok(act(s, A, "next"));
    s = ok(act(s, B, "next"));
    expect(s.result).toMatchObject({ outcome: "completed", summary: { rounds: 2, matched: 1 } });
  });

  it("How Well Do You Know Me: only the subject says if the guess counts; roles swap", async () => {
    const { start, act, ok, code } = await harness("how_well_do_you_know_me", howWell);
    let s = start();
    const subject = s.state.subject;
    const guesser = other(subject);
    s = ok(act(s, subject, "answer", { text: "Egusi" }));
    s = ok(act(s, guesser, "answer", { text: "Egusi soup" }));
    expect(code(act(s, guesser, "match", { same: true }))).toBe("not_your_turn");
    s = ok(act(s, subject, "match", { same: true }));
    expect(s.state.scores[guesser]).toBe(1);
    s = ok(act(s, A, "next"));
    s = ok(act(s, B, "next"));
    expect(s.state.subject).toBe(guesser);
  });
});

describe("Guess My Answer", () => {
  it("keeps picks secret, scores a right prediction, swaps roles", async () => {
    const { start, act, ok, code, view } = await harness("guess_my_answer", guessMyAnswer);
    let s = start();
    const subject = s.state.subject;
    const guesser = other(subject);
    expect(code(act(s, subject, "choose", { index: 9 }))).toBe("malformed_action");
    s = ok(act(s, subject, "choose", { index: 2 }));
    expect(view(s, guesser)).toMatchObject({ partnerChose: true, partnerChoice: null });
    s = ok(act(s, guesser, "choose", { index: 2 }));
    expect(s.state.scores[guesser]).toBe(1);
    expect(view(s, guesser).partnerChoice).toBe(2);
    s = ok(act(s, A, "next"));
    s = ok(act(s, B, "next"));
    expect(s.state.subject).toBe(guesser);
  });
});

describe("General Trivia", () => {
  it("hides the answer, gives +5 to the first right answer, and the most points wins", async () => {
    const { start, act, ok, code, view, tick, options } = await harness("general_trivia", generalTrivia, 2);
    let s = start();
    expect(view(s, A).answer).toBeNull();
    expect(JSON.stringify(view(s, A).question)).not.toContain('"answer"');
    const right = options.questions[0].answer;
    const wrong = (right + 1) % 4;
    tick(1000);
    s = ok(act(s, A, "answer", { index: right }));
    expect(view(s, B)).toMatchObject({ partnerAnswered: true, partnerAnswer: null });
    tick(1000);
    s = ok(act(s, B, "answer", { index: right }));
    expect(s.state.phase).toBe("reveal");
    expect(s.state.scores).toEqual({ [A]: 15, [B]: 10 }); // A was first
    expect(view(s, B)).toMatchObject({ answer: right, partnerAnswer: right });
    s = ok(act(s, B, "next"));
    // Question 2: only B answers (wrong); time runs out.
    expect(code(act(s, A, "time_up"))).toBe("already_not_yet");
    const right2 = options.questions[1].answer;
    s = ok(act(s, B, "answer", { index: (right2 + 1) % 4 }));
    tick(QUESTION_MS + 1500);
    expect(code(act(s, A, "answer", { index: right2 }))).toBe("already_timed_out");
    s = ok(act(s, A, "time_up"));
    expect(s.state.phase).toBe("reveal");
    expect(s.state.gained).toEqual({ [A]: 0, [B]: 0 });
    expect(wrong).not.toBe(right);
    s = ok(act(s, A, "next"));
    expect(s.result).toMatchObject({ outcome: "win", winnerId: A, scores: { [A]: 15, [B]: 10 } });
  });

  it("shuffles the options so the right one isn't always first", async () => {
    const { options } = await harness("general_trivia", generalTrivia, 10);
    expect(new Set(options.questions.map((q) => q.answer)).size).toBeGreaterThan(1);
    for (const q of options.questions) {
      const original = GENERAL_TRIVIA.find((g) => g.id === q.id);
      expect(q.options[q.answer]).toBe(original.options[0]);
    }
  });
});

describe("Category Blitz", () => {
  it("hides the lists while you play; strikes count; most standing wins", async () => {
    const { start, act, ok, code, view, tick } = await harness("category_blitz", categoryBlitz, 1);
    let s = start();
    s = ok(act(s, A, "add", { word: "Jollof" }));
    expect(code(act(s, A, "add", { word: " jollof! " }))).toBe("illegal_action"); // the same answer
    s = ok(act(s, A, "add", { word: "Suya" }));
    s = ok(act(s, B, "add", { word: "Amala" }));
    expect(view(s, B)).toMatchObject({ theirs: null, theirCount: 2 });
    expect(code(act(s, A, "time_up"))).toBe("already_not_yet");
    tick(ROUND_MS + 1500);
    expect(code(act(s, A, "add", { word: "Late" }))).toBe("already_time_up");
    s = ok(act(s, B, "time_up"));
    expect(view(s, B).theirs.map((e) => e.word)).toEqual(["Jollof", "Suya"]);
    s = ok(act(s, B, "strike", { index: 1 }));
    expect(s.state.words[A][1].struck).toBe(true);
    s = ok(act(s, B, "strike", { index: 1 })); // changed their mind
    s = ok(act(s, A, "strike", { index: 0 })); // Amala struck
    s = ok(act(s, A, "done"));
    expect(code(act(s, A, "strike", { index: 0 }))).toBe("illegal_action");
    s = ok(act(s, B, "done"));
    expect(s.result).toMatchObject({ outcome: "win", winnerId: A, scores: { [A]: 2, [B]: 0 } });
  });
});
