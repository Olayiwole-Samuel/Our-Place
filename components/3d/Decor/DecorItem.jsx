"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The things you can place (lib/room/decor.js), modelled from simple shapes in
 * the room's own soft style. Each faces +z ("its front") and sits on the floor
 * at its origin; sizes match the catalogue's footprint. Glowing things (candles,
 * lamps, lanterns) use emissive materials rather than real lights, so a room
 * full of them stays light on phones.
 */
const materials = new Map();
function mat(color, { emissive = null, intensity = 1, opacity = 1, roughness = 0.85, metalness = 0 } = {}) {
  const key = `${color}|${emissive}|${intensity}|${opacity}|${roughness}|${metalness}`;
  if (!materials.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = intensity;
      m.toneMapped = false;
    }
    materials.set(key, m);
  }
  return materials.get(key);
}

const WOOD = "#b98d62";
const DARK_WOOD = "#5e4433";
const FLAME = "#ffb347";
const box = (w, h, d) => <boxGeometry args={[w, h, d]} />;
const cyl = (rt, rb, h, s = 20) => <cylinderGeometry args={[rt, rb, h, s]} />;
const ball = (r, s = 16) => <sphereGeometry args={[r, s, Math.max(8, s * 0.6)]} />;

function Mesh({ geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, shadow = true }) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} material={material} castShadow={shadow} receiveShadow>
      {geometry}
    </mesh>
  );
}

const heartShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.62);
  s.bezierCurveTo(-0.15, -0.45, -0.7, -0.1, -0.7, 0.25);
  s.bezierCurveTo(-0.7, 0.55, -0.4, 0.68, -0.2, 0.62);
  s.bezierCurveTo(-0.08, 0.58, 0, 0.48, 0, 0.4);
  s.bezierCurveTo(0, 0.48, 0.08, 0.58, 0.2, 0.62);
  s.bezierCurveTo(0.4, 0.68, 0.7, 0.55, 0.7, 0.25);
  s.bezierCurveTo(0.7, -0.1, 0.15, -0.45, 0, -0.62);
  return s;
})();

function Flame({ position }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.y = 1 + Math.sin(clock.elapsedTime * 13 + position[0] * 9) * 0.15;
  });
  return (
    <mesh ref={ref} position={position} material={mat(FLAME, { emissive: FLAME, intensity: 2.4 })}>
      <coneGeometry args={[0.012, 0.04, 8]} />
    </mesh>
  );
}

function Glow({ position, size = 0.6, color = FLAME }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,190,110,0.55)");
    g.addColorStop(1, "rgba(255,190,110,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }, []);
  return (
    <sprite position={position} scale={[size, size, 1]}>
      <spriteMaterial map={texture} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>
  );
}

function Pot({ r = 0.15, h = 0.22, color = "#c97b5a" }) {
  return (
    <>
      <Mesh geometry={cyl(r, r * 0.78, h)} material={mat(color)} position={[0, h / 2, 0]} />
      <Mesh geometry={cyl(r * 0.92, r * 0.92, 0.02)} material={mat("#4a3426")} position={[0, h - 0.005, 0]} shadow={false} />
    </>
  );
}

function Fish() {
  const group = useRef();
  useFrame(({ clock }) => {
    group.current?.children.forEach((fish, i) => {
      const t = clock.elapsedTime * (0.35 + i * 0.12) + i * 2;
      fish.position.set(Math.sin(t) * 0.38, 0.62 + i * 0.07 + Math.sin(t * 2.3) * 0.02, Math.cos(t * 1.3) * 0.08);
      fish.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
    });
  });
  return (
    <group ref={group}>
      {["#ff8a3d", "#ffd23f", "#ff5e7e"].map((color) => (
        <mesh key={color} material={mat(color, { emissive: color, intensity: 0.25 })}>
          <sphereGeometry args={[0.025, 10, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function Record() {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 3.5;
  });
  return (
    <group ref={ref} position={[-0.08, 0.47, 0]}>
      <Mesh geometry={cyl(0.15, 0.15, 0.01, 32)} material={mat("#151515", { roughness: 0.4 })} />
      <Mesh geometry={cyl(0.05, 0.05, 0.012, 20)} material={mat("#e889a2")} />
    </group>
  );
}

const MODELS = {
  dog_house: () => (
    <>
      <Mesh geometry={box(0.84, 0.5, 0.74)} material={mat(WOOD)} position={[0, 0.25, 0]} />
      <Mesh geometry={box(0.5, 0.06, 0.82)} material={mat("#b5525a")} position={[-0.22, 0.6, 0]} rotation={[0, 0, 0.62]} />
      <Mesh geometry={box(0.5, 0.06, 0.82)} material={mat("#b5525a")} position={[0.22, 0.6, 0]} rotation={[0, 0, -0.62]} />
      <Mesh geometry={box(0.34, 0.34, 0.02)} material={mat("#1c1512")} position={[0, 0.2, 0.371]} shadow={false} />
      <Mesh geometry={cyl(0.17, 0.17, 0.02, 20)} material={mat("#1c1512")} position={[0, 0.37, 0.371]} rotation={[Math.PI / 2, 0, 0]} shadow={false} />
      <Mesh geometry={box(0.3, 0.07, 0.01)} material={mat("#f3e7d3")} position={[0, 0.52, 0.375]} shadow={false} />
    </>
  ),
  dog_bed: () => (
    <>
      <Mesh geometry={cyl(0.33, 0.33, 0.06, 28)} material={mat("#f3d2dc")} position={[0, 0.03, 0]} scale={[1, 1, 0.78]} />
      <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.78, 1]} material={mat("#e889a2")} castShadow>
        <torusGeometry args={[0.3, 0.06, 10, 28]} />
      </mesh>
    </>
  ),
  dog_bowl: () => (
    <>
      <Mesh geometry={box(0.42, 0.01, 0.22)} material={mat("#7a9a6a")} position={[0, 0.005, 0]} shadow={false} />
      {[-0.1, 0.1].map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          <Mesh geometry={cyl(0.08, 0.065, 0.05, 20)} material={mat("#d9dde3", { roughness: 0.3, metalness: 0.6 })} position={[0, 0.03, 0]} />
          {/* Water in the right bowl; the left one fills when you feed the dog (Food.jsx). */}
          {i === 1 && <Mesh geometry={cyl(0.068, 0.068, 0.005, 20)} material={mat("#7ab8e8", { roughness: 0.1 })} position={[0, 0.052, 0]} shadow={false} />}
        </group>
      ))}
    </>
  ),
  dog_toys: () => (
    <>
      <Mesh geometry={box(0.36, 0.16, 0.26)} material={mat("#b08a5a")} position={[0, 0.08, 0]} />
      <Mesh geometry={ball(0.045)} material={mat("#c8e64b")} position={[-0.08, 0.19, 0.02]} />
      <Mesh geometry={box(0.18, 0.04, 0.04)} material={mat("#f5f0e6")} position={[0.06, 0.18, -0.03]} rotation={[0, 0.4, 0.3]} />
      <Mesh geometry={ball(0.04)} material={mat("#e889a2")} position={[0.12, 0.19, 0.06]} />
    </>
  ),
  round_rug: () => (
    <>
      <Mesh geometry={cyl(1, 1, 0.012, 40)} material={mat("#6b4e71")} position={[0, 0.006, 0]} shadow={false} />
      <Mesh geometry={cyl(0.72, 0.72, 0.014, 40)} material={mat("#8a6a8f")} position={[0, 0.007, 0]} shadow={false} />
      <Mesh geometry={cyl(0.4, 0.4, 0.016, 32)} material={mat("#b495b7")} position={[0, 0.008, 0]} shadow={false} />
    </>
  ),
  fluffy_rug: () => <Mesh geometry={box(1.7, 0.025, 1.1)} material={mat("#ece6da", { roughness: 1 })} position={[0, 0.0125, 0]} shadow={false} />,
  heart_rug: () => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} material={mat("#e889a2", { roughness: 1 })} receiveShadow>
      <extrudeGeometry args={[heartShape, { depth: 0.012, bevelEnabled: false, curveSegments: 24 }]} />
    </mesh>
  ),
  floor_cushions: () => (
    <>
      <Mesh geometry={box(0.44, 0.12, 0.44)} material={mat("#e889a2")} position={[-0.25, 0.06, 0]} rotation={[0, 0.2, 0]} />
      <Mesh geometry={box(0.44, 0.12, 0.44)} material={mat("#7a9a6a")} position={[0.26, 0.06, 0.04]} rotation={[0, -0.25, 0]} />
    </>
  ),
  bean_bag: () => <Mesh geometry={ball(0.4, 20)} material={mat("#d9a441")} position={[0, 0.22, 0]} scale={[1, 0.6, 1]} />,
  armchair: () => (
    <>
      <Mesh geometry={box(0.86, 0.36, 0.78)} material={mat("#b47a8c")} position={[0, 0.2, 0.02]} />
      <Mesh geometry={box(0.86, 0.5, 0.16)} material={mat("#a46a7c")} position={[0, 0.58, -0.33]} />
      {[-0.39, 0.39].map((x) => (
        <Mesh key={x} geometry={box(0.12, 0.26, 0.74)} material={mat("#a46a7c")} position={[x, 0.5, 0]} />
      ))}
      <Mesh geometry={box(0.6, 0.08, 0.56)} material={mat("#c992a3")} position={[0, 0.42, 0.06]} />
    </>
  ),
  loveseat: () => (
    <>
      <Mesh geometry={box(1.56, 0.36, 0.8)} material={mat("#5d6e8c")} position={[0, 0.2, 0.02]} />
      <Mesh geometry={box(1.56, 0.52, 0.16)} material={mat("#4f5f7c")} position={[0, 0.6, -0.34]} />
      {[-0.72, 0.72].map((x) => (
        <Mesh key={x} geometry={box(0.14, 0.28, 0.76)} material={mat("#4f5f7c")} position={[x, 0.5, 0]} />
      ))}
      {[-0.36, 0.36].map((x) => (
        <Mesh key={x} geometry={box(0.66, 0.08, 0.58)} material={mat("#7184a3")} position={[x, 0.42, 0.06]} />
      ))}
    </>
  ),
  side_table: () => (
    <>
      <Mesh geometry={cyl(0.25, 0.25, 0.04, 28)} material={mat(WOOD)} position={[0, 0.55, 0]} />
      <Mesh geometry={cyl(0.03, 0.03, 0.53)} material={mat(DARK_WOOD)} position={[0, 0.27, 0]} />
      <Mesh geometry={cyl(0.16, 0.18, 0.02, 24)} material={mat(DARK_WOOD)} position={[0, 0.01, 0]} />
    </>
  ),
  dinner_table: () => (
    <>
      <Mesh geometry={box(1.0, 0.04, 0.7)} material={mat(WOOD)} position={[0, 0.74, 0]} />
      <Mesh geometry={box(1.02, 0.005, 0.25)} material={mat("#f3e7d3")} position={[0, 0.763, 0]} shadow={false} />
      {[
        [-0.45, -0.3],
        [0.45, -0.3],
        [-0.45, 0.3],
        [0.45, 0.3],
      ].map(([x, z]) => (
        <Mesh key={`${x}${z}`} geometry={box(0.05, 0.72, 0.05)} material={mat(DARK_WOOD)} position={[x, 0.36, z]} />
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * 0.52]} rotation={[0, side > 0 ? Math.PI : 0, 0]}>
          <Mesh geometry={box(0.42, 0.05, 0.4)} material={mat("#b47a8c")} position={[0, 0.45, 0]} />
          <Mesh geometry={box(0.42, 0.45, 0.05)} material={mat(DARK_WOOD)} position={[0, 0.7, -0.19]} />
          {[
            [-0.18, -0.17],
            [0.18, -0.17],
            [-0.18, 0.17],
            [0.18, 0.17],
          ].map(([x, z]) => (
            <Mesh key={`${x}${z}`} geometry={box(0.04, 0.43, 0.04)} material={mat(DARK_WOOD)} position={[x, 0.21, z]} />
          ))}
        </group>
      ))}
      {[-0.12, 0.12].map((x) => (
        <group key={x} position={[x, 0.76, 0]}>
          <Mesh geometry={cyl(0.018, 0.018, 0.16, 12)} material={mat("#fbf3e4")} position={[0, 0.08, 0]} />
          <Flame position={[0, 0.18, 0]} />
        </group>
      ))}
      <Glow position={[0, 0.98, 0]} size={0.7} />
    </>
  ),
  candles: () => (
    <>
      {[
        [-0.1, 0.12, 0],
        [0.06, 0.18, 0.05],
        [0.12, 0.09, -0.07],
      ].map(([x, h, z]) => (
        <group key={x} position={[x, 0, z]}>
          <Mesh geometry={cyl(0.04, 0.04, h, 16)} material={mat("#fbf3e4")} position={[0, h / 2, 0]} />
          <Flame position={[0, h + 0.025, 0]} />
        </group>
      ))}
      <Glow position={[0, 0.25, 0]} size={0.6} />
    </>
  ),
  lantern: () => (
    <>
      <Mesh geometry={box(0.24, 0.32, 0.24)} material={mat("#ffe2b0", { emissive: "#ffb85c", intensity: 1.3, opacity: 0.85 })} position={[0, 0.2, 0]} shadow={false} />
      <Mesh geometry={box(0.28, 0.03, 0.28)} material={mat("#1f1f1f", { metalness: 0.5 })} position={[0, 0.02, 0]} />
      <Mesh geometry={cyl(0.02, 0.16, 0.08, 4)} material={mat("#1f1f1f", { metalness: 0.5 })} position={[0, 0.4, 0]} rotation={[0, Math.PI / 4, 0]} />
      <Glow position={[0, 0.22, 0]} size={0.8} />
    </>
  ),
  warm_lamp: () => (
    <>
      <Mesh geometry={cyl(0.16, 0.18, 0.03, 24)} material={mat("#2b2b2b", { metalness: 0.5 })} position={[0, 0.015, 0]} />
      <Mesh geometry={cyl(0.015, 0.015, 1.3)} material={mat("#c9a35d", { metalness: 0.7, roughness: 0.3 })} position={[0, 0.66, 0]} />
      <Mesh geometry={cyl(0.12, 0.22, 0.28, 24)} material={mat("#ffe8c2", { emissive: "#ffc77a", intensity: 1.2 })} position={[0, 1.38, 0]} shadow={false} />
      <Glow position={[0, 1.35, 0]} size={1.1} />
    </>
  ),
  small_plant: () => (
    <>
      <Pot r={0.13} h={0.2} />
      {[0, 1.3, 2.6, 3.9, 5.2].map((a) => (
        <Mesh key={a} geometry={ball(0.09, 10)} material={mat("#5e8a4e")} position={[Math.sin(a) * 0.07, 0.3, Math.cos(a) * 0.07]} scale={[1, 1.3, 0.6]} rotation={[0, a, 0.3]} />
      ))}
    </>
  ),
  cactus: () => (
    <>
      <Pot r={0.1} h={0.14} color="#e0b07a" />
      <Mesh geometry={<capsuleGeometry args={[0.06, 0.28, 6, 12]} />} material={mat("#4f8a5a")} position={[0, 0.34, 0]} />
      <Mesh geometry={<capsuleGeometry args={[0.035, 0.1, 6, 10]} />} material={mat("#4f8a5a")} position={[0.08, 0.4, 0]} rotation={[0, 0, -0.5]} />
      <Mesh geometry={ball(0.025, 8)} material={mat("#f3a6b9")} position={[0, 0.54, 0]} />
    </>
  ),
  flower_vase: () => (
    <>
      <Mesh geometry={cyl(0.06, 0.1, 0.26, 18)} material={mat("#9fc6dd", { roughness: 0.2, opacity: 0.85 })} position={[0, 0.13, 0]} />
      {["#f3a6b9", "#ffd23f", "#ffffff", "#e889a2", "#c9a3e8"].map((color, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={color}>
            <Mesh geometry={cyl(0.005, 0.005, 0.2, 5)} material={mat("#4f7a3a")} position={[Math.sin(a) * 0.03, 0.34, Math.cos(a) * 0.03]} rotation={[Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2]} shadow={false} />
            <Mesh geometry={ball(0.035, 10)} material={mat(color)} position={[Math.sin(a) * 0.06, 0.45 + (i % 2) * 0.03, Math.cos(a) * 0.06]} />
          </group>
        );
      })}
    </>
  ),
  monstera: () => (
    <>
      <Pot r={0.22} h={0.32} color="#e9e2d6" />
      {[0, 1.1, 2.2, 3.3, 4.4, 5.5].map((a, i) => (
        <group key={a} position={[0, 0.3, 0]} rotation={[0, a, 0]}>
          <Mesh geometry={cyl(0.008, 0.008, 0.5 + (i % 3) * 0.12, 5)} material={mat("#4f7a3a")} position={[0, 0.25, 0.12]} rotation={[0.45, 0, 0]} shadow={false} />
          <Mesh geometry={ball(0.17, 12)} material={mat(i % 2 ? "#3f7a45" : "#4c8a50")} position={[0, 0.55 + (i % 3) * 0.12, 0.3]} scale={[1, 0.18, 1.35]} rotation={[-0.5, 0, 0]} />
        </group>
      ))}
    </>
  ),
  teddy_bear: () => (
    <group rotation={[-0.08, 0, 0]}>
      <Mesh geometry={ball(0.15)} material={mat("#a8774f")} position={[0, 0.15, 0]} scale={[1, 1.1, 0.9]} />
      <Mesh geometry={ball(0.11)} material={mat("#a8774f")} position={[0, 0.36, 0.02]} />
      {[-0.08, 0.08].map((x) => (
        <Mesh key={x} geometry={ball(0.04, 10)} material={mat("#8a5f3e")} position={[x, 0.45, 0]} />
      ))}
      <Mesh geometry={ball(0.045, 10)} material={mat("#e8cfae")} position={[0, 0.34, 0.1]} />
      {[-0.13, 0.13].map((x) => (
        <Mesh key={x} geometry={ball(0.06, 10)} material={mat("#a8774f")} position={[x, 0.06, 0.1]} />
      ))}
      <Mesh geometry={box(0.12, 0.04, 0.02)} material={mat("#e889a2")} position={[0, 0.27, 0.1]} />
    </group>
  ),
  bookshelf_small: () => (
    <>
      <Mesh geometry={box(0.9, 1.0, 0.33)} material={mat(DARK_WOOD)} position={[0, 0.5, 0]} />
      {[0.3, 0.62].map((y) => (
        <Mesh key={y} geometry={box(0.84, 0.02, 0.3)} material={mat(WOOD)} position={[0, y, 0.01]} shadow={false} />
      ))}
      {[0.06, 0.38, 0.7].map((y, row) =>
        ["#e889a2", "#f5f0e6", "#596b40", "#5d6e8c", "#d9a441", "#b47a8c"].slice(0, 5 - row).map((color, i) => (
          <Mesh key={`${y}${color}`} geometry={box(0.07, 0.2 - (i % 2) * 0.03, 0.22)} material={mat(color)} position={[-0.33 + i * 0.09, y + 0.11, 0.04]} shadow={false} />
        )),
      )}
    </>
  ),
  guitar: () => (
    <group position={[0, 0, -0.05]} rotation={[-0.25, 0, 0]}>
      <Mesh geometry={cyl(0.16, 0.16, 0.08, 24)} material={mat("#c47a3c")} position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <Mesh geometry={cyl(0.12, 0.12, 0.08, 24)} material={mat("#c47a3c")} position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <Mesh geometry={cyl(0.045, 0.045, 0.082, 16)} material={mat("#2a1a10")} position={[0, 0.32, 0.001]} rotation={[Math.PI / 2, 0, 0]} shadow={false} />
      <Mesh geometry={box(0.05, 0.5, 0.03)} material={mat(DARK_WOOD)} position={[0, 0.74, 0]} />
      <Mesh geometry={box(0.08, 0.12, 0.03)} material={mat(DARK_WOOD)} position={[0, 1.04, 0]} />
    </group>
  ),
  record_player: () => (
    <>
      <Mesh geometry={box(0.7, 0.42, 0.44)} material={mat(WOOD)} position={[0, 0.21, 0]} />
      <Mesh geometry={box(0.66, 0.04, 0.4)} material={mat("#2b2b2b")} position={[0, 0.44, 0]} />
      <Record />
      <Mesh geometry={box(0.02, 0.02, 0.2)} material={mat("#d9dde3", { metalness: 0.7 })} position={[0.2, 0.48, 0.02]} rotation={[0, -0.4, 0]} />
      {[-0.16, 0.16].map((x) => (
        <Mesh key={x} geometry={box(0.24, 0.3, 0.02)} material={mat("#1f1712")} position={[x, 0.2, 0.221]} shadow={false} />
      ))}
    </>
  ),
  aquarium: () => (
    <>
      <Mesh geometry={box(1.1, 0.5, 0.45)} material={mat(DARK_WOOD)} position={[0, 0.25, 0]} />
      <Mesh geometry={box(1.04, 0.42, 0.4)} material={mat("#7ec8e3", { emissive: "#3a8fb7", intensity: 0.35, opacity: 0.45, roughness: 0.1 })} position={[0, 0.72, 0]} shadow={false} />
      <Mesh geometry={box(1.04, 0.04, 0.4)} material={mat("#e9dcc0")} position={[0, 0.52, 0]} shadow={false} />
      {[-0.35, 0.3].map((x) => (
        <Mesh key={x} geometry={box(0.03, 0.22, 0.03)} material={mat("#4c8a50")} position={[x, 0.65, -0.08]} shadow={false} />
      ))}
      <Fish />
      <Mesh geometry={box(1.1, 0.03, 0.45)} material={mat("#1f1f1f")} position={[0, 0.945, 0]} />
    </>
  ),
};

/** One placed thing. `ghost`: a see-through preview while placing (green = OK, pink = not here). */
export function DecorItem({ item, ghost = null }) {
  const Model = MODELS[item];
  const group = useRef();
  // Ghost: tint every mesh see-through green / pink.
  useFrame(() => {
    if (!ghost || !group.current) return;
    const tint = ghost === "ok" ? ghostOk : ghostBad;
    group.current.traverse((node) => {
      if (node.isMesh && node.material !== tint) {
        node.userData.realMaterial ??= node.material;
        node.material = tint;
      }
    });
  });
  if (!Model) return null;
  return (
    <group ref={group}>
      <Model />
    </group>
  );
}

const ghostOk = new THREE.MeshBasicMaterial({ color: "#8fdc7a", transparent: true, opacity: 0.55, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: "#f3a6b9", transparent: true, opacity: 0.55, depthWrite: false });

export const DECOR_MODELS = Object.keys(MODELS);
