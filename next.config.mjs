import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */

// Baseline security headers applied to every route. A full Content-Security-Policy
// is deferred until the external origins (Supabase, Colyseus, Daily, MetaPerson) are
// actually wired in, so it can be written against real traffic instead of guessed.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Microphone (Daily voice) and camera (MetaPerson selfie) are allowed for our own
    // origin only; everything else stays off.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig = {
  // Pin the project root: a stray lockfile in a parent directory otherwise makes
  // Next.js guess the wrong workspace root for output file tracing.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must never be served stale, or updates stop shipping.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
