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
    // In-process Postgres (PGlite) tests can exceed the 5s default when the full suite runs in parallel.
    testTimeout: 20000,
  },
});
