"use client";

import dynamic from "next/dynamic";

// DEVELOPMENT / BENCHMARK ONLY: the bench reads window/sessionStorage, so it renders client-side only.
export const BenchClient = dynamic(() => import("./Bench").then((m) => m.Bench), { ssr: false });
