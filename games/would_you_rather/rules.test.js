import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import { countsTowardWinStreak } from "@/lib/game/result";
import { validateQuestion } from "@/lib/game/questions/validate";
import { WOULD_YOU_RATHER_QUESTIONS } from "@/lib/game/questions/wouldYouRather";
import rules from "./rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("would_you_rather");
const deck = WOULD_YOU_RATHER_QUESTIONS.slice(0, 3);

function start(rounds = 3) {
  return createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], options: { rounds, questions: deck.slice(0, rounds) }, random: createRandom(1), now: 0 });
}
function act(session, playerId, type, payload = {}) {
  return applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(2), now: 1 });
}
const ok = (result) => {
  expect(result.ok).toBe(true);
  return result.session;
};
const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });

describe("question bank and validation", () => {
  it("every curated question is valid and ids are unique", () => {
    expect(WOULD_YOU_RATHER_QUESTIONS.length).toBeGreaterThanOrEqual(50);
    expect(WOULD_YOU_RATHER_QUESTIONS.every((q) => validateQuestion(q))).toBe(true);
    expect(new Set(WOULD_YOU_RATHER_QUESTIONS.map((q) => q.id)).size).toBe(WOULD_YOU_RATHER_QUESTIONS.length);
  });

  it("rejects malformed, empty, oversized, duplicate-option and markup questions", () => {
    const good = { id: "q-1", optionA: "Tea", optionB: "Coffee" };
    expect(validateQuestion(good)).toMatchObject(good);
    expect(validateQuestion(null)).toBeNull();
    expect(validateQuestion([good])).toBeNull();
    expect(validateQuestion({ ...good, optionB: undefined })).toBeNull();
    expect(validateQuestion({ ...good, optionA: "   " })).toBeNull();
    expect(validateQuestion({ ...good, optionA: "x".repeat(121) })).toBeNull();
    expect(validateQuestion({ ...good, optionB: "tea" })).toBeNull();
    expect(validateQuestion({ ...good, optionA: "<img src=x onerror=alert(1)>" })).toBeNull();
    expect(validateQuestion({ ...good, optionA: 42 })).toBeNull();
    expect(validateQuestion({ ...good, id: "../../etc" })).toBeNull();
    expect(validateQuestion({ ...good, optionA: "  Tea\n time " }).optionA).toBe("Tea time");
  });
});

describe("Would You Rather rules", () => {
  it("starts answering round 1 with the first question; future questions stay hidden", () => {
    const session = start();
    const v = view(session, A);
    expect(v).toMatchObject({ round: 1, rounds: 3, phase: "answering", myAnswer: null, partnerAnswered: false, partnerAnswer: null });
    expect(v.question).toMatchObject({ id: deck[0].id, optionA: deck[0].optionA });
    expect(JSON.stringify(v)).not.toContain(deck[1].id);
  });

  it("keeps each answer private until both have answered, then reveals both together", () => {
    let session = ok(act(start(), A, "answer", { choice: "A" }));
    expect(view(session, B)).toMatchObject({ partnerAnswered: true, partnerAnswer: null, myAnswer: null });
    expect(JSON.stringify(view(session, B))).not.toMatch(/"A"/);
    expect(view(session, A)).toMatchObject({ myAnswer: "A", partnerAnswered: false });
    session = ok(act(session, B, "answer", { choice: "B" }));
    expect(view(session, A)).toMatchObject({ phase: "revealing", myAnswer: "A", partnerAnswer: "B" });
    expect(view(session, B)).toMatchObject({ phase: "revealing", myAnswer: "B", partnerAnswer: "A" });
  });

  it("rejects invalid choices, duplicate answers and answers after the reveal", () => {
    const session = start();
    expect(act(session, A, "answer", { choice: "C" }).error.code).toBe("malformed_action");
    expect(act(session, A, "answer", {}).error.code).toBe("malformed_action");
    const answered = ok(act(session, A, "answer", { choice: "B" }));
    expect(act(answered, A, "answer", { choice: "A" }).error.code).toBe("already_answered"); // locked, idempotent duplicate
    const revealed = ok(act(answered, B, "answer", { choice: "B" }));
    expect(act(revealed, A, "answer", { choice: "A" }).error.code).toBe("round_over");
    expect(act(session, A, "dance").error.code).toBe("malformed_action");
    expect(act(session, "intruder", "answer", { choice: "A" }).error.code).toBe("not_a_player");
  });

  it("moves to the next round only when both tap Next", () => {
    let session = ok(act(ok(act(start(), A, "answer", { choice: "A" })), B, "answer", { choice: "A" }));
    expect(act(session, A, "next").ok).toBe(true);
    session = ok(act(session, A, "next"));
    expect(view(session, A)).toMatchObject({ round: 1, phase: "revealing", myNext: true, partnerNext: false });
    expect(act(session, A, "next").error.code).toBe("already_ready");
    expect(view(session, B).partnerNext).toBe(true);
    session = ok(act(session, B, "next"));
    expect(view(session, A)).toMatchObject({ round: 2, phase: "answering", myAnswer: null, partnerAnswered: false, myNext: false });
    expect(view(session, A).question.id).toBe(deck[1].id);
    expect(act(session, A, "next").error.code).toBe("not_revealed");
  });

  it("finishes after the last round as 'completed' — no winner, no streak", () => {
    let session = start(2);
    for (let round = 0; round < 2; round += 1) {
      session = ok(act(session, A, "answer", { choice: "A" }));
      session = ok(act(session, B, "answer", { choice: round === 0 ? "A" : "B" }));
      session = ok(act(session, A, "next"));
      session = ok(act(session, B, "next"));
    }
    expect(session.status).toBe("completed");
    expect(session.result).toMatchObject({ outcome: "completed", winnerId: null, scores: null, summary: { headline: "That was fun ❤️", rounds: 2 } });
    expect(countsTowardWinStreak(definition, session.result)).toBe(false);
    expect(definition.winStreakEligible).toBe(false);
    expect(act(session, A, "answer", { choice: "A" }).error.code).toBe("session_not_active");
  });

  it("either player can finish early; an unrevealed answer stays private", () => {
    let session = ok(act(start(), A, "answer", { choice: "B" }));
    session = ok(act(session, B, "finish"));
    expect(session.result).toMatchObject({ outcome: "completed", winnerId: null });
    expect(view(session, B).partnerAnswer).toBeNull();
  });
});
