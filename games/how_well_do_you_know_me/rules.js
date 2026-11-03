import { createRevealRules } from "@/games/shared/revealRules";

/** How Well Do You Know Me?: rounds alternate; one writes the truth, the other guesses — see games/shared/revealRules.js. */
export default createRevealRules({ gameId: "how_well_do_you_know_me", mode: "subject", defaultRounds: 8, headline: "Now you know 💞" });
