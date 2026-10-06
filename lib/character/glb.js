import { isFullBodyHumanoid, mapHumanoidBones } from "./rig.js";

/**
 * Minimal GLB inspection without three.js, used on the SERVER to validate a
 * provider model before it is stored: the file must be a real GLB, within size
 * limits, and contain a skinned, full-body humanoid skeleton. A head-only or
 * bust model is rejected — Our Place characters are full-body by requirement.
 */
export const MAX_MODEL_BYTES = 30 * 1024 * 1024;
/** Mobile budget for one character (the built-in character is ~18k). */
export const MAX_CHARACTER_TRIANGLES = 120_000;
/**
 * Extensions our loader can handle when a file REQUIRES them. Includes the two
 * that `npm run optimize:character` (gltf-transform) produces: meshopt geometry
 * compression (decoded by MeshoptDecoder in lib/character/modelCache.js) and
 * WebP textures (built into GLTFLoader) — an optimised avatar is ~70% smaller.
 */
const SUPPORTED_REQUIRED_EXTENSIONS = new Set([
  "KHR_materials_unlit",
  "KHR_texture_transform",
  "KHR_mesh_quantization",
  "KHR_materials_emissive_strength",
  "EXT_meshopt_compression",
  "EXT_texture_webp",
]);
const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

export function readGlbJson(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buffer.byteLength < 20) throw new Error("not_glb");
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("not_glb");
  if (view.getUint32(4, true) !== 2) throw new Error("unsupported_glb_version");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength > buffer.byteLength) throw new Error("truncated_glb");
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + chunkLength > buffer.byteLength) throw new Error("bad_glb_json");
  const text = new TextDecoder().decode(buffer.subarray(20, 20 + chunkLength));
  return JSON.parse(text);
}

/**
 * Inspects a GLB and reports whether it is a usable Our Place character.
 * Returns { ok, reason?, stats: { meshes, skins, joints, animations, materials, textures, missingBones } }.
 */
export function inspectCharacterGlb(bytes) {
  if ((bytes?.byteLength ?? 0) > MAX_MODEL_BYTES) return { ok: false, reason: "too_large" };
  let json;
  try {
    json = readGlbJson(bytes);
  } catch (error) {
    return { ok: false, reason: error.message || "not_glb" };
  }
  // Everything must be embedded: an external URL inside a model would make every
  // viewer's browser contact a third party (tracking) or fail to load.
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some((entry) => typeof entry?.uri === "string");
  if (external) return { ok: false, reason: "external_resources" };
  const unsupported = (json.extensionsRequired ?? []).filter((name) => !SUPPORTED_REQUIRED_EXTENSIONS.has(name));
  if (unsupported.length) return { ok: false, reason: "unsupported_extensions", stats: { unsupported } };

  const nodes = json.nodes ?? [];
  const skins = json.skins ?? [];
  const jointNames = skins.flatMap((skin) => (skin.joints ?? []).map((index) => nodes[index]?.name).filter(Boolean));
  const { missing } = mapHumanoidBones(jointNames);
  const stats = {
    meshes: (json.meshes ?? []).length,
    skins: skins.length,
    joints: jointNames.length,
    animations: (json.animations ?? []).length,
    materials: (json.materials ?? []).length,
    textures: (json.textures ?? []).length,
    triangles: estimateTriangles(json),
    missingBones: missing,
  };
  if (stats.meshes === 0) return { ok: false, reason: "no_mesh", stats };
  if (stats.skins === 0) return { ok: false, reason: "not_rigged", stats };
  if (!isFullBodyHumanoid(jointNames)) return { ok: false, reason: "not_full_body", stats };
  if (stats.triangles > MAX_CHARACTER_TRIANGLES) return { ok: false, reason: "too_detailed", stats };
  return { ok: true, stats };
}

function estimateTriangles(json) {
  const accessors = json.accessors ?? [];
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue; // TRIANGLES only
      const accessor = primitive.indices !== undefined ? accessors[primitive.indices] : accessors[primitive.attributes?.POSITION];
      triangles += Math.floor((accessor?.count ?? 0) / 3);
    }
  }
  return triangles;
}
