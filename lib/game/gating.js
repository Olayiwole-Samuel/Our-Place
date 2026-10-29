/**
 * Can this couple launch this game right now? One function, used by the menu
 * (to show the right state) and by the server (to refuse anything else).
 *
 * Returns { launchable, status, reason }:
 *   status  the effective availability shown to the couple
 *   reason  short human copy for anything that isn't launchable
 *
 * 18+ (Flirty / Spicy): off by default, couple-only. It opens only when BOTH
 * partners have switched it on (`matureEnabled`: couple_members.mature_opt_in,
 * read by the room store on the client and checked again by the game server).
 */
export function gameAvailability(definition, { matureEnabled = false } = {}) {
  if (!definition) return { launchable: false, status: "disabled", reason: "This game isn't ready yet." };
  if (definition.mature && !matureEnabled) {
    return { launchable: false, status: "locked", reason: "18+ and off by default. Both of you need to opt in." };
  }
  switch (definition.status) {
    case "available":
      return { launchable: true, status: "available", reason: null };
    case "coming_soon":
      return { launchable: false, status: "coming_soon", reason: "This game isn't ready yet." };
    case "locked":
      return { launchable: false, status: "locked", reason: "This game is locked." };
    default:
      return { launchable: false, status: "disabled", reason: "This game is switched off right now." };
  }
}

/** Human-friendly labels for a game card — never internal capability names. */
export function gameLabels(definition) {
  const labels = [`${definition.maxPlayers} Players`];
  if (definition.mode === "conversation") labels.push("Conversation");
  else if (definition.mode === "cooperative") labels.push("Co-op");
  else if (definition.mode === "creative") labels.push("Together");
  else labels.push(definition.multiplayer === "realtime" ? "Realtime" : "Turn Based");
  return labels;
}
