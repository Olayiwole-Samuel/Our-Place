import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { palette } from "@/lib/design/tokens";
import { createTextTexture, getMaterials, mix } from "../materials";

/**
 * Wall-mounted features. Each has an intentional EMPTY state today; the data they
 * will show later (media_assets, left_messages, watch-together sessions) plugs
 * into the same component without changing the room.
 */

/** A flat label in the world (empty-state copy). Disposes its texture on unmount. */
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

/** Frames for memories. Empty until photos exist (photos come from Supabase Storage later). */
export function PhotoWall({ photos = [] }) {
  const m = getMaterials();
  const emptyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: mix(palette.black800, palette.whiteSoft, 0.06), roughness: 1 }), []);
  return (
    <group>
      {PHOTO_SLOTS.map((slot, i) => (
        <group key={i} position={[slot.x, slot.y, 0.03]}>
          <mesh material={m.blackMetal}>
            <boxGeometry args={[slot.w, slot.h, 0.03]} />
          </mesh>
          {/* When photos exist, slot i renders photos[i] as a texture here. */}
          <mesh position={[0, 0, 0.017]} material={photos[i] ? m.paper : emptyMat}>
            <planeGeometry args={[slot.w - 0.08, slot.h - 0.08]} />
          </mesh>
        </group>
      ))}
      {photos.length === 0 && <WorldLabel lines={EMPTY_PHOTO_LINES} width={1.9} height={0.42} position={[0, 0.62, 0.03]} pixelWidth={768} pixelHeight={168} />}
    </group>
  );
}

const IDLE_SCREEN_LINES = [
  { text: "Nothing playing yet", size: 40, weight: 600, color: palette.whiteSoft },
  { text: "Watch together — coming soon", size: 28, color: palette.blue400 },
];

/** The TV. Idle screen for now; watch-together plays here later. */
export function VideoScreen() {
  const m = getMaterials();
  return (
    <group>
      <mesh position={[0, 1.42, 0.035]} material={m.blackMetal}>
        <boxGeometry args={[1.86, 1.08, 0.05]} />
      </mesh>
      <mesh position={[0, 1.42, 0.062]} material={m.screenIdle}>
        <planeGeometry args={[1.76, 0.98]} />
      </mesh>
      <WorldLabel lines={IDLE_SCREEN_LINES} width={1.2} height={0.3} position={[0, 1.42, 0.064]} />
      {/* Standby light: sky blue = something live/digital. */}
      <mesh position={[0.82, 0.92, 0.065]} material={m.liveGlow}>
        <circleGeometry args={[0.008, 8]} />
      </mesh>
    </group>
  );
}

const EMPTY_BOARD_LINES = [
  { text: "No notes yet", size: 36, weight: 600, color: palette.black900 },
  { text: "Leave each other notes — soon", size: 24, color: palette.black700 },
];

/** Felt board for left messages. One blank card pinned, waiting for the first note. */
export function MessageBoard() {
  const m = getMaterials();
  return (
    <group position={[0, 1.45, 0]}>
      <mesh position={[0, 0, 0.025]} material={m.darkWood}>
        <boxGeometry args={[1.05, 0.75, 0.04]} />
      </mesh>
      <mesh position={[0, 0, 0.047]} material={m.feltGreen}>
        <planeGeometry args={[0.95, 0.65]} />
      </mesh>
      <group position={[0.05, 0.02, 0.05]} rotation-z={-0.05}>
        <mesh material={m.paper}>
          <planeGeometry args={[0.46, 0.3]} />
        </mesh>
        <WorldLabel lines={EMPTY_BOARD_LINES} width={0.42} height={0.16} position={[0, -0.01, 0.002]} pixelWidth={512} pixelHeight={192} />
        <mesh position={[0, 0.12, 0.012]} material={m.cushionPink}>
          <sphereGeometry args={[0.018, 12, 8]} />
        </mesh>
      </group>
    </group>
  );
}
