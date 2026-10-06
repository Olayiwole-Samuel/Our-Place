/**
 * Game results. Not every game produces a winner, so the result is a tagged
 * outcome rather than a `winnerId` field:
 *
 * - "win"       competitive, one player won            { winnerId, scores? }
 * - "draw"      competitive, nobody won                { scores? }
 * - "completed" cooperative goal met / conversation or creative activity finished
 * - "failed"    cooperative goal not met (e.g. timer ran out)
 * - "abandoned" ended early (leave, disconnect timeout) — never counts toward streaks
 *
 * `scores` is an optional { [playerId]: number } map; `summary` is optional
 * game-specific detail that is persisted alongside the result.
 */
export const RESULT_OUTCOMES = Object.freeze(["win", "draw", "completed", "failed", "abandoned"]);

const OUTCOMES_BY_MODE = {
  competitive: ["win", "draw", "abandoned"],
  cooperative: ["completed", "failed", "abandoned"],
  conversation: ["completed", "abandoned"],
  creative: ["completed", "abandoned"],
};

/** Validates a result produced by game rules against the definition and players. */
export function normalizeResult(definition, playerIds, result) {
  if (!result || typeof result !== "object") throw new Error("Game result must be an object.");
  const { outcome, winnerId = null, scores = null, summary = null } = result;

  if (!OUTCOMES_BY_MODE[definition.mode].includes(outcome)) {
    throw new Error(`Outcome "${outcome}" is not valid for ${definition.mode} game "${definition.id}".`);
  }
  if (outcome === "win" && !playerIds.includes(winnerId)) {
    throw new Error(`Winner "${winnerId}" is not a player in this session.`);
  }
  if (outcome !== "win" && winnerId !== null) {
    throw new Error(`Outcome "${outcome}" cannot have a winner.`);
  }
  if (scores !== null) {
    for (const [playerId, score] of Object.entries(scores)) {
      if (!playerIds.includes(playerId) || !Number.isFinite(score)) {
        throw new Error(`Invalid score entry for "${playerId}".`);
      }
    }
  }

  return Object.freeze({ outcome, winnerId, scores, summary });
}

/** True when this result should extend the winner's win streak. Eligibility is per game. */
export function countsTowardWinStreak(definition, result) {
  return definition.winStreakEligible === true && result?.outcome === "win";
}
