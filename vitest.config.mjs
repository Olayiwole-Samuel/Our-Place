import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.js", import.meta.url)),
    },
  },
  test: {
    // Node by default; component tests opt into jsdom with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["**/*.test.{js,jsx,mjs}"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["./tests/setup.js"],
    // The database suite boots real Postgres (PGlite) once per file.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
