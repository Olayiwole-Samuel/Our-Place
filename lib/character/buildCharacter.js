import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HAIRSTYLES, ITEMS_BY_ID, colorHex } from "./catalog";
import { HUMANOID_BONES, REFERENCE_HEIGHT } from "./rig";
import { bodyDimensions, normalizeCharacterConfig } from "./schema";

/**
 * Builds the built-in Our Place character: a full-body humanoid as a real
 * THREE.SkinnedMesh bound to a THREE.Skeleton with canonical humanoid bones.
 *
 * Every body part, garment, hairstyle and accessory is authored in its bone's
 * local space, skinned 100% to that bone, then all parts sharing a material are
 * merged — so a fully dressed character is ~8 draw calls instead of ~80, while
 * every limb still articulates (walk, sit, wave…) through the skeleton.
 *
 * Pure three.js (no React, no DOM): usable in any scene and in Node tests.
 *
 * Returns { root, bones, skeleton, dims, hipHeight, dispose() }.
 */

const tmpMatrix = new THREE.Matrix4();

function mixHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function capsule(radius, length, segments = 10) {
  return new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 4, segments, 1);
}

/** Part placement helper: geometry in bone space with a local transform. */
function placed(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  return geometry.applyMatrix4(matrix);
}

/** Partial sphere (a cap) — used for hair, hats and facial hair shells. */
function sphereCap(radius, thetaLength, { phiStart = 0, phiLength = Math.PI * 2, segments = 18 } = {}) {
  return new THREE.SphereGeometry(radius, segments, Math.max(4, Math.round(segments * 0.6)), phiStart, phiLength, 0, thetaLength);
}

/**
 * Torso silhouette in Hips-bone space: [height, radius] for the reference body.
 * One continuous profile (hips → waist → chest → shoulders → neck) is lathed
 * into a smooth surface; garments are the same profile, inflated — so clothes
 * follow the body instead of stacking on it.
 */
const TORSO_PROFILE = [
  [-0.125, 0.06], [-0.11, 0.118], [-0.075, 0.148], [-0.02, 0.158], [0.04, 0.149], [0.1, 0.131],
  [0.16, 0.127], [0.24, 0.137], [0.32, 0.151], [0.4, 0.155], [0.45, 0.143], [0.49, 0.112], [0.52, 0.072], [0.54, 0.048],
];
// Where each torso bone sits above the Hips bone (from HUMANOID_BONES).
const TORSO_BONES = [
  { bone: "Hips", base: 0, from: -0.125, to: 0.125 },
  { bone: "Spine", base: 0.1, from: 0.105, to: 0.32 },
  { bone: "Spine1", base: 0.3, from: 0.3, to: 0.54 },
];

function torsoRadius(y) {
  if (y <= TORSO_PROFILE[0][0]) return TORSO_PROFILE[0][1];
  for (let i = 1; i < TORSO_PROFILE.length; i++) {
    const [y1, r1] = TORSO_PROFILE[i];
    const [y0, r0] = TORSO_PROFILE[i - 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const smooth = t * t * (3 - 2 * t);
      return r0 + (r1 - r0) * smooth;
    }
  }
  return TORSO_PROFILE[TORSO_PROFILE.length - 1][1];
}

/**
 * Lathed torso slice from y0 to y1 (Hips space) for a bone at height `base`,
 * returned in that bone's local space. `inflate` turns the body into a garment.
 * Cross-sections are elliptical (shallower front-to-back) and the chest widens
 * with the shoulder setting.
 */
function torsoSlice(y0, y1, base, { build, shoulders, inflate = 0, depth = 0.7, steps = 12 }) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    points.push(new THREE.Vector2(torsoRadius(y) * build + inflate, y));
  }
  // phiStart = π puts the lathe seam at the back, never down the front.
  const geometry = new THREE.LatheGeometry(points, 28, Math.PI);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const t = Math.min(1, Math.max(0, (y - 0.24) / 0.2));
    const widen = 1 + (shoulders - 1) * t * t * (3 - 2 * t);
    position.setX(i, position.getX(i) * widen);
    position.setZ(i, position.getZ(i) * depth);
    position.setY(i, y - base);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Tapered limb hanging down from its bone: rounded at both joints, no seams. */
function limb(radiusTop, radiusBottom, length, segments = 14) {
  const shaft = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments, 1, true);
  shaft.translate(0, -length / 2, 0);
  const top = new THREE.SphereGeometry(radiusTop, segments, 8);
  const bottom = new THREE.SphereGeometry(radiusBottom, segments, 8);
  bottom.translate(0, -length, 0);
  const merged = mergeGeometries([shaft, top, bottom], false);
  [shaft, top, bottom].forEach((g) => g.dispose());
  return merged;
}

/**
 * The head as ONE sculpted surface (no intersecting shapes, so no seams): a
 * sphere whose lower half narrows into the jaw (width set by face shape) and
 * whose chin comes slightly forward, then scaled to the face proportions.
 */
function headGeometry(shape) {
  const geometry = new THREE.SphereGeometry(0.105, 32, 24);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    const y = position.getY(i);
    let z = position.getZ(i);
    if (y < 0) {
      const t = Math.min(1, -y / 0.105);
      x *= 1 + (shape.jaw * 0.86 - 1) * t * t;
      z *= 1 - 0.12 * t * t;
      if (z > 0) z += 0.012 * t * t * (z / 0.105); // chin forward, front only
    }
    position.setXYZ(i, x * shape.head[0], y * shape.head[1], z * shape.head[2]);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createMaterials(config) {
  const skin = colorHex("skin", config.skin.tone);
  const hair = colorHex("hair", config.hair.color);
  const fabric = (slot) => colorHex("fabric", config.colors[slot]) ?? "#2e322e";
  const standard = (color, props = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...props });
  return {
    skin: standard(skin, { roughness: 0.55 }),
    lips: standard(mixHex(mixHex(skin, "#000000", 0.12), "#b86a74", 0.22), { roughness: 0.5 }),
    skinMark: standard(mixHex(skin, "#2b1a10", 0.45), { roughness: 0.7 }),
    stubble: standard(mixHex(skin, hair, 0.55), { roughness: 0.95 }),
    hair: standard(hair, { roughness: 0.72 }),
    brow: standard(mixHex(hair, "#000000", 0.25), { roughness: 0.8 }),
    eyeWhite: standard("#f4f1ea", { roughness: 0.3 }),
    iris: standard(colorHex("eyes", config.face.eyes.color), { roughness: 0.3 }),
    pupil: standard("#0b0b0b", { roughness: 0.2 }),
    top: standard(fabric("top")),
    bottom: standard(fabric("bottom")),
    outfit: standard(fabric("outfit")),
    trim: standard(mixHex(fabric(config.outfit.outfit ? "outfit" : "top"), "#000000", 0.35)),
    shoes: standard(fabric("shoes"), { roughness: 0.6 }),
    sole: standard(config.outfit.shoes === "sneakers" ? "#f5f5f2" : "#141414", { roughness: 0.9 }),
    glasses: standard(fabric("glasses"), { roughness: 0.35, metalness: 0.3 }),
    lens: standard("#101310", { roughness: 0.1, metalness: 0.4 }),
    jewelry: standard(fabric("earrings") ?? "#c9c4b8", { roughness: 0.3, metalness: 0.7 }),
    necklace: standard(fabric("necklace") ?? "#c9c4b8", { roughness: 0.3, metalness: 0.7 }),
    wrist: standard(fabric("wrist") ?? "#171a17", { roughness: 0.4, metalness: 0.4 }),
    hat: standard(fabric("hat"), { roughness: 0.9 }),
  };
}

// Face shape → head proportions [x, y, z] and jaw width.
const FACE = {
  oval: { head: [1, 1.18, 1.05], jaw: 1 },
  round: { head: [1.07, 1.08, 1.05], jaw: 1.06 },
  square: { head: [1.05, 1.12, 1.04], jaw: 1.16 },
  heart: { head: [1.02, 1.16, 1.04], jaw: 0.82 },
  long: { head: [0.97, 1.26, 1.04], jaw: 0.95 },
};

export function buildCharacter(configInput) {
  const config = normalizeCharacterConfig(configInput);
  const dims = bodyDimensions(config);
  const scale = dims.height / REFERENCE_HEIGHT;
  const b = dims.build;
  const sh = dims.shoulders;

  // ── Skeleton ──────────────────────────────────────────────────────────────
  const bones = {};
  for (const def of HUMANOID_BONES) {
    const bone = new THREE.Bone();
    bone.name = def.name;
    let [x, y, z] = def.offset;
    if (def.name.endsWith("Shoulder") || (def.name.endsWith("Arm") && !def.name.includes("Fore"))) x *= sh;
    if (def.name.endsWith("UpLeg")) x *= 0.92 + 0.08 * b;
    bone.position.set(x, y, z);
    bones[def.name] = bone;
    if (def.parent) bones[def.parent].add(bone);
  }
  // Relaxed rest pose: arms slightly away from the body.
  bones.LeftArm.rotation.z = 0.07;
  bones.RightArm.rotation.z = -0.07;

  const root = new THREE.Group();
  root.name = "OurPlaceCharacter";
  root.add(bones.Hips);
  root.updateMatrixWorld(true);
  const ordered = HUMANOID_BONES.map((def) => bones[def.name]);
  const skeleton = new THREE.Skeleton(ordered);
  const boneIndex = new Map(ordered.map((bone, i) => [bone.name, i]));

  // ── Parts ─────────────────────────────────────────────────────────────────
  const parts = []; // { bone, material, geometry }
  const add = (bone, material, geometry) => parts.push({ bone, material, geometry });
  const mirrored = (fn) => {
    fn("Left", 1);
    fn("Right", -1);
  };

  const { outfit, accessories, face, hair } = config;
  const outfitItem = outfit.outfit ? ITEMS_BY_ID.get(outfit.outfit) : null;
  const top = outfit.top ? ITEMS_BY_ID.get(outfit.top) : null;
  const bottom = outfit.bottom ? ITEMS_BY_ID.get(outfit.bottom) : null;
  const shoes = ITEMS_BY_ID.get(outfit.shoes);
  const upperMat = outfitItem ? "outfit" : "top";
  const upperShape = outfitItem ? "tank" : top.shape;

  // Body (skin): one smooth lathed torso split across Hips / Spine / Spine1,
  // tapered limbs with rounded joints. Kept under clothing so necklines,
  // sleeveless tops and cuffs show skin naturally.
  const torso = (material, { from, to, inflate = 0, depth } = {}) => {
    for (const section of TORSO_BONES) {
      const y0 = Math.max(section.from, from ?? section.from);
      const y1 = Math.min(section.to, to ?? section.to);
      if (y1 - y0 > 0.005) add(section.bone, material, torsoSlice(y0, y1, section.base, { build: b, shoulders: sh, inflate, depth }));
    }
  };
  torso("skin");
  add("Hips", "skin", placed(new THREE.SphereGeometry(1, 16, 10), { position: [0, -0.105, 0], scale: [0.115 * b, 0.05, 0.085 * b] }));
  add("Neck", "skin", placed(new THREE.CylinderGeometry(0.042, 0.048, 0.14, 14), { position: [0, 0.03, 0] }));
  mirrored((side, s) => {
    add(`${side}Arm`, "skin", limb(0.047 * b, 0.037 * b, 0.29));
    add(`${side}ForeArm`, "skin", limb(0.036 * b, 0.027 * b, 0.25));
    add(`${side}Hand`, "skin", placed(new THREE.SphereGeometry(1, 14, 10), { position: [0, -0.068, 0.004], scale: [0.036, 0.068, 0.019] }));
    add(`${side}HandThumb1`, "skin", placed(capsule(0.011, 0.03), { position: [s * 0.016, -0.02, 0.01], rotation: [0.25, 0, s * 0.28] }));
    add(`${side}UpLeg`, "skin", limb(0.074 * b, 0.05 * b, 0.4));
    add(`${side}Leg`, "skin", limb(0.05 * b, 0.034 * b, 0.4));
  });

  // Head & face (front = +z).
  const shape = FACE[face.shape];
  add("Head", "skin", placed(headGeometry(shape), { position: [0, 0.088, 0] }));
  mirrored((side, s) => {
    const earGeo =
      face.ears.shape === "pointed"
        ? placed(new THREE.ConeGeometry(0.022, 0.06, 8), { rotation: [0, 0, s * -0.35] })
        : new THREE.SphereGeometry(face.ears.shape === "small" ? 0.02 : 0.025, 10, 8);
    add("Head", "skin", placed(earGeo, { position: [s * 0.107, 0.09, -0.004], scale: [0.55, 1, 0.9] }));

    const eyeScaleY = { almond: 0.72, round: 1, soft: 0.85, narrow: 0.55 }[face.eyes.shape];
    const eyeSize = 0.85 + face.eyes.size * 0.35;
    const eyeX = s * (0.034 + face.eyes.spacing * 0.014);
    const eyeTilt = face.eyes.shape === "almond" ? s * 0.12 : face.eyes.shape === "soft" ? s * -0.08 : 0;
    add("Head", "eyeWhite", placed(new THREE.SphereGeometry(0.017 * eyeSize, 14, 10), { position: [eyeX, 0.1, 0.094], rotation: [0, 0, eyeTilt], scale: [1.2, eyeScaleY, 0.5] }));
    add("Head", "iris", placed(new THREE.CircleGeometry(0.0105 * eyeSize, 16), { position: [eyeX, 0.1, 0.1035] }));
    add("Head", "pupil", placed(new THREE.CircleGeometry(0.0048 * eyeSize, 12), { position: [eyeX, 0.1, 0.1045] }));

    const browThick = (0.006 + face.brows.thickness * 0.006) * (face.brows.shape === "bold" ? 1.5 : 1);
    const browArch = { straight: 0, arched: 0.22, soft: 0.1, bold: 0.06 }[face.brows.shape];
    add("Head", "brow", placed(new THREE.BoxGeometry(0.038, browThick, 0.008), { position: [eyeX, 0.128 + browArch * 0.02, 0.1], rotation: [0, 0, s * -browArch] }));
  });

  const noseSize = 0.8 + face.nose.size * 0.45;
  const noseGeo = {
    button: () => placed(new THREE.SphereGeometry(0.015, 12, 10), { scale: [1, 0.9, 1] }),
    straight: () => placed(new THREE.SphereGeometry(0.013, 12, 10), { scale: [0.85, 1.5, 0.95] }),
    wide: () => placed(new THREE.SphereGeometry(0.016, 12, 10), { scale: [1.5, 0.85, 1] }),
    narrow: () => placed(new THREE.SphereGeometry(0.012, 12, 10), { scale: [0.7, 1.6, 0.9] }),
  }[face.nose.shape]();
  add("Head", "skin", placed(noseGeo, { position: [0, 0.074, 0.104], scale: [noseSize, noseSize, noseSize * 0.9] }));

  // Lips: a soft horizontal shape with a fuller lower lip; shape sets width/fullness.
  const mouth = { soft: { width: 0.03, lip: 0.0065 }, full: { width: 0.032, lip: 0.0085 }, wide: { width: 0.042, lip: 0.006 }, small: { width: 0.022, lip: 0.006 } }[face.mouth.shape];
  add("Head", "lips", placed(capsule(mouth.lip, mouth.width, 8), { position: [0, 0.033, 0.103], rotation: [0, 0, Math.PI / 2], scale: [1, 1, 0.55] }));
  add("Head", "lips", placed(capsule(mouth.lip * 0.75, mouth.width * 0.8, 8), { position: [0, 0.041, 0.103], rotation: [0, 0, Math.PI / 2], scale: [1, 1, 0.5] }));

  if (face.marks === "beauty_mark") add("Head", "skinMark", placed(new THREE.SphereGeometry(0.0035, 8, 6), { position: [0.045, 0.06, 0.1] }));
  if (face.marks.startsWith("freckles")) {
    const count = face.marks === "freckles" ? 14 : 8;
    for (let i = 0; i < count; i++) {
      const s = i % 2 ? 1 : -1;
      const x = s * (0.018 + ((i * 7) % 5) * 0.008);
      const y = 0.078 + ((i * 3) % 4) * 0.006;
      add("Head", "skinMark", placed(new THREE.SphereGeometry(0.0024, 6, 4), { position: [x, y, 0.103 - Math.abs(x) * 0.25] }));
    }
  }

  // Facial hair.
  const fh = face.facialHair;
  if (fh === "stubble" || fh === "beard") {
    add("Head", fh === "beard" ? "hair" : "stubble", placed(sphereCap(0.088, Math.PI * 0.5, { phiStart: Math.PI * 0.15, phiLength: Math.PI * 0.7 }), {
      position: [0, 0.05, 0.012],
      rotation: [Math.PI, 0, 0],
      scale: [shape.jaw * (fh === "beard" ? 1.08 : 1.02), fh === "beard" ? 1.1 : 0.95, fh === "beard" ? 1.12 : 1.03],
    }));
  }
  if (fh === "mustache" || fh === "beard" || fh === "goatee") {
    add("Head", "hair", placed(capsule(0.006, 0.03, 8), { position: [0, 0.061, 0.106], rotation: [0, 0, Math.PI / 2] }));
  }
  if (fh === "goatee") add("Head", "hair", placed(new THREE.SphereGeometry(0.016, 10, 8), { position: [0, 0.018, 0.09], scale: [1, 1.3, 0.8] }));

  // ── Hair ─────────────────────────────────────────────────────────────────
  const hairStyle = (style) => {
    const cap = (radius = 0.113, theta = Math.PI * 0.5) =>
      // Tilted so the hairline sits above the brows in front and lower at the nape.
      add("Head", "hair", placed(sphereCap(radius, theta), { position: [0, 0.094, -0.006], rotation: [-0.45, 0, 0], scale: [shape.head[0], shape.head[1] * 0.98, shape.head[2]] }));
    switch (style) {
      case "buzz":
        cap(0.109, Math.PI * 0.48);
        break;
      case "crop":
        cap(0.115);
        break;
      case "sidePart":
        cap();
        add("Head", "hair", placed(capsule(0.028, 0.12, 8), { position: [0.03, 0.19, 0.05], rotation: [0.3, 0.2, 1.3] }));
        break;
      case "curlyTop":
        cap(0.11, Math.PI * 0.5);
        for (let i = 0; i < 16; i++) {
          const a = i * 2.39996;
          const r = 0.04 + (i % 4) * 0.012;
          add("Head", "hair", placed(new THREE.SphereGeometry(0.03, 8, 6), { position: [Math.cos(a) * r, 0.19 + (i % 3) * 0.008, Math.sin(a) * r * 0.9 + 0.01] }));
        }
        break;
      case "afro":
        add("Head", "hair", placed(new THREE.SphereGeometry(0.155, 20, 16), { position: [0, 0.15, -0.06], scale: [1.05, 0.9, 0.85] }));
        break;
      case "locs":
        cap();
        for (let i = 0; i < 14; i++) {
          const a = Math.PI * (0.15 + (i / 13) * 0.7);
          add("Head", "hair", placed(capsule(0.012, 0.2, 6), { position: [Math.cos(a) * 0.105, -0.02, -Math.sin(a) * 0.1], rotation: [Math.sin(a) * 0.15, 0, Math.cos(a) * -0.15] }));
        }
        break;
      case "bob":
        cap();
        add("Head", "hair", placed(new THREE.CylinderGeometry(0.118, 0.13, 0.13, 20, 1, true, Math.PI * 0.32, Math.PI * 1.36), { position: [0, 0.05, -0.005] }));
        break;
      case "long":
      case "waves":
        cap();
        add("Head", "hair", placed(new THREE.CylinderGeometry(0.118, 0.13, 0.12, 20, 1, true, Math.PI * 0.3, Math.PI * 1.4), { position: [0, 0.05, -0.005] }));
        add("Head", "hair", placed(new THREE.BoxGeometry(0.21, 0.32, 0.05), { position: [0, -0.07, -0.085], rotation: [0.08, 0, 0] }));
        if (style === "waves") {
          for (let i = 0; i < 8; i++) {
            add("Head", "hair", placed(new THREE.SphereGeometry(0.03, 8, 6), { position: [(i % 4) * 0.05 - 0.075, -0.17 + Math.floor(i / 4) * 0.08, -0.095] }));
          }
        }
        break;
      case "bun":
        cap();
        add("Head", "hair", placed(new THREE.SphereGeometry(0.05, 14, 10), { position: [0, 0.2, -0.07] }));
        break;
      case "braids":
        cap();
        for (const s of [-1, 1]) {
          for (let i = 0; i < 6; i++) {
            add("Head", "hair", placed(new THREE.SphereGeometry(0.02, 8, 6), { position: [s * 0.075, 0.02 - i * 0.045, -0.06], scale: [1, 1.2, 1] }));
          }
        }
        break;
      default:
        break; // bald
    }
  };
  hairStyle(HAIRSTYLES.find((style) => style.id === hair.style)?.shape ?? "crop");

  // ── Clothing (top / outfit) ───────────────────────────────────────────────
  // Garments are the body profile, inflated; hems and necklines differ per item.
  const thick = { hoodie: 0.02, jacket: 0.021, shirt: 0.011, longSleeve: 0.01, tee: 0.01, tank: 0.008 }[upperShape] ?? 0.01;
  const hem = { hoodie: -0.06, jacket: -0.07, shirt: -0.05 }[upperShape] ?? -0.035;
  const neckline = { tank: 0.455, tee: 0.505, hoodie: 0.53, jacket: 0.52 }[upperShape] ?? 0.515;
  torso(upperMat, { from: hem, to: neckline, inflate: thick, depth: 0.72 });
  const sleeves = { tee: "short", tank: "none", longSleeve: "long", hoodie: "long", shirt: "long", jacket: "long" }[upperShape];
  mirrored((side, s) => {
    if (sleeves === "none") {
      add("Spine1", upperMat, placed(new THREE.BoxGeometry(0.028, 0.016, 0.16 * b), { position: [s * 0.085 * sh, 0.165, 0] }));
      return;
    }
    add(`${side}Arm`, upperMat, limb(0.047 * b + thick, (sleeves === "short" ? 0.043 : 0.037) * b + thick, sleeves === "short" ? 0.12 : 0.29));
    if (sleeves === "long") add(`${side}ForeArm`, upperMat, limb(0.036 * b + thick, 0.03 * b + thick, 0.21));
  });
  if (upperShape === "hoodie") {
    add("Spine1", upperMat, placed(new THREE.TorusGeometry(0.07, 0.026, 8, 20, Math.PI * 1.15), { position: [0, 0.225, -0.05], rotation: [Math.PI / 2 + 0.55, 0, Math.PI * 0.93] }));
    add("Spine", "trim", placed(new THREE.BoxGeometry(0.15 * b, 0.065, 0.008), { position: [0, -0.045, 0.098 * b + thick] }));
  }
  if (upperShape === "shirt" || upperShape === "jacket") {
    add("Spine1", "trim", placed(new THREE.TorusGeometry(0.055, 0.011, 6, 20), { position: [0, 0.215, 0.004], rotation: [Math.PI / 2 - 0.3, 0, 0] }));
    add("Spine1", "trim", placed(new THREE.BoxGeometry(0.024, 0.2, 0.006), { position: [0, 0.03, 0.106 * b + thick] }));
  }

  // ── Clothing (bottom / outfit skirt) ─────────────────────────────────────
  const bottomShape = outfitItem ? "dress" : bottom.shape;
  const bottomMat = outfitItem ? "outfit" : "bottom";
  torso(bottomMat, { from: -0.12, to: 0.07, inflate: 0.013, depth: 0.74 });
  add("Hips", bottomMat, placed(new THREE.SphereGeometry(1, 16, 10), { position: [0, -0.105, 0], scale: [0.125 * b, 0.058, 0.094 * b] }));
  mirrored((side) => {
    if (bottomShape === "trousers") {
      add(`${side}UpLeg`, bottomMat, limb(0.074 * b + 0.013, 0.05 * b + 0.016, 0.4));
      add(`${side}Leg`, bottomMat, limb(0.05 * b + 0.016, 0.042 * b + 0.014, 0.33));
    } else if (bottomShape === "shorts") {
      add(`${side}UpLeg`, bottomMat, limb(0.074 * b + 0.015, 0.064 * b + 0.016, 0.17));
    }
  });
  if (bottomShape === "skirt" || bottomShape === "dress") {
    const length = bottomShape === "dress" ? 0.46 : 0.3;
    add("Hips", bottomMat, placed(new THREE.CylinderGeometry(0.152 * b, 0.24 * b, length, 28, 1, true), { position: [0, 0.03 - length / 2, 0], scale: [1, 1, 0.8] }));
  }

  // ── Shoes ────────────────────────────────────────────────────────────────
  mirrored((side) => {
    const foot = `${side}Foot`;
    const lowProfile = shoes.shape === "loafers";
    add(foot, "shoes", placed(capsule(0.047, 0.15, 10), { position: [0, -0.038, 0.045], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 1, lowProfile ? 0.6 : 0.75] }));
    add(foot, "sole", placed(new THREE.BoxGeometry(0.1, 0.018, 0.25), { position: [0, -0.072, 0.045] }));
    if (shoes.shape === "boots") add(foot, "shoes", placed(new THREE.CylinderGeometry(0.058, 0.055, 0.15, 12), { position: [0, 0.03, 0] }));
  });

  // ── Accessories ──────────────────────────────────────────────────────────
  const glasses = accessories.glasses && ITEMS_BY_ID.get(accessories.glasses);
  if (glasses) {
    const segments = glasses.shape === "glassesSquare" ? 4 : 18;
    mirrored((_, s) => {
      add("Head", "glasses", placed(new THREE.TorusGeometry(0.024, 0.0032, 6, segments), { position: [s * 0.04, 0.1, 0.118], rotation: [0, 0, segments === 4 ? Math.PI / 4 : 0] }));
      if (glasses.shape === "sunglasses") add("Head", "lens", placed(new THREE.CircleGeometry(0.023, 18), { position: [s * 0.04, 0.1, 0.117] }));
      add("Head", "glasses", placed(new THREE.BoxGeometry(0.004, 0.004, 0.09), { position: [s * 0.1, 0.105, 0.075] }));
    });
    add("Head", "glasses", placed(new THREE.BoxGeometry(0.03, 0.004, 0.004), { position: [0, 0.105, 0.12] }));
  }
  const earrings = accessories.earrings && ITEMS_BY_ID.get(accessories.earrings);
  if (earrings) {
    mirrored((_, s) => {
      const geo = earrings.shape === "hoops" ? placed(new THREE.TorusGeometry(0.012, 0.0022, 6, 16), { rotation: [0, Math.PI / 2, 0] }) : new THREE.SphereGeometry(0.0055, 8, 6);
      add("Head", "jewelry", placed(geo, { position: [s * 0.108, earrings.shape === "hoops" ? 0.05 : 0.062, 0] }));
    });
  }
  const necklace = accessories.necklace && ITEMS_BY_ID.get(accessories.necklace);
  if (necklace) {
    add("Spine1", "necklace", placed(new THREE.TorusGeometry(0.068, 0.0035, 6, 28), { position: [0, 0.22, 0.012], rotation: [Math.PI / 2 - 0.35, 0, 0], scale: [1, 0.9, 1] }));
    if (necklace.shape === "pendantHeart") {
      for (const s of [-1, 1]) add("Spine1", "necklace", placed(new THREE.SphereGeometry(0.0085, 8, 6), { position: [s * 0.006, 0.185, 0.105 * b] }));
      add("Spine1", "necklace", placed(new THREE.ConeGeometry(0.012, 0.016, 8), { position: [0, 0.175, 0.105 * b], rotation: [0, 0, Math.PI] }));
    }
  }
  const wrist = accessories.wrist && ITEMS_BY_ID.get(accessories.wrist);
  if (wrist) {
    add("LeftForeArm", "wrist", placed(new THREE.TorusGeometry(0.038 * b, wrist.shape === "watch" ? 0.007 : 0.004, 6, 18), { position: [0, -0.22, 0], rotation: [Math.PI / 2, 0, 0] }));
    if (wrist.shape === "watch") add("LeftForeArm", "lens", placed(new THREE.BoxGeometry(0.026, 0.026, 0.01), { position: [0, -0.22, 0.04 * b] }));
  }
  const hat = accessories.hat && ITEMS_BY_ID.get(accessories.hat);
  if (hat) {
    add("Head", "hat", placed(sphereCap(0.125, Math.PI * 0.5), { position: [0, 0.1, -0.005], rotation: [-0.15, 0, 0], scale: [shape.head[0], shape.head[1] * 0.95, shape.head[2]] }));
    if (hat.shape === "beanie") add("Head", "hat", placed(new THREE.TorusGeometry(0.118, 0.016, 6, 24), { position: [0, 0.115, 0], rotation: [Math.PI / 2 - 0.15, 0, 0], scale: [shape.head[0], shape.head[2], 1] }));
    if (hat.shape === "cap") add("Head", "hat", placed(new THREE.BoxGeometry(0.15, 0.008, 0.1), { position: [0, 0.135, 0.13], rotation: [-0.12, 0, 0] }));
  }

  // ── Skin & merge: one SkinnedMesh per material ───────────────────────────
  const materials = createMaterials(config);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  for (const part of parts) {
    const bone = bones[part.bone];
    tmpMatrix.multiplyMatrices(rootInverse, bone.matrixWorld);
    const { geometry } = part; // three.js primitives are all indexed, as merging requires
    geometry.applyMatrix4(tmpMatrix);
    for (const name of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.uv) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    const count = geometry.attributes.position.count;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    const index = boneIndex.get(bone.name);
    for (let i = 0; i < count; i++) {
      skinIndex[i * 4] = index;
      skinWeight[i * 4] = 1;
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
    if (!groups.has(part.material)) groups.set(part.material, []);
    groups.get(part.material).push(geometry);
  }

  const meshes = [];
  for (const [key, geometries] of groups) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error(`Character part merge failed for "${key}".`);
    const mesh = new THREE.SkinnedMesh(merged, materials[key]);
    mesh.name = `character:${key}`;
    mesh.frustumCulled = false; // limbs move beyond the bind-pose bounds
    root.add(mesh);
    mesh.bind(skeleton);
    meshes.push(mesh);
  }
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  return {
    root,
    bones,
    skeleton,
    meshes,
    dims,
    /** Hip joint height in world metres (for sitting). */
    hipHeight: (HUMANOID_BONES[0].offset[1] - 0.04) * scale,
    config,
    dispose() {
      meshes.forEach((mesh) => mesh.geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
      skeleton.dispose();
    },
  };
}

