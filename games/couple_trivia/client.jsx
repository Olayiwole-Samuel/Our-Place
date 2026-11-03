"use client";

import { RevealGame } from "@/games/shared/RevealGame";

/** Couple Trivia: questions about your story; you both answer, then say if you matched: the shared write-in-secret, reveal-together panel. */
export default function Game(props) {
  return <RevealGame {...props} title="Couple trivia 💑" placeholder="What do you remember?" />;
}
