import * as THREE from "three";

/**
 * Per-tier rendering of model characters (imported / gallery / provider GLBs).
 * Same person at every tier — shape, colours and textures stay recognisable —
 * at very different GPU cost. Measured on the Avaturn exports (docs/performance.md):
 * 13–14 textures of 1024² each ≈ 57–63 MB of GPU memory per character as authored.
 *
 *   high    as authored
 *   medium  no ambient-occlusion maps (barely visible at room distance)
 *   low     colour map only, downscaled to `textureMax` (512 px), Lambert shading
 *           (no normal / roughness / metalness / AO maps): ≈ 2–4 MB per character
 *
 * Materials are per-instance copies (modelCache), so swapping them never affects
 * another instance. Textures are SHARED: by both avatars when they use the same
 * model, and between tiers (a small colour map can be the original when it's
 * already ≤ 512 px). Returns a restore function that puts the authored
 * materials back and disposes what this call created.
 *
 * GPU memory lifecycle (texture ownership):
 *   Every texture a rendered avatar actually draws with is reference-counted
 *   (`retain` on apply, `release` on restore/unmount). When a texture's count
 *   reaches zero — e.g. HIGH → LOW stops using the 1024 px normal/roughness/AO
 *   maps, or the partner leaves — its GPU copy is released after a short delay
 *   (texture.dispose() frees only the WebGL texture; the decoded image stays in
 *   the model cache, so if it's needed again three.js re-uploads it without any
 *   network request). The delay absorbs quick quality flip-flops, so nothing is
 *   re-uploaded or flashes. A texture in use by any avatar is never released.
 *   Final CPU-side cleanup (closing ImageBitmaps) happens on model cache eviction.
 */
const resized = new WeakMap(); // source texture → Map(size → texture)

export const TEXTURE_RELEASE_DELAY_MS = 3000;
const users = new Map(); // texture → number of rendered materials drawing with it
const pendingRelease = new Map(); // texture → timer
const TEXTURE_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap", "lightMap", "specularMap"];

function texturesOf(material) {
  const textures = [];
  for (const slot of TEXTURE_SLOTS) if (material?.[slot]?.isTexture) textures.push(material[slot]);
  return textures;
}

function retain(texture) {
  users.set(texture, (users.get(texture) ?? 0) + 1);
  const timer = pendingRelease.get(texture);
  if (timer) {
    clearTimeout(timer);
    pendingRelease.delete(texture);
  }
}

function release(texture) {
  const count = (users.get(texture) ?? 0) - 1;
  if (count > 0) {
    users.set(texture, count);
    return;
  }
  users.delete(texture);
  if (pendingRelease.has(texture)) return;
  pendingRelease.set(
    texture,
    setTimeout(() => {
      pendingRelease.delete(texture);
      if (!users.has(texture)) texture.dispose(); // GPU copy only; re-uploads on demand
    }, TEXTURE_RELEASE_DELAY_MS),
  );
}

/** Diagnostics/tests: how many avatars' materials currently draw with `texture`. */
export function textureUsers(texture) {
  return users.get(texture) ?? 0;
}

function downscale(texture, max) {
  const image = texture?.image;
  if (!image || !image.width || Math.max(image.width, image.height) <= max) return texture;
  let bySize = resized.get(texture);
  if (!bySize) resized.set(texture, (bySize = new Map()));
  if (!bySize.has(max)) {
    const ratio = max / Math.max(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const small = new THREE.CanvasTexture(canvas);
    small.colorSpace = texture.colorSpace;
    small.flipY = texture.flipY;
    small.wrapS = texture.wrapS;
    small.wrapT = texture.wrapT;
    small.offset.copy(texture.offset);
    small.repeat.copy(texture.repeat);
    small.channel = texture.channel;
    bySize.set(max, small);
  }
  return bySize.get(max);
}

function lowMaterial(source, textureMax) {
  return new THREE.MeshLambertMaterial({
    name: `${source.name}-low`,
    color: source.color,
    map: source.map ? downscale(source.map, textureMax) : null,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    depthWrite: source.depthWrite,
    emissive: source.emissive ?? new THREE.Color(0),
  });
}

function mediumMaterial(source) {
  const copy = source.clone();
  copy.aoMap = null;
  copy.needsUpdate = true;
  return copy;
}

export function applyModelQuality(root, quality, { textureMax = 1024 } = {}) {
  const swaps = [];
  const retained = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    const original = node.material;
    const list = [].concat(original);
    const next = quality === "high" ? list : list.map((material) => (quality === "low" ? lowMaterial(material, textureMax) : mediumMaterial(material)));
    if (quality !== "high") node.material = Array.isArray(original) ? next : next[0];
    for (const material of next) for (const texture of texturesOf(material)) retained.push(texture);
    swaps.push({ node, original, created: quality === "high" ? [] : next });
  });
  retained.forEach(retain);
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const { node, original, created } of swaps) {
      node.material = original;
      created.forEach((material) => material.dispose());
    }
    retained.forEach(release);
  };
}

/** Real shadows (when the tier enables them): characters cast, the floor receives. */
export function setCastShadow(root, enabled) {
  root.traverse((node) => {
    if (node.isMesh) node.castShadow = enabled;
  });
}

const frustum = new THREE.Frustum();
const projection = new THREE.Matrix4();
const sphere = new THREE.Sphere(new THREE.Vector3(), 1.3);

/**
 * Is a character (standing at `object`'s origin, ~1.7 m tall) inside the camera
 * view? Skinned meshes can't be frustum-culled by three.js (their bounds move
 * with animation), so characters are culled as a whole with a generous sphere.
 */
export function characterInView(camera, object) {
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projection);
  object.getWorldPosition(sphere.center);
  sphere.center.y += 0.9;
  return frustum.intersectsSphere(sphere);
}
