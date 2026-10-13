// Pure helpers for the blog polish: what kind of page is it, what may be changed, and is the polished text still true to the original.
// No network here, so it can be tested.

export const plain = (c) => String(c ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export const picturesIn = (c) => (String(c ?? "").match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
export const yearOf = (category) => Number(String(category ?? "").match(/^Year\s*(\d)/i)?.[1] ?? 0);

/** A question bank or paper, judged by what is inside it and not by its title. */
export function isBank(content) {
  const c = String(content ?? "");
  const qs = (c.match(/^(?:#{1,4}\s*)?\**(?:Question|Q)\s*\d+/gim) ?? []).length;
  const answers = (c.match(/^\**Answers?\**\s*[:.]/gim) ?? []).length;
  const options = (c.match(/^\s*[-*]?\s*\(?[A-E][.)]\s+\S/gm) ?? []).length;
  return qs >= 5 || answers >= 8 || options >= 24;
}

/** The stored text is only reading noise or a stub: the scanned pages are the paper, so the text must not be polished. */
export function isScanOnly(content) {
  const p = plain(content);
  const stub = p.length < 260 && /original (paper )?scans|awaiting manual transcription|transcription is being generated/i.test(p);
  return stub || /Visual Scan Archive/i.test(content) || (String(content).match(/Scanned by Cam\s?Scanner/gi) ?? []).length >= 3;
}

/** A bank whose questions are not yet in the form the site understands (Question N, options A. B. C., "Answer: X", "Explanation:"). */
export function needsMcqFormat(content) {
  const c = String(content ?? "");
  const qs = (c.match(/^(?:#{1,4}\s*)?\**Question\s*\d+/gim) ?? []).length;
  if (qs < 5) return false;
  const options = (c.match(/^\s*[-*]?\s*\(?[A-E][.)]\s+\S/gm) ?? []).length;
  if (options < qs * 2) return false; // essay or short-answer paper: nothing to put in option form
  const answers = (c.match(/^\**Answer\**\s*:\s*\**\s*\(?[A-E]\b/gim) ?? []).length;
  return answers < qs * 0.8;
}

/** The polished text must still say what the original said: numbers and long words kept, pictures kept, a sensible length, real headings. */
export function soundPolish(original, out, { headings = true } = {}) {
  const nums = [...new Set((plain(original).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.length >= 2))];
  const keptNums = nums.filter((n) => out.includes(n)).length;
  if (nums.length >= 5 && keptNums / nums.length < 0.9) return `numbers lost (${keptNums}/${nums.length})`;
  const words = [...new Set(plain(original).toLowerCase().match(/[a-z]{7,}/g) ?? [])];
  const o = out.toLowerCase();
  const kept = words.filter((w) => o.includes(w)).length;
  if (words.length >= 20 && kept / words.length < 0.8) return `words lost (${kept}/${words.length})`;
  const ratio = plain(out).length / Math.max(1, plain(original).length);
  if (ratio < 0.6 || ratio > 1.4) return `length changed (${ratio.toFixed(2)})`;
  if (headings && (out.match(/^##\s/gm) ?? []).length < 2) return "no headings";
  const pics = picturesIn(original);
  if (pics && picturesIn(out) < pics) return "pictures lost";
  return "";
}

/** A short, clean title and a description for search results (about 155 characters), both safe to show. */
export function cleanMeta(title, description) {
  const t = String(title ?? "").replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim().slice(0, 90);
  let d = String(description ?? "").replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (d.length > 160) d = d.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return { title: t.length >= 8 ? t : "", description: d.length >= 40 ? d : "" };
}

export function parseJson(text) {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export const VERDICTS = ["keep", "review", "irrelevant"];
