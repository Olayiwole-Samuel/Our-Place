"use client";

import dynamic from "next/dynamic";

/** Loads the dog preview on the client only (three.js never renders on the server). */
export const DogPreviewClient = dynamic(() => import("./DogPreview").then((m) => m.DogPreview), { ssr: false });
