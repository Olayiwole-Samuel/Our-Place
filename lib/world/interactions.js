/**
 * Interactable objects.
 *
 * An interactable is plain data registered by the room configuration:
 *   { id, type, label, verb, x, z, radius }
 * What happens on interaction is looked up by `type` in an interaction handler
 * map (components/lobby/interactionHandlers.js), so new objects register
 * themselves without touching detection or UI.
 *
 * Detection runs on a timer (~10 Hz), not every frame, and only changes React
 * state when the nearest target changes.
 */

/**
 * Nearest interactable whose radius contains `position`, or null.
 *
 * Linear scan: a room has ~10 interactables, so this is a few microseconds. If a
 * space ever holds hundreds, bucket them in a uniform grid keyed by
 * floor(x / cell), floor(z / cell) and only scan neighbouring cells — the call
 * signature stays the same.
 */
export function findNearestInteractable(position, interactables) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const item of interactables) {
    const distance = Math.hypot(position.x - item.x, position.z - item.z);
    if (distance <= item.radius && distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  return nearest;
}
