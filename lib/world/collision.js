/**
 * Ground-plane collision for walking around a room. The world is laid out on the
 * XZ plane (metres, Y up); players are circles, furniture is axis-aligned boxes or
 * circles. That is all a living room needs, costs a few dozen float operations per
 * frame, and keeps physics engines out of the bundle.
 *
 * Collider shapes:
 *   { shape: "box",    x, z, halfWidth, halfDepth }
 *   { shape: "circle", x, z, radius }
 * Bounds: { minX, maxX, minZ, maxZ } — the walkable interior (inside the walls).
 */

const PUSH_ITERATIONS = 3;

function pushOutOfBox(position, radius, box) {
  const closestX = Math.max(box.x - box.halfWidth, Math.min(position.x, box.x + box.halfWidth));
  const closestZ = Math.max(box.z - box.halfDepth, Math.min(position.z, box.z + box.halfDepth));
  const dx = position.x - closestX;
  const dz = position.z - closestZ;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= radius * radius) return false;

  if (distanceSq > 1e-12) {
    const distance = Math.sqrt(distanceSq);
    const push = radius - distance;
    position.x += (dx / distance) * push;
    position.z += (dz / distance) * push;
    return true;
  }

  // Centre is inside the box: leave by the nearest face.
  const exits = [
    { axis: "x", amount: box.x + box.halfWidth + radius - position.x },
    { axis: "x", amount: box.x - box.halfWidth - radius - position.x },
    { axis: "z", amount: box.z + box.halfDepth + radius - position.z },
    { axis: "z", amount: box.z - box.halfDepth - radius - position.z },
  ];
  const nearest = exits.reduce((best, exit) => (Math.abs(exit.amount) < Math.abs(best.amount) ? exit : best));
  position[nearest.axis] += nearest.amount;
  return true;
}

function pushOutOfCircle(position, radius, circle) {
  const dx = position.x - circle.x;
  const dz = position.z - circle.z;
  const minDistance = radius + circle.radius;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= minDistance * minDistance) return false;
  const distance = Math.sqrt(distanceSq) || 1e-6;
  const nx = distanceSq > 1e-12 ? dx / distance : 1;
  const nz = distanceSq > 1e-12 ? dz / distance : 0;
  position.x = circle.x + nx * minDistance;
  position.z = circle.z + nz * minDistance;
  return true;
}

function clampToBounds(position, radius, bounds) {
  position.x = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, position.x));
  position.z = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, position.z));
}

/**
 * Moves a circle by (dx, dz) and resolves overlaps by pushing it out of colliders
 * along the contact normal, so the player slides along furniture and walls
 * instead of sticking. Always returns a position inside `bounds`.
 */
export function moveWithCollisions(from, dx, dz, { radius, bounds, colliders = [] }) {
  const position = { x: from.x + dx, z: from.z + dz };
  for (let i = 0; i < PUSH_ITERATIONS; i++) {
    let moved = false;
    for (const collider of colliders) {
      moved = (collider.shape === "circle" ? pushOutOfCircle(position, radius, collider) : pushOutOfBox(position, radius, collider)) || moved;
    }
    clampToBounds(position, radius, bounds);
    if (!moved) break;
  }
  return position;
}

/** True when a circle at `position` overlaps any collider or leaves the bounds. */
export function isBlocked(position, { radius, bounds, colliders = [] }) {
  if (
    position.x - radius < bounds.minX ||
    position.x + radius > bounds.maxX ||
    position.z - radius < bounds.minZ ||
    position.z + radius > bounds.maxZ
  ) {
    return true;
  }
  return colliders.some((collider) => {
    const probe = { x: position.x, z: position.z };
    return collider.shape === "circle" ? pushOutOfCircle(probe, radius, collider) : pushOutOfBox(probe, radius, collider);
  });
}
