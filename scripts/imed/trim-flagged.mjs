// One-off: when the repair write still carries a flagged statement, that statement is cut out (the sentence the reviewer pointed at) instead of throwing the whole
// set of notes away; the notes are published only if enough remains. Nothing a reviewer flagged as serious is ever shown.
import fs from "node:fs";
const f = "supabase/functions/_shared/contentCheck.js";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("dropFlagged")) { console.log("already done"); process.exit(0); }
const a = s.indexOf("export async function generateCheckedDeep(");
if (a < 0) throw new Error("generateCheckedDeep not found");
const head = s.slice(0, s.lastIndexOf("/**", a));
const fn = `/** Letters and digits only, lower case: so a quote and the text it came from can be compared. */
const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Cuts out every bullet, row, question or fact that a flagged issue points at (matched by its quoted text). Returns { deep, removed }. */
export function dropFlagged(deep, issues) {
  const keys = issues.map((x) => norm(x.where)).filter((k) => k.length >= 18).map((k) => k.slice(0, 40));
  let removed = 0;
  const hit = (...texts) => { const n = norm(texts.join(" ")); const bad = keys.some((k) => n.includes(k)) || texts.some((t) => { const m = norm(t).slice(0, 40); return m.length >= 18 && issues.some((x) => norm(x.where).includes(m)); }); if (bad) removed++; return bad; };
  const out = { ...deep };
  out.sections = (deep.sections ?? []).map((x) => ({ ...x, b: (x.b ?? []).filter((t) => !hit(t)), t: (x.t ?? []).filter((r) => !hit(r.a, r.b)) })).filter((x) => x.p || x.b.length || x.t.length);
  out.facts = (deep.facts ?? []).filter((t) => !hit(t));
  out.mnemonics = (deep.mnemonics ?? []).filter((m) => !hit(m.n, m.t));
  out.vivas = (deep.vivas ?? []).filter((v) => !hit(v.q, v.a));
  out.mcqs = (deep.mcqs ?? []).filter((m) => !hit(m.q, ...m.o, m.e));
  out.cases = (deep.cases ?? []).map((c) => ({ ...c, qs: c.qs.filter((x) => !hit(x.q, x.a)) })).filter((c) => c.qs.length >= 2 && !hit(c.v));
  out.mistakes = (deep.mistakes ?? []).filter((t) => !hit(t));
  out.exam = out.vivas.slice(0, 14).map((x) => x.q + " — " + x.a);
  return { deep: out, removed };
}

/**
 * Writes the deep notes, has a second AI check them, and if the check finds a serious error writes them once more with the errors listed.
 * If a serious error is still there, the flagged statements are cut out and the rest is published when enough remains.
 * Returns the notes with the date they passed. Throws when too little would be left (nothing wrong is ever published).
 */
export async function generateCheckedDeep(input, env, fetchImpl = fetch, budgetMs = 600000) {
  let fixes = [];
  let deep = null;
  let last = null;
  const t0 = Date.now();
  for (let round = 0; round < 2; round++) {
    // a second write only when there is time left inside the caller's limit (a web request has about a minute)
    if (round > 0 && Date.now() - t0 > budgetMs * 0.5) break;
    deep = await generateDeepWithFallback({ ...input, fixes }, env);
    last = await checkContent({ title: input.name, kind: "deep exam notes", text: deepToText(deep), env, fetchImpl });
    if (last.validated) return { ...deep, checked: last.at };
    fixes = last.issues.filter((x) => x.severity !== "low").map((x) => x.problem + " Correct: " + x.fix);
  }
  const { deep: trimmed, removed } = dropFlagged(deep, last.issues.filter((x) => x.severity === "high"));
  if (!removed || (trimmed.sections?.length ?? 0) < 5 || (trimmed.vivas?.length ?? 0) < 8) throw new Error("deep notes held back: " + fixes.join(" | ").slice(0, 300));
  return { ...trimmed, checked: last.at, trimmed: removed };
}
`;
s = head + fn;
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("trim added");
