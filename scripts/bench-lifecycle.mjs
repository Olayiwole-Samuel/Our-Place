#!/usr/bin/env node
/**
 * DEVELOPMENT / BENCHMARK INFRASTRUCTURE.
 *
 * GPU memory lifecycle check in headless Chrome (needs `npm run dev`):
 *   1. two imported characters at Quality (HIGH) → textures/geometries on the GPU
 *   2. switch to Performance (LOW) mid-session → after the release delay, the
 *      full-size textures LOW no longer draws with should leave the GPU
 *   3. back to Quality → textures re-upload (from memory, no network requests)
 *   4. leave/re-enter the room 6× → JS heap, textures and model requests must not grow
 *
 *   node scripts/bench-lifecycle.mjs [--base http://localhost:3000]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []));
const BASE = args.base ?? "http://localhost:3000";
const CHROME = args.chrome ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "op-life-"));
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9488", `--user-data-dir=${profile}`, "--window-size=1280,720", "--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--no-first-run", "about:blank"]);
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i += 1) {
      await sleep(250);
      targets = await fetch("http://127.0.0.1:9488/json").then((r) => r.json()).catch(() => null);
    }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
    let id = 0;
    const pending = new Map();
    let modelRequests = 0;
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Network.requestWillBeSent" && message.params.request.url.includes("/dev/bench/model/")) modelRequests += 1;
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
    const gpu = () =>
      evaluate(`(() => { const gl = window.__ourPlaceGl; if (window.gc) window.gc(); return { textures: gl ? gl.info.memory.textures : null, geometries: gl ? gl.info.memory.geometries : null, tier: window.__bench.snapshot().tier, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) }; })()`);

    await send("Page.enable");
    await send("Network.enable");
    await send("Page.bringToFront");
    const url = `${BASE}/dev/bench?a=${encodeURIComponent("me model.glb")}&b=${encodeURIComponent("mineee.glb")}&pref=quality`;
    await send("Page.navigate", { url });
    await sleep(20000);
    await send("Page.navigate", { url }); // warm (compiled, cached)
    modelRequests = 0;
    await sleep(15000);
    const rows = [];
    rows.push(["1. Quality (HIGH)", await gpu(), modelRequests]);
    await evaluate(`window.__bench.setPreference("performance")`);
    await sleep(1000);
    rows.push(["2. → Performance, 1 s", await gpu(), modelRequests]);
    await sleep(5000);
    rows.push(["2. → Performance, 6 s (after release delay)", await gpu(), modelRequests]);
    await evaluate(`window.__bench.setPreference("quality")`);
    await sleep(6000);
    rows.push(["3. → back to Quality", await gpu(), modelRequests]);
    for (let visit = 1; visit <= 6; visit += 1) {
      await evaluate(`window.__bench.leave()`);
      await sleep(1500);
      await evaluate(`window.__bench.enter()`);
      await sleep(9000);
      if (visit === 1 || visit === 6) rows.push([`4. leave/re-enter ×${visit}`, await gpu(), modelRequests]);
    }
    console.log(["step", "tier", "GPU textures", "GPU geometries", "JS heap MB", "model downloads"].join("\t"));
    for (const [step, s, requests] of rows) console.log([step, s.tier, s.textures, s.geometries, s.heapMB, requests].join("\t"));
    ws.close();
  } finally {
    chrome.kill();
    await sleep(800);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // temp profile may still be locked briefly
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
