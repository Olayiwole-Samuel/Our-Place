// Vitest stand-in for the `server-only` marker package, which Next.js resolves
// at build time (and which makes client imports fail the build). Unit tests run
// server modules directly in Node, so the marker is a no-op here.
export {};
