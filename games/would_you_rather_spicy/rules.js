import { createWouldYouRatherRules } from "@/games/would_you_rather/rules";

/**
 * Would You Rather — Spicy (18+): the same game as Would You Rather, with the
 * after-dark questions (lib/game/questions/spicy.js). Only startable once both
 * of you have switched 18+ on.
 */
export default createWouldYouRatherRules("would_you_rather_spicy", { headline: "That got hot 🔥" });
