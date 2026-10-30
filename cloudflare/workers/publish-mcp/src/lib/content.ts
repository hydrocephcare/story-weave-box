// Pure helpers for lesson text. A lesson is Markdown in articles.content: "## Heading" sections, tables, lists,
// images as ![alt](url) with an optional italic caption line directly under. Nothing here touches the network.

export const MAX_CONTENT_CHARS = 400_000;
export const IMAGE_HOSTS = ["cdn.ompathstudy.com"];

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Removes anything that could run script or break the page. Markdown stays as it is. */
export function sanitize(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(\]\()\s*javascript:[^)]*\)/gi, "$1#)")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export interface Section { level: number; heading: string; start: number; end: number }

/** Headings outside code fences, with the character range each section covers (heading line to the next heading of the same or higher level). */
export function sections(md: string): Section[] {
  const out: Section[] = [];
  let pos = 0, fence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, heading: m[2].trim(), start: pos, end: md.length });
    pos += line.length + 1;
  }
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) if (out[j].level <= out[i].level) { out[i].end = out[j].start; break; }
  }
  return out;
}

const headKey = (h: string) => h.toLowerCase().replace(/\*\*|__|`/g, "").replace(/^\d+(\.\d+)*[.)]?\s*/, "").replace(/\s+/g, " ").trim();

export function findSection(md: string, heading: string): Section | null {
  const want = headKey(heading);
  const all = sections(md);
  return all.find((s) => headKey(s.heading) === want) ?? all.find((s) => headKey(s.heading).includes(want)) ?? null;
}

export type EditOp =
  | { op: "replace_section"; heading: string; body: string }
  | { op: "append_section"; heading: string; body: string; level?: number }
  | { op: "insert_after_section"; after_heading: string; heading: string; body: string; level?: number }
  | { op: "append_to_section"; heading: string; body: string }
  | { op: "delete_section"; heading: string };

const block = (level: number, heading: string, body: string) => `${"#".repeat(level)} ${heading}\n\n${sanitize(body)}\n`;

/** One partial edit. Throws a plain-language Error when the section is missing or ambiguous. */
export function applyEdit(md: string, e: EditOp): string {
  const text = md.replace(/\r\n/g, "\n");
  switch (e.op) {
    case "append_section":
      return `${text.trimEnd()}\n\n${block(e.level ?? 2, e.heading, e.body)}`;
    case "replace_section": {
      const s = findSection(text, e.heading);
      if (!s) throw new Error(`No section called "${e.heading}". Sections: ${sections(text).map((x) => x.heading).join(" | ")}`);
      const keep = text.slice(s.start, text.indexOf("\n", s.start) < 0 ? s.end : text.indexOf("\n", s.start)); // keep the heading line itself
      return `${text.slice(0, s.start)}${keep}\n\n${sanitize(e.body)}\n\n${text.slice(s.end).trimStart()}`.replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
    }
    case "append_to_section": {
      const s = findSection(text, e.heading);
      if (!s) throw new Error(`No section called "${e.heading}".`);
      return `${text.slice(0, s.end).trimEnd()}\n\n${sanitize(e.body)}\n\n${text.slice(s.end).trimStart()}`.trimEnd() + "\n";
    }
    case "insert_after_section": {
      const s = findSection(text, e.after_heading);
      if (!s) throw new Error(`No section called "${e.after_heading}".`);
      return `${text.slice(0, s.end).trimEnd()}\n\n${block(e.level ?? s.level, e.heading, e.body)}\n${text.slice(s.end).trimStart()}`.trimEnd() + "\n";
    }
    case "delete_section": {
      const s = findSection(text, e.heading);
      if (!s) throw new Error(`No section called "${e.heading}".`);
      return `${text.slice(0, s.start)}${text.slice(s.end)}`.replace(/\n{3,}/g, "\n\n").trim() + "\n";
    }
  }
}

export interface ImageRef { alt: string; url: string; caption: string; line: number }

const IMG = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;

export function listImages(md: string): ImageRef[] {
  const lines = md.split("\n");
  const out: ImageRef[] = [];
  lines.forEach((l, i) => {
    const m = IMG.exec(l.trim());
    if (!m) return;
    const next = (lines[i + 1] ?? "").trim();
    const cap = /^\*(?:Figure[^:]*:\s*)?(.+?)\*$/.exec(next);
    out.push({ alt: m[1], url: m[2], caption: cap ? cap[1] : "", line: i });
  });
  return out;
}

export const imageBlock = (url: string, alt: string, caption?: string) =>
  `![${alt.replace(/[\[\]]/g, "")}](${url})${caption ? `\n*Figure: ${caption.replace(/\*/g, "")}*` : ""}`;

export function isAllowedImageUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === "https:" && IMAGE_HOSTS.includes(x.hostname); } catch { return false; }
}

/** Puts an image block under a section's heading (before its first paragraph) or at its end. */
export function attachImage(md: string, img: { url: string; alt: string; caption?: string }, where: { heading: string; position?: "start" | "end" }): string {
  if (!isAllowedImageUrl(img.url)) throw new Error("Image must be on cdn.ompathstudy.com (upload it with upload_image first).");
  if (!img.alt.trim()) throw new Error("alt text is required.");
  const s = findSection(md, where.heading);
  if (!s) throw new Error(`No section called "${where.heading}". Sections: ${sections(md).map((x) => x.heading).join(" | ")}`);
  const b = imageBlock(img.url, img.alt, img.caption);
  if ((where.position ?? "start") === "end") return `${md.slice(0, s.end).trimEnd()}\n\n${b}\n\n${md.slice(s.end).trimStart()}`.trimEnd() + "\n";
  const nl = md.indexOf("\n", s.start);
  const at = nl < 0 ? md.length : nl + 1;
  return `${md.slice(0, at)}\n${b}\n${md.slice(at)}`.replace(/\n{4,}/g, "\n\n\n");
}

export function removeImage(md: string, url: string): string {
  const lines = md.split("\n");
  const i = lines.findIndex((l) => IMG.exec(l.trim())?.[2] === url);
  if (i < 0) throw new Error("That image is not in the lesson.");
  const cap = /^\*(?:Figure[^:]*:\s*)?.+\*$/.test((lines[i + 1] ?? "").trim());
  lines.splice(i, cap ? 2 : 1);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function replaceImage(md: string, oldUrl: string, next: { url: string; alt?: string; caption?: string }): string {
  if (!isAllowedImageUrl(next.url)) throw new Error("Image must be on cdn.ompathstudy.com.");
  const cur = listImages(md).find((x) => x.url === oldUrl);
  if (!cur) throw new Error("That image is not in the lesson.");
  const lines = md.split("\n");
  const cap = /^\*(?:Figure[^:]*:\s*)?.+\*$/.test((lines[cur.line + 1] ?? "").trim());
  lines.splice(cur.line, cap ? 2 : 1, imageBlock(next.url, next.alt ?? cur.alt, next.caption ?? cur.caption));
  return lines.join("\n");
}

export interface Validation { ok: boolean; errors: string[]; warnings: string[]; stats: { words: number; sections: number; images: number; tables: number } }

export function validateLesson(md: string, opts: { title?: string } = {}): Validation {
  const errors: string[] = [], warnings: string[] = [];
  const text = md.replace(/\r\n/g, "\n");
  if (text.length > MAX_CONTENT_CHARS) errors.push(`Too long (${text.length} characters; limit ${MAX_CONTENT_CHARS}).`);
  if (/<\s*(script|iframe|object|embed|form)\b/i.test(text) || /\son\w+\s*=/i.test(text)) errors.push("Contains HTML that is not allowed (script, iframe, event handlers). Use Markdown.");
  if (/javascript:/i.test(text)) errors.push("Contains a javascript: link.");
  const secs = sections(text);
  if (secs.length < 2) warnings.push("Fewer than two headings; lessons read better in sections.");
  if (!secs.some((s) => s.level === 1) && !opts.title) warnings.push("No title heading.");
  const images = listImages(text);
  for (const im of images) {
    if (!isAllowedImageUrl(im.url)) errors.push(`Image not on the OmpathStudy CDN: ${im.url}`);
    if (!im.alt.trim()) errors.push(`Image without alt text: ${im.url}`);
    if (!im.caption) warnings.push(`Image without caption: ${im.url}`);
  }
  const seen = new Set<string>();
  for (const s of secs) { const k = headKey(s.heading) + "|" + s.level; if (seen.has(k)) warnings.push(`Duplicate heading: ${s.heading}`); seen.add(k); }
  if (/^\s*(Slide \d+|## Slide)/im.test(text)) warnings.push('Contains "Slide N" markers: this looks like a raw slide dump.');
  const tableRows = text.split("\n").filter((l) => /^\s*\|.*\|\s*$/.test(l));
  const sepRows = tableRows.filter((l) => /^\s*\|[\s:|-]+\|\s*$/.test(l)).length;
  if (tableRows.length && !sepRows) errors.push("A table is missing its header separator row (| --- | --- |).");
  if (!/Key points|Quick revision|Summary/i.test(text)) warnings.push("No revision section (Key points / Quick revision / Summary).");
  const words = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).filter(Boolean).length;
  return { ok: errors.length === 0, errors, warnings, stats: { words, sections: secs.length, images: images.length, tables: sepRows } };
}

/** Section-level comparison, so a preview shows what a draft changes without printing both lessons. */
export function diffSections(before: string, after: string) {
  const a = new Map(sections(before).map((s) => [headKey(s.heading) + "|" + s.level, before.slice(s.start, s.end).trim()]));
  const b = new Map(sections(after).map((s) => [headKey(s.heading) + "|" + s.level, after.slice(s.start, s.end).trim()]));
  const added: string[] = [], removed: string[] = [], changed: string[] = [];
  for (const [k, v] of b) { if (!a.has(k)) added.push(k.split("|")[0]); else if (a.get(k) !== v) changed.push(k.split("|")[0]); }
  for (const k of a.keys()) if (!b.has(k)) removed.push(k.split("|")[0]);
  return { added, removed, changed };
}
