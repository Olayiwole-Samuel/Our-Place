import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createAnimationController, EMOTES } from "./animation";
import { createRetarget } from "./retarget";
import { HUMANOID_BONES } from "./rig";

/**
 * A Mixamo/Avaturn-style rig: T-pose arms, every bone with its own local axes
 * (Y along the bone), an extra spine segment the canonical rig doesn't have,
 * and centimetre units under a scaled armature — everything retargeting must cope with.
 */
function buildForeignRig() {
  const root = new THREE.Group();
  const armature = new THREE.Object3D();
  armature.scale.setScalar(0.01);
  root.add(armature);
  const world = {
    Hips: [0, 95, 0],
    Spine: [0, 105, 0],
    Spine1: [0, 118, 0],
    Spine2: [0, 130, 0],
    Neck: [0, 145, 0],
    Head: [0, 155, 0],
    LeftShoulder: [5, 140, 0],
    LeftArm: [17, 140, 0],
    LeftForeArm: [45, 140, 0],
    LeftHand: [70, 140, 0],
    RightShoulder: [-5, 140, 0],
    RightArm: [-17, 140, 0],
    RightForeArm: [-45, 140, 0],
    RightHand: [-70, 140, 0],
    LeftUpLeg: [9, 90, 0],
    LeftLeg: [9, 50, 0],
    LeftFoot: [9, 8, 0],
    RightUpLeg: [-9, 90, 0],
    RightLeg: [-9, 50, 0],
    RightFoot: [-9, 8, 0],
  };
  const parents = {
    Hips: null,
    Spine: "Hips",
    Spine1: "Spine",
    Spine2: "Spine1",
    Neck: "Spine2",
    Head: "Neck",
    LeftShoulder: "Spine2",
    LeftArm: "LeftShoulder",
    LeftForeArm: "LeftArm",
    LeftHand: "LeftForeArm",
    RightShoulder: "Spine2",
    RightArm: "RightShoulder",
    RightForeArm: "RightArm",
    RightHand: "RightForeArm",
    LeftUpLeg: "Hips",
    LeftLeg: "LeftUpLeg",
    LeftFoot: "LeftLeg",
    RightUpLeg: "Hips",
    RightLeg: "RightUpLeg",
    RightFoot: "RightLeg",
  };
  const bones = {};
  const worldQuat = {};
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const [name, parent] of Object.entries(parents)) {
    const bone = new THREE.Bone();
    bone.name = name;
    // Arbitrary per-bone orientation (as exported rigs have).
    worldQuat[name] = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 2, rand() * 2, rand() * 2));
    const parentQuat = parent ? worldQuat[parent] : new THREE.Quaternion();
    bone.quaternion.copy(parentQuat.clone().invert().multiply(worldQuat[name]));
    const offset = new THREE.Vector3(...world[name]).sub(new THREE.Vector3(...(parent ? world[parent] : [0, 0, 0])));
    bone.position.copy(offset.applyQuaternion(parentQuat.clone().invert()));
    (parent ? bones[parent] : armature).add(bone);
    bones[name] = bone;
  }
  const canonical = Object.fromEntries(HUMANOID_BONES.map((def) => [def.name, bones[def.name]]).filter(([, bone]) => bone));
  return { root, bones: canonical, all: bones };
}

const position = (object) => object.getWorldPosition(new THREE.Vector3());
const direction = (from, to) => position(to).sub(position(from)).normalize();

describe("retargeting the animation controller onto imported rigs", () => {
  it("measures the model (hip height in metres) and starts in the reference pose: arms down", () => {
    const rig = buildForeignRig();
    const retarget = createRetarget(rig.root, rig.bones);
    expect(retarget.controllerTarget.hipHeight).toBeCloseTo(0.95, 2);
    retarget.apply();
    rig.root.updateMatrixWorld(true);
    expect(direction(rig.bones.LeftArm, rig.bones.LeftForeArm).y).toBeLessThan(-0.99); // was +x (T-pose)
    expect(direction(rig.bones.RightForeArm, rig.bones.RightHand).y).toBeLessThan(-0.99);
    expect(direction(rig.bones.LeftUpLeg, rig.bones.LeftLeg).y).toBeLessThan(-0.99);
  });

  it("every limb follows the reference skeleton through walking, sitting and all emotes", () => {
    const rig = buildForeignRig();
    const retarget = createRetarget(rig.root, rig.bones);
    const controller = createAnimationController(retarget.controllerTarget);
    const proxy = retarget.controllerTarget.bones;
    const limbs = [
      ["LeftArm", "LeftForeArm"],
      ["LeftForeArm", "LeftHand"],
      ["RightArm", "RightForeArm"],
      ["RightForeArm", "RightHand"],
      ["LeftUpLeg", "LeftLeg"],
      ["LeftLeg", "LeftFoot"],
      ["RightUpLeg", "RightLeg"],
      ["RightLeg", "RightFoot"],
    ];
    const check = () => {
      retarget.apply();
      rig.root.updateMatrixWorld(true);
      retarget.controllerTarget.root.updateMatrixWorld(true);
      for (const [a, b] of limbs) {
        const expected = direction(proxy[a], proxy[b]);
        expect(direction(rig.bones[a], rig.bones[b]).dot(expected)).toBeGreaterThan(0.999);
      }
    };
    for (const state of ["walk", "run", "sit", "idle"]) {
      controller.setState(state, { speed: 1 });
      for (let i = 0; i < 20; i += 1) controller.update(1 / 30);
      check();
    }
    for (const emote of Object.keys(EMOTES)) {
      controller.setState("idle");
      controller.playEmote(emote);
      for (let i = 0; i < 15; i += 1) controller.update(1 / 30);
      check();
    }
  });

  it("waving raises the model's actual right hand above its head", () => {
    const rig = buildForeignRig();
    const retarget = createRetarget(rig.root, rig.bones);
    const controller = createAnimationController(retarget.controllerTarget);
    controller.playEmote("wave");
    for (let i = 0; i < 30; i += 1) controller.update(1 / 30);
    retarget.apply();
    rig.root.updateMatrixWorld(true);
    expect(position(rig.bones.RightHand).y).toBeGreaterThan(position(rig.bones.Head).y);
  });

  it("sitting lowers the model's hips to the couch seat", () => {
    const rig = buildForeignRig();
    const retarget = createRetarget(rig.root, rig.bones);
    const controller = createAnimationController(retarget.controllerTarget);
    controller.setState("sit");
    for (let i = 0; i < 60; i += 1) controller.update(1 / 30);
    retarget.apply();
    rig.root.updateMatrixWorld(true);
    expect(position(rig.bones.Hips).y).toBeGreaterThan(0.44);
    expect(position(rig.bones.Hips).y).toBeLessThan(0.56);
  });
});
