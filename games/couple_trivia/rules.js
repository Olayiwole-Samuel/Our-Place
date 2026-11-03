import { createRevealRules } from "@/games/shared/revealRules";

/** Couple Trivia: questions about your story; you both answer, then say if you matched — see games/shared/revealRules.js. */
export default createRevealRules({ gameId: "couple_trivia", mode: "match", defaultRounds: 8, headline: "Your story ❤️" });
