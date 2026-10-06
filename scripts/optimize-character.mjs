#!/usr/bin/env node
/**
 * Shrinks a character GLB before importing it into Our Place.
 *
 *   npm run optimize:character -- "path/to/model.glb" [output.glb]
 *
 * Same tool and settings as the gallery build (gltf-transform via npx):
 * meshopt geometry compression, WebP textures capped at 1024 px, unused data
 * pruned. Geometry is NOT simplified (the character's shape stays as authored).
 * Measured on Avaturn exports: 4.4–4.7 MB → 1.3–1.5 MB with no visible difference
 * in the room (docs/performance.md). The result is checked with
 * the same validator the import uses, so a file that prints "OK" will import.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { inspectCharacterGlb } from "../lib/character/glb.js";

const [input, outputArg] = process.argv.slice(2);
if (!input || extname(input).toLowerCase() !== ".glb") {
  console.error('Usage: npm run optimize:character -- "path/to/model.glb" [output.glb]');
  process.exit(1);
}
const output = outputArg ?? join(dirname(input), `${basename(input, ".glb")}.optimized.glb`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

execFileSync(npx, ["-y", "@gltf-transform/cli@4", "optimize", input, output, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024", "--simplify", "false"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

const before = statSync(input).size;
const after = statSync(output).size;
const verdict = inspectCharacterGlb(readFileSync(output));
console.log(`\n${basename(input)}: ${(before / 1048576).toFixed(1)} MB → ${basename(output)}: ${(after / 1048576).toFixed(1)} MB (${Math.round((1 - after / before) * 100)}% smaller)`);
console.log(verdict.ok ? `OK — full-body, rigged, ${verdict.stats.triangles.toLocaleString("en")} triangles. Import ${basename(output)}.` : `Not importable: ${verdict.reason}`);
process.exit(verdict.ok ? 0 : 1);
