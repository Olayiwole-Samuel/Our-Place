import * as THREE from "three";
import { HUMANOID_BONES } from "./rig";

/**
 * Drives an imported humanoid (Avaturn, Mixamo, VRoid, MetaPerson… any rig that
 * maps onto the canonical bones) with Our Place's own animation controller, so
 * models that ship without clips still walk, sit and emote — the same motions
 * as the built-in character, on the person's actual model.
 *
 * How: the controller animates an invisible canonical skeleton (the "proxy",
 * whose rest pose is the reference rig: identity rotations, arms down). Each
 * frame, every mapped bone of the model is given the same change of orientation
 * in character space as its proxy bone, after a one-time rest-pose correction
 * that lines the model's limbs up with the reference (e.g. T-pose arms → down).
 *
 *   target(bone) = anim(proxy bone) · correction(bone) · rest(bone)   [character space]
 *   local(bone)  = parentCurrent⁻¹ · target(bone)
 *
 * Bones the canonical rig doesn't have (extra spine/neck segments, fingers)
 * keep their rest pose relative to their parent, so they follow naturally.
 */

// Limb segments whose rest direction is aligned with the reference rig.
const AIM_CHILD = {
  LeftShoulder: "LeftArm",
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  RightShoulder: "RightArm",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
};
const DEFS = Object.fromEntries(HUMANOID_BONES.map((def) => [def.name, def]));

/** The invisible canonical skeleton the controller animates. */
function createProxy() {
  const root = new THREE.Object3D();
  const bones = {};
  for (const def of HUMANOID_BONES) {
    const bone = new THREE.Object3D();
    bone.name = def.name;
    bone.position.set(...def.offset);
    bones[def.name] = bone;
    (def.parent ? bones[def.parent] : root).add(bone);
  }
  return { root, bones };
}

const _q = new THREE.Quaternion();
const _rootInv = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * @param root   Object3D that defines character space (feet at y = 0, facing +z)
 * @param bones  { CanonicalName: Bone } of the model (from mapHumanoidBones)
 * Returns { controllerTarget: { bones, root, hipHeight }, apply() }.
 */
export function createRetarget(root, bones) {
  const proxy = createProxy();
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(_rootInv).invert();

  const names = HUMANOID_BONES.map((def) => def.name).filter((name) => bones[name]);
  const charQuat = (object, out) => object.getWorldQuaternion(out).premultiply(_rootInv);
  const charPos = (object, out) => root.worldToLocal(object.getWorldPosition(out));

  const rest = {};
  const correction = {};
  for (const name of names) {
    rest[name] = charQuat(bones[name], new THREE.Quaternion());
    const child = AIM_CHILD[name];
    if (child && bones[child]) {
      const from = charPos(bones[child], _b).sub(charPos(bones[name], _a)).normalize();
      const to = new THREE.Vector3(...DEFS[child].offset).normalize();
      correction[name] = new THREE.Quaternion().setFromUnitVectors(from, to);
    } else {
      // Hands, feet, head…: keep the alignment of the nearest corrected ancestor.
      let parent = DEFS[name].parent;
      while (parent && !correction[parent]) parent = DEFS[parent].parent;
      correction[name] = parent ? correction[parent].clone() : new THREE.Quaternion();
    }
  }
  const hipHeight = charPos(bones.Hips, _a).y;
  const anim = Object.fromEntries(HUMANOID_BONES.map((def) => [def.name, new THREE.Quaternion()]));
  const restRootY = root.position.y;

  return {
    controllerTarget: { bones: proxy.bones, root: proxy.root, hipHeight },
    apply() {
      // Proxy orientations in character space (its rest is identity, so this is the change).
      for (const def of HUMANOID_BONES) {
        const local = proxy.bones[def.name].quaternion;
        if (def.parent) anim[def.name].multiplyQuaternions(anim[def.parent], local);
        else anim[def.name].copy(local);
      }
      root.position.y = restRootY + proxy.root.position.y;
      root.updateWorldMatrix(true, false);
      root.getWorldQuaternion(_rootInv).invert();
      for (const name of names) {
        const bone = bones[name];
        _q.copy(anim[name]).multiply(correction[name]).multiply(rest[name]);
        bone.parent.updateWorldMatrix(true, false);
        charQuat(bone.parent, _parent);
        bone.quaternion.copy(_parent.invert().multiply(_q));
      }
    },
  };
}
