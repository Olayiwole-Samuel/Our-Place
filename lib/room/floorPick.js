import * as THREE from "three";
import { DECOR, footprint } from "./decor";

/**
 * Decorate mode's pointer: where on the floor a tap lands, and which placed
 * thing is under it. `view` = { camera, canvas } (set by World on create).
 */
const raycaster = new THREE.Raycaster();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export function floorPoint(view, clientX, clientY) {
  if (!view?.camera || !view.canvas) return null;
  const rect = view.canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, view.camera);
  return raycaster.ray.intersectPlane(floor, hit) ? { x: hit.x, z: hit.z } : null;
}

/** The placed thing under (x, z) — the smallest one, so a lamp on a rug picks the lamp. */
export function thingAt(placed, point) {
  let best = null;
  let bestArea = Infinity;
  for (const thing of placed) {
    const entry = DECOR[thing.item];
    if (!entry) continue;
    const { halfWidth, halfDepth } = footprint(entry, thing.rotation);
    const pad = 0.08; // fingers are bigger than cactuses
    if (Math.abs(point.x - thing.x) <= halfWidth + pad && Math.abs(point.z - thing.z) <= halfDepth + pad && halfWidth * halfDepth < bestArea) {
      best = thing;
      bestArea = halfWidth * halfDepth;
    }
  }
  return best;
}
