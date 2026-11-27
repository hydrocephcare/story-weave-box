import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Cloudflare Pages runtime", () => {
  it("has Pages Function entrypoints for the production API routes", () => {
    const required = [
      "functions/api/ai.js",
      "functions/api/ai-polish.js",
      "functions/api/neon-functions.js",
      "functions/api/paystack-webhook.js",
      "api/_lib/onekitty.js",
      "api/_lib/blogPolishAuth.js",
      "api/_lib/blogPolishQueue.js",
      "scripts/blogs/polish-runner.mjs",
      "functions/api/note-card.js",
      "functions/api/source-pdf.js",
      "functions/api/sitemap-index.js",
      "functions/api/sitemap.js",
      "functions/_middleware.ts",
      "functions/stories-sitemap.xml.ts",
    ];
    for (const path of required) expect(fs.existsSync(path), path).toBe(true);
  });

  it("keeps the Pages runtime adapter available for migrated API handlers", () => {
    expect(fs.existsSync("functions/_lib/vercel-adapter.js")).toBe(true);
    const source = fs.readFileSync("functions/_lib/vercel-adapter.js", "utf8");
    expect(source).toContain("runVercelHandler");
    expect(source).toContain("request.arrayBuffer()");
  });
});
