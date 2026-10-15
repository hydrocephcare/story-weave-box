// Deepens the short Internal Medicine notes: asks only for the sections a note does not have yet (anatomy, pathophysiology, differential, investigations,
// complications, a clinical case, tricky examiner questions) and slots them in, never touching what is already written.
//   node scripts/imed/extend-notes.mjs [slug ...]     (no slug: every Internal Medicine note under 14 KB that is not a question bank or the roadmap)
import fs from "node:fs";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const fromFile = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GROQ_API_KEYS: [process.env.GROQ_API_KEYS, fromFile(".groq-keys.local")].filter(Boolean).join(","), GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, fromFile(".gemini-keys.local")].filter(Boolean).join(",") };
const registry = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));

const WANT = [
  { key: "anatomy", test: /anatom|physiolog/i, group: "A", ask: "## Anatomy and physiology you need\nOnly the anatomy and physiology that explains this condition, with the clinical reason each point matters." },
  { key: "patho", test: /patho(physiolog|genesis)|mechanism/i, group: "A", ask: "## Pathophysiology\nShort causal steps with arrows, from cause to symptoms and signs." },
  { key: "ddx", test: /differential/i, group: "A", ask: "## Differential diagnosis and how to tell them apart\nA compact table: condition, what points to it, what separates it from this one." },
  { key: "ix", test: /investigat/i, group: "A", ask: "## Investigations: what each test answers\nA compact table: test, the question it answers, what a result means." },
  { key: "comp", test: /complication|prognosis/i, group: "B", ask: "## Complications and prognosis" },
  { key: "case", test: /clinical case|case\b/i, group: "B", ask: "## Clinical case\nA short case (age, presentation, key findings), then 3 questions with model answers." },
  { key: "tricky", test: /tricky|examiner/i, group: "B", ask: "## Tricky questions examiners ask\nSix short scenario questions (a patient lying in bed with these findings: what next, what separates two conditions, why is a choice avoided). Write each as \"**Q1.** question\" followed by \"**Answer:** the answer and the reason\". No lettered options." },
];
const RULES = `Rules: standard accepted medical knowledge only; if unsure, leave it out. Never give drug doses (write no amount in mg, mcg or µg), never invent statistics, references or guideline numbers. Use medical terms a clinical-year student is expected to know. Tables must be compact: single spaces, separator row exactly |---|---|---|, at most 7 rows. Do not repeat anything the note already says. Do not add a "related topics" section.`;
const DOSE = /\b\d+(?:[.,]\d+)?(?:\s?[-–]\s?\d+(?:[.,]\d+)?)?\s?(?:mg|mcg|µg|ug)(?:\s?\/\s?(?:kg|day|dose|h|hr|hour|24\s?h))*\b(?!\s?\/\s?(?:d?l|ml|mmol|mol|g\b|l\b))/gi;
const clean = (t) => String(t).replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
const squeeze = (md) => md.split("\n").map((l) => (l.trim().startsWith("|") ? l.replace(/[ \t]{2,}/g, " ").replace(/-{4,}/g, "---") : l)).join("\n");
const shortRuns = (t) => t.split("\n").reduce((a, l) => { if (l.trim().startsWith("|")) a[a.length - 1] = (a[a.length - 1] ?? 0) + 1; else if (a[a.length - 1] !== 0) a.push(0); return a; }, [0]).filter((n) => n > 0 && n < 3).length;

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : registry.filter((n) => n.unit === "Internal Medicine" && !n.paper && !/question-bank|roadmap/.test(n.slug) && fs.statSync(n.file).size < 14000).map((n) => n.slug);
let failures = 0;
for (const slug of slugs) {
  const n = registry.find((x) => x.slug === slug); if (!n) { console.log("unknown:", slug); continue; }
  let md = fs.readFileSync(n.file, "utf8").replace(/\r\n/g, "\n");
  const heads = (md.match(/^##\s+.*/gm) ?? []).join(" | ");
  const missing = WANT.filter((w) => !w.test.test(heads));
  if (!missing.length) { console.log("complete already:", slug); continue; }
  const added = { A: "", B: "" };
  for (const g of ["A", "B"]) {
    const part = missing.filter((m) => m.group === g);
    if (!part.length) continue;
    const prompt = `You are deepening a Year 4 MBChB internal medicine study note (Kenya, clinical rotations) titled "${n.title}". Below is the existing note. Write ONLY the following new sections, in markdown, then stop. They must add depth the note lacks: medical terminology, mechanisms, how an examiner thinks.\n\n${part.map((p) => p.ask).join("\n")}\n\n${RULES} About ${part.length * 220} words.\n\nEXISTING NOTE (for context, do not repeat it):\n${md.slice(0, 6500)}`;
    let text = "";
    for (let attempt = 0; attempt < 2 && !text; attempt++) {
      try {
        const r = await askModel(prompt, { env, plain: true, timeoutMs: 90000, maxTokens: 4500 });
        const t = squeeze(clean(r.text)).replace(DOSE, "the protocol dose");
        const have = part.every((p) => new RegExp(`^##\\s+${p.ask.split("\n")[0].replace(/^##\s+/, "").slice(0, 5)}`, "im").test(t));
        if (have && !shortRuns(t) && t.length > 400 * part.length / 2) text = t;
      } catch (e) { console.log("  error:", String(e.message).slice(0, 80)); break; }
    }
    if (!text) { console.log("  skipped group", g, "of", slug); failures++; continue; }
    added[g] = text;
  }
  if (!added.A && !added.B) { if (failures >= 4) { console.log("several failures in a row, stopping"); break; } continue; }
  failures = 0;
  // each new section goes where a clinician expects it: anatomy and pathophysiology after the definition, the differential before the investigations,
  // the rest (complications, case, tricky questions) before the practice questions / pharmacology card
  const pieces = [added.A, added.B].filter(Boolean).join("\n\n").split(/\n(?=## )/).map((p) => p.trim()).filter(Boolean);
  const first = (p) => p.split("\n")[0];
  pieces.sort((a, b) => Number(/patho/i.test(first(b))) - Number(/patho/i.test(first(a)))); // pathophysiology goes in first so it ends up after the anatomy
  const find = (re) => { const m = md.search(re); return m; };
  const put = (section, index) => { md = `${md.slice(0, index).trimEnd()}\n\n${section}\n\n${md.slice(index)}`; };
  for (const sec of pieces) {
    const title = sec.split("\n")[0];
    if (/anatom|physiolog|patho(physiolog|genesis)/i.test(title)) {
      const second = [...md.matchAll(/^## /gm)][1]?.index; // the heading after the first section (the definition)
      if (second != null) { put(sec, second); continue; }
    }
    if (/differential/i.test(title)) { const i = find(/^## [^\n]*investigat/im); if (i >= 0) { put(sec, i); continue; } }
    if (/investigat/i.test(title)) { const i = find(/^## [^\n]*(management|treatment)/im); if (i >= 0) { put(sec, i); continue; } }
    const end = find(/^## (practice questions|pharmacology)/im);
    if (end >= 0) put(sec, end); else md = `${md.trimEnd()}\n\n${sec}\n`;
  }
  const block = pieces.join("\n\n");
  fs.writeFileSync(n.file, md);
  console.log("extended:", slug, `+${block.length} chars (${missing.map((m) => m.key).join(", ")})`);
}
