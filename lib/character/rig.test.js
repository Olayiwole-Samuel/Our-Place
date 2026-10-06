import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EMOTES, LOCOMOTION_STATES, createAnimationController } from "./animation";
import { buildCharacter } from "./buildCharacter";
import { BODY_RANGES, ITEMS, HAIRSTYLES } from "./catalog";
import { MAX_MODEL_BYTES, inspectCharacterGlb } from "./glb";
import { HUMANOID_BONES, REQUIRED_BONES, isFullBodyHumanoid, mapHumanoidBones } from "./rig";
import { DEFAULT_CHARACTER, STARTING_LOOKS, applyCharacterPatch } from "./schema";

const worldY = (object) => object.getWorldPosition(new THREE.Vector3()).y;

describe("built-in character: full-body humanoid", () => {
  const character = buildCharacter(DEFAULT_CHARACTER);

  it("has every required humanoid bone, including hands, legs and feet", () => {
    for (const name of REQUIRED_BONES) expect(character.bones[name], name).toBeInstanceOf(THREE.Bone);
    expect(character.skeleton.bones.map((bone) => bone.name)).toEqual(HUMANOID_BONES.map((bone) => bone.name));
    expect(isFullBodyHumanoid(character.skeleton.bones.map((bone) => bone.name))).toBe(true);
  });

  it("is a real rigged mesh: every part is a SkinnedMesh bound to the skeleton", () => {
    expect(character.meshes.length).toBeGreaterThan(0);
    for (const mesh of character.meshes) {
      expect(mesh).toBeInstanceOf(THREE.SkinnedMesh);
      expect(mesh.skeleton).toBe(character.skeleton);
      expect(mesh.geometry.attributes.skinIndex).toBeTruthy();
    }
  });

  it("stands head-to-toe at the configured height, feet on the floor", () => {
    character.root.updateMatrixWorld(true);
    const head = worldY(character.bones.Head);
    const foot = worldY(character.bones.LeftFoot);
    expect(foot).toBeGreaterThan(0.03);
    expect(foot).toBeLessThan(0.12);
    expect(head).toBeGreaterThan(character.dims.height * 0.85);
    const box = new THREE.Box3();
    for (const mesh of character.meshes) box.expandByObject(mesh, true);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.max.y).toBeLessThan(character.dims.height + 0.12);
  });

  it("keeps draw calls low by merging parts per material", () => {
    expect(character.meshes.length).toBeLessThanOrEqual(20);
  });

  it("builds every hairstyle, garment, accessory and starting look without errors", () => {
    for (const style of HAIRSTYLES) buildCharacter(applyCharacterPatch(DEFAULT_CHARACTER, { hair: { style: style.id } })).dispose();
    for (const item of ITEMS) {
      const slot = item.slot;
      const patch = ["top", "outfit", "bottom", "shoes"].includes(slot) ? { outfit: { [slot]: item.id } } : { accessories: { [slot]: item.id } };
      buildCharacter(applyCharacterPatch(DEFAULT_CHARACTER, patch)).dispose();
    }
    for (const look of STARTING_LOOKS) buildCharacter(applyCharacterPatch(DEFAULT_CHARACTER, look.patch)).dispose();
  });

  it("scales safely across the whole height range", () => {
    const short = buildCharacter(applyCharacterPatch(DEFAULT_CHARACTER, { body: { height: 0 } }));
    const tall = buildCharacter(applyCharacterPatch(DEFAULT_CHARACTER, { body: { height: 1 } }));
    expect(short.dims.height).toBe(BODY_RANGES.height.min);
    expect(tall.dims.height).toBe(BODY_RANGES.height.max);
    expect(tall.hipHeight).toBeGreaterThan(short.hipHeight);
  });
});

describe("animation controller", () => {
  it("drives the limbs for every locomotion state and emote", () => {
    const character = buildCharacter(DEFAULT_CHARACTER);
    const controller = createAnimationController(character);
    const rest = character.bones.LeftUpLeg.rotation.x;
    controller.setState("walk", { speed: 1 });
    for (let i = 0; i < 30; i++) controller.update(1 / 60);
    expect(character.bones.LeftUpLeg.rotation.x).not.toBeCloseTo(rest, 3);
    for (const state of LOCOMOTION_STATES) expect(controller.setState(state)).toBe(true);
    for (const name of Object.keys(EMOTES)) expect(controller.playEmote(name)).toBe(true);
    expect(controller.setState("moonwalk")).toBe(false);
    expect(controller.playEmote("teleport")).toBe(false);
  });

  it("sits with hips on the seat for short and tall characters alike", () => {
    for (const height of [0, 1]) {
      const character = buildCharacter(applyCharacterPatch(DEFAULT_CHARACTER, { body: { height } }));
      const controller = createAnimationController(character);
      controller.setState("sit");
      for (let i = 0; i < 120; i++) controller.update(1 / 60);
      character.root.updateMatrixWorld(true);
      const hips = worldY(character.bones.LeftUpLeg);
      expect(hips).toBeGreaterThan(0.42);
      expect(hips).toBeLessThan(0.58);
      // Thighs point forward (+z) when seated.
      const knee = character.bones.LeftLeg.getWorldPosition(new THREE.Vector3());
      const hip = character.bones.LeftUpLeg.getWorldPosition(new THREE.Vector3());
      expect(knee.z - hip.z).toBeGreaterThan(0.25);
    }
  });

  it("a wave raises the right hand above the head, then the emote ends", () => {
    const character = buildCharacter(DEFAULT_CHARACTER);
    const controller = createAnimationController(character);
    controller.playEmote("wave");
    for (let i = 0; i < 40; i++) controller.update(1 / 60);
    character.root.updateMatrixWorld(true);
    expect(worldY(character.bones.RightHand)).toBeGreaterThan(worldY(character.bones.Head));
    for (let i = 0; i < 200; i++) controller.update(1 / 60);
    expect(controller.emote).toBeNull();
  });
});

describe("humanoid mapping for provider rigs", () => {
  it("maps Mixamo-prefixed names", () => {
    const names = REQUIRED_BONES.map((name) => `mixamorig:${name}`);
    expect(mapHumanoidBones(names).missing).toEqual([]);
  });

  it("rejects head-only rigs", () => {
    expect(isFullBodyHumanoid(["Hips", "Spine", "Neck", "Head"])).toBe(false);
  });
});

/** Builds a minimal GLB (JSON chunk only) for inspector tests. */
function glb(json) {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const out = new Uint8Array(20 + padded.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  return out;
}

describe("server-side GLB inspection", () => {
  const humanoid = (names) => ({
    nodes: names.map((name) => ({ name })),
    skins: [{ joints: names.map((_, i) => i) }],
    meshes: [{}],
  });

  it("accepts a skinned full-body humanoid", () => {
    expect(inspectCharacterGlb(glb(humanoid(REQUIRED_BONES.map((n) => `mixamorig:${n}`))))).toMatchObject({ ok: true });
  });

  it("rejects head-only, unrigged, non-GLB and oversized files", () => {
    expect(inspectCharacterGlb(glb(humanoid(["Head", "Neck"])))).toMatchObject({ ok: false, reason: "not_full_body" });
    expect(inspectCharacterGlb(glb({ nodes: [], meshes: [{}] }))).toMatchObject({ ok: false, reason: "not_rigged" });
    expect(inspectCharacterGlb(new TextEncoder().encode("<html>nope</html>"))).toMatchObject({ ok: false, reason: "not_glb" });
    expect(inspectCharacterGlb({ byteLength: MAX_MODEL_BYTES + 1 })).toMatchObject({ ok: false, reason: "too_large" });
  });
});

describe("GLB inspection for user uploads", () => {
  const rigged = (extra = {}) => ({ nodes: REQUIRED_BONES.map((name) => ({ name })), skins: [{ joints: REQUIRED_BONES.map((_, i) => i) }], meshes: [{ primitives: [] }], ...extra });

  it("rejects models that pull resources from external URLs", () => {
    expect(inspectCharacterGlb(glb(rigged({ images: [{ uri: "https://tracker.example/pixel.png" }] })))).toMatchObject({ ok: false, reason: "external_resources" });
    expect(inspectCharacterGlb(glb(rigged({ buffers: [{ uri: "https://cdn.example/geo.bin", byteLength: 10 }] })))).toMatchObject({ ok: false, reason: "external_resources" });
  });

  it("rejects extensions our loader can't handle", () => {
    expect(inspectCharacterGlb(glb(rigged({ extensionsRequired: ["KHR_draco_mesh_compression"] })))).toMatchObject({ ok: false, reason: "unsupported_extensions" });
    // what npm run optimize:character produces — the client loader decodes both
    expect(inspectCharacterGlb(glb(rigged({ extensionsRequired: ["EXT_meshopt_compression", "EXT_texture_webp"] }))).ok).toBe(true);
  });

  it("rejects characters too detailed for phones", () => {
    const heavy = rigged({ accessors: [{ count: 3 * 200_000 }], meshes: [{ primitives: [{ indices: 0, attributes: {} }] }] });
    expect(inspectCharacterGlb(glb(heavy))).toMatchObject({ ok: false, reason: "too_detailed" });
  });
});
