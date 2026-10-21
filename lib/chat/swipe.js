/**
 * Swipe-to-reply on a chat bubble (touch), as pure functions so the feel is
 * testable without a finger:
 *
 *   swipeAxis(dx, dy)   decides, once the finger has moved a little, whether this
 *                       is a reply swipe ("x") or not ("none": scrolling, or a
 *                       leftward swipe). Until then it returns null.
 *   swipeOffset(dx)     how far the bubble follows the finger: 1:1 up to the
 *                       trigger point, then with resistance, never past CAP.
 *   swipeArmed(offset)  past the trigger point — releasing here starts a reply.
 */
export const SWIPE = Object.freeze({
  lock: 10, // px of movement before the gesture picks an axis
  trigger: 48, // px of bubble travel that arms the reply
  cap: 70, // px the bubble can travel at most
  resistance: 0.35, // how much of the finger's movement past the trigger the bubble follows
});

export function swipeAxis(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE.lock && ay < SWIPE.lock) return null;
  // Rightward and clearly more sideways than up/down; anything else belongs to scrolling.
  return dx > 0 && ax > ay * 1.5 ? "x" : "none";
}

export function swipeOffset(dx) {
  if (!(dx > 0)) return 0;
  if (dx <= SWIPE.trigger) return dx;
  return Math.min(SWIPE.cap, SWIPE.trigger + (dx - SWIPE.trigger) * SWIPE.resistance);
}

export const swipeArmed = (offset) => offset >= SWIPE.trigger;
