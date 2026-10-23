"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LANES, targetAt } from "@/lib/range/targets";
import { useRangeStore } from "@/store/rangeStore";
import { Pistol, mat } from "./RangePieces";

/**
 * Shooting at the range, while you're at a lane (store/rangeStore.js):
 * targets popping up downrange (and flipping down when hit), your pistol in
 * your hand at the bottom right with recoil and a muzzle flash, "+10" floating
 * up from each hit, and holes in the berm where you missed. Taps / clicks are
 * turned into rays here (they're queued by useWorldControls).
 */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const BERM_Z = -5.5;

function targetTexture(gold) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const rings = gold ? ["#b8860b", "#ffd23f", "#b8860b", "#fff3b0"] : ["#f5f0e6", "#1c1d20", "#f5f0e6", "#e5484d"];
  [1, 0.78, 0.58, 0.22].forEach((r, i) => {
    ctx.fillStyle = rings[i];
    ctx.beginPath();
    ctx.arc(128, 128, 124 * r, 0, Math.PI * 2);
    ctx.fill();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function textSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 84px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One target: pops up when it appears, flips down when hit or when its time is up. */
function Target({ target, textures }) {
  const group = useRef();
  useFrame(() => {
    const { startedAt, hit, phase } = useRangeStore.getState();
    const g = group.current;
    if (!g || !startedAt) return;
    const t = Date.now() - startedAt;
    const at = targetAt(target, t);
    const shot = hit.has(target.id);
    // Up for its life; 0.18 s to pop up, 0.25 s to fall.
    let lift = 0;
    if (at.age >= 0) lift = Math.min(1, at.age / 180);
    if (at.age > target.life) lift = Math.max(0, 1 - (at.age - target.life) / 250);
    if (shot) {
      g.userData.shotAt ??= Date.now();
      lift = Math.max(0, 1 - (Date.now() - g.userData.shotAt) / 250);
    }
    if (phase !== "playing") lift = 0;
    g.visible = lift > 0.01;
    g.position.set(at.x, at.y, at.z);
    g.rotation.x = -(1 - lift) * (Math.PI / 2);
  });
  return (
    <group ref={group} visible={false}>
      <mesh>
        <circleGeometry args={[target.radius, 32]} />
        <meshStandardMaterial map={target.kind === "gold" ? textures.gold : textures.plain} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, target.radius + 0.6, -0.01]} material={mat("#3b3f45")}>
        <cylinderGeometry args={[0.006, 0.006, 1.2, 4]} />
      </mesh>
    </group>
  );
}

/** "+10" floating up from a hit. */
function Popup({ popup }) {
  const texture = useMemo(() => textSprite(`+${popup.points}`, popup.bullseye ? "#ffd23f" : "#ffffff"), [popup.points, popup.bullseye]);
  useEffect(() => () => texture.dispose(), [texture]);
  const sprite = useRef();
  useFrame(() => {
    const age = (Date.now() - popup.at) / 900;
    if (!sprite.current) return;
    sprite.current.visible = age < 1;
    sprite.current.position.set(popup.x, popup.y + 0.15 + age * 0.45, popup.z + 0.05);
    sprite.current.material.opacity = 1 - age;
  });
  return (
    <sprite ref={sprite} scale={[0.5, 0.25, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

export function RangePlay({ runtime }) {
  const lane = useRangeStore((state) => state.lane);
  const plan = useRangeStore((state) => state.plan);
  const popups = useRangeStore((state) => state.popups);
  const holes = useRangeStore((state) => state.holes);
  const camera = useThree((state) => state.camera);
  const gun = useRef();
  const flash = useRef();
  const kick = useRef({ at: 0, aim: new THREE.Vector3(0, 1.2, -6) });
  const [textures] = useState(() => ({ plain: targetTexture(false), gold: targetTexture(true) }));
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);

  useFrame(() => {
    if (lane === null) return;
    // Shots: each queued tap becomes a ray from the camera.
    const store = useRangeStore.getState();
    for (const aim of store.takeAims()) {
      const view = runtime.view;
      if (!view?.canvas) continue;
      const rect = view.canvas.getBoundingClientRect();
      ndc.set(((aim.clientX - rect.left) / rect.width) * 2 - 1, -((aim.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const { origin, direction } = raycaster.ray;
      const k = (BERM_Z - origin.z) / direction.z;
      const wall = k > 0 ? { x: origin.x + direction.x * k, y: Math.max(0.05, origin.y + direction.y * k) } : null;
      store.fire({ x: origin.x, y: origin.y, z: origin.z }, { x: direction.x, y: direction.y, z: direction.z }, wall);
      kick.current.at = performance.now();
      kick.current.aim.copy(origin).addScaledVector(direction, 8);
    }
    // The pistol in your hand: bottom right of the view, pointing at your last shot, kicking up when it fires.
    const g = gun.current;
    if (g) {
      const since = (performance.now() - kick.current.at) / 1000;
      const recoil = since < 0.18 ? Math.sin((since / 0.18) * Math.PI) : 0;
      g.position.set(0.17, -0.2 + recoil * 0.015, -0.42 + recoil * 0.05).applyMatrix4(camera.matrixWorld);
      g.lookAt(kick.current.aim);
      g.rotateX(recoil * 0.25);
      if (flash.current) flash.current.visible = since < 0.06;
    }
  });

  if (lane === null) return null;
  return (
    <group>
      {plan.map((target) => (
        <Target key={`${target.id}-${target.at}`} target={target} textures={textures} />
      ))}
      {popups.map((popup) => (
        <Popup key={popup.id} popup={popup} />
      ))}
      {holes.map((hole, i) => (
        <mesh key={i} position={[hole.x, hole.y, BERM_Z + 0.02]} material={mat("#0a0908")}>
          <circleGeometry args={[0.018, 10]} />
        </mesh>
      ))}
      <group ref={gun}>
        <group rotation-y={Math.PI}>
          <Pistol
            flash={
              <mesh ref={flash} position={[0, 0.035, -0.175]} visible={false} material={mat("#ffcc66", { emissive: "#ffb347", intensity: 4 })}>
                <sphereGeometry args={[0.011, 8, 6]} />
              </mesh>
            }
          />
        </group>
      </group>
    </group>
  );
}

/** Where you stand at lane `index` (just behind the counter, facing downrange). */
export const laneSpot = (index) => ({ x: LANES[index] ?? 0, z: 2.05, ry: Math.PI });
