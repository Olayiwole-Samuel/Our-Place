"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { gameRegistry } from "@/lib/game/catalog";
import { palette } from "@/lib/design/tokens";
import { useRoomStore } from "@/store/roomStore";
import { DecorItem } from "../Decor/DecorItem";
import { Door } from "../Furniture/Furniture";
import { PhotoInFrame, WorldLabel } from "../Furniture/WallFeatures";
import { framePhotos, slotIds } from "@/lib/room/frames";
import { getMaterials } from "../materials";

/**
 * The pieces the hallway and the game room are built from (lib/world/rooms/*).
 * Each gets its room object as `object` (position/rotation are applied by
 * Room.jsx), faces +z, and stands on the floor at its origin.
 */
const mats = new Map();
function mat(color, { emissive = null, intensity = 1, roughness = 0.8, metalness = 0, opacity = 1 } = {}) {
  const key = `${color}|${emissive}|${intensity}|${roughness}|${metalness}|${opacity}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: opacity < 1, opacity });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = intensity;
      m.toneMapped = false;
    }
    mats.set(key, m);
  }
  return mats.get(key);
}
const glow = (color, intensity = 1.6) => mat(color, { emissive: color, intensity });

/** A canvas texture drawn once (and redrawn when `deps` change). */
function useCanvasTexture(width, height, draw, deps) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d"), width, height);
    const made = new THREE.CanvasTexture(canvas);
    made.colorSpace = THREE.SRGBColorSpace;
    return made;
    // `deps` decide when to redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

const signLines = (text) => [{ text, size: 40, weight: 700, color: palette.whiteSoft }];

// ── Doors ─────────────────────────────────────────────────────────────────

/** A door with its room's name above it. */
export function SignedDoor({ object }) {
  const lines = useMemo(() => signLines(object?.sign ?? ""), [object?.sign]);
  return (
    <group>
      <Door />
      {object?.sign && (
        <>
          <mesh position={[0, 2.43, 0.03]} material={mat("#15171a")}>
            <boxGeometry args={[1.0, 0.24, 0.03]} />
          </mesh>
          <WorldLabel lines={lines} width={0.95} height={0.21} position={[0, 2.43, 0.05]} pixelWidth={512} pixelHeight={112} />
        </>
      )}
    </group>
  );
}

/** A door to a room that isn't built yet: dimmed, with "soon" on its sign. */
export function SoonDoor({ object }) {
  return (
    <group>
      <SignedDoor object={object} />
      <mesh position={[0, 1.05, 0.11]} material={mat("#0d0f0d", { opacity: 0.35 })}>
        <planeGeometry args={[0.96, 2.08]} />
      </mesh>
    </group>
  );
}

// ── Hallway ───────────────────────────────────────────────────────────────

export function Runner() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} material={mat("#6b4e71", { roughness: 1 })} receiveShadow>
        <planeGeometry args={[1.15, 7.2]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 0]} material={mat("#8a6a8f", { roughness: 1 })}>
        <planeGeometry args={[0.85, 6.9]} />
      </mesh>
    </group>
  );
}

const ART = [
  ["#f3a6b9", "#596b40", "#ffd166"],
  ["#7dd3fc", "#e889a2", "#f5f0e6"],
];
/** Three frames: your photos (chosen, or your newest), else framed prints. */
export function ArtFrames({ object }) {
  const colors = ART[(object?.variant ?? 0) % ART.length];
  const m = getMaterials();
  const frames = useRoomStore((state) => state.frames);
  const memories = useRoomStore((state) => state.memories);
  const photos = useMemo(() => framePhotos(frames, memories), [frames, memories]);
  const slots = slotIds(object?.id ?? "");
  return (
    <group>
      {[
        [-0.45, 1.75, 0.42, 0.55],
        [0.12, 1.85, 0.5, 0.36],
        [0.12, 1.4, 0.5, 0.36],
      ].map(([x, y, w, h], i) => (
        <group key={i} position={[x, y, 0.03]}>
          <mesh material={m.blackMetal}>
            <boxGeometry args={[w, h, 0.03]} />
          </mesh>
          <mesh position={[0, 0, 0.017]} material={m.paper}>
            <planeGeometry args={[w - 0.06, h - 0.06]} />
          </mesh>
          {photos[slots[i]]?.memory ? (
            <PhotoInFrame url={photos[slots[i]].memory.url} w={w - 0.08} h={h - 0.08} />
          ) : (
            <mesh position={[0, 0, 0.019]} material={mat(colors[i])}>
              <circleGeometry args={[Math.min(w, h) * 0.28, 24]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/** Warm pendant lights down the middle of the ceiling. */
export function Pendants({ object, room }) {
  const height = room?.size?.height ?? 3;
  return (
    <group>
      {(object?.spots ?? [0]).map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, height - 0.25, 0]} material={mat("#1b1b1b")}>
            <cylinderGeometry args={[0.006, 0.006, 0.5, 6]} />
          </mesh>
          <mesh position={[0, height - 0.55, 0]} material={glow("#ffd9a0", 1.4)}>
            <sphereGeometry args={[0.11, 16, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Anything from the Decorate catalogue, placed by the room itself. */
export function DecorPiece({ object }) {
  return <DecorItem item={object?.item} />;
}

// ── Game room ─────────────────────────────────────────────────────────────

/** The big screen: games, ready when you are. */
export function GameScreen() {
  const screen = useCanvasTexture(
    1024,
    576,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#2a1a5e");
      g.addColorStop(1, "#7a1f5c");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 120px sans-serif";
      ctx.fillText("🎮 Game night", w / 2, h * 0.45);
      ctx.font = "48px sans-serif";
      ctx.fillStyle = "#ffd1e0";
      ctx.fillText("Walk up and press Play", w / 2, h * 0.68);
    },
    [],
  );
  return (
    <group>
      <mesh position={[0, 1.6, 0.04]} material={mat("#0c0c10", { metalness: 0.4, roughness: 0.4 })}>
        <boxGeometry args={[3.3, 1.92, 0.06]} />
      </mesh>
      <mesh position={[0, 1.6, 0.075]}>
        <planeGeometry args={[3.16, 1.78]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.25, 0.25]} material={mat("#1c1b24")}>
        <boxGeometry args={[2.4, 0.5, 0.45]} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.52, 0.25]} material={glow(x < 0 ? "#ff4f9a" : "#4fc3ff", 1.2)}>
          <boxGeometry args={[0.18, 0.04, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

const CABINET = [
  { body: "#3a1d5c", trim: "#ff4f9a", title: "ARCADE" },
  { body: "#16365c", trim: "#4fc3ff", title: "WORDS" },
];
/** An arcade cabinet with a lit marquee and a glowing screen. */
export function Arcade({ object }) {
  const look = CABINET[(object?.variant ?? 0) % CABINET.length];
  const screen = useRef();
  const marquee = useCanvasTexture(
    256,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = "#0b0b12";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = look.trim;
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(look.title, w / 2, h / 2 + 2);
    },
    [look.title],
  );
  useFrame(({ clock }) => {
    if (screen.current) screen.current.material.emissiveIntensity = 0.9 + Math.sin(clock.elapsedTime * 2.2 + (object?.variant ?? 0)) * 0.25;
  });
  return (
    <group>
      <mesh position={[0, 0.6, 0]} material={mat(look.body)} castShadow>
        <boxGeometry args={[0.66, 1.2, 0.66]} />
      </mesh>
      <mesh position={[0, 1.42, -0.08]} material={mat(look.body)} castShadow>
        <boxGeometry args={[0.66, 0.64, 0.5]} />
      </mesh>
      <mesh ref={screen} position={[0, 1.4, 0.18]} rotation-x={-0.25} material={mat("#3fd4ff", { emissive: "#2a7fff", intensity: 1 }).clone()}>
        <planeGeometry args={[0.5, 0.42]} />
      </mesh>
      <mesh position={[0, 1.86, 0.18]}>
        <planeGeometry args={[0.6, 0.15]} />
        <meshBasicMaterial map={marquee} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.06, 0.36]} rotation-x={-0.5} material={mat("#111114")}>
        <boxGeometry args={[0.64, 0.05, 0.3]} />
      </mesh>
      <mesh position={[-0.15, 1.13, 0.38]} material={mat("#e5e5e5")}>
        <cylinderGeometry args={[0.012, 0.012, 0.09, 8]} />
      </mesh>
      <mesh position={[-0.15, 1.18, 0.38]} material={glow(look.trim, 1.2)}>
        <sphereGeometry args={[0.025, 10, 8]} />
      </mesh>
      {[0.05, 0.14, 0.23].map((x, i) => (
        <mesh key={x} position={[x, 1.1, 0.39]} material={glow(["#ff4f9a", "#ffd23f", "#4fc3ff"][i], 1.1)}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 12]} />
        </mesh>
      ))}
      {[-0.335, 0.335].map((x) => (
        <mesh key={x} position={[x, 1.0, 0.0]} material={glow(look.trim, 1.3)}>
          <boxGeometry args={[0.01, 1.9, 0.66]} />
        </mesh>
      ))}
    </group>
  );
}

/** A table with a chess game laid out, and a stool each side. */
export function GameTable() {
  const board = useCanvasTexture(
    256,
    256,
    (ctx, w) => {
      const s = w / 8;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#5f6f45" : "#e9e4d4";
        ctx.fillRect(c * s, r * s, s, s);
      }
    },
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.74, 0]} material={mat("#5e4433")} castShadow>
        <boxGeometry args={[1.0, 0.05, 1.0]} />
      </mesh>
      <mesh position={[0, 0.37, 0]} material={mat("#3a2a20")}>
        <cylinderGeometry args={[0.07, 0.1, 0.72, 12]} />
      </mesh>
      <mesh position={[0, 0.768, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.56, 0.56]} />
        <meshStandardMaterial map={board} roughness={0.7} />
      </mesh>
      {[
        [-0.2, -0.24, "#f5f0e6"],
        [0.05, -0.17, "#f5f0e6"],
        [0.13, 0.2, "#1a1a1a"],
        [-0.1, 0.24, "#1a1a1a"],
      ].map(([x, z, color], i) => (
        <mesh key={i} position={[x, 0.81, z]} material={mat(color)} castShadow>
          <cylinderGeometry args={[0.018, 0.026, 0.08, 10]} />
        </mesh>
      ))}
      {[-0.78, 0.78].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 0.48, 0]} material={mat("#b47a8c")} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.07, 18]} />
          </mesh>
          <mesh position={[0, 0.23, 0]} material={mat("#2b2b2b", { metalness: 0.5 })}>
            <cylinderGeometry args={[0.025, 0.12, 0.46, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Who's winning: your head-to-head record (couple_trophies). */
export function Scoreboard({ runtime }) {
  const trophies = useRoomStore((state) => state.trophies);
  useEffect(() => {
    useRoomStore.getState().refresh("trophies");
  }, []);
  const me = useRoomStore.getState().me();
  const partnerName = runtime?.partnerName ?? "Them";
  const tally = useMemo(() => {
    const games = new Map();
    let mine = 0;
    let theirs = 0;
    for (const row of trophies?.wins ?? []) {
      const entry = games.get(row.game_id) ?? { mine: 0, theirs: 0 };
      if (row.user_id === me) {
        entry.mine += Number(row.wins);
        mine += Number(row.wins);
      } else {
        entry.theirs += Number(row.wins);
        theirs += Number(row.wins);
      }
      games.set(row.game_id, entry);
    }
    return { mine, theirs, games: [...games].sort((a, b) => b[1].mine + b[1].theirs - (a[1].mine + a[1].theirs)).slice(0, 5) };
  }, [trophies, me]);
  const texture = useCanvasTexture(
    640,
    480,
    (ctx, w, h) => {
      ctx.fillStyle = "#0d0c14";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#ff4f9a";
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd1e0";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText("WHO'S WINNING", w / 2, 62);
      ctx.font = "bold 64px sans-serif";
      ctx.fillStyle = "#8fdc7a";
      ctx.fillText(`You ${tally.mine}`, w * 0.27, 150);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("–", w / 2, 150);
      ctx.fillStyle = "#ff8fb1";
      ctx.fillText(`${tally.theirs} ${partnerName}`.slice(0, 16), w * 0.73, 150);
      ctx.font = "30px sans-serif";
      tally.games.forEach(([id, entry], i) => {
        const y = 215 + i * 50;
        ctx.textAlign = "left";
        ctx.fillStyle = "#d6d8d2";
        const game = gameRegistry.get(id);
        ctx.fillText(`${game?.icon ?? "🎲"} ${game?.name ?? id}`.slice(0, 22), 40, y);
        ctx.textAlign = "right";
        ctx.fillStyle = entry.mine > entry.theirs ? "#8fdc7a" : entry.mine < entry.theirs ? "#ff8fb1" : "#ffffff";
        ctx.fillText(`${entry.mine} – ${entry.theirs}`, w - 40, y);
      });
      if (!tally.games.length) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#a8ada5";
        ctx.fillText("No winners yet — go play!", w / 2, 270);
      }
    },
    [tally, partnerName],
  );
  return (
    <group position={[0, 1.6, 0.03]}>
      <mesh material={mat("#16151c")}>
        <boxGeometry args={[1.42, 1.08, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <planeGeometry args={[1.34, 1.0]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Neon strips along the top of the walls, a "GAME ON" sign, and their glow. */
export function Neon({ room }) {
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const y = room.size.height - 0.32;
  const sign = useCanvasTexture(
    512,
    160,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 92px sans-serif";
      ctx.shadowColor = "#ff4f9a";
      ctx.shadowBlur = 28;
      ctx.fillStyle = "#ffd1e6";
      ctx.fillText("GAME ON", w / 2, h / 2);
    },
    [],
  );
  const strip = (from, to, color, key) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const along = Math.atan2(to[0] - from[0], to[1] - from[1]);
    return (
      <mesh key={key} position={[mid[0], y, mid[1]]} rotation-y={along} material={glow(color, 2)}>
        <boxGeometry args={[0.03, 0.03, length]} />
      </mesh>
    );
  };
  const m = 0.06;
  return (
    <group>
      {strip([minX + m, minZ + m], [maxX - m, minZ + m], "#ff4f9a", "back")}
      {strip([minX + m, maxZ - m], [maxX - m, maxZ - m], "#4fc3ff", "front")}
      {strip([minX + m, minZ + m], [minX + m, maxZ - m], "#4fc3ff", "left")}
      {strip([maxX - m, minZ + m], [maxX - m, maxZ - m], "#ff4f9a", "right")}
      <mesh position={[minX + 0.03, 2.3, -1.15]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[1.8, 0.56]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight position={[minX + 0.6, 2.2, -1.2]} color="#ff4f9a" intensity={1.6} distance={5} decay={2} />
      <pointLight position={[maxX - 0.6, 2.2, 1]} color="#4fc3ff" intensity={1.4} distance={5} decay={2} />
    </group>
  );
}
