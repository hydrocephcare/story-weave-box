import { describe, expect, it } from "vitest";
import { applyEdit, attachImage, diffSections, listImages, removeImage, replaceImage, sanitize, sections, slugify, validateLesson } from "../src/lib/content";
import { checkUploadToken, fromBase64, signUploadToken, sniffImage } from "../src/lib/images";

const CDN = "https://cdn.ompathstudy.com/ai/2026/10/a-1.png";
const lesson = `# Acute Abdomen

## What you must know

- Pain first.

## 1. Causes

Many.

### Surgical

Appendicitis.

## 2. Management

Resuscitate.

## Key points to revise

1. Examine.
`;

describe("sections", () => {
  it("finds headings and ranges, ignoring code fences", () => {
    const md = "# T\n\n## A\n\n```\n## not a heading\n```\n\n## B\n";
    expect(sections(md).map((s) => s.heading)).toEqual(["T", "A", "B"]);
  });
});

describe("partial edits", () => {
  it("replaces one section and leaves the others", () => {
    const out = applyEdit(lesson, { op: "replace_section", heading: "Management", body: "Fluids, analgesia, antibiotics." });
    expect(out).toContain("Fluids, analgesia, antibiotics.");
    expect(out).not.toContain("Resuscitate.");
    expect(out).toContain("## What you must know");
    expect(out).toContain("Appendicitis.");
    expect(out).toContain("## 2. Management");
  });
  it("matches headings with or without the number", () => {
    expect(applyEdit(lesson, { op: "append_to_section", heading: "2. Management", body: "Theatre." })).toContain("Theatre.");
    expect(applyEdit(lesson, { op: "append_to_section", heading: "management", body: "Theatre." })).toContain("Theatre.");
  });
  it("inserts a new section after another", () => {
    const out = applyEdit(lesson, { op: "insert_after_section", after_heading: "Causes", heading: "Appendicitis", body: "RIF pain." });
    const heads = sections(out).map((s) => s.heading);
    expect(heads.indexOf("Appendicitis")).toBeGreaterThan(heads.indexOf("Causes"));
    expect(heads.indexOf("Appendicitis")).toBeLessThan(heads.indexOf("2. Management"));
  });
  it("appends a section before nothing else is lost", () => {
    const out = applyEdit(lesson, { op: "append_section", heading: "Appendicitis", body: "x" });
    expect(sections(out).length).toBe(sections(lesson).length + 1);
  });
  it("deletes a section", () => {
    const out = applyEdit(lesson, { op: "delete_section", heading: "Management" });
    expect(out).not.toContain("Resuscitate.");
    expect(out).toContain("Key points to revise");
  });
  it("explains a missing section", () => {
    expect(() => applyEdit(lesson, { op: "replace_section", heading: "Nope", body: "x" })).toThrow(/No section called "Nope"/);
  });
  it("reports what changed", () => {
    const next = applyEdit(lesson, { op: "replace_section", heading: "Management", body: "New." });
    const d = diffSections(lesson, next);
    expect(d.changed).toContain("management");
    expect(d.added).toEqual([]);
  });
});

describe("images", () => {
  it("attaches under a heading with alt text and caption, and lists it", () => {
    const out = attachImage(lesson, { url: CDN, alt: "RIF tenderness", caption: "McBurney point" }, { heading: "Causes" });
    const imgs = listImages(out);
    expect(imgs).toEqual([{ alt: "RIF tenderness", url: CDN, caption: "McBurney point", line: expect.any(Number) }]);
    expect(out.indexOf("![RIF")).toBeGreaterThan(out.indexOf("## 1. Causes"));
    expect(out.indexOf("![RIF")).toBeLessThan(out.indexOf("Many."));
  });
  it("can place at the end of a section", () => {
    const out = attachImage(lesson, { url: CDN, alt: "alt text" }, { heading: "Causes", position: "end" });
    expect(out.indexOf("![alt text]")).toBeGreaterThan(out.indexOf("Appendicitis."));
    expect(out.indexOf("![alt text]")).toBeLessThan(out.indexOf("## 2. Management"));
  });
  it("refuses images that are not on the CDN or have no alt text", () => {
    expect(() => attachImage(lesson, { url: "https://evil.example/x.png", alt: "x" }, { heading: "Causes" })).toThrow(/cdn/);
    expect(() => attachImage(lesson, { url: CDN, alt: " " }, { heading: "Causes" })).toThrow(/alt/);
  });
  it("replaces and removes while keeping the caption line tidy", () => {
    const withImg = attachImage(lesson, { url: CDN, alt: "first", caption: "cap" }, { heading: "Causes" });
    const next = "https://cdn.ompathstudy.com/ai/2026/10/b-2.webp";
    const swapped = replaceImage(withImg, CDN, { url: next });
    expect(listImages(swapped)[0]).toMatchObject({ url: next, alt: "first", caption: "cap" });
    const gone = removeImage(swapped, next);
    expect(listImages(gone)).toEqual([]);
    expect(gone).not.toContain("*Figure:");
  });
});

describe("sanitize and validate", () => {
  it("strips script, iframes, handlers and javascript links", () => {
    const dirty = 'Hi <script>alert(1)</script> <iframe src="x"></iframe> <b onclick="x()">b</b> [a](javascript:alert(1))';
    const clean = sanitize(dirty);
    expect(clean).not.toMatch(/script|iframe|onclick|javascript:/i);
  });
  it("accepts a normal lesson", () => {
    const v = validateLesson(lesson);
    expect(v.ok).toBe(true);
    expect(v.stats.sections).toBeGreaterThan(3);
  });
  it("rejects html, off-site images and tables without a header row", () => {
    expect(validateLesson("## A\n\n<script>x</script>\n\n## B\n").ok).toBe(false);
    expect(validateLesson("## A\n\n![x](https://other.example/a.png)\n\n## B\n").errors.join()).toMatch(/not on the OmpathStudy CDN/);
    expect(validateLesson("## A\n\n| a | b |\n| 1 | 2 |\n\n## B\n").errors.join()).toMatch(/separator/);
  });
  it("warns about raw slide dumps and missing revision sections", () => {
    const v = validateLesson("## Slide 1\n\nx\n\n## Slide 2\n\ny\n");
    expect(v.warnings.join()).toMatch(/Slide N/);
    expect(v.warnings.join()).toMatch(/revision/);
  });
});

describe("slugify", () => {
  it("makes url-safe slugs", () => expect(slugify("Year 4: Surgery — Acute Abdomen (Ré)")).toBe("year-4-surgery-acute-abdomen-re"));
});

describe("image intake", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 0, 0]);
  it("recognises JPEG, PNG and WebP from the bytes", () => {
    expect(sniffImage(png)?.ext).toBe("png");
    expect(sniffImage(jpg)?.ext).toBe("jpg");
    expect(sniffImage(webp)?.ext).toBe("webp");
  });
  it("rejects other files, including an SVG or HTML renamed to .png", () => {
    expect(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toBeNull();
  });
  it("decodes base64 and data URLs, and refuses oversized input", () => {
    expect(fromBase64("data:image/png;base64," + Buffer.from(png).toString("base64"))).toEqual(png);
    expect(() => fromBase64("A".repeat(12_000_000))).toThrow(/too large/);
  });
  it("signs upload links that expire, cannot be altered, and name the client", async () => {
    const { token } = await signUploadToken("secret", "ChatGPT", 600);
    expect(await checkUploadToken("secret", token)).toMatchObject({ by: "ChatGPT" });
    expect(await checkUploadToken("other-secret", token)).toBeNull();
    const parts = token.split("."); parts[0] = String(Number(parts[0]) + 99999);
    expect(await checkUploadToken("secret", parts.join("."))).toBeNull();
    const old = await signUploadToken("secret", "x", -10);
    expect(await checkUploadToken("secret", old.token)).toBeNull();
  });
});
