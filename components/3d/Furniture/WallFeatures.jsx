import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { palette } from "@/lib/design/tokens";
import { anniversaryLabel, togetherSince } from "@/lib/room/together";
import { useRoomStore } from "@/store/roomStore";
import { createTextTexture, getMaterials, mix } from "../materials";

/**
 * Wall-mounted features, showing what the couple has left in the room
 * (store/roomStore.js): memory photos in the frames, notes on the board, and
 * what's on the TV, plus a glowing heart counting your days together (opens
 * "Us"). Each keeps an inviting empty state.
 */

/** A flat label in the world. Disposes its texture on unmount. */
function WorldLabel({ lines, width, height, position, pixelWidth = 512, pixelHeight = 128 }) {
  const texture = useMemo(() => createTextTexture(lines, { width: pixelWidth, height: pixelHeight }), [lines, pixelWidth, pixelHeight]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), [texture]);
  useEffect(
    () => () => {
      texture.dispose();
      material.dispose();
    },
    [texture, material],
  );
  return (
    <mesh position={position} material={material}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}

const PHOTO_TEXTURE_PX = 384; // frames are small: never upload full photos to the GPU

/** A memory photo as a small, cover-cropped texture for a frame of aspect w/h. */
function usePhotoTexture(url, aspect) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!url) {
      setTexture(null);
      return undefined;
    }
    let cancelled = false;
    let made = null;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(PHOTO_TEXTURE_PX * Math.min(1, aspect));
      canvas.height = Math.round(PHOTO_TEXTURE_PX * Math.min(1, 1 / aspect));
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      canvas.getContext("2d").drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      made = new THREE.CanvasTexture(canvas);
      made.colorSpace = THREE.SRGBColorSpace;
      setTexture(made);
    };
    image.src = url;
    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [url, aspect]);
  return texture;
}

function PhotoInFrame({ url, w, h }) {
  const texture = usePhotoTexture(url, w / h);
  const material = useMemo(() => (texture ? new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }) : null), [texture]);
  useEffect(() => () => material?.dispose(), [material]);
  if (!material) return null;
  return (
    <mesh position={[0, 0, 0.019]} material={material}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

const PHOTO_SLOTS = [
  { x: 0, y: 1.55, w: 0.6, h: 0.75 },
  { x: -0.62, y: 1.72, w: 0.42, h: 0.52 },
  { x: -0.62, y: 1.12, w: 0.42, h: 0.42 },
  { x: 0.62, y: 1.78, w: 0.42, h: 0.42 },
  { x: 0.62, y: 1.18, w: 0.42, h: 0.52 },
];

const EMPTY_PHOTO_LINES = [
  { text: "Add your first memory", size: 44, weight: 600, color: palette.whiteSoft },
  { text: "Your photos will hang here", size: 30, color: palette.textSecondary },
];

/** Frames for memories: the five newest photos the couple hung (couple_memories). */
export function PhotoWall() {
  const m = getMaterials();
  const memories = useRoomStore((state) => state.memories);
  const photos = useMemo(() => memories.filter((memory) => memory.url).slice(0, PHOTO_SLOTS.length), [memories]);
  const emptyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: mix(palette.black800, palette.whiteSoft, 0.06), roughness: 1 }), []);
  return (
    <group>
      {PHOTO_SLOTS.map((slot, i) => (
        <group key={i} position={[slot.x, slot.y, 0.03]}>
          <mesh material={m.blackMetal}>
            <boxGeometry args={[slot.w, slot.h, 0.03]} />
          </mesh>
          <mesh position={[0, 0, 0.017]} material={photos[i] ? m.paper : emptyMat}>
            <planeGeometry args={[slot.w - 0.08, slot.h - 0.08]} />
          </mesh>
          {photos[i] && <PhotoInFrame url={photos[i].url} w={slot.w - 0.1} h={slot.h - 0.1} />}
        </group>
      ))}
      {photos.length === 0 && <WorldLabel lines={EMPTY_PHOTO_LINES} width={1.9} height={0.42} position={[0, 0.62, 0.03]} pixelWidth={768} pixelHeight={168} />}
    </group>
  );
}

const IDLE_SCREEN_LINES = [
  { text: "Nothing playing yet", size: 40, weight: 600, color: palette.whiteSoft },
  { text: "Walk up and press Watch", size: 28, color: palette.blue400 },
];

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The TV: what the two of you are watching (couple_watch), or an idle screen. */
export function VideoScreen() {
  const m = getMaterials();
  const watch = useRoomStore((state) => state.watch);
  const playing = Boolean(watch?.playing);
  const title = watch?.source ? watch.source.title || "Something good" : null;
  const lines = useMemo(
    () =>
      title
        ? [
            { text: playing ? "▶  Now playing" : "❚❚  Paused", size: 28, color: palette.blue400 },
            { text: clip(title, 34), size: 40, weight: 600, color: palette.whiteSoft },
          ]
        : IDLE_SCREEN_LINES,
    [title, playing],
  );
  return (
    <group>
      <mesh position={[0, 1.42, 0.035]} material={m.blackMetal}>
        <boxGeometry args={[1.86, 1.08, 0.05]} />
      </mesh>
      <mesh position={[0, 1.42, 0.062]} material={m.screenIdle}>
        <planeGeometry args={[1.76, 0.98]} />
      </mesh>
      <WorldLabel lines={lines} width={1.5} height={0.375} position={[0, 1.42, 0.064]} pixelWidth={640} pixelHeight={160} />
      {/* Standby light: sky blue = something live/digital. */}
      <mesh position={[0.82, 0.92, 0.065]} material={m.liveGlow}>
        <circleGeometry args={[0.008, 8]} />
      </mesh>
    </group>
  );
}

const EMPTY_BOARD_LINES = [
  { text: "No notes yet", size: 36, weight: 600, color: palette.black900 },
  { text: "Leave each other a note", size: 24, color: palette.black700 },
];
const NOTE_COLORS = { yellow: "#f6e27a", pink: "#f3a6b9", green: "#b6dd9a", blue: "#a9d4f5" };
const STICKY_SPOTS = [
  [-0.27, 0.12, 0.06],
  [0.05, 0.16, -0.04],
  [0.3, 0.08, 0.05],
  [-0.2, -0.15, -0.03],
  [0.12, -0.14, 0.04],
];

function StickyNote({ color, spot: [x, y, tilt] }) {
  const m = getMaterials();
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: NOTE_COLORS[color] ?? NOTE_COLORS.yellow, roughness: 0.9 }), [color]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group position={[x, y, 0.05]} rotation-z={tilt}>
      <mesh material={material}>
        <planeGeometry args={[0.2, 0.2]} />
      </mesh>
      <mesh position={[0, 0.08, 0.012]} material={m.cushionPink}>
        <sphereGeometry args={[0.014, 10, 6]} />
      </mesh>
    </group>
  );
}

/** Felt board with the couple's notes pinned on it (couple_notes). */
export function MessageBoard() {
  const m = getMaterials();
  const notes = useRoomStore((state) => state.notes);
  const unseen = useRoomStore((state) => state.unseenNotes);
  const countLines = useMemo(
    () => [{ text: unseen ? `${unseen} new note${unseen === 1 ? "" : "s"} for you` : `${notes.length} note${notes.length === 1 ? "" : "s"}`, size: 30, weight: 600, color: palette.whiteSoft }],
    [notes.length, unseen],
  );
  return (
    <group position={[0, 1.45, 0]}>
      <mesh position={[0, 0, 0.025]} material={m.darkWood}>
        <boxGeometry args={[1.05, 0.75, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.047]} material={m.feltGreen}>
        <planeGeometry args={[0.95, 0.65]} />
      </mesh>
      {notes.length ? (
        <>
          {notes.slice(0, STICKY_SPOTS.length).map((note, i) => (
            <StickyNote key={note.id} color={note.color} spot={STICKY_SPOTS[i]} />
          ))}
          <WorldLabel lines={countLines} width={0.9} height={0.12} position={[0, -0.47, 0.03]} pixelWidth={512} pixelHeight={68} />
        </>
      ) : (
        <group position={[0.05, 0.02, 0.05]} rotation-z={-0.05}>
          <mesh material={m.paper}>
            <planeGeometry args={[0.46, 0.3]} />
          </mesh>
          <WorldLabel lines={EMPTY_BOARD_LINES} width={0.42} height={0.16} position={[0, -0.01, 0.002]} pixelWidth={512} pixelHeight={192} />
          <mesh position={[0, 0.12, 0.012]} material={m.cushionPink}>
            <sphereGeometry args={[0.018, 12, 8]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** A heart outline (three.js's classic), centred and about 0.55 m across. */
function heartGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(25, 25);
  shape.bezierCurveTo(25, 25, 20, 0, 0, 0);
  shape.bezierCurveTo(-30, 0, -30, 35, -30, 35);
  shape.bezierCurveTo(-30, 55, -10, 77, 25, 95);
  shape.bezierCurveTo(60, 77, 80, 55, 80, 35);
  shape.bezierCurveTo(80, 35, 80, 0, 50, 0);
  shape.bezierCurveTo(35, 0, 25, 25, 25, 25);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 4, curveSegments: 20 });
  geometry.center();
  geometry.rotateZ(Math.PI); // the shape is drawn point-up
  geometry.scale(0.005, 0.005, 0.005);
  return geometry;
}

/** A soft round glow (canvas radial gradient) for behind the heart. */
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 92, 138, 0.85)");
  gradient.addColorStop(0.45, "rgba(255, 79, 126, 0.3)");
  gradient.addColorStop(1, "rgba(255, 79, 126, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** lub-dub: two quick swells, then rest (period 1.5 s). */
const heartbeat = (t) => {
  const phase = (t % 1.5) / 1.5;
  const pulse = (center, width) => Math.max(0, 1 - Math.abs(phase - center) / width);
  return pulse(0.12, 0.1) * 0.09 + pulse(0.36, 0.1) * 0.06;
};

/** The glowing heart on the back wall: your days together (couples.together_since). */
export function LoveHeart({ reducedMotion = false }) {
  const since = useRoomStore((state) => state.togetherSince);
  const heart = useRef();
  const glow = useRef();
  const geometry = useMemo(heartGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ff4f7e", emissive: "#ff2e6e", emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.1, toneMapped: false }), []);
  const glowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      glowMaterial.map?.dispose();
      glowMaterial.dispose();
    },
    [geometry, material, glowMaterial],
  );

  useFrame(({ clock }) => {
    if (reducedMotion || !heart.current) return;
    const beat = heartbeat(clock.elapsedTime);
    heart.current.scale.setScalar(1 + beat);
    if (glow.current) glow.current.material.opacity = 0.75 + beat * 3;
  });

  const lines = useMemo(() => {
    if (!since) return [{ text: "Us", size: 40, weight: 700, color: palette.whiteSoft }];
    const time = togetherSince(since);
    const special = time.today.monthsary;
    return [
      { text: `${time.days.toLocaleString()} days together`, size: 40, weight: 700, color: palette.whiteSoft },
      { text: special ? `Happy ${anniversaryLabel(special)}! 🎉` : `${anniversaryLabel(time.next.months)} in ${time.next.inDays} days`, size: 26, color: "#ff8fb1" },
    ];
  }, [since]);

  return (
    <group position={[0, 1.86, 0]}>
      <mesh ref={glow} position={[0, 0, 0.02]} material={glowMaterial}>
        <planeGeometry args={[1.25, 1.25]} />
      </mesh>
      <mesh ref={heart} position={[0, 0, 0.07]} geometry={geometry} material={material} />
      <WorldLabel lines={lines} width={1.1} height={0.24} position={[0, -0.5, 0.03]} pixelWidth={640} pixelHeight={140} />
    </group>
  );
}
