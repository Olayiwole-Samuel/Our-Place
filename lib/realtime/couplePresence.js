import { logConnection } from "@/lib/diagnostics/connectionLog";
import { COUPLE_CHANNEL, coupleChannelName } from "./channels";
import { openResilientChannel } from "./resilientChannel";

/**
 * Living-room presence for a couple, over one PRIVATE Supabase Realtime channel
 * (`our-place:couple:<id>:presence`) that only the couple's two members can join
 * (enforced by RLS — see the realtime migration).
 *
 * Two mechanisms, each used for what it is good at:
 *  - Presence (`track`) says WHO is in the room and their resting pose, so someone
 *    who arrives later immediately sees where their partner is standing.
 *    Re-tracked at most once per second, only when the pose settles.
 *  - Broadcast (`pose` events) streams movement at POSE_SEND_HZ while moving.
 *    Cheap, unpersisted, fire-and-forget.
 *
 * Payloads carry only pose + animation. Names and avatars always come from the
 * server-verified couple state, never from the channel, so a modified client
 * cannot change how its owner appears beyond moving around.
 */
export const POSE_SEND_HZ = 10;
const SEND_INTERVAL_MS = 1000 / POSE_SEND_HZ;
const RETRACK_INTERVAL_MS = 1000;
const POSITION_EPSILON = 0.01;
const ANGLE_EPSILON = 0.02;
export const ANIMATIONS = Object.freeze(["idle", "walk", "sit"]);

/** Coerces untrusted pose data into something safe to render, or null. */
export function sanitizePose(raw, bounds) {
  if (!raw || typeof raw !== "object") return null;
  const { x, z, ry, anim } = raw;
  if (![x, z, ry].every(Number.isFinite)) return null;
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, z)),
    ry: ((ry % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    anim: ANIMATIONS.includes(anim) ? anim : "idle",
  };
}

function poseChanged(a, b) {
  return (
    !a ||
    a.anim !== b.anim ||
    Math.abs(a.x - b.x) > POSITION_EPSILON ||
    Math.abs(a.z - b.z) > POSITION_EPSILON ||
    Math.abs(a.ry - b.ry) > ANGLE_EPSILON
  );
}

const round = (value) => Math.round(value * 1000) / 1000;
const compact = (pose) => ({ x: round(pose.x), z: round(pose.z), ry: round(pose.ry), anim: pose.anim });

/**
 * Decides when to send. Pure (time is passed in) so the rate limiting is testable.
 * Returns { broadcast: pose|null, track: pose|null }.
 */
export function createPoseScheduler() {
  let lastSent = null;
  let lastSentAt = -Infinity;
  let lastTracked = null;
  let lastTrackedAt = -Infinity;

  return {
    next(pose, now) {
      const result = { broadcast: null, track: null };
      if (poseChanged(lastSent, pose) && now - lastSentAt >= SEND_INTERVAL_MS) {
        result.broadcast = compact(pose);
        lastSent = { ...pose }; // a copy: callers mutate their pose object in place
        lastSentAt = now;
      }
      // Settled (not walking) and different from what presence holds → re-track.
      const settled = pose.anim !== "walk";
      if (settled && poseChanged(lastTracked, pose) && now - lastTrackedAt >= RETRACK_INTERVAL_MS) {
        result.track = compact(pose);
        lastTracked = { ...pose };
        lastTrackedAt = now;
      }
      return result;
    },
    reset() {
      lastSent = null;
      lastSentAt = -Infinity;
      lastTracked = null;
      lastTrackedAt = -Infinity;
    },
  };
}

/**
 * Opens the couple's presence channel.
 *
 * handlers:
 *   onConnection(status)        "connecting" | "live" | "reconnecting" | "closed"
 *   onPartnerSync({ present, pose })   authoritative presence snapshot
 *   onPartnerPose(pose)         streamed movement (already sanitised)
 *   onPartnerLeft()             partner closed the room deliberately
 *
 * Returns { updatePose(pose, now), leave() }.
 */
export function joinCouplePresence({ supabase, coupleId, userId, partnerId, bounds, initialPose, handlers }) {
  const topic = coupleChannelName(coupleId, COUPLE_CHANNEL.PRESENCE);
  const scheduler = createPoseScheduler();
  let currentPose = initialPose;
  let live = false;
  let closed = false;

  let partnerWasPresent = null;
  const bind = (channel) => {
    channel.on("presence", { event: "sync" }, () => {
      const metas = channel.presenceState()[partnerId] ?? [];
      if (partnerWasPresent !== metas.length > 0) {
        partnerWasPresent = metas.length > 0;
        logConnection("presence", partnerWasPresent ? "partner here" : "partner not here");
      }
      const latest = metas.reduce((best, meta) => (!best || (meta.at ?? 0) > (best.at ?? 0) ? meta : best), null);
      handlers.onPartnerSync({ present: metas.length > 0, pose: latest ? sanitizePose(latest.pose, bounds) : null });
    });

    channel.on("broadcast", { event: "pose" }, ({ payload }) => {
      const pose = sanitizePose(payload, bounds);
      if (pose) handlers.onPartnerPose(pose);
    });

    channel.on("broadcast", { event: "leave" }, () => {
      logConnection("presence", "partner said goodbye");
      handlers.onPartnerLeft();
    });
  };

  handlers.onConnection("connecting");
  const realtime = openResilientChannel({
    supabase,
    topic,
    options: { config: { private: true, presence: { key: userId }, broadcast: { self: false, ack: false } } },
    area: "presence",
    bind,
    onStatus: (status, error) => {
      if (closed) return;
      logConnection("presence", `${status.toLowerCase()}${error?.message ? `: ${error.message}` : ""}`);
      if (status === "SUBSCRIBED") {
        live = true;
        scheduler.reset();
        trackCurrent();
        handlers.onConnection("live");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // Errored channels are retried by supabase-js, closed ones by openResilientChannel.
        live = false;
        handlers.onConnection("reconnecting");
      }
    },
  });
  const channel = () => realtime.channel;
  const trackCurrent = () => channel().track({ v: 1, pose: compact(currentPose), at: Date.now() });

  return {
    updatePose(pose, now) {
      currentPose = pose;
      if (!live) return;
      const { broadcast, track } = scheduler.next(pose, now);
      if (broadcast) channel().send({ type: "broadcast", event: "pose", payload: broadcast });
      if (track) channel().track({ v: 1, pose: track, at: Date.now() });
    },
    async leave() {
      if (closed) return;
      closed = true;
      if (live) {
        try {
          await channel().send({ type: "broadcast", event: "leave", payload: {} });
          await channel().untrack();
        } catch {
          // Leaving is best-effort; presence times out on its own.
        }
      }
      await realtime.close();
    },
  };
}
