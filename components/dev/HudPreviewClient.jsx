"use client";

import dynamic from "next/dynamic";

// DEVELOPMENT ONLY: renders client-side (reads the URL, window sizes).
export const HudPreviewClient = dynamic(() => import("./HudPreview").then((m) => m.HudPreview), { ssr: false });
