"use client";

import { LazyMotion, domAnimation } from "motion/react";
import { useState } from "react";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import Ludo from "@/games/ludo/client";
import rules from "@/games/ludo/rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("ludo");
const queue = (values) => ({ int: () => values.shift() ?? 1, next: () => 0, pick: (items) => items[0], shuffle: (items) => [...items] });

/** A to play; A1 is 3 behind B1 (B1 on absolute square 15, not safe). */
function initial(asB) {
  const session = createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(1), now: 0 });
  const pieces = asB ? { B1: 12, B2: 30, A1: 15 + 26 } : { A1: 12, A2: 30, B1: 15 - 26 + 52 };
  return { ...session, state: { ...session.state, current: asB ? B : A, pieces: { ...session.state.pieces, ...pieces } } };
}

export function LudoSandbox() {
  const [asB] = useState(() => typeof location !== "undefined" && location.search.includes("seat=b"));
  const [session, setSession] = useState(() => initial(asB));
  const viewer = asB ? B : A;
  const [dice, setDice] = useState("3,1");
  const me = session.state.current;
  const view = getPlayerView(session, viewer, { rules, random: createRandom(9), now: 2 });
  const act = async (type, payload, playerId = me) => {
    const values = dice.split(",").map(Number);
    const result = applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: queue(values), now: Date.now() });
    if (!result.error) setSession(result.session);
    return result;
  };
  return (
    <LazyMotion features={domAnimation} strict>
    <main className="min-h-dvh bg-black-950 p-4 text-white" data-sandbox>
      <p className="mb-2 text-sm">
        Turn: {me === A ? "A (you)" : "B"} · next dice <input className="w-16 bg-black-800 px-1" value={dice} onChange={(e) => setDice(e.target.value)} data-dice-input /> · pieces {JSON.stringify(session.state.pieces)}
      </p>
      <div className="game-shell panel mx-auto flex flex-col" data-layout="board">
        <div className="game-body">
          <Ludo view={view} me={viewer} partner={asB ? A : B} names={{ [viewer]: "You", [asB ? A : B]: "King" }} profiles={{}} status="active" busy={false} act={(type, payload) => act(type, payload, viewer)} />
        </div>
      </div>
    </main>
    </LazyMotion>
  );
}
