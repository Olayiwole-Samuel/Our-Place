/**
 * Humanoid skeleton definition shared by every character in Our Place.
 *
 * Canonical bone names follow the widely used Mixamo-style convention, so the
 * built-in character and provider models (MetaPerson exports a Mixamo-compatible
 * humanoid rig) are driven by the same animation code. Provider bones are mapped
 * onto these names by `mapHumanoidBones`.
 *
 * Positions are for the reference character (1.70 m tall), in metres, relative to
 * the parent bone. The whole rig is scaled uniformly to the chosen height.
 */
export const REFERENCE_HEIGHT = 1.7;

export const HUMANOID_BONES = Object.freeze([
  { name: "Hips", parent: null, offset: [0, 0.92, 0] },
  { name: "Spine", parent: "Hips", offset: [0, 0.1, 0] },
  { name: "Spine1", parent: "Spine", offset: [0, 0.2, 0] }, // chest
  { name: "Neck", parent: "Spine1", offset: [0, 0.24, 0] },
  { name: "Head", parent: "Neck", offset: [0, 0.08, 0] },
  { name: "LeftShoulder", parent: "Spine1", offset: [0.04, 0.15, 0] },
  { name: "LeftArm", parent: "LeftShoulder", offset: [0.125, 0, 0] },
  { name: "LeftForeArm", parent: "LeftArm", offset: [0, -0.29, 0] },
  { name: "LeftHand", parent: "LeftForeArm", offset: [0, -0.26, 0] },
  { name: "LeftHandThumb1", parent: "LeftHand", offset: [0, -0.03, 0.03] },
  { name: "RightShoulder", parent: "Spine1", offset: [-0.04, 0.15, 0] },
  { name: "RightArm", parent: "RightShoulder", offset: [-0.125, 0, 0] },
  { name: "RightForeArm", parent: "RightArm", offset: [0, -0.29, 0] },
  { name: "RightHand", parent: "RightForeArm", offset: [0, -0.26, 0] },
  { name: "RightHandThumb1", parent: "RightHand", offset: [0, -0.03, 0.03] },
  { name: "LeftUpLeg", parent: "Hips", offset: [0.09, -0.04, 0] },
  { name: "LeftLeg", parent: "LeftUpLeg", offset: [0, -0.4, 0] },
  { name: "LeftFoot", parent: "LeftLeg", offset: [0, -0.4, 0] },
  { name: "RightUpLeg", parent: "Hips", offset: [-0.09, -0.04, 0] },
  { name: "RightLeg", parent: "RightUpLeg", offset: [0, -0.4, 0] },
  { name: "RightFoot", parent: "RightLeg", offset: [0, -0.4, 0] },
]);

/** Bones a model MUST have to count as a full-body humanoid in Our Place. */
export const REQUIRED_BONES = Object.freeze([
  "Hips",
  "Spine",
  "Neck",
  "Head",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
]);

// Alternate names used by common humanoid rigs (Mixamo prefixes, Unity/VRM-style
// names). Matching is case-insensitive after stripping "mixamorig:" style prefixes.
const ALIASES = {
  Hips: ["hips", "pelvis", "hip"],
  Spine: ["spine", "spine0"],
  Spine1: ["spine1", "chest", "spine2", "upperchest"],
  Neck: ["neck"],
  Head: ["head"],
  LeftShoulder: ["leftshoulder", "shoulder_l", "lshoulder", "leftclavicle", "clavicle_l"],
  LeftArm: ["leftarm", "leftupperarm", "upperarm_l", "larm"],
  LeftForeArm: ["leftforearm", "leftlowerarm", "lowerarm_l", "forearm_l"],
  LeftHand: ["lefthand", "hand_l", "lhand"],
  RightShoulder: ["rightshoulder", "shoulder_r", "rshoulder", "rightclavicle", "clavicle_r"],
  RightArm: ["rightarm", "rightupperarm", "upperarm_r", "rarm"],
  RightForeArm: ["rightforearm", "rightlowerarm", "lowerarm_r", "forearm_r"],
  RightHand: ["righthand", "hand_r", "rhand"],
  LeftUpLeg: ["leftupleg", "leftupperleg", "thigh_l", "leftthigh"],
  LeftLeg: ["leftleg", "leftlowerleg", "calf_l", "shin_l", "leftknee"],
  LeftFoot: ["leftfoot", "foot_l", "lfoot"],
  RightUpLeg: ["rightupleg", "rightupperleg", "thigh_r", "rightthigh"],
  RightLeg: ["rightleg", "rightlowerleg", "calf_r", "shin_r", "rightknee"],
  RightFoot: ["rightfoot", "foot_r", "rfoot"],
};

const normalise = (name) => String(name).toLowerCase().replace(/^.*[:|]/, "").replace(/[\s.]/g, "");

/**
 * Maps a model's bone names onto canonical humanoid names.
 * Returns { map: { Canonical: originalName }, missing: [Canonical...] }.
 */
export function mapHumanoidBones(boneNames) {
  const byNormalised = new Map(boneNames.map((name) => [normalise(name), name]));
  const map = {};
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    for (const alias of [canonical.toLowerCase(), ...aliases]) {
      if (byNormalised.has(alias)) {
        map[canonical] = byNormalised.get(alias);
        break;
      }
    }
  }
  return { map, missing: REQUIRED_BONES.filter((bone) => !map[bone]) };
}

/** True when the bone list describes a complete full-body humanoid. */
export function isFullBodyHumanoid(boneNames) {
  return mapHumanoidBones(boneNames).missing.length === 0;
}
