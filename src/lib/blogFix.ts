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

/** A line that is a piece of a shredded diagram: very short, no real word in it, and either tiny or holding bond-like dashes. */
export const shredded = (t: string) => t.length > 0 && t.length <= 9 && !/[A-Za-z]{4,}/.test(t) && !/^(\d+[.)]?|[A-E][.)]?|[-*|>#]+|\(?[ivx]+\)?)$/i.test(t) && (t.length <= 4 || /[—–=|]/.test(t));

/** An exam typed from a scan whose typing is broken: marks and sections are there, but so are page markers or diagrams shredded into runs of tiny lines. */
export function examDamaged(content: string): boolean {
  const marks = (content.match(/\(\s*\d+\s*marks?\s*\)|\d+\s*marks?\b/gi) ?? []).length;
  const exam = marks >= 4 && /section\s+[a-d]\b|attempt\s+(any|all)|answer\s+(any|all)|time\s*[:\-]|date\s*[:\-]/i.test(content);
  if (!exam) return false;
  if (/^.{0,12}Page\s+\d+\s+of\s+\d+/im.test(content)) return true;
  let run = 0;
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (shredded(t)) { run++; if (run === 3) return true; } else if (t) run = 0;
  }
  return false;
}

/** True when the stored text is only reading noise or a stub, or is a damaged typing of a scanned exam, so the scanned pages are the real paper. */
export function looksScanned(a: { content: string }): boolean {
  const plain = a.content.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // a stub ("The original paper scans are available…", "Awaiting manual transcription") has nothing to read, only the scans
  const stub = plain.length < 260 && /original (paper )?scans|awaiting manual transcription|transcription is being generated/i.test(plain);
  return stub || /Visual Scan Archive/i.test(a.content) || (a.content.match(/Scanned by Cam\s?Scanner/gi) ?? []).length >= 3 || examDamaged(a.content);
}

/** The typed text of a damaged exam with only the certain debris removed: page markers and runs of one-to-four-character lines (a shredded diagram). */
export function lightClean(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let run: string[] = [];
  const tiny = shredded;
  const flush = () => { if (run.length < 3) out.push(...run); run = []; };
  for (const raw of lines) {
    const t = raw.trim();
    if (/^.{0,12}Page\s+\d+\s+of\s+\d+/i.test(t)) { flush(); continue; }
    if (tiny(t)) { run.push(raw); continue; }
    if (t === "" && run.length) { run.push(raw); continue; }
    flush(); out.push(raw);
  }
  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A paper that was scanned: the typed text is damaged or only noise ("Scanned by CamScanner", broken lines), while the pictures of the pages are
 * the real paper. A noise-only page shows just the pictures, in order. A damaged but readable exam shows the pictures first and its typed text
 * below, labelled as read from the scan, with only the certain debris removed. The stored text is never changed.
 * The page pictures live in `original_notes`, which the article page does not download with the rest, so the caller fetches them when needed.
 */
export function scanFirst<T extends { title?: string | null; content: string; original_notes?: string | null }>(a: T): T {
  if (!looksScanned(a)) return a;
  const pages = String(a.original_notes ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^!\[[^\]]*\]\([^\s)]+\)$/.test(l));
  if (!pages.length) return a;
  const heading = (a.title ?? "Past paper").replace(/\s+—\s+Past Paper Questions & Answers$/i, "").trim();
  const intro = `This paper is shown as the original scanned pages (${pages.length}), in order. Tap a page to enlarge it.`;
  if (examDamaged(a.content) && !/Visual Scan Archive/i.test(a.content)) {
    const typed = lightClean(a.content);
    return { ...a, content: [`## ${heading}`, intro, ...pages, "## Typed version", "*Read from the scan by a program, so it may contain mistakes. The pages above are the paper itself.*", typed].join("\n\n") };
  }
  return { ...a, content: [`## ${heading}`, intro, ...pages].join("\n\n") };
}
