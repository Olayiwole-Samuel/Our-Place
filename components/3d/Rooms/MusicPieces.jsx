"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { beat, musicPosition } from "@/lib/music/queue";
import { useMusicStore } from "@/store/musicStore";
import { useRoomStore } from "@/store/roomStore";

/**
 * The music pieces (lib/world/rooms/musicRoom.js, and the record player in the
 * living room). They follow the shared player (store/musicStore.js): while a
 * song plays the record turns, the speaker cones thump, the dance floor and
 * the lights pulse — on a gentle beat from the song's position (YouTube's
 * audio can't be read, so the beat is steady rather than the song's own).
 */
const materials = new Map();
function mat(color, { emissive = null, intensity = 1, roughness = 0.7, metalness = 0 } = {}) {
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

/** 0..1 pulse now (0 when nothing plays). */
function pulseNow() {
  const music = useMusicStore.getState().music;
  if (!music?.playing || !music.queue.length) return 0;
  return beat(musicPosition(music, { skewMs: useRoomStore.getState().skewMs ?? 0 }));
}
const isPlaying = () => Boolean(useMusicStore.getState().music?.playing);

/** A turntable on a little cabinet: the record spins and the arm rests on it while music plays. */
export function RecordPlayer({ object }) {
  const record = useRef();
  const arm = useRef();
  const scale = object?.scale ?? 1;
  useFrame((_, dt) => {
    const playing = isPlaying();
    if (record.current) record.current.rotation.y -= playing ? dt * 3.5 : 0;
    if (arm.current) arm.current.rotation.y += ((playing ? -0.42 : 0) - arm.current.rotation.y) * Math.min(1, dt * 4);
  });
  return (
    <group scale={scale}>
      {/* cabinet */}
      <mesh position={[0, 0.32, 0]} material={mat("#6b4a32", { roughness: 0.6 })} castShadow>
        <boxGeometry args={[0.62, 0.64, 0.46]} />
      </mesh>
      <mesh position={[0, 0.32, 0.232]} material={mat("#4e3524")}>
        <boxGeometry args={[0.52, 0.5, 0.01]} />
      </mesh>
      {/* records in the cabinet */}
      {[-0.16, -0.12, -0.08, 0.1, 0.14].map((x, i) => (
        <mesh key={i} position={[x, 0.3, 0.05]} material={mat(["#d84a5f", "#2f6fd8", "#f2c14e", "#7a3fd1", "#e8e1d0"][i])}>
          <boxGeometry args={[0.012, 0.32, 0.32]} />
        </mesh>
      ))}
      {/* turntable */}
      <mesh position={[0, 0.69, 0]} material={mat("#1d1d22", { roughness: 0.4, metalness: 0.2 })}>
        <boxGeometry args={[0.5, 0.08, 0.4]} />
      </mesh>
      <group ref={record} position={[-0.05, 0.74, 0]}>
        <mesh material={mat("#0d0d0f", { roughness: 0.25 })}>
          <cylinderGeometry args={[0.16, 0.16, 0.012, 40]} />
        </mesh>
        <mesh position={[0, 0.007, 0]} material={mat("#e8495f")}>
          <cylinderGeometry args={[0.055, 0.055, 0.004, 24]} />
        </mesh>
        <mesh position={[0.1, 0.008, 0]} material={mat("#ffffff", { emissive: "#ffffff", intensity: 0.2 })}>
          <boxGeometry args={[0.03, 0.002, 0.008]} />
        </mesh>
      </group>
      <group ref={arm} position={[0.17, 0.76, -0.12]}>
        <mesh position={[0, 0, 0]} material={mat("#b8b8c0", { metalness: 0.8, roughness: 0.3 })}>
          <cylinderGeometry args={[0.02, 0.02, 0.03, 12]} />
        </mesh>
        <mesh position={[-0.02, 0.02, 0.1]} rotation-x={Math.PI / 2} material={mat("#c9c9d1", { metalness: 0.8, roughness: 0.3 })}>
          <cylinderGeometry args={[0.006, 0.006, 0.22, 8]} />
        </mesh>
      </group>
    </group>
  );
}

/** A tall speaker: the woofer cone thumps on the beat. */
export function Speaker() {
  const woofer = useRef();
  const tweeter = useRef();
  const glowing = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a2f4a", emissive: "#ff5fa2", emissiveIntensity: 0.3 }), []);
  useFrame(() => {
    const p = pulseNow();
    if (woofer.current) woofer.current.position.z = 0.205 + p * 0.025;
    if (tweeter.current) tweeter.current.material.emissiveIntensity = 0.3 + p * 1.4;
  });
  return (
    <group>
      <mesh position={[0, 0.55, 0]} material={mat("#16161a", { roughness: 0.55 })} castShadow>
        <boxGeometry args={[0.46, 1.1, 0.4]} />
      </mesh>
      <mesh ref={woofer} position={[0, 0.4, 0.205]} rotation-x={Math.PI / 2} material={mat("#2b2b30", { roughness: 0.9 })}>
        <cylinderGeometry args={[0.16, 0.12, 0.03, 32]} />
      </mesh>
      <mesh ref={tweeter} position={[0, 0.82, 0.205]} rotation-x={Math.PI / 2} material={glowing}>
        <cylinderGeometry args={[0.06, 0.05, 0.02, 24]} />
      </mesh>
    </group>
  );
}

/** A 4×4 dance floor of glowing tiles: they light up in turn to the beat while music plays. */
export function DanceFloor() {
  const colors = useMemo(() => ["#ff4f9a", "#4fc3ff", "#ffd166", "#9b5cff"].map((c) => new THREE.Color(c)), []);
  const materialsFor = useMemo(() => Array.from({ length: 16 }, (_, i) => new THREE.MeshStandardMaterial({ color: "#1a1622", emissive: colors[(i + Math.floor(i / 4)) % 4], emissiveIntensity: 0.05, roughness: 0.35 })), [colors]);
  useFrame(() => {
    const music = useMusicStore.getState().music;
    const playing = music?.playing && music.queue.length;
    const seconds = playing ? musicPosition(music, { skewMs: useRoomStore.getState().skewMs ?? 0 }) : 0;
    const step = Math.floor((seconds * 104) / 60);
    const p = playing ? beat(seconds) : 0;
    materialsFor.forEach((m, i) => {
      const lit = playing && (i + step) % 3 === 0;
      m.emissiveIntensity = playing ? (lit ? 0.35 + p * 1.2 : 0.08 + p * 0.15) : 0.05;
    });
  });
  return (
    <group>
      {materialsFor.map((m, i) => (
        <mesh key={i} position={[((i % 4) - 1.5) * 0.62, 0.012, (Math.floor(i / 4) - 1.5) * 0.62]} rotation-x={-Math.PI / 2} material={m} receiveShadow>
          <planeGeometry args={[0.58, 0.58]} />
        </mesh>
      ))}
    </group>
  );
}

/** Fairy lights along the walls, and coloured lights that pulse while music plays. */
export function MusicLights({ room }) {
  const pink = useRef();
  const blue = useRef();
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const y = room.size.height - 0.25;
  const points = useMemo(() => {
    const list = [];
    const run = (x1, z1, x2, z2, n) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        list.push([x1 + (x2 - x1) * t, y - Math.sin(t * Math.PI * 3) * 0.08 - 0.05, z1 + (z2 - z1) * t]);
      }
    };
    const m = 0.08;
    run(minX + m, minZ + m, maxX - m, minZ + m, 22);
    run(minX + m, minZ + m, minX + m, maxZ - m, 22);
    run(maxX - m, minZ + m, maxX - m, maxZ - m, 22);
    return list;
  }, [minX, maxX, minZ, maxZ, y]);
  const bulbMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fff2c8", emissive: "#ffcf7a", emissiveIntensity: 1.4 }), []);
  useFrame(() => {
    const p = pulseNow();
    const on = isPlaying();
    if (pink.current) pink.current.intensity = on ? 0.6 + p * 2.2 : 0.4;
    if (blue.current) blue.current.intensity = on ? 0.5 + (1 - p) * 1.4 : 0.35;
    bulbMaterial.emissiveIntensity = on ? 1.1 + p * 0.8 : 1.2;
  });
  return (
    <group>
      <group>
        {points.map((point, i) => (
          <mesh key={i} position={point} material={bulbMaterial}>
            <sphereGeometry args={[0.025, 8, 6]} />
          </mesh>
        ))}
      </group>
      <pointLight ref={pink} position={[-1.6, 2.3, -1.6]} color="#ff4f9a" intensity={0.4} distance={6} decay={2} />
      <pointLight ref={blue} position={[1.6, 2.3, -0.4]} color="#4fc3ff" intensity={0.35} distance={6} decay={2} />
    </group>
  );
}
