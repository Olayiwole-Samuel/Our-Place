"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { goodnightTonight, skyAt } from "@/lib/bedroom/night";
import { BED, BED_TOP } from "@/lib/world/rooms/bedroom";
import { useBedroomStore } from "@/store/bedroomStore";
import { useRoomStore } from "@/store/roomStore";

/**
 * The bedroom's pieces (lib/world/rooms/bedroom.js). They read the bedroom
 * store each frame (never re-rendering the scene): once you've said goodnight
 * the lamps turn down to a night-light and the stars on the ceiling glow; the
 * window shows the same shooting stars on both screens (lib/bedroom/night.js).
 */
const materials = new Map();
function mat(color, { emissive = null, intensity = 1, roughness = 0.75, metalness = 0 } = {}) {
  const key = `${color}|${emissive}|${intensity}|${roughness}|${metalness}`;
  if (!materials.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = intensity;
    }
    materials.set(key, m);
  }
  return materials.get(key);
}

/** Has this phone's person said goodnight tonight? (read per frame, no re-render) */
function saidGoodnight() {
  const me = useRoomStore.getState().me?.();
  if (!me) return false;
  return Boolean(goodnightTonight(useBedroomStore.getState().goodnights, { me, partner: null }).mine);
}

// ── The bed ────────────────────────────────────────────────────────────────
/** A big bed: frame, headboard, mattress, two pillows and a duvet over the bottom two-thirds (it covers you when you lie down). */
// The duvet covers from just below your shoulders to the foot of the bed.
const DUVET_LENGTH = 1.42;
const DUVET_Z = BED.halfDepth - DUVET_LENGTH / 2 + 0.03;

export function Bed() {
  const length = BED.halfDepth * 2;
  const width = BED.halfWidth * 2;
  return (
    <group>
      {/* frame + legs */}
      <mesh position={[0, 0.2, 0]} material={mat("#6b4a35", { roughness: 0.6 })} castShadow receiveShadow>
        <boxGeometry args={[width + 0.08, 0.26, length + 0.08]} />
      </mesh>
      {/* headboard (against the wall, at −z) */}
      <mesh position={[0, 0.78, -length / 2 - 0.02]} material={mat("#7a5340", { roughness: 0.55 })} castShadow>
        <boxGeometry args={[width + 0.16, 1.1, 0.1]} />
      </mesh>
      <mesh position={[0, 0.92, -length / 2 + 0.04]} material={mat("#c98fa0", { roughness: 0.95 })}>
        <boxGeometry args={[width - 0.1, 0.6, 0.04]} />
      </mesh>
      {/* mattress */}
      <mesh position={[0, BED_TOP - 0.11, 0]} material={mat("#f3eee6", { roughness: 0.95 })} receiveShadow>
        <boxGeometry args={[width, 0.22, length]} />
      </mesh>
      {/* pillows */}
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, BED_TOP + 0.07, -length / 2 + 0.3]} rotation-x={-0.25} material={mat("#ffffff", { roughness: 1 })} castShadow>
          <boxGeometry args={[0.66, 0.14, 0.36]} />
        </mesh>
      ))}
      {/* duvet: thick and soft over the bottom of the bed, a folded edge at the top */}
      <mesh position={[0, BED_TOP + 0.3, DUVET_Z]} material={mat("#b85c7a", { roughness: 1 })} castShadow receiveShadow>
        <boxGeometry args={[width + 0.06, 0.26, DUVET_LENGTH]} />
      </mesh>
      <mesh position={[0, BED_TOP + 0.445, DUVET_Z - DUVET_LENGTH / 2 + 0.08]} material={mat("#f0dce3", { roughness: 1 })}>
        <boxGeometry args={[width + 0.07, 0.035, 0.16]} />
      </mesh>
      {/* the duvet's sides fall to the frame */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 + 0.035), BED_TOP + 0.08, DUVET_Z]} material={mat("#b85c7a", { roughness: 1 })}>
          <boxGeometry args={[0.03, 0.52, DUVET_LENGTH]} />
        </mesh>
      ))}
    </group>
  );
}

// ── Nightstands ────────────────────────────────────────────────────────────
/** A nightstand with a lamp: warm, until you've said goodnight — then a soft night-light. */
export function Nightstand({ object }) {
  const light = useRef();
  const shade = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fbe7c6", emissive: new THREE.Color("#ffcf8a"), emissiveIntensity: 1.2, roughness: 0.9 }), []);
  useEffect(() => () => shade.dispose(), [shade]);
  useFrame(() => {
    const dim = saidGoodnight();
    if (light.current) light.current.intensity += ((dim ? 0.15 : 0.9) - light.current.intensity) * 0.06;
    shade.emissiveIntensity += ((dim ? 0.25 : 1.2) - shade.emissiveIntensity) * 0.06;
  });
  const variant = object?.variant ?? 0;
  return (
    <group>
      <mesh position={[0, 0.28, 0]} material={mat("#6b4a35", { roughness: 0.6 })} castShadow>
        <boxGeometry args={[0.48, 0.56, 0.42]} />
      </mesh>
      <mesh position={[0, 0.34, 0.215]} material={mat("#c9a27a", { metalness: 0.5, roughness: 0.4 })}>
        <boxGeometry args={[0.1, 0.02, 0.02]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} material={mat("#d9c4a5", { roughness: 0.5 })}>
        <cylinderGeometry args={[0.06, 0.08, 0.08, 16]} />
      </mesh>
      <mesh position={[0, 0.72, 0]} material={mat("#c9a27a", { metalness: 0.4 })}>
        <cylinderGeometry args={[0.012, 0.012, 0.2, 8]} />
      </mesh>
      <mesh position={[0, 0.86, 0]} material={shade}>
        <cylinderGeometry args={[0.1, 0.15, 0.17, 20, 1, true]} />
      </mesh>
      {variant === 1 ? (
        // a little framed heart for the goodnight side
        <mesh position={[0.15, 0.64, 0.05]} rotation-y={-0.4} material={mat("#ff8fb1", { emissive: "#ff5f8f", intensity: 0.4 })}>
          <boxGeometry args={[0.1, 0.12, 0.015]} />
        </mesh>
      ) : (
        // a tiny speaker for the sleep sounds
        <mesh position={[-0.15, 0.62, 0.05]} material={mat("#2b2b33", { roughness: 0.6 })}>
          <cylinderGeometry args={[0.045, 0.045, 0.06, 16]} />
        </mesh>
      )}
      <pointLight ref={light} position={[0, 0.9, 0.05]} color="#ffcf8a" intensity={0.9} distance={3.2} decay={2} />
    </group>
  );
}

// ── The wardrobe ───────────────────────────────────────────────────────────
export function Wardrobe() {
  return (
    <group>
      <mesh position={[0, 1.0, 0]} material={mat("#7a5340", { roughness: 0.6 })} castShadow>
        <boxGeometry args={[1.25, 2.0, 0.55]} />
      </mesh>
      <mesh position={[0, 1.0, 0.281]} material={mat("#5e3f2f", { roughness: 0.6 })}>
        <boxGeometry args={[0.012, 1.9, 0.01]} />
      </mesh>
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, 1.05, 0.29]} material={mat("#d9b98a", { metalness: 0.6, roughness: 0.35 })}>
          <boxGeometry args={[0.02, 0.18, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}

// ── The window onto the night sky ──────────────────────────────────────────
/** Stars, a moon, and the shooting stars (same moments on both screens). */
export function SkyWindow() {
  const W = 1.5;
  const H = 1.15;
  const star = useRef();
  const sky = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 384;
    const g = canvas.getContext("2d");
    const gradient = g.createLinearGradient(0, 0, 0, 384);
    gradient.addColorStop(0, "#070b24");
    gradient.addColorStop(1, "#1d1940");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 512, 384);
    for (let i = 0; i < 160; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
      g.fillStyle = `rgba(255,255,255,${0.35 + ((i * 37) % 60) / 100})`;
      g.beginPath();
      g.arc(Math.abs(x) * 512, Math.abs(y) * 300, (i % 7 === 0 ? 1.6 : 0.9), 0, Math.PI * 2);
      g.fill();
    }
    // the moon
    g.fillStyle = "#fff6d8";
    g.shadowColor = "#fff2c0";
    g.shadowBlur = 30;
    g.beginPath();
    g.arc(410, 80, 34, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "#1a1636";
    g.beginPath();
    g.arc(426, 70, 30, 0, Math.PI * 2);
    g.fill();
    // rooftops of Lagos at the bottom
    g.fillStyle = "#0a0a16";
    let x = 0;
    while (x < 512) {
      const w = 30 + ((x * 7) % 50);
      const h = 30 + ((x * 13) % 70);
      g.fillRect(x, 384 - h, w - 3, h);
      g.fillStyle = "rgba(255,210,120,0.65)";
      for (let k = 0; k < 4; k++) if ((x + k * 11) % 3 === 0) g.fillRect(x + 6 + k * 7, 384 - h + 10 + ((k * 17) % (h - 18)), 3, 4);
      g.fillStyle = "#0a0a16";
      x += w;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => sky.dispose(), [sky]);
  const streak = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), []);
  useEffect(() => () => streak.dispose(), [streak]);

  useFrame(() => {
    const seed = useRoomStore.getState().coupleId ?? "our-place";
    const now = Date.now() + (useRoomStore.getState().skewMs ?? 0);
    const { crossing } = skyAt(seed, now);
    if (!star.current) return;
    if (!crossing) {
      streak.opacity = 0;
      return;
    }
    const p = crossing.progress;
    const dx = Math.cos(crossing.angle) * crossing.length;
    const dy = -Math.sin(crossing.angle) * crossing.length;
    const x = (crossing.x + dx * p - 0.5) * W;
    const y = (0.5 - (crossing.y - dy * p)) * H;
    star.current.position.set(x, y, 0.012);
    star.current.rotation.z = -crossing.angle;
    streak.opacity = Math.sin(p * Math.PI);
  });

  return (
    <group position={[0, 1.55, 0.02]}>
      <mesh material={mat("#e9dccb", { roughness: 0.7 })}>
        <boxGeometry args={[W + 0.14, H + 0.14, 0.05]} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      <mesh ref={star} material={streak}>
        <planeGeometry args={[0.32, 0.012]} />
      </mesh>
      {/* the window bars */}
      <mesh position={[0, 0, 0.04]} material={mat("#e9dccb")}>
        <boxGeometry args={[0.035, H, 0.02]} />
      </mesh>
      <mesh position={[0, 0, 0.04]} material={mat("#e9dccb")}>
        <boxGeometry args={[W, 0.035, 0.02]} />
      </mesh>
      {/* curtains */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (W / 2 + 0.18), -0.1, 0.08]} material={mat("#8e4f6b", { roughness: 1 })}>
          <boxGeometry args={[0.26, H + 0.6, 0.04]} />
        </mesh>
      ))}
      <pointLight position={[0, 0, 0.6]} color="#8fa6ff" intensity={0.35} distance={3} decay={2} />
    </group>
  );
}

// ── Glow-in-the-dark stars on the ceiling ─────────────────────────────────
export function StarCeiling({ room }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d6ffb8", transparent: true, opacity: 0.25, toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  const spots = useMemo(() => {
    const list = [];
    for (let i = 0; i < 40; i++) list.push([(((i * 0.6180339) % 1) - 0.5) * room.size.width * 0.85, (((i * 0.4142135) % 1) - 0.5) * room.size.depth * 0.85, 0.02 + (i % 3) * 0.012]);
    return list;
  }, [room.size.width, room.size.depth]);
  useFrame(({ clock }) => {
    const target = saidGoodnight() ? 0.85 + Math.sin(clock.elapsedTime * 1.3) * 0.1 : 0.22;
    material.opacity += (target - material.opacity) * 0.04;
  });
  return (
    <group position={[0, room.size.height - 0.01, 0]}>
      {spots.map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0, z]} rotation-x={Math.PI / 2} material={material}>
          <circleGeometry args={[r, 5]} />
        </mesh>
      ))}
    </group>
  );
}
