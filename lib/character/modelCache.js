import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mapHumanoidBones } from "./rig";

/**
 * Character model loading + caching (client).
 *
 *   key (stable storage path) + url (short-lived signed URL)
 *     → load GLB once → validate full-body humanoid → cache
 *     → clone per use (each scene gets its own skeleton; geometry/textures shared)
 *
 * Keyed by the storage path, not the signed URL (which changes on every
 * request), so moving between the living room, the studio and future game rooms
 * never re-downloads the same character. A small LRU keeps memory bounded; an
 * evicted entry's GPU resources are disposed once no instance is using it.
 */
const MAX_ENTRIES = 4;
const cache = new Map(); // key → { promise, gltf, users }
let loader = null;

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder); // gallery models are meshopt-compressed
  }
  return loader;
}

/** Target standing height (m) for models, so any import fits the world and the couch. */
export const MODEL_TARGET_HEIGHT = 1.7;

const clipLibraries = new Map(); // url → Promise<AnimationClip[]>

/** Shared animation clips (bind by bone name), loaded once per library file. */
export function loadClipLibrary(url) {
  if (!clipLibraries.has(url)) {
    const promise = getLoader()
      .loadAsync(url)
      .then((gltf) => gltf.animations);
    promise.catch(() => clipLibraries.delete(url));
    clipLibraries.set(url, promise);
  }
  return clipLibraries.get(url);
}

/** Final cleanup when a model leaves the cache for good (nothing can reuse it). */
function disposeGltf(gltf) {
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose();
    for (const material of [].concat(node.material ?? [])) {
      for (const value of Object.values(material)) {
        if (!value?.isTexture) continue;
        value.dispose();
        // GLTFLoader decodes into ImageBitmaps, which are not garbage-collected
        // on their own: close them so their memory is returned.
        if (typeof ImageBitmap !== "undefined" && value.image instanceof ImageBitmap) value.image.close();
      }
      material.dispose();
    }
  });
}

/**
 * GPU release while a model is cached but unused (e.g. the partner left, or we
 * left the room): free the geometry buffers on the GPU after a delay. The data
 * stays in the cache, so a returning avatar re-uploads it with no download.
 * Textures are released by their own reference counts (lib/character/quality.js).
 */
const GEOMETRY_RELEASE_DELAY_MS = 5000;

function scheduleGeometryRelease(entry) {
  clearTimeout(entry.releaseTimer);
  entry.releaseTimer = setTimeout(() => {
    entry.releaseTimer = null;
    if (entry.users !== 0) return;
    entry.promise.then((gltf) => gltf.scene.traverse((node) => node.isMesh && node.geometry?.dispose()), () => {});
  }, GEOMETRY_RELEASE_DELAY_MS);
}

function evict() {
  for (const [key, entry] of cache) {
    if (cache.size <= MAX_ENTRIES) return;
    if (entry.users === 0) {
      cache.delete(key);
      clearTimeout(entry.releaseTimer);
      entry.promise.then(disposeGltf, () => {});
    }
  }
}

export class CharacterModelError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "CharacterModelError";
    this.reason = reason;
  }
}

/** Loads (or reuses) a character GLB. Rejects if it isn't a full-body humanoid. */
export function loadCharacterModel({ key, url }) {
  if (cache.has(key)) {
    const entry = cache.get(key);
    cache.delete(key); // refresh LRU position
    cache.set(key, entry);
    return entry.promise;
  }
  const promise = getLoader()
    .loadAsync(url)
    .then((gltf) => {
      const boneNames = [];
      gltf.scene.traverse((node) => node.isBone && boneNames.push(node.name));
      if (mapHumanoidBones(boneNames).missing.length) {
        disposeGltf(gltf);
        throw new CharacterModelError("not_full_body");
      }
      return gltf;
    });
  const entry = { promise, users: 0, releaseTimer: null };
  promise.catch(() => cache.delete(key)); // failures are retryable
  cache.set(key, entry);
  evict();
  return promise;
}

/**
 * A renderable instance: its own skeleton (so two rooms or two players can pose
 * independently) and its own material copies (so fading one doesn't fade all).
 * Call release() when done.
 */
export function instantiateCharacterModel(key, gltf) {
  const entry = cache.get(key);
  if (entry) {
    entry.users += 1;
    clearTimeout(entry.releaseTimer); // back in use before the GPU release ran
    entry.releaseTimer = null;
  }
  const model = cloneSkinned(gltf.scene);
  // Normalise scale and grounding: exports come in metres, centimetres or worse.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const scale = Number.isFinite(height) && height > 0.01 ? MODEL_TARGET_HEIGHT / height : 1;
  model.scale.multiplyScalar(scale);
  model.position.y -= box.min.y * scale;
  const root = new THREE.Group();
  root.name = "CharacterModel";
  root.add(model);
  const ownedMaterials = [];
  const bones = {};
  model.traverse((node) => {
    if (node.isBone) bones[node.name] = node;
    if (node.isMesh) {
      node.frustumCulled = false;
      node.material = [].concat(node.material).map((material) => {
        const copy = material.clone();
        ownedMaterials.push(copy);
        return copy;
      });
      if (node.material.length === 1) node.material = node.material[0];
    }
  });
  const { map } = mapHumanoidBones(Object.keys(bones));
  const canonicalBones = Object.fromEntries(Object.entries(map).map(([canonical, original]) => [canonical, bones[original]]));
  return {
    root,
    bones: canonicalBones,
    animations: gltf.animations,
    materials: ownedMaterials,
    release() {
      ownedMaterials.forEach((material) => material.dispose());
      if (entry) {
        entry.users = Math.max(0, entry.users - 1);
        if (entry.users === 0) scheduleGeometryRelease(entry);
      }
      evict();
    },
  };
}

/** Test/debug helper. */
export function characterModelCacheSize() {
  return cache.size;
}
