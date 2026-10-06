/**
 * Partner presence as a small state machine, so the UI stays calm on flaky
 * networks and never claims the partner is here unless Realtime confirms it.
 *
 * status:
 *   "unknown"  we are not connected, so we can't know (never shown as online)
 *   "offline"  connected, partner not present
 *   "online"   partner present
 *   "away"     partner's connection dropped without saying goodbye; kept visible
 *              (dimmed) for a short grace period in case they reconnect
 *
 * `announce` is true on the transition that deserves "❤️ They're here".
 */
export const PARTNER_AWAY_GRACE_MS = 10_000;

export const initialPartnerPresence = Object.freeze({ status: "unknown", announce: false, seenThisSession: false });

export function partnerPresenceReducer(state, event) {
  const next = { ...state, announce: false };

  switch (event.type) {
    case "sync": {
      // Authoritative snapshot from Realtime presence.
      if (event.partnerPresent) {
        const arriving = state.status === "offline" || (state.status === "unknown" && !state.seenThisSession);
        return { status: "online", announce: arriving, seenThisSession: true };
      }
      if (state.status === "online") return { ...next, status: "away" };
      if (state.status === "away") return next; // grace timer decides
      return { ...next, status: "offline" };
    }
    case "partner_left": // they told us they were leaving (closed the room, signed out)
      return { ...next, status: "offline" };
    case "grace_expired":
      return state.status === "away" ? { ...next, status: "offline" } : next;
    case "self_disconnected":
      return { ...next, status: "unknown" };
    default:
      return next;
  }
}
