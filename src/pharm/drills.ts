// Pharmacology practice: questions generated from the drug, condition and reference data, so every question is checked against the same source as the cards.
import { mcq, o } from "@/clinical/templates";
import type { MCQ } from "@/clinical/types";
import { ALL_PDRUGS, pdrugById } from "./index";
import { CONDITIONS } from "./conditions";
import { AE_LINKS, INTERACTIONS, PREGNANCY_AVOID, SUFFIXES } from "./reference";

export type DrillKind = "ae" | "class" | "toxicity" | "condition" | "avoid" | "interaction" | "suffix" | "pregnancy" | "mixed";

export const DRILLS: { id: DrillKind; label: string; blurb: string }[] = [
  { id: "mixed", label: "Mixed round", blurb: "A bit of everything — the best daily practice." },
  { id: "ae", label: "Adverse effect → drug", blurb: "“Which drug causes gum overgrowth?” The questions examiners love." },
  { id: "toxicity", label: "Cancer-drug toxicities", blurb: "Doxorubicin and the heart, bleomycin and the lung, vincristine and the nerves." },
  { id: "condition", label: "Condition → first-line drug", blurb: "What do I prescribe for this patient?" },
  { id: "avoid", label: "What to avoid", blurb: "The drug that would harm the patient in front of you." },
  { id: "class", label: "Drug → class", blurb: "Name the class, and the mechanism follows." },
  { id: "interaction", label: "Interactions", blurb: "Rifampicin, warfarin, lithium, ACE inhibitors: the combinations that kill." },
  { id: "suffix", label: "Name endings", blurb: "-pril, -sartan, -mab, -nib: read the class from the name." },
  { id: "pregnancy", label: "Pregnancy", blurb: "Which drugs harm the baby, and how." },
];

/** The one toxicity each cancer drug is famous for (index into its adverse-effect list). */
const SIGNATURE: Record<string, number> = {
  cyclophosphamide: 1, doxorubicin: 0, cisplatin: 0, carboplatin: 0, vincristine: 0, methotrexate: 2, fluorouracil: 2, paclitaxel: 0,
  bleomycin: 0, etoposide: 2, imatinib: 0, tamoxifen: 1, letrozole: 0, trastuzumab: 0, rituximab: 1, leuprorelin: 0, bicalutamide: 0,
};

// Fisher-Yates: sorting with a random comparator is not a fair shuffle (the first item, often the right answer, ends up first or last far too often)
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hash = (s: string) => { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return h.toString(36); };
/** A comparison key: the longest of the first three words, so “An antipsychotic” and “Mania: an antipsychotic” collide. */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).sort((a, b) => b.length - a.length)[0] ?? "";
/** Distractors with no repeated key and none from the blocked set. */
const distinct = (list: string[], block: Set<string>, n: number) => { const seen = new Set(block); const out: string[] = []; for (const x of shuffle(list)) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); } if (out.length === n) break; } return out; };
/** A short, answer-sized form of a long guideline line: drop “Step 1:”-style prefixes and trailing detail. */
const short = (t: string) => { const m = t.match(/^[^:]{2,32}: (.+)$/); const body = (m ? m[1] : t).split(/ [(—+±]| plus |; |, | for | once | with | after | within /)[0].trim(); return body.charAt(0).toUpperCase() + body.slice(1); };
const hints = (answer: string, ctx: string): string[] => [ctx, `The answer starts with “${answer.slice(0, 14)}…”.`];

function make(kind: string, stem: string, right: string, wrong: string[], explain: string, ctx: string): MCQ {
  const opts = shuffle([o(right, true, explain), ...wrong.map((w) => o(w, false, "Not the best answer here."))]);
  return mcq(`ph-${kind}-${hash(stem + right)}`, "pharmacology", stem, opts, hints(right, ctx), explain);
}

function aeToDrug(): MCQ | null {
  const links = AE_LINKS.filter((l) => l.drugs.length <= 4);
  const l = links[Math.floor(Math.random() * links.length)];
  const right = l.drugs[Math.floor(Math.random() * l.drugs.length)];
  const wrong = distinct(links.filter((x) => x !== l).flatMap((x) => x.drugs), new Set(l.drugs.map(key)), 3);
  if (wrong.length < 3) return null;
  return make("ae", `Which drug is classically linked with: ${l.effect.toLowerCase()}?`, right, wrong, `${l.effect}: ${l.drugs.join("; ")}. ${l.note}`, "Think of the mechanism that produces this effect.");
}

function toxicity(): MCQ | null {
  const ids = Object.keys(SIGNATURE).filter((id) => pdrugById(id));
  const id = ids[Math.floor(Math.random() * ids.length)];
  const d = pdrugById(id)!;
  const right = d.ae[SIGNATURE[id]];
  const others = ids.filter((x) => x !== id).map((x) => pdrugById(x)!.ae[SIGNATURE[x]]);
  const wrong = distinct(others, new Set([key(right)]), 3);
  if (wrong.length < 3) return null;
  return make("tox", `Which adverse effect is the signature of ${d.name}?`, right, wrong, `${d.name}: ${d.ae.join("; ")}.`, `${d.name} is a ${d.cls.toLowerCase()}. Link the mechanism to the organ it injures.`);
}

function drugToClass(): MCQ {
  const d = ALL_PDRUGS[Math.floor(Math.random() * ALL_PDRUGS.length)];
  const seen = new Set([d.cls]); const wrong: string[] = [];
  for (const x of shuffle(ALL_PDRUGS)) { if (key(x.cls) !== key(d.cls) && !seen.has(x.cls)) { seen.add(x.cls); wrong.push(x.cls); } if (wrong.length === 3) break; }
  return make("cls", `${d.name} belongs to which class?`, d.cls, wrong, `${d.name} is a ${d.cls.toLowerCase()}. ${d.why}`, `It is used for: ${d.why.split(".")[0]}.`);
}

const firsts = (xs: typeof CONDITIONS) => xs.map((x) => short(x.first[0]));
function conditionFirst(): MCQ {
  const c = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];
  const right = short(c.first[0]);
  const block = new Set([...c.first, ...c.alt].map((x) => key(short(x))).concat(key(right)));
  const near = firsts(CONDITIONS.filter((x) => x !== c && x.group === c.group));
  const far = firsts(CONDITIONS.filter((x) => x !== c && x.group !== c.group));
  const a = distinct(near, block, 3);
  const wrong = a.length >= 3 ? a : [...a, ...distinct(far, new Set([...block, ...a.map(key)]), 3 - a.length)];
  return make("cond", `What is first-line for: ${c.name.toLowerCase()}?`, right, wrong, `${c.name}: ${c.first.join("; ")}. ${c.pearl}`, "Think of the guideline step, then check for contraindications.");
}

function avoid(): MCQ | null {
  const c = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];
  if (!c.avoid.length) return null;
  const right = short(c.avoid[0]);
  const block = new Set([...c.first, ...c.alt].map((x) => key(short(x))).concat(key(right)));
  // The wrong options must be ordinary treatments that are NOT harmful here, so draw them from unrelated conditions.
  const wrong = distinct(firsts(CONDITIONS.filter((x) => x !== c && x.group !== c.group)), block, 3);
  if (wrong.length < 3) return null;
  return make("avoid", `In ${c.name.toLowerCase()}, which of these should be avoided or used with great care?`, right, wrong, `Avoid in ${c.name.toLowerCase()}: ${c.avoid.join("; ")}.`, "One of these can harm the patient; the others are ordinary treatments.");
}

function interaction(): MCQ {
  const it = INTERACTIONS[Math.floor(Math.random() * INTERACTIONS.length)];
  const wrong = distinct(INTERACTIONS.filter((x) => x !== it).map((x) => x.effect), new Set([key(it.effect)]), 3);
  return make("int", `What is the main danger of combining ${it.a} with ${it.b}?`, it.effect, wrong, `${it.a} + ${it.b}: ${it.effect}. ${it.why}`, "Think about metabolism, excretion and shared side-effects.");
}

function suffix(): MCQ {
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  const wrong = distinct(SUFFIXES.filter((x) => x.meaning !== s.meaning).map((x) => x.meaning), new Set([key(s.meaning)]), 3);
  return make("suf", `A drug name ending in “${s.stem}” (for example ${s.example.split(",")[0]}) tells you it is a:`, s.meaning, wrong, `${s.stem} = ${s.meaning}. Examples: ${s.example}.`, "Say the name aloud and think of drugs with the same ending.");
}

function pregnancy(): MCQ {
  const p = PREGNANCY_AVOID[Math.floor(Math.random() * PREGNANCY_AVOID.length)];
  const wrong = distinct(PREGNANCY_AVOID.filter((x) => x !== p).map((x) => x.harm), new Set([key(p.harm)]), 3);
  return make("preg", `What is the recognised risk of ${p.drug} in pregnancy?`, p.harm, wrong, `${p.drug}: ${p.harm}.`, "Match the drug to the organ it affects in the fetus.");
}

const MAKERS: Record<Exclude<DrillKind, "mixed">, () => MCQ | null> = { ae: aeToDrug, class: drugToClass, toxicity, condition: conditionFirst, avoid, interaction, suffix, pregnancy };

export function buildPharmDrill(kind: DrillKind, n = 10): MCQ[] {
  const out: MCQ[] = []; const seen = new Set<string>();
  const kinds = kind === "mixed" ? (Object.keys(MAKERS) as (keyof typeof MAKERS)[]) : [kind];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const k = kinds[out.length % kinds.length] ?? kinds[0];
    const q = (MAKERS as Record<string, () => MCQ | null>)[k]();
    if (q && !seen.has(q.id)) { seen.add(q.id); out.push(q); }
  }
  return out;
}
