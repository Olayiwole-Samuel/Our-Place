"use client";

import { RevealGame } from "@/games/shared/RevealGame";

/** How Well Do You Know Me?: rounds alternate; one writes the truth, the other guesses: the shared write-in-secret, reveal-together panel. */
export default function Game(props) {
  return <RevealGame {...props} title="How well do you know me? 💞" placeholder="Your answer…" />;
}
