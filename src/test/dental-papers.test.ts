import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import index from "@/data/dentalPapers.json";

const dir = path.resolve(__dirname, "../content/dental");

describe("dental papers", () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  it("has an index entry for every paper and a file for every entry", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual((index as { slug: string }[]).map((p) => p.slug).sort());
  });
  it.each(files)("%s is a complete, readable paper", (f) => {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    expect(p.slug).toBe(f.replace(/\.json$/, ""));
    for (const k of ["title", "university", "unitTitle", "sitting"]) expect(String(p[k] || "").length).toBeGreaterThan(1);
    const qs = p.pages.flatMap((pg: { items: { t: string }[] }) => pg.items.filter((i) => i.t === "q"));
    expect(qs.length).toBeGreaterThan(0);
    for (const pg of p.pages) for (const it of pg.items) expect(["h", "q", "p"]).toContain(it.t);
    // nothing of a handwritten script or a student's details is published
    expect(JSON.stringify(p)).not.toMatch(/reg(istration)?\.? ?no|admission/i);
  });
});
