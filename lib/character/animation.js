/**
 * Character animation controller — the one place that knows how a body moves.
 *
 *   const controller = createAnimationController(character)
 *   controller.setState("walk", { speed })   // locomotion: idle | walk | run | sit
 *   controller.playEmote("wave")             // one-shot: wave | laugh | cry | kiss | dance | celebrate | angry | heart
 *   controller.update(dt)                    // once per frame
 *
 * Callers (player controllers, the future emote system, game rooms) never touch
 * bones. Poses are procedural rotations on the canonical humanoid bones
 * (lib/character/rig.js), cross-faded so state changes never snap. When
 * authored clips arrive (e.g. Mixamo-compatible clips for provider models),
 * they slot in behind this same API.
 *
 * Axis conventions for the canonical rig (front = +z, limbs hang along −y):
 *   leg/arm forward swing = negative X    knee bend = positive X on *Leg
 *   elbow bend forward    = negative X    spine lean forward = positive X
 *   left arm outward      = positive Z    right arm outward = negative Z
 */

export const LOCOMOTION_STATES = Object.freeze(["idle", "walk", "run", "sit"]);
export const EMOTES = Object.freeze({
  wave: { duration: 2.2 },
  laugh: { duration: 2.0 },
  cry: { duration: 2.6 },
  kiss: { duration: 2.0 },
  dance: { duration: 4.0 },
  celebrate: { duration: 2.0 },
  angry: { duration: 2.0 },
  heart: { duration: 2.2 },
});

const LOWER_BODY = /Leg|Foot|Hips/;
const SEAT_HEIGHT = 0.46; // couch seat top (metres)
const BLEND_SHARPNESS = 12;

const sin = Math.sin;

/** Locomotion poses. Return { bones: { Name: [x, y, z] }, rootY }. */
const STATE_POSES = {
  idle: (t) => ({
    bones: {
      Spine1: [sin(t * 1.6) * 0.02, 0, 0],
      Head: [sin(t * 0.7) * 0.03, sin(t * 0.4) * 0.05, 0],
      LeftArm: [sin(t * 1.6) * 0.015, 0, 0.02],
      RightArm: [sin(t * 1.6) * 0.015, 0, -0.02],
    },
    rootY: 0,
  }),
  walk: (t, { speed = 1 }) => {
    const phase = t * 8.5;
    const swing = 0.5 * Math.min(1, speed);
    return {
      bones: {
        LeftUpLeg: [-sin(phase) * swing, 0, 0],
        RightUpLeg: [sin(phase) * swing, 0, 0],
        LeftLeg: [Math.max(0, sin(phase + Math.PI / 2)) * 0.7 * swing, 0, 0],
        RightLeg: [Math.max(0, -sin(phase + Math.PI / 2)) * 0.7 * swing, 0, 0],
        LeftArm: [sin(phase) * swing * 0.8, 0, 0.05],
        RightArm: [-sin(phase) * swing * 0.8, 0, -0.05],
        LeftForeArm: [-0.25, 0, 0],
        RightForeArm: [-0.25, 0, 0],
        Spine: [0.03, sin(phase) * 0.06, 0],
      },
      rootY: Math.abs(sin(phase)) * 0.022,
    };
  },
  run: (t, { speed = 1 }) => {
    const phase = t * 12;
    const swing = 0.85 * Math.min(1, speed);
    return {
      bones: {
        LeftUpLeg: [-sin(phase) * swing, 0, 0],
        RightUpLeg: [sin(phase) * swing, 0, 0],
        LeftLeg: [(Math.max(0, sin(phase + Math.PI / 2)) * 1.2 + 0.2) * swing, 0, 0],
        RightLeg: [(Math.max(0, -sin(phase + Math.PI / 2)) * 1.2 + 0.2) * swing, 0, 0],
        LeftArm: [sin(phase) * swing, 0, 0.12],
        RightArm: [-sin(phase) * swing, 0, -0.12],
        LeftForeArm: [-1.3, 0, 0],
        RightForeArm: [-1.3, 0, 0],
        Spine1: [0.16, sin(phase) * 0.08, 0],
      },
      rootY: Math.abs(sin(phase)) * 0.05,
    };
  },
  sit: (t, _options, character) => ({
    bones: {
      LeftUpLeg: [-1.52, 0, 0.04],
      RightUpLeg: [-1.52, 0, -0.04],
      LeftLeg: [1.48, 0, 0],
      RightLeg: [1.48, 0, 0],
      LeftFoot: [0.05, 0, 0],
      RightFoot: [0.05, 0, 0],
      Spine: [-0.08, 0, 0],
      Spine1: [sin(t * 1.4) * 0.015, 0, 0],
      LeftArm: [-0.45, 0, 0.12],
      RightArm: [-0.45, 0, -0.12],
      LeftForeArm: [-0.85, 0, 0],
      RightForeArm: [-0.85, 0, 0],
    },
    // Lower the hips onto the seat whatever the character's height.
    rootY: -(character.hipHeight - SEAT_HEIGHT - 0.04),
  }),
};

/** Emote poses (layered over locomotion). `p` = progress 0..1, t = seconds into the emote. */
const EMOTE_POSES = {
  wave: (t) => ({ RightArm: [-0.2, 0, -2.5], RightForeArm: [0, 0, sin(t * 9) * 0.4 - 0.25], Head: [0, -0.15, 0.08] }),
  laugh: (t) => ({ Spine1: [-0.12 + sin(t * 14) * 0.05, 0, 0], Head: [-0.32, 0, 0], LeftArm: [-0.35, 0, 0.15], RightArm: [-0.35, 0, -0.15], LeftForeArm: [-1.2, 0, 0], RightForeArm: [-1.2, 0, 0] }),
  cry: (t) => ({ Head: [0.42, 0, 0], Spine1: [0.2 + sin(t * 10) * 0.02, 0, 0], LeftArm: [-1.0, 0, -0.15], RightArm: [-1.0, 0, 0.15], LeftForeArm: [-2.0, 0, 0], RightForeArm: [-2.0, 0, 0] }),
  kiss: () => ({ Spine1: [0.18, 0, 0], Head: [0.08, 0, 0], RightArm: [-1.15, 0, 0.05], RightForeArm: [-1.65, 0, 0] }),
  dance: (t) => ({
    Hips: [0, sin(t * 3) * 0.2, sin(t * 6) * 0.08],
    Spine1: [0, -sin(t * 3) * 0.15, -sin(t * 6) * 0.08],
    LeftArm: [-0.3, 0, 0.9 + sin(t * 6) * 0.4],
    RightArm: [-0.3, 0, -0.9 - sin(t * 6 + 1) * 0.4],
    LeftForeArm: [-0.9, 0, 0],
    RightForeArm: [-0.9, 0, 0],
    LeftLeg: [Math.max(0, sin(t * 6)) * 0.3, 0, 0],
    RightLeg: [Math.max(0, -sin(t * 6)) * 0.3, 0, 0],
  }),
  celebrate: () => ({ LeftArm: [0, 0, 2.6], RightArm: [0, 0, -2.6], LeftForeArm: [0, 0, 0.2], RightForeArm: [0, 0, -0.2], Head: [-0.15, 0, 0] }),
  angry: (t) => ({ LeftArm: [-0.55, 0, -0.25], RightArm: [-0.55, 0, 0.25], LeftForeArm: [-1.7, 0.4, 0], RightForeArm: [-1.7, -0.4, 0], Head: [0.15, sin(t * 4) * 0.12, 0] }),
  heart: () => ({ LeftArm: [-0.65, 0, -0.28], RightArm: [-0.65, 0, 0.28], LeftForeArm: [-1.35, 0, 0], RightForeArm: [-1.35, 0, 0], Head: [0.05, 0, 0.12] }),
};

const EMOTE_ROOT = {
  celebrate: (t) => Math.abs(sin(t * 7)) * 0.06,
  angry: (t) => Math.abs(sin(t * 8)) * 0.012,
};

/**
 * `character` needs: { bones: { CanonicalName: Object3D }, root: Object3D, hipHeight }.
 * Rest rotations are captured once; poses are applied as offsets on top.
 */
export function createAnimationController(character, { reducedMotion = false } = {}) {
  const names = Object.keys(character.bones);
  const rest = Object.fromEntries(names.map((name) => [name, character.bones[name].rotation.clone()]));
  const restRootY = character.root.position.y;
  const current = Object.fromEntries(names.map((name) => [name, [0, 0, 0]]));
  let currentRootY = 0;

  let state = "idle";
  let stateOptions = {};
  let emote = null; // { name, elapsed }
  let clock = 0;

  const api = {
    get state() {
      return state;
    },
    get emote() {
      return emote?.name ?? null;
    },
    setState(next, options = {}) {
      if (!LOCOMOTION_STATES.includes(next)) return false;
      state = next;
      stateOptions = options;
      return true;
    },
    playEmote(name) {
      if (!EMOTES[name]) return false;
      emote = { name, elapsed: 0 };
      return true;
    },
    stopEmote() {
      emote = null;
    },
    update(rawDt) {
      const dt = Math.min(rawDt, 0.05);
      // Reduced motion: hold calm poses (no bobbing/sway), keep meaningful states.
      clock += reducedMotion ? 0 : dt;

      const base = STATE_POSES[state](clock, stateOptions, character);
      const target = {};
      for (const name of names) target[name] = base.bones[name] ?? [0, 0, 0];
      let targetRootY = base.rootY;

      if (emote) {
        emote.elapsed += dt;
        const { duration } = EMOTES[emote.name];
        if (emote.elapsed >= duration) {
          emote = null;
        } else {
          const layer = EMOTE_POSES[emote.name](reducedMotion ? 0 : emote.elapsed);
          // Movement rule: standing still, an emote uses the whole body. While
          // walking/running or seated, locomotion keeps the legs and hips (no
          // foot sliding, no leaving the couch) and the emote drives the upper body.
          const upperBodyOnly = state !== "idle";
          for (const [name, value] of Object.entries(layer)) {
            if (upperBodyOnly && LOWER_BODY.test(name)) continue;
            target[name] = value;
          }
          if (EMOTE_ROOT[emote.name] && !upperBodyOnly && !reducedMotion) targetRootY += EMOTE_ROOT[emote.name](emote.elapsed);
        }
      }

      const blend = 1 - Math.exp(-BLEND_SHARPNESS * dt);
      for (const name of names) {
        const c = current[name];
        const g = target[name];
        c[0] += (g[0] - c[0]) * blend;
        c[1] += (g[1] - c[1]) * blend;
        c[2] += (g[2] - c[2]) * blend;
        const r = rest[name];
        character.bones[name].rotation.set(r.x + c[0], r.y + c[1], r.z + c[2]);
      }
      currentRootY += (targetRootY - currentRootY) * blend;
      character.root.position.y = restRootY + currentRootY;
    },
    /** Return the skeleton to its rest pose (e.g. before disposal or a hard reset). */
    reset() {
      for (const name of names) {
        current[name] = [0, 0, 0];
        character.bones[name].rotation.copy(rest[name]);
      }
      currentRootY = 0;
      character.root.position.y = restRootY;
      emote = null;
    },
  };
  return api;
}
