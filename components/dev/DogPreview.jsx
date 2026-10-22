"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Dog } from "@/components/3d/Pet/Dog";

/**
 * DEVELOPMENT ONLY — the dog on its own, to see and tune it (/dev/dog):
 *   ?anim=idle|look|sniff|walk|run|eat|petted|jump  ?pose=stand|sit|lie|sleep
 *   ?wag=0..1  ?hearts=1  ?carrying=1  ?view=side|front|back|top|three
 */
const VIEWS = { side: [1.1, 0.35, 0], front: [0, 0.35, 1.1], back: [0, 0.35, -1.1], top: [0, 1.4, 0.05], three: [0.8, 0.5, 0.8] };

export function DogPreview() {
  const params = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);
  const state = useRef({
    x: 0,
    z: 0,
    ry: 0,
    anim: params.get("anim") ?? "idle",
    pose: params.get("pose") ?? "stand",
    wag: Number(params.get("wag") ?? 0.5),
    hearts: params.get("hearts") === "1",
    carrying: params.get("carrying") === "1",
    ball: null,
  });
  const view = VIEWS[params.get("view") ?? "three"] ?? VIEWS.three;
  return (
    <main style={{ position: "fixed", inset: 0, background: "#1b201b" }}>
      <Canvas camera={{ position: view, fov: 40, near: 0.01, far: 20 }} onCreated={({ camera }) => camera.lookAt(0, 0.18, 0)}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={1.6} />
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial color="#3a3f38" />
        </mesh>
        <Dog stateRef={state} name="Snowy" />
      </Canvas>
      <p style={{ position: "fixed", left: 8, top: 8, color: "#ddd", font: "12px sans-serif" }}>
        {state.current.anim} · {state.current.pose} · {params.get("view") ?? "three"}
      </p>
    </main>
  );
}
