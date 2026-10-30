import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { gameAvailability } from "@/lib/game/gating";
import { DAILY_QUESTIONS, STORY_STARTERS, THIS_OR_THAT_QUESTIONS } from "@/lib/game/questions/talk";
import { validatePrompt, validateQuestion } from "@/lib/game/questions/validate";
import { createRandom } from "@/lib/game/random";
import { GAME_CATEGORIES } from "@/lib/game/categories";
import dailyQuestion, { lagosDay, questionsFor } from "./daily_question/rules";
import storyBuilder from "./story_builder/rules";
import thisOrThat from "./this_or_that/rules";
import twoTruths from "./two_truths_and_a_lie/rules";

/** The rest of Talk & Party: Two Truths and a Lie, Daily Question, This or That, Story Builder. */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const other = (id) => (id === A ? B : A);
const services = {
  questions: { draw: async ({ gameId, count }) => ({ this_or_that: THIS_OR_THAT_QUESTIONS, story_builder: STORY_STARTERS })[gameId].slice(0, count) },
};

function harness(gameId, rules, options = {}) {
  const definition = gameRegistry.get(gameId);
  const start = () => createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], options, random: createRandom(1), now: 0 });
  const act = (session, playerId, type, payload = {}) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(session.version + 5), now: 1 });
  const ok = (result) => {
    expect(result.error ?? null).toBeNull();
    return result.session;
  };
  const code = (result) => result.error?.code;
  const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });
  return { start, act, ok, code, view };
}

it("every Talk & Party game is playable, with valid content", () => {
  expect(GAME_CATEGORIES.some((c) => c.id === "talk_party")).toBe(true);
  for (const definition of gameRegistry.listByCategory("talk_party")) expect(gameAvailability(definition).launchable, definition.id).toBe(true);
  expect([...DAILY_QUESTIONS, ...STORY_STARTERS].every((p) => validatePrompt(p))).toBe(true);
  expect(THIS_OR_THAT_QUESTIONS.every((q) => validateQuestion(q))).toBe(true);
  const ids = [...DAILY_QUESTIONS, ...STORY_STARTERS, ...THIS_OR_THAT_QUESTIONS].map((q) => q.id);
  expect(new Set(ids).size).toBe(ids.length);
});

describe("Two Truths and a Lie", () => {
  const { start, act, ok, code, view } = harness("two_truths_and_a_lie", twoTruths, { rounds: 2 });

  it("hides the lie from the guesser until the reveal", () => {
    let session = start();
    const teller = session.state.teller;
    const guesser = other(teller);
    expect(code(act(session, guesser, "write", { statements: ["a1", "b2", "c3"], lie: 0 }))).toBe("not_your_turn");
    expect(code(act(session, teller, "write", { statements: ["only two", "here"], lie: 0 }))).toBe("malformed_action");
    session = ok(act(session, teller, "write", { statements: ["I've been to Ghana", "I can't swim", "I hate jollof"], lie: 2 }));
    expect(view(session, guesser).lie).toBeNull();
    expect(view(session, guesser).statements).toHaveLength(3);
    const lie = view(session, teller).statements.indexOf("I hate jollof");
    expect(view(session, teller).lie).toBe(lie);
    session = ok(act(session, guesser, "guess", { index: lie }));
    expect(view(session, guesser)).toMatchObject({ lie, phase: "reveal" });
    expect(session.state.caught[guesser]).toBe(1);
    session = ok(act(session, teller, "next"));
    expect(session.state.teller).toBe(guesser);
    session = ok(act(session, guesser, "write", { statements: ["one", "two", "three"], lie: 1 }));
    const wrong = (session.state.lie + 1) % 3;
    session = ok(act(session, teller, "guess", { index: wrong }));
    expect(session.state.fooled[guesser]).toBe(1);
    session = ok(act(session, teller, "next"));
    expect(session.result).toMatchObject({ outcome: "completed", summary: { rounds: 2, spotted: 1 } });
  });
});

describe("Daily Question", () => {
  it("is the same question all day for a couple, and changes the next day", () => {
    const noon = Date.UTC(2026, 9, 30, 11);
    expect(lagosDay(noon)).toBe("2026-10-30");
    expect(lagosDay(Date.UTC(2026, 9, 30, 23, 30))).toBe("2026-10-31"); // 00:30 in Lagos
    expect(questionsFor("couple", "2026-10-30")).toEqual(questionsFor("couple", "2026-10-30"));
    expect(questionsFor("couple", "2026-10-30")[0]).not.toEqual(questionsFor("couple", "2026-10-31")[0]);
    expect(new Set(questionsFor("couple", "2026-10-30").map((q) => q.id)).size).toBe(3);
  });

  it("keeps answers secret until you've both answered; bonus questions after", async () => {
    const options = await dailyQuestion.prepare({ coupleId: "c" });
    const { start, act, ok, code, view } = harness("daily_question", dailyQuestion, options);
    let session = start();
    session = ok(act(session, A, "answer", { text: "  Your laugh  " }));
    expect(view(session, B)).toMatchObject({ partnerAnswered: true, partnerAnswer: null });
    expect(code(act(session, A, "answer", { text: "again" }))).toBe("already_answered");
    expect(code(act(session, B, "answer", { text: "x".repeat(281) }))).toBe("malformed_action");
    session = ok(act(session, B, "answer", { text: "Your voice notes" }));
    expect(view(session, B)).toMatchObject({ partnerAnswer: "Your laugh", phase: "revealing" });
    session = ok(act(session, A, "more"));
    expect(view(session, A).question.id).toBe(options.questions[1].id);
    session = ok(act(session, B, "finish"));
    expect(session.result).toMatchObject({ outcome: "completed", summary: { answered: 1 } });
  });
});

describe("This or That", () => {
  it("moves on as soon as you've both picked and reveals the last pair", async () => {
    const options = { rounds: 2, ...(await thisOrThat.prepare({ coupleId: "c", options: { rounds: 2 }, random: createRandom(1), services })) };
    const { start, act, ok, code, view } = harness("this_or_that", thisOrThat, options);
    let session = start();
    session = ok(act(session, A, "pick", { choice: "A" }));
    expect(view(session, B)).toMatchObject({ partnerPicked: true, last: null });
    expect(code(act(session, A, "pick", { choice: "B" }))).toBe("already_answered");
    session = ok(act(session, B, "pick", { choice: "A" }));
    expect(view(session, B)).toMatchObject({ round: 2, myPick: null, last: { mine: "A", theirs: "A" }, matched: 1 });
    session = ok(act(session, A, "pick", { choice: "A" }));
    session = ok(act(session, B, "pick", { choice: "B" }));
    expect(session.result).toMatchObject({ outcome: "completed", summary: { rounds: 2, matched: 1 } });
  });
});

describe("Story Builder", () => {
  it("takes turns line by line; The end after six lines", async () => {
    const options = await storyBuilder.prepare({ coupleId: "c", options: { maxLines: 8 }, random: createRandom(1), services });
    const { start, act, ok, code, view } = harness("story_builder", storyBuilder, options);
    let session = start();
    expect(view(session, A).opening).toEqual({ id: STORY_STARTERS[0].id, text: STORY_STARTERS[0].text });
    let writer = session.state.current;
    expect(code(act(session, other(writer), "add", { text: "Not my turn" }))).toBe("not_your_turn");
    expect(code(act(session, writer, "end"))).toBe("illegal_action"); // too short yet
    for (let i = 0; i < 6; i++) {
      session = ok(act(session, writer, "add", { text: `Line ${i + 1}` }));
      writer = other(writer);
    }
    expect(view(session, A).lines.map((l) => l.text)).toEqual(["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6"]);
    session = ok(act(session, A, "end"));
    expect(session.result).toMatchObject({ outcome: "completed", summary: { lines: 6 } });
  });
});
