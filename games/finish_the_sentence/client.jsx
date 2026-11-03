"use client";

import { RevealGame } from "@/games/shared/RevealGame";

/** Finish the Sentence: you both finish it in your own words; ❤️ the ones you love: the shared write-in-secret, reveal-together panel. */
export default function Game(props) {
  return <RevealGame {...props} title="Finish the sentence 💭" placeholder="…and finish it here" />;
}
