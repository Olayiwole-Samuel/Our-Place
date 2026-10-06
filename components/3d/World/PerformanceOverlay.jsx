"use client";

import { useEffect, useState } from "react";
import { PROFILES } from "@/lib/performance/profiles";
import { diagnostics, usePerformanceStore } from "@/store/performanceStore";

/**
 * Developer-only performance overlay (development builds, `?perf=1`). Shows only
 * what the renderer actually reports — nothing estimated. Refreshes twice a
 * second from a plain object, so it doesn't add per-frame React work.
 */
export default function PerformanceOverlay() {
  const tier = usePerformanceStore((state) => state.tier);
  const preference = usePerformanceStore((state) => state.preference);
  const assessed = usePerformanceStore((state) => state.assessed);
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);
  const profile = PROFILES[tier];
  const memory = typeof performance !== "undefined" ? performance.memory : null;
  const rows = [
    ["FPS", `${diagnostics.fps}${diagnostics.cap ? ` (cap ${diagnostics.cap})` : " (probe)"}`],
    ["Frame", `${diagnostics.frameMs} ms · long ${diagnostics.longFrames}/s`],
    ["Tier", `${tier.toUpperCase()} · ${preference}${assessed ? ` (start ${assessed.tier})` : ""}`],
    ["Pixel ratio", diagnostics.dpr],
    ["Draw calls", diagnostics.calls],
    ["Triangles", `${(diagnostics.triangles / 1000).toFixed(1)}k`],
    ["Geometries", diagnostics.geometries],
    ["Textures", diagnostics.textures],
    ["Shader programs", diagnostics.programs],
    ["Shadows", profile.shadows],
    ["Characters", profile.characterQuality],
    ["Post FX / particles", "none in scene"],
    ...(memory ? [["JS heap", `${Math.round(memory.usedJSHeapSize / 1048576)} MB`]] : []),
    ...(diagnostics.lastChange ? [["Last change", `${diagnostics.lastChange.type} → ${diagnostics.lastChange.tier ?? ""} @${diagnostics.lastChange.at}s`]] : []),
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed top-20 left-3 z-50 rounded-[var(--radius-sm)] bg-black-950/85 px-3 py-2 font-mono text-[11px] leading-4 text-text-secondary">
      <p className="mb-1 font-semibold text-white-soft">Our Place performance</p>
      {rows.map(([label, value]) => (
        <p key={label}>
          <span className="text-text-muted">{label}: </span>
          {value}
        </p>
      ))}
    </div>
  );
}
