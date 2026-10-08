// Pharmacology questions answered from the site's own drug library, so they cost no AI credit:
//   "side effects of furosemide", "dose of ceftriaxone", "first-line for hypertension", "what class is metformin".
// If the drug or condition is not in the library this returns null and the normal search + AI path takes over.
import { ALL_PDRUGS, pdrugById } from "@/pharm";
import { CONDITIONS } from "@/pharm/conditions";
import drugIndex from "@/data/drugIndex.json";
import type { Condition, PDrug } from "@/pharm/types";

export interface PharmReply {
  answer: string;
  links: { label: string; href: string }[];
  followUps: string[];
  /** What to search the site for, to show the notes and files that go with the answer. */
  topic: string;
  drugId?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, term: string) => new RegExp(`(^| )${escape(term)}( |$)`).test(text);

// every name a drug can be called, longest first so "enoxaparin" wins over "heparin"
const TERMS: { id: string; term: string }[] = (() => {
  const out = new Map<string, string>();
  for (const d of drugIndex as { id: string; name: string; terms: string[] }[]) for (const t of d.terms) if (norm(t).length >= 4) out.set(norm(t), d.id);
  for (const d of ALL_PDRUGS) for (const part of d.name.split(/\s*[/+,()]\s*/)) { const t = norm(part); if (t.length >= 4 && !out.has(t) && !/^(iv|oral|and|with)$/.test(t)) out.set(t, d.id); }
  return [...out.entries()].map(([term, id]) => ({ id, term })).sort((a, b) => b.term.length - a.term.length);
})();

export function findDrug(text: string): PDrug | null {
  const s = norm(text);
  for (const t of TERMS) if (hasWord(s, t.term)) return pdrugById(t.id) ?? null;
  return null;
}

const aliasesOf = (c: Condition) => [...new Set([norm(c.name), norm(c.name.split(/ and |, | \(/)[0]), ...(c.id.length > 5 ? [norm(c.id)] : [])])].filter((a) => a.length >= 4);
export function findCondition(text: string): Condition | null {
  const s = norm(text);
  let best: { c: Condition; len: number } | null = null;
  for (const c of CONDITIONS) for (const a of aliasesOf(c)) if (hasWord(s, a) && (!best || a.length > best.len)) best = { c, len: a.length };
  return best?.c ?? null;
}

const TREAT = /\b(first line|firstline|treat|treatment|treating|manage|management|drug|drugs|medication|medicine|medicines|give|regimen|therapy|prescribe|what do i|antibiotic|antibiotics)\b/;
const WANTS_FILES = /\b(notes?|papers?|past papers?|pdf|slides?|files?|cats?|exams?|osce|case)\b/;

type Part = "why" | "mech" | "ae" | "caution" | "dose" | "special" | "class";
const PARTS: [Part, RegExp][] = [
  ["dose", /\b(dose|doses|dosing|dosage|how much|mg kg|regimen)\b/],
  ["ae", /\b(side effects?|adverse|toxicity|toxic|complications of|reactions?)\b/],
  ["mech", /\b(mechanism|moa|how does .{1,30} work|action of|mode of action)\b/],
  ["caution", /\b(contraindicat\w*|avoid|caution|precautions?|when not|should not)\b/],
  ["special", /\b(pregnan\w*|renal|kidney|children|child|paediatric|pediatric|elderly|breastfeed\w*|lactation|liver)\b/],
  ["class", /\b(class|classification|type of drug|what kind of drug|what type of drug)\b/],
  ["why", /\b(uses?|used for|indications?|indicated|what is .{1,30} for|why)\b/],
];

const bullets = (items: string[]) => items.map((x) => `- ${x}`).join("\n");

function drugAnswer(d: PDrug, s: string): PharmReply {
  const asked = PARTS.filter(([, re]) => re.test(s)).map(([p]) => p);
  const section: Record<Part, string> = {
    class: `**Class:** ${d.cls}`,
    why: `**Used for:** ${d.why}`,
    mech: `**How it works:** ${d.mech}`,
    ae: `**Adverse effects:**\n${bullets(d.ae)}`,
    caution: `**Avoid or take care when:** ${d.caution}`,
    dose: `**Typical dose:** ${d.dose}`,
    special: `**Kidney, pregnancy and children:** ${d.special}`,
  };
  const order: Part[] = asked.length ? [...asked, ...(asked.includes("why") ? [] : (["why"] as Part[]))] : ["class", "why", "mech", "ae", "caution", "dose", "special"];
  const body = order.map((p) => section[p]).join("\n\n");
  const short = d.name.split(/\s*[/+(]/)[0].trim();
  return {
    answer: `### ${d.name}\n${body}\n\n_From the Ompath pharmacology library, so it used no credits. Doses are teaching doses: check the national guideline and your hospital formulary._`,
    links: [{ label: `Full ${short} card`, href: `/pharmacology/drug/${d.id}?card=1` }, { label: `Test me on ${short}`, href: `/pharmacology/drug/${d.id}` }],
    followUps: asked.length ? [`Everything about ${short}`, `Quiz me on ${short}`] : [`Quiz me on ${short}`, `Side effects of ${short}`, `Dose of ${short}`],
    topic: short, drugId: d.id,
  };
}

function conditionAnswer(c: Condition): PharmReply {
  const parts = [`### ${c.name}`, `**First line**\n${bullets(c.first)}`];
  if (c.alt.length) parts.push(`**Next steps and alternatives**\n${bullets(c.alt)}`);
  if (c.avoid.length) parts.push(`**Avoid**\n${bullets(c.avoid)}`);
  if (c.monitor) parts.push(`**Monitor:** ${c.monitor}`);
  if (c.pearl) parts.push(`**Remember:** ${c.pearl}`);
  parts.push("_From the Ompath pharmacology library, so it used no credits. The national guideline and your hospital formulary come first._");
  const topic = c.name.split(/ and |, | \(/)[0];
  return { answer: parts.join("\n\n"), links: [{ label: "All conditions", href: "/pharmacology?tab=conditions" }, { label: "Drug practice", href: "/pharmacology?tab=practice&drill=mixed" }], followUps: [`Quiz me on ${topic.toLowerCase()}`, `Notes on ${topic.toLowerCase()}`], topic };
}

/** A pharmacology question the library can answer, or null (not pharmacology, or the drug is not on the site). */
export function pharmReply(input: string): PharmReply | null {
  const s = norm(input);
  if (s.length < 4 || input.length > 180) return null;
  if (/\b(quiz|mcqs?|multiple choice|test me|essay|saq|remind|plan)\b/.test(s)) return null; // those are handled by the practice tools
  const hasPart = PARTS.some(([, re]) => re.test(s));
  const drug = findDrug(s);
  if (drug) {
    if (WANTS_FILES.test(s) && !hasPart) return null; // "notes on lithium" is a search
    if (hasPart || TREAT.test(s) || s.split(" ").length <= 3 || /\bpharmacology\b/.test(s)) return drugAnswer(drug, s);
    return null;
  }
  const cond = findCondition(s);
  if (cond && TREAT.test(s) && !(WANTS_FILES.test(s) && !/\bfirst line|drugs?|treat/.test(s))) return conditionAnswer(cond);
  return null;
}
