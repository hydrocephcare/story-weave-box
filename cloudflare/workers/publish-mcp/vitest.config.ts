import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  // The gateway's tests do not process CSS. Prevent Vite from inheriting the
  // monorepo root PostCSS config, which requires the website's Tailwind package.
  css: { postcss: { plugins: [] } },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
