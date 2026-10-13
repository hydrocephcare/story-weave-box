import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Vercel Hobby plan", () => {
  it("keeps the serverless functions within the limit of twelve", () => {
    const files = fs.readdirSync("api").filter((f) => /\.(js|ts|mjs)$/.test(f) && !f.startsWith("_"));
    // an edge function does not count towards the limit
    const edge = files.filter((f) => /runtime:\s*"edge"/.test(fs.readFileSync(`api/${f}`, "utf8")));
    const counted = files.filter((f) => !edge.includes(f));
    expect(counted.length, `functions: ${counted.join(", ")}`).toBeLessThanOrEqual(12);
  });
  it("only names functions that exist in vercel.json", () => {
    const v = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    for (const p of Object.keys(v.functions ?? {})) expect(fs.existsSync(p), p).toBe(true);
  });
});
