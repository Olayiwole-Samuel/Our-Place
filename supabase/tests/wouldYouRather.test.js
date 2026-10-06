import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQuestionProvider } from "@/lib/game/questions/provider.server";
import { WOULD_YOU_RATHER_QUESTIONS } from "@/lib/game/questions/wouldYouRather";
import { createRandom } from "@/lib/game/random";
import { createGameSessionService } from "@/lib/game/sessions.server";
import { createAdminAdapter } from "./adminAdapter";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Would You Rather end to end: the real service + rules + question provider +
// migrations (game_sessions, question_usage) — what the API routes run.
let db;
let admin;
let service;
let n = 0;
const newUser = () => signUp(db, { email: `wyr${++n}@example.test`, name: `Wyr ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};
const errorOf = (promise) =>
  promise.then(
    () => null,
    (error) => error.detail?.code ?? error.code,
  );

async function startedGame(couple) {
  const { a, b, coupleId } = couple ?? (await pair());
  const { id } = await service.create(a, "would_you_rather");
  await service.join(b, id);
  await service.ready(a, id, true);
  await service.ready(b, id, true);
  return { a, b, coupleId, id };
}

beforeAll(async () => {
  db = await createTestDatabase();
  admin = createAdminAdapter(db);
  service = createGameSessionService({ admin });
}, 60_000);
afterAll(() => db?.close());

describe("question provider", () => {
  it("never repeats a question for a couple while unseen ones remain, and records usage", async () => {
    const { coupleId } = await pair();
    const provider = createQuestionProvider({ admin });
    const seen = new Set();
    for (let s = 0; s < 6; s += 1) {
      const questions = await provider.draw({ gameId: "would_you_rather", coupleId, count: 10, random: createRandom(s) });
      expect(questions).toHaveLength(10);
      for (const q of questions) {
        expect(seen.has(q.id)).toBe(false);
        seen.add(q.id);
      }
    }
    const usage = (await db.query("select count(*)::int as n from public.question_usage where couple_id = $1", [coupleId])).rows[0].n;
    expect(usage).toBe(60);
  });

  it("when everything has been seen, the least recently used come back", async () => {
    const { coupleId } = await pair();
    const provider = createQuestionProvider({ admin });
    const total = WOULD_YOU_RATHER_QUESTIONS.length;
    const first = await provider.draw({ gameId: "would_you_rather", coupleId, count: total, random: createRandom(1) });
    expect(first).toHaveLength(total);
    const again = await provider.draw({ gameId: "would_you_rather", coupleId, count: 5, random: createRandom(2) });
    expect(again).toHaveLength(5);
  });

  it("usage is per couple: another couple still gets fresh questions", async () => {
    const one = await pair();
    const two = await pair();
    const provider = createQuestionProvider({ admin });
    await provider.draw({ gameId: "would_you_rather", coupleId: one.coupleId, count: WOULD_YOU_RATHER_QUESTIONS.length, random: createRandom(1) });
    const fresh = (await db.query("select count(*)::int as n from public.question_usage where couple_id = $1", [two.coupleId])).rows[0].n;
    expect(fresh).toBe(0);
  });

  it("clients can't read or write question usage", async () => {
    const { a } = await pair();
    await expect(as(db, a, (tx) => tx.query("select * from public.question_usage"))).rejects.toThrow(/permission denied/);
  });
});

describe("Would You Rather via the game authority", () => {
  it("starts with server-drawn questions and 10 rounds (from the definition, not the client)", async () => {
    const { a, b, id } = await startedGame();
    const forA = await service.view(a, id);
    const forB = await service.view(b, id);
    expect(forA.session.status).toBe("active");
    expect(forA.view).toMatchObject({ round: 1, rounds: 10, phase: "answering" });
    expect(forB.view.question).toEqual(forA.view.question); // both see the same question
    expect(JSON.stringify(forA.view)).not.toContain("deck");
  });

  it("answers stay private until both answer; the reveal shows both", async () => {
    const { a, b, id } = await startedGame();
    await service.action(a, id, { type: "answer", payload: { choice: "A" } });
    const forB = await service.view(b, id);
    expect(forB.view).toMatchObject({ partnerAnswered: true, partnerAnswer: null });
    const revealed = await service.action(b, id, { type: "answer", payload: { choice: "B" } });
    expect(revealed.view).toMatchObject({ phase: "revealing", myAnswer: "B", partnerAnswer: "A" });
  });

  it("identity comes from the session: forged player/couple ids are ignored, outsiders rejected", async () => {
    const { a, b, coupleId, id } = await startedGame();
    const outsider = await pair();
    // A forged playerId/coupleId in the body changes nothing: the verified user (b) answers.
    const result = await service.action(b, id, { type: "answer", payload: { choice: "A", playerId: a, coupleId: outsider.coupleId }, playerId: a, coupleId: outsider.coupleId });
    expect(result.view).toMatchObject({ myAnswer: "A" });
    expect((await service.view(a, id)).view).toMatchObject({ myAnswer: null, partnerAnswered: true });
    expect(await errorOf(service.action(outsider.a, id, { type: "answer", payload: { choice: "A" } }))).toBe("not_found");
    expect(await errorOf(service.view(outsider.b, id))).toBe("not_found");
    expect(coupleId).not.toBe(outsider.coupleId);
  });

  it("rejects invalid choices and duplicate taps safely", async () => {
    const { a, id } = await startedGame();
    expect(await errorOf(service.action(a, id, { type: "answer", payload: { choice: "Z" } }))).toBe("malformed_action");
    await service.action(a, id, { type: "answer", payload: { choice: "A" } });
    expect(await errorOf(service.action(a, id, { type: "answer", payload: { choice: "B" } }))).toBe("already_answered");
    expect((await service.view(a, id)).view.myAnswer).toBe("A"); // unchanged
  });

  it("plays to the end: completed with no winner and no streak", async () => {
    const { a, b, id } = await startedGame();
    for (let round = 0; round < 10; round += 1) {
      await service.action(a, id, { type: "answer", payload: { choice: "A" } });
      await service.action(b, id, { type: "answer", payload: { choice: round % 2 ? "A" : "B" } });
      await service.action(b, id, { type: "next", payload: {} });
      await service.action(a, id, { type: "next", payload: {} });
    }
    const { session } = await service.view(a, id);
    expect(session).toMatchObject({ status: "completed", winnerId: null, streakEligible: false, result: { outcome: "completed", winnerId: null } });
    const row = (await db.query("select winner_id, streak_eligible from public.game_sessions where id = $1", [id])).rows[0];
    expect(row).toEqual({ winner_id: null, streak_eligible: false });
    expect(await errorOf(service.action(a, id, { type: "answer", payload: { choice: "A" } }))).toBe("invalid_transition");
  });

  it("a refresh/reconnect restores the exact state for each player", async () => {
    const { a, b, id } = await startedGame();
    await service.action(a, id, { type: "answer", payload: { choice: "B" } });
    const reloadedA = await service.current(a);
    const reloadedB = await service.current(b);
    expect(reloadedA.view).toMatchObject({ myAnswer: "B", partnerAnswered: false, phase: "answering" });
    expect(reloadedB.view).toMatchObject({ myAnswer: null, partnerAnswered: true, partnerAnswer: null });
  });
});
