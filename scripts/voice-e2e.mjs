#!/usr/bin/env node
/**
 * DEVELOPMENT: end-to-end voice check through Agora.
 *
 *   node scripts/voice-e2e.mjs [--seconds 30] [--base http://localhost:3000]
 *
 * Starts two independent headless Chromes with a fake microphone (Chrome plays
 * a test tone), joins both to a throwaway Agora channel with tokens signed by
 * the project's own AGORA_APP_ID / AGORA_APP_CERTIFICATE (read from .env /
 * .env.local, never printed), and reports what each side HEARS from the other.
 * Requires `npm run dev` (it uses /dev/voice) and Chrome.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import agoraToken from "agora-token";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []));
const SECONDS = Number(args.seconds ?? 30);
const BASE = args.base ?? "http://localhost:3000";
const CHROME = args.chrome ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function env(name) {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return process.env[name];
}

const appId = env("AGORA_APP_ID");
const certificate = env("AGORA_APP_CERTIFICATE");
if (!appId || !certificate) {
  console.error("AGORA_APP_ID / AGORA_APP_CERTIFICATE are not set in .env or .env.local.");
  process.exit(1);
}
const channel = `op-selftest-${randomBytes(6).toString("hex")}`;
const token = (uid) => agoraToken.RtcTokenBuilder.buildTokenWithUserAccount(appId, certificate, channel, uid, agoraToken.RtcRole.PUBLISHER, 600, 600);

async function browser(uid) {
  const profile = mkdtempSync(join(tmpdir(), "op-voice-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "about:blank",
  ]);
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
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Page.enable");
  const fragment = new URLSearchParams({ appId, channel, token: token(uid), uid }).toString();
  await send("Page.navigate", { url: `${BASE}/dev/voice#${fragment}` });
  return {
    uid,
    report: () => evaluate("JSON.parse(JSON.stringify(window.__voiceTest ?? null))"),
    close: async () => {
      ws.close();
      chrome.kill();
      await sleep(700);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Chrome may still hold the profile briefly.
      }
    },
  };
}

const summarise = (levels) => {
  const heard = levels.filter((level) => level >= 0);
  const audible = heard.filter((level) => level > 0.01);
  return { samples: levels.length, withRemoteTrack: heard.length, audible: audible.length, peak: Math.max(0, ...heard), mean: heard.length ? Number((heard.reduce((a, b) => a + b, 0) / heard.length).toFixed(3)) : 0 };
};

console.log(`[voice] two browsers joining a throwaway Agora channel for ${SECONDS}s…`);
const [a, b] = await Promise.all([browser("selftest-a"), browser("selftest-b")]);
try {
  for (let elapsed = 0; elapsed < SECONDS; elapsed += 5) {
    await sleep(5000);
    const [ra, rb] = await Promise.all([a.report(), b.report()]);
    console.log(`[voice] ${elapsed + 5}s  A: ${ra?.state ?? "loading"} hears ${ra?.remoteUsers?.join(",") || "nobody"}  ·  B: ${rb?.state ?? "loading"} hears ${rb?.remoteUsers?.join(",") || "nobody"}`);
  }
  const [ra, rb] = await Promise.all([a.report(), b.report()]);
  const result = {
    A: { state: ra?.state, published: ra?.published, hears: ra?.remoteUsers, errors: ra?.errors, ownMic: summarise(ra?.localLevels ?? []), fromB: summarise(ra?.remoteLevels ?? []) },
    B: { state: rb?.state, published: rb?.published, hears: rb?.remoteUsers, errors: rb?.errors, ownMic: summarise(rb?.localLevels ?? []), fromA: summarise(rb?.remoteLevels ?? []) },
  };
  console.log(JSON.stringify(result, null, 1));
  const ok = result.A.fromB.audible > 0 && result.B.fromA.audible > 0;
  console.log(ok ? "[voice] PASS — audio went through Agora in both directions." : "[voice] FAIL — see above.");
  process.exitCode = ok ? 0 : 1;
} finally {
  await Promise.all([a.close(), b.close()]);
}
