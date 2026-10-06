import { useMemo } from "react";
import * as THREE from "three";
import { getMaterials, mix } from "../materials";

const WAINSCOT_HEIGHT = 0.95;
const BASEBOARD_HEIGHT = 0.1;

/** One wall: plaster plane, a green wainscot band and a dark baseboard. */
function Wall({ width, height, position, rotation }) {
  const m = getMaterials();
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, height / 2, 0]} material={m.wall}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <mesh position={[0, WAINSCOT_HEIGHT / 2, 0.012]} material={m.wainscot}>
        <planeGeometry args={[width, WAINSCOT_HEIGHT]} />
      </mesh>
      <mesh position={[0, WAINSCOT_HEIGHT, 0.02]} material={m.trim}>
        <boxGeometry args={[width, 0.03, 0.025]} />
      </mesh>
      <mesh position={[0, BASEBOARD_HEIGHT / 2, 0.025]} material={m.trim}>
        <boxGeometry args={[width, BASEBOARD_HEIGHT, 0.03]} />
      </mesh>
    </group>
  );
}

/**
 * Floor, four walls, ceiling and a window whose "sky" follows the time of day.
 * Walls are single-sided planes facing inward, so the camera never sees their
 * backs and they cost one draw call each.
 */
export function RoomShell({ room, timeOfDay }) {
  const m = getMaterials();
  const { width, depth, height } = room.size;
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const skyMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: mix(timeOfDay.background, timeOfDay.sky, timeOfDay.skyIntensity) }),
    [timeOfDay],
  );

  return (
    <group name="room-shell">
      <mesh rotation-x={-Math.PI / 2} material={m.floor} receiveShadow>
        <planeGeometry args={[width, depth]} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, height, 0]} material={m.ceiling}>
        <planeGeometry args={[width, depth]} />
      </mesh>

      <Wall width={width} height={height} position={[0, 0, minZ]} rotation={0} />
      <Wall width={width} height={height} position={[0, 0, maxZ]} rotation={Math.PI} />
      <Wall width={depth} height={height} position={[minX, 0, 0]} rotation={Math.PI / 2} />
      <Wall width={depth} height={height} position={[maxX, 0, 0]} rotation={-Math.PI / 2} />

      {/* Window on the left wall — the key light's source. */}
      <group position={[minX + 0.03, 1.75, -2.75]} rotation-y={Math.PI / 2}>
        <mesh material={skyMaterial}>
          <planeGeometry args={[1.25, 1.35]} />
        </mesh>
        <mesh position={[0, 0, 0.02]} material={m.trim}>
          <boxGeometry args={[0.05, 1.35, 0.04]} />
        </mesh>
        <mesh position={[0, 0, 0.02]} material={m.trim}>
          <boxGeometry args={[1.25, 0.05, 0.04]} />
        </mesh>
        {[
          [0, 0.7, 1.35, 0.08],
          [0, -0.7, 1.45, 0.1],
          [-0.65, 0, 0.08, 1.45],
          [0.65, 0, 0.08, 1.45],
        ].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.03]} material={m.trim}>
            <boxGeometry args={[w, h, 0.06]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
