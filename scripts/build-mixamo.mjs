#!/usr/bin/env node
/**
 * Builds the two Our Place characters (male + female) and their motion-capture
 * animations from Mixamo downloads in /assets-src/mixamo (git-ignored).
 *
 *   npm run characters:build
 *
 * Expects FBX files named after what they are (see docs/characters.md for the
 * exact Mixamo download settings):
 *   assets-src/mixamo/male.fbx, female.fbx            characters (With Skin, T-pose)
 *   assets-src/mixamo/idle.fbx, walk.fbx, run.fbx, sit.fbx,
 *     wave.fbx, laugh.fbx, cry.fbx, kiss.fbx, dance.fbx,
 *     celebrate.fbx, angry.fbx, heart.fbx              animations (Without Skin)
 * Only male/female, idle and walk are required; any missing emote simply
 * isn't performed by the model.
 *
 * Steps: FBX → GLB (FBX2glTF) → compressed (@gltf-transform/cli: meshopt
 * geometry, WebP ≤ 1K textures) → public/models/{characters,animations/mixamo}
 * → lib/character/gallery.manifest.json (read by lib/character/gallery.js).
 * Raw downloads never enter the repo; only the optimised outputs do.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readGlbJson } from "../lib/character/glb.js";
import { isFullBodyHumanoid } from "../lib/character/rig.js";

const require = createRequire(import.meta.url);
const convertFbx = require("fbx2gltf");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets-src", "mixamo");
const WORK = join(SRC, "converted");
const OUT_CHARACTERS = join(ROOT, "public", "models", "characters");
const OUT_ANIMATIONS = join(ROOT, "public", "models", "animations", "mixamo");
const MANIFEST = join(ROOT, "lib", "character", "gallery.manifest.json");
const GLTF_TRANSFORM = ["-y", "@gltf-transform/cli@4"];
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const CHARACTERS = [
  { id: "male", name: "Male" },
  { id: "female", name: "Female" },
];
const CLIPS = ["idle", "walk", "run", "sit", "wave", "laugh", "cry", "kiss", "dance", "celebrate", "angry", "heart"];
const REQUIRED_CLIPS = ["idle", "walk"];

const log = (...args) => console.log("[characters]", ...args);
const kb = (file) => `${Math.round(statSync(file).size / 1024)} KB`;

function optimize(input, output, { textures }) {
  const args = [...GLTF_TRANSFORM, "optimize", input, output, "--compress", "meshopt"];
  if (textures) args.push("--texture-compress", "webp", "--texture-size", "1024");
  execFileSync(npx, args, { stdio: "inherit", shell: process.platform === "win32" });
}

async function toGlb(fbx, name) {
  const raw = join(WORK, `${name}.glb`);
  await convertFbx(fbx, raw, ["--khr-materials-unlit=false", "--anim-framerate", "bake30"]);
  return raw;
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`Put the Mixamo downloads in ${SRC} first (see docs/characters.md).`);
    process.exit(1);
  }
  const missing = [...CHARACTERS.map((c) => c.id), ...REQUIRED_CLIPS].filter((name) => !existsSync(join(SRC, `${name}.fbx`)));
  if (missing.length) {
    console.error(`Missing in assets-src/mixamo: ${missing.map((name) => `${name}.fbx`).join(", ")}`);
    process.exit(1);
  }
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT_CHARACTERS, { recursive: true });
  rmSync(OUT_ANIMATIONS, { recursive: true, force: true });
  mkdirSync(OUT_ANIMATIONS, { recursive: true });

  const characters = [];
  for (const character of CHARACTERS) {
    const raw = await toGlb(join(SRC, `${character.id}.fbx`), character.id);
    const out = join(OUT_CHARACTERS, `${character.id}.glb`);
    optimize(raw, out, { textures: true });
    const json = readGlbJson(new Uint8Array(readFileSync(out)));
    const bones = (json.nodes ?? []).map((node) => node.name ?? "");
    if (!isFullBodyHumanoid(bones)) throw new Error(`${character.id}.fbx is not a full-body rigged humanoid (download it "With Skin" in T-pose).`);
    log(`${character.id}: ${kb(out)}`);
    characters.push({ id: character.id, name: character.name, file: `/models/characters/${character.id}.glb`, rig: "mixamo", credit: "Mixamo (Adobe)", license: "Mixamo terms: royalty-free use in projects" });
  }

  const clips = {};
  for (const clip of CLIPS) {
    const fbx = join(SRC, `${clip}.fbx`);
    if (!existsSync(fbx)) {
      log(`${clip}: not provided (skipped)`);
      continue;
    }
    const raw = await toGlb(fbx, `anim-${clip}`);
    const out = join(OUT_ANIMATIONS, `${clip}.glb`);
    optimize(raw, out, { textures: false });
    const json = readGlbJson(new Uint8Array(readFileSync(out)));
    if (!json.animations?.length) throw new Error(`${clip}.fbx has no animation in it.`);
    clips[clip] = `/models/animations/mixamo/${clip}.glb`;
    log(`${clip}: ${kb(out)}`);
  }

  writeFileSync(
    MANIFEST,
    `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), characters, animations: { mixamo: { clips, credit: "Mixamo (Adobe)" } } }, null, 2)}\n`,
  );
  rmSync(WORK, { recursive: true, force: true });
  log(`Done: ${characters.length} characters, ${Object.keys(clips).length} animations. Manifest written.`);
}

main().catch((error) => {
  console.error("[characters]", error.message);
  process.exit(1);
});
