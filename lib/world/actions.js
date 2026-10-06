/**
 * Local-player actions that change the pose directly (as opposed to walking).
 * They mutate the world runtime's localPose; the presence layer then shares the
 * new pose/animation with the partner like any other movement.
 */

export function couchSeat(room, slot) {
  const couch = room.objects.find((object) => object.type === "couch");
  return couch?.seats?.[slot] ?? null;
}

/** Sit on your side of the couch. Returns false if this room has no seat for you. */
export function sitDown(runtime) {
  const seat = couchSeat(runtime.room, runtime.slot);
  if (!seat) return false;
  Object.assign(runtime.localPose, { x: seat.x, z: seat.z, ry: seat.ry, anim: "sit" });
  return true;
}

// Distance from the seat to the standing spot in front of it: the walkway between
// the couch and the coffee table (checked by a test to be free of furniture).
const STAND_OFFSET = 0.7;

/** Stand up just in front of the seat (between the couch and the coffee table). */
export function standUp(runtime) {
  const seat = couchSeat(runtime.room, runtime.slot);
  if (!seat || runtime.localPose.anim !== "sit") return false;
  // Seats face −z, so "in front" is further toward −z.
  Object.assign(runtime.localPose, { x: seat.x, z: seat.z - STAND_OFFSET, anim: "idle" });
  return true;
}
