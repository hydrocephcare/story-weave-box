import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["api/_lib/ompathLite*.test.js"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
