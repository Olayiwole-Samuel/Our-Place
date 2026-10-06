"use client";

import { useEffect, useState } from "react";
import { WorldStage } from "@/components/3d/World/WorldStage";
import { DEFAULT_CHARACTER } from "@/lib/character/schema";
import { livingRoom } from "@/lib/world/rooms/livingRoom";
import { createWorldRuntime } from "@/lib/world/runtime";
import { diagnostics, usePerformanceStore } from "@/store/performanceStore";
import { useWorldStore } from "@/store/worldStore";

/**
 * DEVELOPMENT / BENCHMARK INFRASTRUCTURE — not part of the product.
 *
 * Query: ?a=<file.glb|builtin>&b=<file.glb|builtin>&walk=1&emote=1&pref=auto|performance|balanced|quality
 *   a / b    local and partner characters (GLBs come from assets-src/, dev only)
 *   walk     the local player walks in a circle (moving-scene measurement)
 *   emote    both characters emote every 5 s
 * Exposes window.__bench: snapshot() → current diagnostics, setPreference(p) →
 * change graphics mid-session, leave()/enter() → unmount/remount the world
 * (the lobby's leave/re-enter path), for scripted runs.
 */
const character = (value) =>
  !value || value === "builtin"
    ? { config: DEFAULT_CHARACTER }
    : { config: DEFAULT_CHARACTER, model: { key: `bench:${value}`, url: `/dev/bench/model/${encodeURIComponent(value)}` } };

const BENCH_PARTNER = { id: "bench-partner", displayName: "Partner" };

export function Bench() {
  const [setup] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    window.sessionStorage.setItem("our-place:perf", "1");
    return {
      runtime: createWorldRuntime(livingRoom, 1),
      a: character(query.get("a")),
      b: character(query.get("b")),
      walk: query.get("walk") === "1",
      emote: query.get("emote") === "1",
      pref: query.get("pref"),
    };
  });
  const { runtime } = setup;
  const [present, setPresent] = useState(true);

  useEffect(() => {
    const world = useWorldStore.getState();
    world.reset();
    world.setConnection("live");
    world.dispatchPartner({ type: "sync", partnerPresent: true });
    if (setup.pref) setTimeout(() => usePerformanceStore.getState().setPreference(setup.pref), 0);
    const spawn = livingRoom.spawnPoints[2];
    const partnerTimer = setInterval(() => runtime.partnerBuffer.push({ x: spawn.x - 0.4, z: spawn.z - 1.2, ry: Math.PI, anim: "idle" }, performance.now()), 1000);
    let angle = 0;
    const walkTimer = setup.walk
      ? setInterval(() => {
          angle += 0.08;
          runtime.input.setJoystick(Math.cos(angle), Math.sin(angle));
        }, 100)
      : null;
    let n = 0;
    const emoteTimer = setup.emote
      ? setInterval(() => {
          n += 1;
          const names = ["wave", "dance", "heart", "laugh"];
          runtime.emotes.local = { name: names[n % 4], id: `b${n}` };
          runtime.emotes.partner = { name: names[(n + 1) % 4], id: `p${n}` };
        }, 5000)
      : null;
    const ready = setTimeout(() => useWorldStore.getState().setLoadStage("ready"), 1500);
    window.__bench = {
      runtime,
      snapshot: () => ({ ...diagnostics, tier: usePerformanceStore.getState().tier }),
      setPreference: (preference) => usePerformanceStore.getState().setPreference(preference),
      leave: () => setPresent(false),
      enter: () => setPresent(true),
    };
    return () => [partnerTimer, walkTimer, emoteTimer].forEach(clearInterval) || clearTimeout(ready);
  }, [runtime, setup]);

  return (
    <main className="app-viewport bg-black-950">
      {present && <WorldStage runtime={runtime} partner={BENCH_PARTNER} myCharacter={setup.a} partnerCharacter={setup.b} />}
    </main>
  );
}
