// A blog whose text has been tidied (headings, short paragraphs, lists: scripts/blogs/restructure.mjs) is shown from /blog-fixes/<id>.md in place of the
// stored text. The stored text is never changed, so deleting the file puts the original back. Missing, slow or odd: the original is shown.
let index: Promise<Record<string, string>> | null = null;
const loadIndex = () => (index ??= fetch("/blog-fixes/index.json").then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : {})).catch(() => ({})));

export async function tidiedText(id: string): Promise<string | null> {
  try {
    const idx = await loadIndex();
    if (!idx[id]) return null;
    const r = await fetch(`/blog-fixes/${id}.md`);
    if (!r.ok || (r.headers.get("content-type") || "").includes("html")) return null;
    const t = await r.text();
    return t.trim().length > 300 ? t : null;
  } catch { return null; }
}

/**
 * A paper that was only scanned: the stored text is noise from reading the pictures ("Scanned by CamScanner", broken lines). The pictures of the
 * pages are the real paper, so those are shown instead, in order, and the noise is left out of the page. The stored text is never changed.
 */
export function scanFirst<T extends { title?: string | null; content: string; original_notes?: string | null }>(a: T): T {
  const noisy = /Visual Scan Archive/i.test(a.content) || (a.content.match(/Scanned by Cam\s?Scanner/gi) ?? []).length >= 3;
  if (!noisy) return a;
  const pages = String(a.original_notes ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^!\[[^\]]*\]\([^\s)]+\)$/.test(l));
  if (!pages.length) return a;
  const heading = (a.title ?? "Past paper").replace(/\s+—\s+Past Paper Questions & Answers$/i, "").trim();
  const intro = `This paper is shown as the original scanned pages (${pages.length}), in order. Tap a page to enlarge it.`;
  return { ...a, content: [`## ${heading}`, intro, ...pages].join("\n\n") };
}
