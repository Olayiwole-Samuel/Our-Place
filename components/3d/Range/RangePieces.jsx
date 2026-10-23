"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { LANES, LANE_HALF_WIDTH } from "@/lib/range/targets";
import { useRoomStore } from "@/store/roomStore";

/**
 * The range room's fixed pieces (lib/world/rooms/rangeRoom.js): the counter you
 * shoot from, the lanes with their pistols resting on the counter, the
 * downrange (lane lines, dividers, the sloped berm at the back, lights) and
 * the best-scores board by the door. Targets and shooting: RangePlay.jsx.
 */
const mats = new Map();
export function mat(color, { emissive = null, intensity = 1, roughness = 0.8, metalness = 0 } = {}) {
  const key = `${color}|${emissive}|${intensity}|${roughness}|${metalness}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = intensity;
      m.toneMapped = false;
    }
    mats.set(key, m);
  }
  return mats.get(key);
}

/** A pistol, pointing along −z (its front), grip down. ~20 cm long. */
export function Pistol({ flash = null }) {
  return (
    <group>
      <mesh position={[0, 0.03, -0.05]} material={mat("#5a5e66", { metalness: 0.5, roughness: 0.35 })}>
        <boxGeometry args={[0.032, 0.035, 0.19]} />
      </mesh>
      <mesh position={[0, -0.025, 0.02]} rotation-x={0.25} material={mat("#1c1d20", { roughness: 0.7 })}>
        <boxGeometry args={[0.03, 0.09, 0.045]} />
      </mesh>
      <mesh position={[0, 0.0, -0.01]} material={mat("#1c1d20")}>
        <boxGeometry args={[0.028, 0.02, 0.06]} />
      </mesh>
      <mesh position={[0, 0.035, -0.148]} rotation-x={Math.PI / 2} material={mat("#111214")}>
        <cylinderGeometry args={[0.007, 0.007, 0.012, 10]} />
      </mesh>
      {flash}
    </group>
  );
}

export function RangeCounter() {
  return (
    <group>
      <mesh position={[0, 0.95, 0]} material={mat("#6b4f3a", { roughness: 0.6 })} castShadow receiveShadow>
        <boxGeometry args={[6, 0.06, 0.6]} />
      </mesh>
      <mesh position={[0, 0.46, 0.05]} material={mat("#2c2f33")}>
        <boxGeometry args={[6, 0.92, 0.5]} />
      </mesh>
    </group>
  );
}

/** A lane's spot on the counter: its number, a pistol resting, ear defenders. */
export function RangeLane({ object }) {
  const number = (object?.lane ?? 0) + 1;
  const label = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f2c94c";
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1d20";
    ctx.font = "bold 80px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [number]);
  useEffect(() => () => label.dispose(), [label]);
  return (
    <group>
      <group position={[0.25, 1.0, -0.05]} rotation={[-Math.PI / 2, 0, 0.4]}>
        <group rotation-x={Math.PI / 2}>
          <Pistol />
        </group>
      </group>
      <group position={[-0.3, 1.02, 0.05]}>
        <mesh rotation-z={Math.PI / 2} material={mat("#c0392b")}>
          <torusGeometry args={[0.07, 0.012, 6, 16, Math.PI]} />
        </mesh>
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} position={[x, -0.01, 0]} rotation-z={Math.PI / 2} material={mat("#222")}>
            <cylinderGeometry args={[0.035, 0.035, 0.03, 14]} />
          </mesh>
        ))}
      </group>
      <mesh position={[-0.78, 1.16, -0.2]}>
        <circleGeometry args={[0.08, 24]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
      <mesh position={[-0.78, 1.04, -0.21]} material={mat("#222")}>
        <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
      </mesh>
    </group>
  );
}

/** Lane lines and dividers, the sloped berm at the back, and the lights. */
export function RangeDownrange({ room }) {
  const { minX, maxX, minZ } = room.bounds;
  const counter = 1.5;
  const depth = counter - minZ;
  return (
    <group>
      {/* Lane lines on the floor, distance marks every 2 m. */}
      {LANES.flatMap((x) => [x - LANE_HALF_WIDTH, x + LANE_HALF_WIDTH]).map((x, i) => (
        <mesh key={`line${i}`} rotation-x={-Math.PI / 2} position={[x, 0.004, (counter + minZ) / 2]} material={mat("#f2c94c")}>
          <planeGeometry args={[0.04, depth]} />
        </mesh>
      ))}
      {[-0.5, -2.5, -4.5].map((z) => (
        <mesh key={z} rotation-x={-Math.PI / 2} position={[0, 0.004, z]} material={mat("#7a7d82")}>
          <planeGeometry args={[maxX - minX - 0.4, 0.03]} />
        </mesh>
      ))}
      {/* Divider between the lanes, by the counter. */}
      <mesh position={[0, 1.45, counter - 0.55]} material={mat("#3b3f45")}>
        <boxGeometry args={[0.05, 1.3, 1.1]} />
      </mesh>
      {/* The berm: a dark sloped backstop. */}
      <mesh position={[0, 1.2, minZ + 0.45]} rotation-x={-0.35} material={mat("#1f1a17", { roughness: 1 })} receiveShadow>
        <boxGeometry args={[maxX - minX, 2.8, 0.3]} />
      </mesh>
      {/* Baffles across the ceiling. */}
      {[-1, -3.5].map((z) => (
        <mesh key={z} position={[0, room.size.height - 0.25, z]} material={mat("#2c2f33")}>
          <boxGeometry args={[maxX - minX, 0.4, 0.1]} />
        </mesh>
      ))}
      {/* Light over each lane's targets. */}
      {LANES.map((x) => (
        <group key={x}>
          <mesh position={[x, room.size.height - 0.08, -3.5]} material={mat("#fff6dd", { emissive: "#fff2cc", intensity: 1.6 })}>
            <boxGeometry args={[0.6, 0.04, 1.4]} />
          </mesh>
          <pointLight position={[x, 2.6, -4]} intensity={1.6} distance={6} decay={2} color="#fff2d6" />
        </group>
      ))}
    </group>
  );
}

/** Best scores, by the door. */
export function RangeBoard({ runtime }) {
  const range = useRoomStore((state) => state.range);
  useEffect(() => {
    useRoomStore.getState().refresh("range");
  }, []);
  const me = useRoomStore.getState().me();
  const partnerName = runtime?.partnerName ?? "Them";
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#14161a";
    ctx.fillRect(0, 0, 512, 640);
    ctx.strokeStyle = "#f2c94c";
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 628);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f2c94c";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("🎯 BEST SCORES", 256, 70);
    ctx.font = "bold 40px sans-serif";
    ctx.fillStyle = "#8fdc7a";
    ctx.fillText(`You  ${range?.myBest ?? 0}`, 256, 150);
    ctx.fillStyle = "#ff8fb1";
    ctx.fillText(`${partnerName}  ${range?.partnerBest ?? 0}`.slice(0, 18), 256, 205);
    ctx.font = "26px sans-serif";
    ctx.fillStyle = "#a8ada5";
    ctx.fillText("Latest rounds", 256, 270);
    (range?.recent ?? []).slice(0, 7).forEach((round, i) => {
      const y = 315 + i * 44;
      const mine = round.userId === me;
      ctx.textAlign = "left";
      ctx.fillStyle = mine ? "#8fdc7a" : "#ff8fb1";
      ctx.fillText(mine ? "You" : partnerName.slice(0, 10), 50, y);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      const accuracy = round.shots ? Math.round((round.hits / round.shots) * 100) : 0;
      ctx.fillText(`${round.score}  ·  ${accuracy}%`, 462, y);
    });
    if (!range?.recent?.length) {
      ctx.fillStyle = "#a8ada5";
      ctx.fillText("Step up to a lane and press Shoot", 256, 340);
    }
    const made = new THREE.CanvasTexture(canvas);
    made.colorSpace = THREE.SRGBColorSpace;
    return made;
  }, [range, me, partnerName]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[0, 1.55, 0.03]}>
      <mesh material={mat("#0f1012")}>
        <boxGeometry args={[1.06, 1.3, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <planeGeometry args={[1.0, 1.24]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
