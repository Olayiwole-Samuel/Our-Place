/**
 * "… is typing" between the two of them. Sent as `typing` broadcasts on the
 * couple's presence topic (live only, nothing stored):
 *
 *   sender     { on: true } when typing starts, repeated every REFRESH_MS while
 *              the draft keeps changing; { on: false } once the draft is cleared
 *              or sent, or after IDLE_MS without a keystroke.
 *   receiver   shows the indicator on { on: true } and hides it on { on: false },
 *              on the partner's next message, or after EXPIRE_MS without a
 *              refresh (so a lost "stop" never leaves it stuck on).
 */
export const TYPING = Object.freeze({ refreshMs: 2500, idleMs: 4000, expireMs: 6000 });

/**
 * Decides what to send for each draft change. Pure (time is passed in).
 * input(hasText, now) → true (send "typing"), false (send "stopped") or null (nothing).
 * stop() → false if the partner currently thinks we're typing, else null.
 */
export function createTypingGate() {
  let on = false;
  let sentAt = -Infinity;
  return {
    input(hasText, now) {
      if (!hasText) return this.stop();
      if (on && now - sentAt < TYPING.refreshMs) return null;
      on = true;
      sentAt = now;
      return true;
    },
    stop() {
      if (!on) return null;
      on = false;
      sentAt = -Infinity;
      return false;
    },
  };
}

/** Coerces an untrusted typing payload. */
export const typingFrom = (payload) => payload?.on === true;
