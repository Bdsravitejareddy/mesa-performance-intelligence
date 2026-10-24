import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // In-process Postgres (PGlite) tests and their per-test database setup can exceed the 5s/10s defaults when
    // the full suite runs in parallel on a loaded machine.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
