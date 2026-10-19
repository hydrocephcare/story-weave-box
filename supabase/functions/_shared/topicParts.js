// A topic page written in two short calls, for the Ompath AI route. Ompath AI replies in its own clinical-reasoning voice and stops at about
// 3,000 characters, so one call cannot carry a whole page: part 1 is the clinical article, part 2 is the questions, warning signs and extras.
// Used by the browser (src/lib/topicWriter.ts) when the topic-ai edge function is not available. Plain JS so tests and the browser share it.
import { kindOf, sanitizePage } from "./topicAi.js";

/** The subjects a topic can be filed under in the A-Z list. */
/** Maps whatever the model wrote ("Reproductive Health & OBGYN") onto one of the subjects the A-Z list uses. */
export function pickSubject(raw, fallbackText = "") {
  const t = String(raw ?? "").trim().toLowerCase();
  const exact = SUBJECTS.find((x) => x.toLowerCase() === t);
  if (exact) return exact;
  const rules = [[/obstet|gynae|gyne|reproduct|pregnan|contracept|maternal/, "Obstetrics & gynaecology"], [/paed|pediat|child|neonat/, "Paediatrics"], [/psych|mental|behavio/, "Psychiatry"], [/surg|trauma|orthop/, "Surgery"], [/public|epidem|communit|preventive/, "Public health"], [/pharm|drug|therap/, "Pharmacology"], [/microb|immun|infect|parasit|virolog|bacteri/, "Microbiology & immunology"], [/patho|oncolog|cancer|haemat|hemat/, "Pathology"], [/anat|embryo|histolog/, "Anatomy"], [/physio/, "Physiology"], [/bioch|genet|molecul|nutrition/, "Biochemistry & genetics"]];
  for (const [re, name] of rules) if (re.test(t)) return name;
  void fallbackText;
  return t ? "Medicine" : undefined;
}
export const SUBJECTS = ["Anatomy", "Physiology", "Biochemistry & genetics", "Pharmacology", "Microbiology & immunology", "Pathology", "Psychiatry", "Paediatrics", "Obstetrics & gynaecology", "Surgery", "Public health", "Medicine"];

const OVERRIDE = "FORMAT OVERRIDE: this is a page-writing job for a public medical website, not a chat answer. Reply with ONLY one JSON object, no other text. Follow the shape exactly. Standard accepted medical knowledge only; leave out anything you are not sure of; never give drug doses or brand names; no web links.";

export function buildPartPrompts({ name, category }) {
  const kind = kindOf(category, name);
  const disease = kind === "disease" || kind === "microbe";
  const p1 = `${OVERRIDE}

Topic: "${name}" (area: ${category || "medicine"}).
MEDICAL RELEVANCE IS REQUIRED, but interpret the learner generously. Handle misspellings, phonetic spellings, incomplete phrases and mixed-up medical terms. If any part of the query clearly identifies a medical topic (for example "jaundice"), do not reject it because another word is misspelled or nonsensical. Infer the closest intended medical topic, give it a correct textbook title, and briefly note the correction where useful. If multiple medical meanings are plausible, choose the closest one and explain the distinction. Reply {"medical": false} only when the query remains clearly unrelated to medicine or health after reasonable typo correction (for example a person, brand, place, sport, entertainment, politics, technology or joke).

Shape: {"medical": true, "subject": "ONE of: Anatomy, Physiology, Biochemistry & genetics, Pharmacology, Microbiology & immunology, Pathology, Psychiatry, Paediatrics, Obstetrics & gynaecology, Surgery, Public health, Medicine", "summary": "2-3 plain sentences, under 60 words", "aka": ["other names or abbreviations"], "sections": [{"h": "heading", "p": "short paragraph", "b": ["short bullet"], "t": [{"a": "test or item", "b": "the question it answers and what the result means"}]}]}

Write 4 to 6 sections that teach the clinical reasoning for ${name}: ${disease
    ? "definition and how it is diagnosed; severity or staging; causes by category, most likely first, including infections and conditions common in the tropics and low-resource settings; how it presents; investigations as a table in \"t\" (test, the question it answers, what the result means). Do NOT cover management or complications here: they are written separately"
    : "what it is and where it is; structure or mechanism; how it works or is regulated; how it is examined or measured; what goes wrong and why it matters clinically; common exam points"}.
Every bullet under 28 words. Plain words a first-year student can follow.`;
  const p3 = `${OVERRIDE}

Topic: "${name}" (area: ${category || "medicine"}).
Shape: {"medical": true, "sections": [{"h": "Red flags and complications", "b": ["what could harm the patient soon, and the signs of it"]}, {"h": "Management", "p": "the plan in one short paragraph", "b": ["each step: treat the cause first, then supportive care; drug classes and medicine names with WHY each is chosen and why alternatives are avoided; when to refer; never doses"]}, {"h": "Follow-up and prevention", "b": ["monitoring, screening of contacts, secondary prevention"]}]}
Every bullet under 28 words. Plain words a first-year student can follow.`;
  const p2 = `${OVERRIDE}

Topic: "${name}" (area: ${category || "medicine"}).
Shape: {"medical": true, "whenToSeekHelp": ["3-6 warning signs that mean a person should see a doctor or go to hospital urgently (empty list if this is not a condition)"], "faq": [{"q": "a question a student asks", "a": "a short correct answer"}], "exam": ["3 questions an examiner may ask about ${name}"], "related": ["6 closely related topic names"], "sections": [{"h": "Often confused with", "b": ["look-alike conditions or structures and how to tell them apart"]}, {"h": "Where results can mislead", "b": ["lab values, signs or tests that can be falsely normal or abnormal"]}]}
3 faq items. Every bullet under 28 words.`;
  // management only makes sense for a condition; other topics are written in two calls
  return disease ? [p1, p3, p2] : [p1, p2];
}

/** Pulls the JSON object out of a model reply, or returns null. */
export function parseJsonReply(text) {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const plain = (s) => String(s ?? "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();

/**
 * The assistant sometimes answers in its own shape (a "content" text with "## headings") instead of the one asked for. This turns that into
 * {summary, sections} so the page is not lost; replies already in the right shape pass through untouched.
 */
export function normalizeReply(r) {
  if (!r || typeof r !== "object") return r;
  const out = { ...r };
  if (Array.isArray(out.sections)) out.sections = out.sections.map((s) => (s && typeof s === "object" ? { ...s, h: s.h ?? s.heading ?? s.title ?? s.name, p: s.p ?? (typeof s.content === "string" ? s.content : s.text), b: s.b ?? s.bullets ?? s.points } : s));
  if (!Array.isArray(out.sections) && typeof out.content === "string") {
    const parts = out.content.split(/^#{1,4}\s+(.+)$/m);
    const sections = [];
    for (let i = 1; i < parts.length; i += 2) {
      const lines = parts[i + 1].split("\n").map((l) => l.trim()).filter(Boolean);
      const b = lines.filter((l) => /^[*\-•]\s+/.test(l) || /^\d+[.)]\s+/.test(l)).map((l) => plain(l.replace(/^([*\-•]|\d+[.)])\s+/, "")));
      const p = plain(lines.filter((l) => !/^[*\-•]\s+/.test(l) && !/^\d+[.)]\s+/.test(l)).join(" "));
      if (p || b.length) sections.push({ h: plain(parts[i]), ...(p ? { p } : {}), ...(b.length ? { b } : {}) });
    }
    if (sections.length) out.sections = sections;
  }
  if (!out.summary && Array.isArray(out.sections)) {
    const first = out.sections.find((s) => s?.p && String(s.p).length > 50)?.p ?? "";
    const sents = plain(first).match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
    let sum = "";
    for (const s of sents.slice(0, 3)) { if (sum && (sum + s).length > 300) break; sum += s; }
    if (sum.length >= 40) out.summary = sum.trim();
  }
  return out;
}

/**
 * Joins the parts and checks the result. parts[0] is the clinical article; the others are optional: a page with only the first part is
 * still published. The last part carries the warning signs, questions and related topics; any part may add sections.
 */
export function mergeParts(parts, { name, category, model }) {
  const [a0, ...rest0] = parts;
  const a = normalizeReply(a0);
  const rest = rest0.map(normalizeReply);
  if (a?.medical === false) return { medical: false };
  const good = rest.filter((p) => p && p.medical !== false);
  const second = Object.assign({}, ...good);
  const page = sanitizePage({
    medical: true,
    summary: a?.summary,
    aka: a?.aka,
    sections: [...(Array.isArray(a?.sections) ? a.sections : []), ...good.flatMap((p) => (Array.isArray(p.sections) ? p.sections : []))],
    whenToSeekHelp: second.whenToSeekHelp,
    faq: second.faq,
    exam: second.exam,
    related: second.related,
  });
  const subject = pickSubject(a?.subject, `${name} ${category}`);
  return page.medical ? { ...page, ...(subject ? { subject } : {}), kind: kindOf(category, name), model, generatedAt: new Date().toISOString().slice(0, 10) } : page;
}
