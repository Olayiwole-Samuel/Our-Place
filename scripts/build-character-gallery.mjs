#!/usr/bin/env node
/**
 * Builds the character gallery from CC0 source packs in /assets-src (git-ignored).
 *
 *   node scripts/build-character-gallery.mjs
 *
 * Expects (download from quaternius.itch.io — free "Standard" tiers, CC0):
 *   assets-src/Universal Base Characters[Standard].zip
 *   assets-src/Universal Animation Library[Standard].zip
 *
 * Steps:
 *   1. extract both zips (system `tar`, which reads zip on Windows/macOS/Linux)
 *   2. find skinned, full-body characters (same inspector the server uses)
 *   3. compress each with @gltf-transform/cli (meshopt geometry, WebP ≤1K
 *      textures) → public/models/characters/<id>.glb
 *   4. compress the animation library → public/models/animations/<id>.glb and
 *      map its clips onto our states/emotes by name
 *   5. write lib/character/gallery.manifest.json (read by lib/character/gallery.js)
 *
 * Raw packs never enter the repo; only the optimised outputs do.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readGlbJson } from "../lib/character/glb.js";
import { isFullBodyHumanoid } from "../lib/character/rig.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets-src");
const WORK = join(SRC, "extracted");
const OUT_CHARACTERS = join(ROOT, "public", "models", "characters");
const OUT_ANIMATIONS = join(ROOT, "public", "models", "animations");
const MANIFEST = join(ROOT, "lib", "character", "gallery.manifest.json");
const GLTF_TRANSFORM = ["-y", "@gltf-transform/cli@4"];

const PACKS = [
  { zip: "Universal Base Characters[Standard].zip", dir: "ubc", kind: "characters" },
  { zip: "Universal Animation Library[Standard].zip", dir: "ual", kind: "animations" },
];

// Our names → regexes over the library's clip names (first match wins).
const CLIP_PATTERNS = {
  idle: [/^idle(_loop)?$/i, /idle/i],
  walk: [/^walk(_loop)?$/i, /walk(?!.*(back|left|right|carry))/i],
  run: [/^jog(_fwd)?(_loop)?$/i, /^run/i, /jog/i, /sprint/i],
  sit: [/sit.*idle/i, /^sit/i, /sitting/i],
  wave: [/wave/i],
  dance: [/dance/i],
  celebrate: [/cheer|celebrat|victory|fist.?pump/i],
  laugh: [/laugh/i],
  cry: [/cry|sad/i],
  angry: [/angry|anger|frustrat/i],
  kiss: [/kiss|blow/i],
  heart: [/heart|love/i],
};

const log = (...args) => console.log("[gallery]", ...args);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function slug(name) {
  return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

function toGlb(file, out) {
  // Normalises .gltf (+ external .bin/textures) or .glb into one optimised .glb.
  execFileSync(npx, [...GLTF_TRANSFORM, "optimize", file, out, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function extract() {
  for (const pack of PACKS) {
    const zip = join(SRC, pack.zip);
    if (!existsSync(zip)) throw new Error(`Missing ${relative(ROOT, zip)} — download the free Standard pack from quaternius.itch.io.`);
    const target = join(WORK, pack.dir);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    execFileSync("tar", ["-xf", zip, "-C", target], { stdio: "inherit" });
    log("extracted", pack.zip);
  }
}

function candidates(dir) {
  // Prefer glTF exports; one model per base name.
  const files = walk(dir).filter((file) => [".glb", ".gltf"].includes(extname(file).toLowerCase()));
  const byName = new Map();
  for (const file of files) {
    const key = slug(basename(file));
    if (!byName.has(key) || extname(file).toLowerCase() === ".glb") byName.set(key, file);
  }
  return [...byName.entries()];
}

function buildCharacters() {
  mkdirSync(OUT_CHARACTERS, { recursive: true });
  const entries = [];
  for (const [id, file] of candidates(join(WORK, "ubc"))) {
    const out = join(OUT_CHARACTERS, `${id}.glb`);
    toGlb(file, out);
    const bytes = readFileSync(out);
    // Optimised files require EXT_meshopt_compression, which our client loader
    // supports; check the rig + full body directly rather than upload rules.
    const json = readGlbJson(bytes);
    const joints = (json.skins ?? []).flatMap((skin) => (skin.joints ?? []).map((i) => json.nodes?.[i]?.name)).filter(Boolean);
    if (!json.skins?.length || !isFullBodyHumanoid(joints)) {
      log("skip (not a full-body rigged humanoid):", basename(file));
      rmSync(out);
      continue;
    }
    entries.push({
      id,
      name: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      file: `/models/characters/${id}.glb`,
      bytes: bytes.length,
      rig: "quaternius",
      credit: "Quaternius — Universal Base Characters",
      license: "CC0-1.0",
    });
    log("character", id, `${(bytes.length / 1024).toFixed(0)} KB`);
  }
  return entries;
}

function buildAnimations() {
  mkdirSync(OUT_ANIMATIONS, { recursive: true });
  const sources = candidates(join(WORK, "ual"))
    .map(([id, file]) => {
      const out = join(OUT_ANIMATIONS, `${id}.glb`);
      toGlb(file, out);
      const json = readGlbJson(readFileSync(out));
      return { id, out, clips: (json.animations ?? []).map((a) => a.name).filter(Boolean) };
    })
    .filter((source) => source.clips.length > 0)
    .sort((a, b) => b.clips.length - a.clips.length);
  if (!sources.length) throw new Error("No animation clips found in the animation pack.");
  const library = sources[0];
  for (const extra of sources.slice(1)) rmSync(extra.out);

  const map = {};
  for (const [ours, patterns] of Object.entries(CLIP_PATTERNS)) {
    for (const pattern of patterns) {
      const hit = library.clips.find((clip) => pattern.test(clip));
      if (hit) {
        map[ours] = hit;
        break;
      }
    }
  }
  log("animation library", library.id, `${library.clips.length} clips; mapped:`, map);
  return {
    quaternius: {
      file: `/models/animations/${library.id}.glb`,
      bytes: statSync(library.out).size,
      credit: "Quaternius — Universal Animation Library",
      license: "CC0-1.0",
      clips: library.clips,
      map,
    },
  };
}

extract();
const characters = buildCharacters();
const animations = buildAnimations();
writeFileSync(MANIFEST, `${JSON.stringify({ generated: new Date().toISOString(), characters, animations }, null, 2)}\n`);
log(`wrote ${relative(ROOT, MANIFEST)} — ${characters.length} characters`);

