#!/usr/bin/env node
/**
 * DEVELOPMENT / BENCHMARK INFRASTRUCTURE.
 *
 * Measures the living room in a real (headless) Chrome with the GPU enabled,
 * driving /dev/bench over the DevTools protocol — no extra dependencies.
 *
 *   node scripts/bench-headless.mjs [--base http://localhost:3000] [--size 1600x900] [--dpr 1] [--only "a|b|pref|mode,…"]
 *
 * Per scenario: a FRESH browser (no GPU memory carried over), one warm-up load
 * (dev compilation, model download, shader compilation), a second load, then an
 * 8-second measurement: renders/s from the renderer's own frame counter, the
 * 95th-percentile frame interval, long frames (> 50 ms), plus draw calls,
 * triangles, textures and JS heap. Requires `npm run dev` and Chrome.
 * Results describe the machine running it — phones must be tested on the device.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []));
const BASE = args.base ?? "http://localhost:3000";
const [WIDTH, HEIGHT] = (args.size ?? "1600x900").split("x").map(Number);
const DPR = Number(args.dpr ?? 1);
const CHROME = args.chrome ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WARM_MS = Number(args.warm ?? 16000);
const SETTLE_MS = Number(args.settle ?? 9000);

const SCENARIOS = args.only?.split(",") ?? [
  "builtin|builtin|quality|idle",
  "builtin|builtin|balanced|idle",
  "builtin|builtin|performance|idle",
  "me model.glb|mineee.glb|quality|idle",
  "me model.glb|mineee.glb|balanced|idle",
  "me model.glb|mineee.glb|performance|idle",
  "me model.glb|mineee.glb|quality|walk",
  "me model.glb|mineee.glb|performance|walk",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withBrowser(fn) {
  const profile = mkdtempSync(join(tmpdir(), "op-bench-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--force-device-scale-factor=${DPR}`,
    "--enable-gpu",
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-background-timer-throttling",
    "--no-first-run",
    "about:blank",
  ]);
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i += 1) {
      await sleep(250);
      targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
    }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        id += 1;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await send("Page.enable");
    await send("Page.bringToFront");
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    const result = await fn({ send, evaluate });
    ws.close();
    return result;
  } finally {
    chrome.kill();
    await sleep(800);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold the temp profile briefly.
    }
  }
}

const MEASURE = `new Promise((resolve) => {
  const gl = window.__ourPlaceGl;
  if (!gl || !window.__bench) return resolve(null);
  const intervals = [];
  let last = 0;
  const f0 = gl.info.render.frame;
  const t0 = performance.now();
  let lastFrame = f0;
  const tick = (now) => {
    const frame = gl.info.render.frame;
    if (frame !== lastFrame) {
      if (last) intervals.push(now - last);
      last = now;
      lastFrame = frame;
    }
    if (now - t0 < 8000) requestAnimationFrame(tick);
    else {
      const sorted = [...intervals].sort((a, b) => a - b);
      const snap = window.__bench.snapshot();
      resolve({
        fps: Math.round(((gl.info.render.frame - f0) / ((now - t0) / 1000)) * 10) / 10,
        p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
        long: intervals.filter((ms) => ms > 50).length,
        tier: snap.tier, dpr: snap.dpr, calls: snap.calls, tris: snap.triangles, tex: snap.textures, programs: snap.programs,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      });
    }
  };
  requestAnimationFrame(tick);
})`;

async function main() {
  const renderer = await withBrowser(({ evaluate }) =>
    evaluate(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const i = gl && gl.getExtension('WEBGL_debug_renderer_info'); return i ? gl.getParameter(i.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`),
  );
  console.log(`GPU: ${renderer}   viewport ${WIDTH}x${HEIGHT} @${DPR}x\n`);
  console.log(["characters", "setting", "scene", "tier", "fps", "p95 ms", "long", "dpr", "calls", "tris", "tex", "progs", "heap MB"].join("\t"));
  for (const scenario of SCENARIOS) {
    const [a, b, pref, mode] = scenario.split("|");
    const url = `${BASE}/dev/bench?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&pref=${pref}${mode === "walk" ? "&walk=1" : ""}`;
    const row = await withBrowser(async ({ send, evaluate }) => {
      await send("Page.navigate", { url });
      await sleep(WARM_MS);
      await send("Page.navigate", { url });
      await sleep(SETTLE_MS);
      const measured = await evaluate(MEASURE);
      if (args.shots) {
        const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
        const file = join(args.shots, `${pref}-${mode}-${a === "builtin" ? "builtin" : "imported"}.jpg`);
        (await import("node:fs")).writeFileSync(file, Buffer.from(shot.result.data, "base64"));
      }
      return measured;
    });
    const label = a === "builtin" ? "built-in ×2" : "imported ×2";
    if (!row) console.log(`${label}\t${pref}\t${mode}\t(no data)`);
    else console.log([label, pref, mode, row.tier, row.fps, row.p95, row.long, row.dpr, row.calls, `${(row.tris / 1000).toFixed(1)}k`, row.tex, row.programs, row.heap].join("\t"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
