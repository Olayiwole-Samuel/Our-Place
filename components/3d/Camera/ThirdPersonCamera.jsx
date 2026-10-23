import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LANES } from "@/lib/range/targets";
import { useDecorStore } from "@/store/decorStore";
import { useRangeStore } from "@/store/rangeStore";

const DISTANCE = 2.9; // metres behind the player
const HEIGHT = 1.8; // camera height above the floor
const LOOK_HEIGHT = 1.1; // look at the player's chest, not their feet
const WALL_MARGIN = 0.2;
const CEILING_MARGIN = 0.25;
const FOLLOW_SHARPNESS = 6; // higher = tighter follow
const SEATED_DISTANCE = 2.4;
const OVERVIEW_DISTANCE = 3.6; // Decorate: how far from the middle of the room

/**
 * Third-person follow camera.
 *
 * Orbits the local player at `runtime.camera.yaw` (changed by dragging), eases
 * toward its target position every frame (no snapping), and is clamped inside
 * the room's walls and below the ceiling so it never clips outside. The room is
 * a convex box, so clamping is exact; spaces with interior walls would raycast
 * from the player toward the camera instead. Fixed FOV and gentle easing keep it
 * comfortable (no shake, no FOV changes).
 */
export function ThirdPersonCamera({ runtime }) {
  const camera = useThree((state) => state.camera);
  const lookAt = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const focus = useRef(new THREE.Vector3()); // reused every frame: no per-frame allocation
  const initialised = useRef(false);

  const place = (target, out) => {
    const { yaw } = runtime.camera;
    const { bounds, size } = runtime.room;
    const distance = runtime.localPose.anim === "sit" ? SEATED_DISTANCE : DISTANCE;
    out.set(
      THREE.MathUtils.clamp(target.x + Math.sin(yaw) * distance, bounds.minX + WALL_MARGIN, bounds.maxX - WALL_MARGIN),
      Math.min(HEIGHT, size.height - CEILING_MARGIN),
      THREE.MathUtils.clamp(target.z + Math.cos(yaw) * distance, bounds.minZ + WALL_MARGIN, bounds.maxZ - WALL_MARGIN),
    );
  };

  useEffect(() => {
    // Start already in place — no swoop on entry.
    const { x, z } = runtime.localPose;
    lookAt.current.set(x, LOOK_HEIGHT, z);
    place({ x, z }, desired.current);
    camera.position.copy(desired.current);
    camera.lookAt(lookAt.current);
    initialised.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, runtime]);

  useFrame((_, rawDelta) => {
    if (!initialised.current) return;
    const dt = Math.min(rawDelta, 0.05);
    const lane = useRangeStore.getState().lane;
    if (lane !== null && runtime.room.id === "range_room") {
      // At a lane: your own eyes, looking down your lane at the targets.
      const x = LANES[lane] ?? 0;
      const follow = 1 - Math.exp(-6 * dt);
      camera.position.lerp(desired.current.set(x, 1.5, 2.1), follow);
      lookAt.current.lerp(focus.current.set(x, 1.2, -6), follow);
      camera.lookAt(lookAt.current);
      return;
    }
    if (useDecorStore.getState().active) {
      // Decorate: high up near the ceiling, looking down across the room (drag to go round).
      const { yaw } = runtime.camera;
      const { bounds, size } = runtime.room;
      desired.current.set(
        THREE.MathUtils.clamp(Math.sin(yaw) * OVERVIEW_DISTANCE, bounds.minX + WALL_MARGIN, bounds.maxX - WALL_MARGIN),
        size.height - CEILING_MARGIN - 0.05,
        THREE.MathUtils.clamp(Math.cos(yaw) * OVERVIEW_DISTANCE, bounds.minZ + WALL_MARGIN, bounds.maxZ - WALL_MARGIN),
      );
      const follow = 1 - Math.exp(-4 * dt);
      camera.position.lerp(desired.current, follow);
      lookAt.current.lerp(focus.current.set(-Math.sin(yaw) * 0.9, 0, -Math.cos(yaw) * 0.9), follow);
      camera.lookAt(lookAt.current);
      return;
    }
    const { x, z } = runtime.localPose;
    place({ x, z }, desired.current);
    const follow = 1 - Math.exp(-FOLLOW_SHARPNESS * dt);
    camera.position.lerp(desired.current, follow);
    lookAt.current.lerp(focus.current.set(x, LOOK_HEIGHT, z), Math.min(1, follow * 1.5));
    camera.lookAt(lookAt.current);
  });

  return null;
}
