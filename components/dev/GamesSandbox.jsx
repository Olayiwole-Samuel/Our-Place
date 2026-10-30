"use client";

import { LazyMotion, domAnimation } from "motion/react";
import { useEffect, useState } from "react";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import { DARE_PROMPTS, ROULETTE_PROMPTS, SPICY_WYR_QUESTIONS, TRUTH_PROMPTS } from "@/lib/game/questions/spicy";
import { NEVER_HAVE_I_EVER } from "@/lib/game/questions/neverHaveIEver";
import { STORY_STARTERS, THIS_OR_THAT_QUESTIONS } from "@/lib/game/questions/talk";
import { WOULD_YOU_RATHER_QUESTIONS } from "@/lib/game/questions/wouldYouRather";

/**
 * DEVELOPMENT ONLY — any game on its real rules, both seats played on this
 * screen (/dev/games?game=connect_4). You play whoever's turn it is; ?seat=b
 * shows the board from the second player's side. Conversation games get their
 * questions from the curated banks, like the server's provider.
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const BANKS = {
  would_you_rather: WOULD_YOU_RATHER_QUESTIONS,
  never_have_i_ever: NEVER_HAVE_I_EVER,
  this_or_that: THIS_OR_THAT_QUESTIONS,
  story_builder: STORY_STARTERS,
  would_you_rather_spicy: SPICY_WYR_QUESTIONS,
  truth_or_dare_truth: TRUTH_PROMPTS,
  truth_or_dare_dare: DARE_PROMPTS,
  ...Object.fromEntries(Object.entries(ROULETTE_PROMPTS).map(([level, list]) => [`question_roulette_${level}`, list])),
};
const services = { questions: { draw: async ({ gameId, count, random }) => random.shuffle(BANKS[gameId]).slice(0, count) } };

/** Whose move it is, for the games here (else the chosen seat). */
function actorOf(state, fallback) {
  if (state.turn?.order) return state.turn.order[state.turn.index];
  if (typeof state.turn === "string" && state.sides) return Object.keys(state.sides).find((id) => state.sides[id] === state.turn);
  return state.current ?? fallback;
}

export function GamesSandbox() {
  const [params] = useState(() => new URLSearchParams(typeof location === "undefined" ? "" : location.search));
  const gameId = params.get("game") ?? "connect_4";
  const seat = params.get("seat") === "b" ? B : A;
  const definition = gameRegistry.get(gameId);
  const [loaded, setLoaded] = useState(null); // { rules, Client }
  const [session, setSession] = useState(null);
  const [follow, setFollow] = useState(params.get("follow") !== "0");

  useEffect(() => {
    let live = true;
    Promise.all([definition.loadRules(), definition.loadClient()]).then(async ([rulesModule, clientModule]) => {
      const rules = rulesModule.default;
      const seed = Number(params.get("seed") ?? 7);
      let options = definition.sessionDefaults ?? {};
      if (rules.prepare) options = { ...options, ...(await rules.prepare({ coupleId: "c", playerIds: [A, B], options, random: createRandom(seed), services })) };
      if (!live) return;
      setLoaded({ rules, Client: clientModule.default });
      setSession(createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], options, random: createRandom(seed), now: 0 }));
    });
    return () => {
      live = false;
    };
  }, [definition, params]);

  if (!loaded || !session) return <main className="min-h-dvh bg-black-950 p-4 text-white">Loading…</main>;
  const { rules, Client } = loaded;
  const viewer = follow ? (actorOf(session.state, seat) ?? seat) : seat;
  const partner = viewer === A ? B : A;
  const view = getPlayerView(session, viewer, { rules, random: createRandom(9), now: Date.now() });
  const act = async (type, payload) => {
    const result = applyPlayerAction(session, { type, payload, playerId: viewer }, { definition, rules, random: createRandom(session.version + 11), now: Date.now() });
    if (result.error) console.warn("[sandbox]", result.error);
    else setSession(result.session);
    return result;
  };
  const otherAct = (type, payload) => {
    const result = applyPlayerAction(session, { type, payload, playerId: partner }, { definition, rules, random: createRandom(session.version + 11), now: Date.now() });
    if (!result.error) setSession(result.session);
  };
  if (typeof window !== "undefined") window.__sandbox = { session, otherAct, A, B };

  return (
    <LazyMotion features={domAnimation} strict>
      <main className="min-h-dvh bg-black-950 p-4 text-white" data-sandbox>
        <p className="mb-2 text-xs text-text-muted">
          {definition.name} · viewing as {viewer === A ? "A" : "B"} ·{" "}
          <label>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow the turn
          </label>{" "}
          · {session.status}
          {session.result ? ` · ${session.result.outcome}${session.result.winnerId ? ` (${session.result.winnerId === A ? "A" : "B"})` : ""}` : ""}
        </p>
        <div className="game-shell panel mx-auto flex flex-col" data-layout={definition.layout}>
          <div className="game-body">
            <Client view={view} me={viewer} partner={partner} names={{ [viewer]: "You", [partner]: "Baby" }} profiles={{}} status={session.status} result={session.result} busy={false} act={act} />
          </div>
        </div>
      </main>
    </LazyMotion>
  );
}
