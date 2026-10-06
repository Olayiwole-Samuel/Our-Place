import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

const FADED_OPACITY = 0.18;
const FADE_SHARPNESS = 10;

/**
 * Distance on the floor plane from point P to segment A→B, plus where along the
 * segment the closest point lies (t in 0..1).
 */
export function distanceToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lengthSq));
  return { distance: Math.hypot(px - (ax + abx * t), pz - (az + abz * t)), t };
}

/**
 * Wraps a tall prop so it fades out while it stands between the camera and the
 * player, instead of hiding them. Gives the prop its own material copies on
 * mount, so fading never affects other objects that share materials.
 */
export function CameraOccluder({ runtime, x, z, radius, children }) {
  const group = useRef();
  const camera = useThree((state) => state.camera);
  const materials = useRef([]);
  const opacity = useRef(1);

  useLayoutEffect(() => {
    const owned = [];
    group.current?.traverse((node) => {
      if (!node.isMesh || !node.material) return; // includes instanced meshes (books)
      const clone = node.material.clone();
      clone.userData.baseOpacity = clone.opacity;
      clone.userData.baseTransparent = clone.transparent;
      node.material = clone;
      owned.push(clone);
    });
    materials.current = owned;
    return () => owned.forEach((material) => material.dispose());
  }, []);

  useFrame((_, rawDelta) => {
    const pose = runtime.localPose;
    const { distance, t } = distanceToSegment(x, z, camera.position.x, camera.position.z, pose.x, pose.z);
    // Only fade when the prop is between camera and player (not behind the player).
    const blocking = distance < radius && t < 0.92;
    const target = blocking ? FADED_OPACITY : 1;
    if (opacity.current === target) return; // settled: no per-frame material work
    const next = THREE.MathUtils.damp(opacity.current, target, FADE_SHARPNESS, Math.min(rawDelta, 0.05));
    opacity.current = Math.abs(next - target) < 0.005 ? target : next;
    const faded = opacity.current < 0.999;
    for (const material of materials.current) {
      material.opacity = material.userData.baseOpacity * opacity.current;
      if (material.transparent !== (faded || material.userData.baseTransparent)) {
        material.transparent = faded || material.userData.baseTransparent;
        material.needsUpdate = true;
      }
      material.depthWrite = !faded;
    }
  });

  return <group ref={group}>{children}</group>;
}
