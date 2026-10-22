"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { palette } from "@/lib/design/tokens";
import { createTextTexture, getBlobShadowTexture } from "../materials";

/**
 * Your Maltese mix. The model is Quaternius's Shiba Inu (CC0, poly.pizza),
 * recoloured to a white Maltese: cream-white coat, black nose and eyes, ears
 * that flop down instead of standing up. Its own clips (walk, gallop, idles,
 * eating, flinches, a jump) play underneath; on top, this layers the tail wag
 * and the poses the model doesn't have — sit, lie down, sleep — by bending its
 * bones (POSES).
 *
 * `stateRef.current` is the dog's state from lib/pet/behaviour.js, written each
 * frame by the caller: { x, z, ry, anim, pose, wag, hearts, ball, carrying }.
 */
export const DOG_MODEL = "/models/pets/maltese.glb";
const HEAD_HEIGHT = 0.27; // the head bone (behind the eyes)
const COAT = "#f4efe6";
const COAT_LIGHT = "#fffdf8";

const CLIPS = { idle: "Idle", look: "Idle_2", sniff: "Idle_2_HeadLow", walk: "Walk", run: "Gallop", eat: "Eating", jump: "Jump_ToIdle", petted: "Idle_HitReact_Left", petted2: "Idle_HitReact_Right" };

/**
 * Bone bends (radians, x/y/z, added on top of the animation) per pose, and how
 * low the body sits (fraction of height). Tuned by eye in /dev/dog.
 */
export const POSES = {
  // Measured in /dev/dog: the front legs swing on their y axis, the back legs on x.
  stand: { bones: {} },
  sit: {
    bones: {
      Body: [-0.5, 0, 0],
      BackUpperLegL: [-1.5, 0, 0],
      BackUpperLegR: [-1.5, 0, 0],
      BackLowerLegL: [-2.0, 0, 0],
      BackLowerLegR: [-2.0, 0, 0],
      Neck1: [-0.25, 0, 0],
      Head: [-0.2, 0, 0],
    },
  },
  lie: {
    bones: {
      FrontUpperLegL: [0, 1.2, 0],
      FrontUpperLegR: [0, 1.2, 0],
      BackUpperLegL: [-1.7, 0, 0],
      BackUpperLegR: [-1.7, 0, 0],
      BackLowerLegL: [-2.0, 0, 0],
      BackLowerLegR: [-2.0, 0, 0],
      Neck1: [-0.25, 0, 0],
    },
  },
  sleep: {
    bones: {
      FrontUpperLegL: [0, 1.2, 0],
      FrontUpperLegR: [0, 1.2, 0],
      BackUpperLegL: [-1.7, 0, 0],
      BackUpperLegR: [-1.7, 0, 0],
      BackLowerLegL: [-2.0, 0, 0],
      BackLowerLegR: [-2.0, 0, 0],
      Neck1: [-0.55, 0.35, 0],
      Head: [-0.35, 0.2, 0],
    },
  },
};
/** Floppy Maltese ears: each ear bone bends down a little more. */
export const EAR_FLOP = { Ear1L: [0, 0, 1.75], Ear2L: [0, 0, 0.45], Ear1R: [0, 0, -1.75], Ear2R: [0, 0, -0.45] };
const TAIL_BONES = ["Tail1", "Tail2"];
/**
 * The paws hang off separate foot bones (the model's IK targets), not the legs:
 * when a pose folds a leg, its foot is carried along with it, or the paw would
 * stay planted and prop the dog up (or poke through the floor).
 */
const FEET = [
  ["IKFrontLegL", "FrontLowerLegL"],
  ["IKFrontLegR", "FrontLowerLegR"],
  ["IKBackLegL", "BackLowerLegL"],
  ["IKBackLegR", "BackLowerLegR"],
];

let modelPromise = null;
function loadDog() {
  modelPromise ??= new GLTFLoader().loadAsync(DOG_MODEL).catch((error) => {
    modelPromise = null;
    throw error;
  });
  return modelPromise;
}

function recolour(scene) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const next = materials.map((material) => {
      const copy = material.clone();
      if (/^Main$/.test(material.name)) copy.color.set(COAT);
      else if (/Main_Light/.test(material.name)) copy.color.set(COAT_LIGHT);
      else if (/Eyes_White/.test(material.name)) copy.color.set("#2a211c"); // dark Maltese eyes, no white
      copy.roughness = 0.95;
      copy.metalness = 0;
      return copy;
    });
    node.material = Array.isArray(node.material) ? next : next[0];
  });
}

/** Smooths a faceted mesh: shared corners get one averaged normal. */
function smooth(geometry) {
  const plain = geometry.clone();
  plain.deleteAttribute("normal");
  const merged = mergeVertices(plain, 1e-4);
  merged.computeVertexNormals();
  merged.groups = geometry.groups.map((group) => ({ ...group }));
  return merged;
}

/** Smooth the low-poly body (soft, rounded shading instead of flat facets). */
function smoothBody(root) {
  root.traverse((node) => {
    if (node.isSkinnedMesh) node.geometry = smooth(node.geometry);
  });
}

/** The dog's model, ready to animate: { root, mixer, actions, bones, rest }. */
function useDogModel() {
  const [model, setModel] = useState(null);
  useEffect(() => {
    let live = true;
    let made = null;
    loadDog()
      .then((gltf) => {
        if (!live) return;
        const root = cloneSkinned(gltf.scene);
        recolour(root);
        // Fit by the skeleton (a skinned model's bounding box isn't reliable before it
        // has been posed): head at HEAD_HEIGHT, centred between nose and tail, feet
        // on the floor (the model's origin).
        root.updateMatrixWorld(true);
        const at = (name) => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
        const head = at("Head");
        const tail = at("Tail1");
        const scale = head && head.y > 0 ? HEAD_HEIGHT / head.y : 1;
        root.scale.set(scale * 1.12, scale * 0.86, scale); // a Maltese: shorter legs, rounder body
        if (head && tail) root.position.set(-((head.x + tail.x) / 2) * scale, 0, -((head.z + tail.z) / 2) * scale);
        smoothBody(root);
        const body = [];
        root.traverse((node) => node.isSkinnedMesh && body.push(node));
        const mixer = new THREE.AnimationMixer(root);
        const actions = {};
        for (const [key, name] of Object.entries(CLIPS)) {
          const clip = gltf.animations.find((c) => c.name === name);
          if (clip) actions[key] = mixer.clipAction(clip);
        }
        const bones = {};
        root.traverse((node) => {
          if (node.isBone) bones[node.name] = node;
        });
        // Rest rotations of every bone we bend, so bends never pile up frame after frame.
        const bent = new Set([...Object.values(POSES).flatMap((pose) => Object.keys(pose.bones)), ...Object.keys(EAR_FLOP), ...TAIL_BONES]);
        const rest = [...bent].filter((name) => bones[name]).map((name) => [bones[name], bones[name].quaternion.clone()]);
        // Each foot's place relative to its lower leg, at rest (to carry it in poses).
        root.updateMatrixWorld(true);
        const feet = FEET.filter(([foot, leg]) => bones[foot] && bones[leg]).map(([foot, leg]) => ({
          foot: bones[foot],
          leg: bones[leg],
          offset: bones[leg].matrixWorld.clone().invert().multiply(bones[foot].matrixWorld),
          restPosition: bones[foot].position.clone(),
          restQuaternion: bones[foot].quaternion.clone(),
        }));
        made = { root, mixer, actions, bones, rest, body, feet };
        if (process.env.NODE_ENV !== "production") window.__ourPlaceDog = { ...made, POSES, EAR_FLOP }; // devtools / /dev/dog tuning (edit live)
        setModel(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      made?.mixer.stopAllAction();
      made?.root.traverse((node) => {
        if (!node.isMesh) return;
        [].concat(node.material).forEach((m) => m.dispose());
        node.geometry.dispose();
      });
    };
  }, []);
  return model;
}

/** Floating hearts while it's being loved. */
function Hearts({ stateRef }) {
  const group = useRef();
  const texture = useMemo(() => createTextTexture([{ text: "♥", size: 110, weight: 700, color: palette.pink400 }], { width: 128, height: 128 }), []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ clock }) => {
    const on = stateRef.current?.hearts;
    group.current.visible = Boolean(on);
    if (!on) return;
    group.current.children.forEach((sprite, i) => {
      const t = (clock.elapsedTime * 0.7 + i / 3) % 1;
      sprite.position.set(Math.sin(i * 2.1 + t * 3) * 0.12, 0.38 + t * 0.4, Math.cos(i * 1.3) * 0.08);
      sprite.material.opacity = 1 - t;
    });
  });
  return (
    <group ref={group}>
      {[0, 1, 2].map((i) => (
        <sprite key={i} scale={[0.08, 0.08, 1]}>
          <spriteMaterial map={texture} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

function NameTag({ name }) {
  const texture = useMemo(() => createTextTexture([{ text: name, size: 40, weight: 600, color: palette.white }], { width: 384, height: 96 }), [name]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, 0.58, 0]} scale={[0.44, 0.11, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

const probe = new THREE.Vector3();
const footMatrix = new THREE.Matrix4();
const parentInverse = new THREE.Matrix4();
const footPosition = new THREE.Vector3();
const footQuaternion = new THREE.Quaternion();
const footScale = new THREE.Vector3();
const ballMaterial = new THREE.MeshStandardMaterial({ color: "#c8e64b", roughness: 0.8 });

export function Dog({ stateRef, name, growth = null, reducedMotion = false }) {
  const model = useDogModel();
  const group = useRef();
  const body = useRef();
  const ball = useRef();
  const current = useRef({ anim: null, poseWeights: { sit: 0, lie: 0, sleep: 0 }, wagPhase: 0, flinch: 0, frame: 0, ground: 0 });
  const shadow = useMemo(() => new THREE.MeshBasicMaterial({ map: getBlobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 }), []);
  useEffect(() => () => shadow.dispose(), [shadow]);

  useFrame((_, rawDelta) => {
    const state = stateRef.current;
    const g = group.current;
    if (!state || !g) return;
    const dt = Math.min(rawDelta, 0.05);
    // Glide to the computed spot (the computation is exact; this only smooths frame jitter).
    const smooth = 1 - Math.exp(-14 * dt);
    g.position.x += (state.x - g.position.x) * smooth;
    g.position.z += (state.z - g.position.z) * smooth;
    let turn = state.ry - g.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    g.rotation.y += turn * (1 - Math.exp(-10 * dt));

    // The ball: in the air / on the floor (world space) or in the dog's mouth.
    if (ball.current) {
      ball.current.visible = Boolean(state.ball || state.carrying);
      if (state.carrying && model?.bones.Head) {
        model.bones.Head.getWorldPosition(ball.current.position);
        // In its mouth: a little ahead of and below the head bone.
        ball.current.position.y -= 0.045;
        ball.current.position.x += Math.sin(g.rotation.y) * 0.045;
        ball.current.position.z += Math.cos(g.rotation.y) * 0.045;
      } else if (state.ball) ball.current.position.set(state.ball.x, state.ball.y, state.ball.z);
    }

    if (!model) return;
    const c = current.current;
    // Animation: cross-fade to the asked-for clip.
    let anim = state.anim === "petted" ? (Math.floor(performance.now() / 700) % 2 ? "petted2" : "petted") : state.anim;
    if (!model.actions[anim]) anim = "idle";
    if (state.pose === "sleep" || state.pose === "lie") anim = anim === "eat" ? "eat" : "idle";
    if (c.anim !== anim) {
      const next = model.actions[anim];
      const previous = c.anim && model.actions[c.anim];
      next.reset().setEffectiveWeight(1).play();
      if (anim === "jump" || anim.startsWith("petted")) next.setLoop(THREE.LoopRepeat);
      if (previous) next.crossFadeFrom(previous, 0.25, false);
      c.anim = anim;
    }
    for (const [bone, quaternion] of model.rest) bone.quaternion.copy(quaternion);
    for (const foot of model.feet) {
      foot.foot.position.copy(foot.restPosition);
      foot.foot.quaternion.copy(foot.restQuaternion);
    }
    model.mixer.update(reducedMotion && (anim === "walk" || anim === "run") ? dt * 0.5 : dt);

    // Poses on top of the animation, eased in and out.
    const pose = state.pose ?? "stand";
    for (const name of ["sit", "lie", "sleep"]) c.poseWeights[name] += ((pose === name ? 1 : 0) - c.poseWeights[name]) * (1 - Math.exp(-6 * dt));
    for (const [poseName, weight] of Object.entries(c.poseWeights)) {
      if (weight < 0.001) continue;
      const def = POSES[poseName];
      for (const [bone, [x, y, z]] of Object.entries(def.bones)) {
        const b = model.bones[bone];
        if (!b) continue;
        b.rotation.x += x * weight;
        b.rotation.y += y * weight;
        b.rotation.z += z * weight;
      }
    }
    for (const [bone, [x, y, z]] of Object.entries(EAR_FLOP)) {
      const b = model.bones[bone];
      if (b) {
        b.rotation.x += x;
        b.rotation.y += y;
        b.rotation.z += z;
      }
    }
    // Sleeping: slow breathing instead of the idle sway.
    if (c.poseWeights.sleep > 0.5) model.mixer.timeScale = 0.25;
    else model.mixer.timeScale = 1;
    // Tail wag: faster and wider when happy.
    const wag = state.wag ?? 0.3;
    c.wagPhase += dt * (4 + wag * 14);
    const swing = Math.sin(c.wagPhase) * (0.15 + wag * 0.55);
    TAIL_BONES.forEach((name, i) => {
      const b = model.bones[name];
      if (b) b.rotation.y += swing * (i ? 0.6 : 1);
    });
    // Feet follow folded legs (weighted by how far into a pose it is).
    const posed = Math.max(c.poseWeights.sit, c.poseWeights.lie, c.poseWeights.sleep);
    if (posed > 0.001) {
      model.root.updateMatrixWorld(true);
      for (const { foot, leg, offset } of model.feet) {
        footMatrix.multiplyMatrices(leg.matrixWorld, offset);
        footMatrix.premultiply(parentInverse.copy(foot.parent.matrixWorld).invert());
        footMatrix.decompose(footPosition, footQuaternion, footScale);
        foot.position.lerp(footPosition, posed);
        foot.quaternion.slerp(footQuaternion, posed);
      }
    }
    // Growing up: a puppy's head is big for its body.
    if (model.bones.Head && growth) model.bones.Head.scale.setScalar(growth.head);
    // On the floor, never in it: every few frames find the body's lowest point
    // and settle the dog so it just touches the floor, whatever the pose.
    if (body.current && c.frame++ % 4 === 0) {
      model.root.updateMatrixWorld(true);
      let lowest = Infinity;
      for (const mesh of model.body) {
        const count = mesh.geometry.attributes.position.count;
        for (let i = 0; i < count; i += 3) {
          mesh.getVertexPosition(i, probe).applyMatrix4(mesh.matrixWorld);
          if (probe.y < lowest) lowest = probe.y;
        }
      }
      const floorY = g.position.y;
      if (Number.isFinite(lowest)) c.ground = body.current.position.y - (lowest - floorY) / (g.scale.y || 1);
    }
    if (body.current) body.current.position.y += (c.ground - body.current.position.y) * (1 - Math.exp(-10 * dt));
    if (growth) g.scale.setScalar(growth.size);
  });

  return (
    <>
      <group ref={group} position={[stateRef.current?.x ?? 0, 0, stateRef.current?.z ?? 0]}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.004} material={shadow}>
          <planeGeometry args={[0.55, 0.55]} />
        </mesh>
        {model && (
          <group ref={body}>
            <primitive object={model.root} />
          </group>
        )}
        {name && <NameTag name={name} />}
        <Hearts stateRef={stateRef} />
      </group>
      <mesh ref={ball} visible={false} material={ballMaterial}>
        <sphereGeometry args={[0.032, 14, 10]} />
      </mesh>
    </>
  );
}
