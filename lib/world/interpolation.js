/**
 * Snapshot interpolation for the partner's avatar.
 *
 * Pose updates arrive ~10 times a second with network jitter. Rendering the
 * newest one directly would make the partner stutter and teleport. Instead we
 * render slightly in the past (`delayMs`) and blend between the two snapshots
 * that straddle that moment:
 *
 *   received snapshots → buffer → sample(now − delay) → rendered pose
 *
 * Times are local receive times, so sender/receiver clock skew doesn't matter.
 * Pose: { x, z, ry, anim } — ry is yaw in radians.
 */

const TWO_PI = Math.PI * 2;

/** Shortest-path angle blend (so 350° → 10° turns 20°, not 340°). */
export function lerpAngle(from, to, t) {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return from + delta * t;
}

export function createPoseBuffer({ delayMs = 150, maxExtrapolateMs = 200, teleportDistance = 3, capacity = 24 } = {}) {
  let snapshots = [];

  return {
    push(pose, receivedAt) {
      const last = snapshots[snapshots.length - 1];
      // A big jump (sitting down, a respawn) should snap, not glide across the room.
      if (last && Math.hypot(pose.x - last.x, pose.z - last.z) > teleportDistance) snapshots = [];
      if (last && receivedAt <= last.t) receivedAt = last.t + 1;
      snapshots.push({ ...pose, t: receivedAt });
      if (snapshots.length > capacity) snapshots.shift();
    },

    /** The pose to render at local time `now`, or null before the first snapshot. */
    sample(now) {
      if (snapshots.length === 0) return null;
      const renderAt = now - delayMs;
      const first = snapshots[0];
      if (snapshots.length === 1 || renderAt <= first.t) return { x: first.x, z: first.z, ry: first.ry, anim: first.anim };

      for (let i = snapshots.length - 1; i > 0; i--) {
        const a = snapshots[i - 1];
        const b = snapshots[i];
        if (renderAt >= a.t && renderAt <= b.t) {
          const t = (renderAt - a.t) / (b.t - a.t);
          return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ry: lerpAngle(a.ry, b.ry, t), anim: t < 0.5 ? a.anim : b.anim };
        }
      }

      // Past the newest snapshot: extrapolate briefly along the last velocity, then hold.
      const a = snapshots[snapshots.length - 2];
      const b = snapshots[snapshots.length - 1];
      const ahead = Math.min(renderAt - b.t, maxExtrapolateMs);
      const span = b.t - a.t || 1;
      const moving = b.anim === "walk";
      const vx = moving ? (b.x - a.x) / span : 0;
      const vz = moving ? (b.z - a.z) / span : 0;
      return { x: b.x + vx * ahead, z: b.z + vz * ahead, ry: b.ry, anim: b.anim };
    },

    clear() {
      snapshots = [];
    },

    get size() {
      return snapshots.length;
    },

    /** Receive time of the newest snapshot (the frame driver uses it to detect a still partner). */
    get lastReceivedAt() {
      return snapshots.length ? snapshots[snapshots.length - 1].t : -Infinity;
    },
  };
}
