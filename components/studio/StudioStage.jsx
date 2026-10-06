"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Character } from "@/components/character/Character";
import { getBlobShadowTexture } from "@/components/3d/materials";
import { bodyDimensions } from "@/lib/character/schema";
import { palette } from "@/lib/design/tokens";

/**
 * The Character Studio's 3D stage: a dark, softly lit studio in the Our Place
 * palette (army-green rim light, a whisper of pink, clean floor) with the
 * full-body character centre stage.
 *
 * Camera: drag/one finger to orbit, scroll/pinch to zoom, within limits (no
 * clipping, no upside-down views). `framing` and `angle` presets ease the camera
 * to Full body / Upper body / Face and Front / ¾ / Side.
 */
export const FRAMINGS = Object.freeze({
  full: { y: 0.53, distance: 4.1, lift: 0.15 },
  upper: { y: 0.74, distance: 1.9, lift: 0.08 },
  face: { y: 0.93, distance: 0.85, lift: 0.02 },
});

function StudioCamera({ framing, angle, height, reducedMotion, resetKey }) {
  const controls = useRef();
  const camera = useThree((state) => state.camera);
  const goal = useRef(null);

  useEffect(() => {
    const f = FRAMINGS[framing] ?? FRAMINGS.full;
    const target = new THREE.Vector3(0, height * f.y, 0);
    const position = target.clone().add(new THREE.Vector3(Math.sin(angle) * f.distance, f.lift, Math.cos(angle) * f.distance));
    goal.current = { target, position };
  }, [framing, angle, height, resetKey]);

  useFrame((_, delta) => {
    if (!goal.current || !controls.current) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-6 * Math.min(delta, 0.05));
    controls.current.target.lerp(goal.current.target, k);
    camera.position.lerp(goal.current.position, k);
    controls.current.update();
    if (camera.position.distanceTo(goal.current.position) < 0.002) goal.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      minDistance={0.6}
      maxDistance={4.8}
      minPolarAngle={Math.PI * 0.22}
      maxPolarAngle={Math.PI * 0.58}
      rotateSpeed={0.7}
      zoomSpeed={0.7}
      // The user taking control cancels any preset transition.
      onStart={() => (goal.current = null)}
    />
  );
}

function StudioSet() {
  const shadow = useMemo(() => new THREE.MeshBasicMaterial({ map: getBlobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 }), []);
  const ring = useMemo(() => new THREE.MeshBasicMaterial({ color: palette.green500, transparent: true, opacity: 0.55 }), []);
  useEffect(() => () => [shadow, ring].forEach((m) => m.dispose()), [shadow, ring]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
        <circleGeometry args={[1.5, 64]} />
        <meshStandardMaterial color={palette.black800} roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} material={ring}>
        <ringGeometry args={[1.47, 1.5, 96]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.003} material={shadow}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {/* Curved backdrop, far enough to never intersect the camera. */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[7, 7, 9, 48, 1, true]} />
        <meshStandardMaterial color={palette.black900} side={THREE.BackSide} roughness={1} />
      </mesh>
    </group>
  );
}

export default function StudioStage({ character, framing = "full", angle = 0, celebrate, reducedMotion = false, resetKey = 0 }) {
  const motion = useRef({ anim: "idle", speed: 0, emote: null });
  useEffect(() => {
    if (celebrate) motion.current.emote = { name: "celebrate", id: celebrate };
  }, [celebrate]);
  const height = bodyDimensions(character?.config).height;

  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 30, near: 0.05, far: 40, position: [0, 1.1, 4] }} gl={{ antialias: true }} aria-label="Your character, full body. Drag to turn, scroll or pinch to zoom.">
      <color attach="background" args={[palette.black950]} />
      <fog attach="fog" args={[palette.black950, 6, 12]} />
      <hemisphereLight args={[palette.whiteSoft, palette.black900, 0.65]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.1} color={palette.whiteSoft} />
      <directionalLight position={[-3, 2, -2.5]} intensity={1.6} color={palette.green500} />
      <pointLight position={[2.2, 1.4, -2.2]} intensity={4} distance={7} color={palette.pink400} />
      <StudioSet />
      <Character character={character} motion={motion} reducedMotion={reducedMotion} />
      <StudioCamera framing={framing} angle={angle} height={height} reducedMotion={reducedMotion} resetKey={resetKey} />
    </Canvas>
  );
}
