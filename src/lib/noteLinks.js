// Links between study notes and the pharmacology section. Plain JavaScript so the app, the build-time
// prerender and the index generator all produce the same result.
//
//   linkDrugs(html, drugs)  wraps the first mention of each drug in every section of a note in a link to its drug card.
//   drugs is the list in src/data/drugIndex.json: [{ id, name, terms: ["salbutamol", ...] }].

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words in a drug's display name that a note might use: "Salbutamol (albuterol)" gives salbutamol and albuterol. */
export function drugTerms(id, name) {
  const parts = String(name).split(/[\/()+,]| and /i).map((t) => t.trim()).filter(Boolean);
  const terms = parts.filter((t) => t.length >= 5 && !/^(oxygen|silver|tetanus|fluids|saline)$/i.test(t));
  if (/^[a-z-]{5,}$/.test(id) && !terms.some((t) => t.toLowerCase() === id)) terms.push(id);
  return [...new Set(terms.map((t) => t.toLowerCase()))].filter((t) => !/^(oxygen|silver|tetanus|fluids|dextrose|saline|iv-fluids|intravenous crystalloids)$/.test(t));
}

export const drugHref = (id) => `/pharmacology/drug/${id}?card=1`;

/**
 * Link the first mention of each drug per section (an h2 starts a new section). Text inside headings, existing links,
 * table headers and code is left alone, and so is the "Practice questions" section, which should not give answers away.
 * Returns { html, ids } where ids lists the drugs that were linked, in order of first appearance.
 */
export function linkDrugs(html, drugs) {
  if (!drugs?.length) return { html, ids: [] };
  const entries = [];
  for (const d of drugs) for (const t of d.terms) entries.push({ id: d.id, term: t, re: new RegExp(`(^|[^A-Za-z0-9-])(${escRe(t)})(?![A-Za-z0-9-])`, "i") });
  entries.sort((a, b) => b.term.length - a.term.length);

  const ids = [];
  let used = new Set();
  let skipSection = false;
  let anchorDepth = 0, headDepth = 0, thDepth = 0, codeDepth = 0;

  const out = html.split(/(<[^>]+>)/).map((seg) => {
    if (seg.startsWith("<")) {
      const m = seg.match(/^<(\/?)([a-z0-9]+)/i);
      if (!m) return seg;
      const close = m[1] === "/";
      const tag = m[2].toLowerCase();
      if (tag === "a") anchorDepth += close ? -1 : 1;
      else if (/^h[1-6]$/.test(tag)) { headDepth += close ? -1 : 1; if (tag === "h2" && !close) { used = new Set(); skipSection = false; } }
      else if (tag === "th") thDepth += close ? -1 : 1;
      else if (tag === "code") codeDepth += close ? -1 : 1;
      return seg;
    }
    if (headDepth > 0) { if (/practice questions/i.test(seg)) skipSection = true; return seg; }
    if (anchorDepth > 0 || thDepth > 0 || codeDepth > 0 || skipSection || !seg.trim()) return seg;
    // choose non-overlapping matches on the untouched text, longest names first, then build the result in order
    const chosen = [];
    for (const e of entries) {
      if (used.has(e.id)) continue;
      const m = seg.match(e.re);
      if (!m) continue;
      const at = m.index + m[1].length;
      const end = at + m[2].length;
      if (chosen.some((c) => at < c.end && end > c.at)) continue;
      chosen.push({ id: e.id, at, end });
      used.add(e.id);
      if (!ids.includes(e.id)) ids.push(e.id);
    }
    if (!chosen.length) return seg;
    chosen.sort((x, y) => x.at - y.at);
    let res = "", pos = 0;
    for (const c of chosen) { res += seg.slice(pos, c.at) + `<a class="note-link" href="${drugHref(c.id)}" data-drug="${c.id}">${seg.slice(c.at, c.end)}</a>`; pos = c.end; }
    return res + seg.slice(pos);
  }).join("");
  return { html: out, ids };
}
