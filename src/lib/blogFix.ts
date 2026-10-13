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
