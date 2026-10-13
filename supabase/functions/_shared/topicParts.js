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
MEDICAL RELEVANCE IS REQUIRED. Only write about a real topic in human medicine or health: a disease or condition, symptom, sign, test, drug or drug class, procedure, anatomical structure, physiological or biochemical process, microorganism, or a public-health or reproductive-health topic (family planning, antenatal care, vaccination and similar are medical). For anything else (a person, brand, place, sport, entertainment, politics, technology, a joke, or a word with no clinical meaning) reply exactly {"medical": false} and nothing else.

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

/**
 * Joins the parts and checks the result. parts[0] is the clinical article; the others are optional: a page with only the first part is
 * still published. The last part carries the warning signs, questions and related topics; any part may add sections.
 */
export function mergeParts(parts, { name, category, model }) {
  const [a, ...rest] = parts;
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
