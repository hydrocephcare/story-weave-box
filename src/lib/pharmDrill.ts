// Pharmacology you must know, built from the site's own drug guide (no AI, instant): multiple-choice questions and flashcards that follow the drugs named
// on the page being read, or the commonest drugs on the ward (metformin, omeprazole, losartan, amlodipine, aspirin ...).
import { ALL_PDRUGS } from "@/pharm";
import type { PDrug } from "@/pharm/types";

export interface PharmMcq { question: string; options: string[]; correct_answer: number; explanation: string }
export interface PharmCard { question: string; answer: string }

const MUST = ["metformin", "omeprazole", "losartan", "amlodipine", "aspirin", "paracetamol", "ibuprofen", "ceftriaxone", "amoxicillin", "gentamicin", "furosemide", "atenolol", "salbutamol", "prednisolone", "insulin", "artesunate", "enalapril", "hydrochlorothiazide", "ciprofloxacin", "diclofenac", "morphine", "heparin", "warfarin", "simvastatin", "atorvastatin", "gliclazide", "ranitidine", "metronidazole", "doxycycline", "fluconazole", "carbamazepine", "phenytoin", "diazepam", "adrenaline", "ondansetron", "tramadol"];
const short = (t: string, n = 170) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]+\S*$/, "") + "…" : s; };
const shuffle = <T,>(a: T[]): T[] => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const stem = (n: string) => n.split(/[\s/(]/)[0].toLowerCase();

/** Drugs named in the text first (up to `n`), then must-knows, never the same drug twice. */
export function pickDrugs(text: string, n: number): PDrug[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const named = ALL_PDRUGS.filter((d) => hay.includes(` ${stem(d.name)} `));
  const must = shuffle(MUST).map((m) => ALL_PDRUGS.find((d) => stem(d.name) === m)).filter(Boolean) as PDrug[];
  const out: PDrug[] = [];
  for (const d of [...shuffle(named), ...must, ...shuffle(ALL_PDRUGS)]) { if (!out.includes(d)) out.push(d); if (out.length >= n) break; }
  return out;
}

const others = (d: PDrug, pool: PDrug[]) => shuffle(pool.filter((x) => x.id !== d.id));

/** One multiple-choice question about a drug; the kind rotates so the stems and the answers do not look alike. */
export function drugMcq(d: PDrug, kind: number): PharmMcq | null {
  const pool = ALL_PDRUGS;
  const mk = (question: string, right: string, wrong: string[], explanation: string): PharmMcq | null => {
    const opts = [...new Set(wrong.map((w) => short(w, 90)).filter((w) => w && w.toLowerCase() !== right.toLowerCase()))].slice(0, 3);
    if (opts.length < 3) return null;
    const options = shuffle([short(right, 90), ...opts]);
    return { question, options, correct_answer: options.indexOf(short(right, 90)), explanation };
  };
  switch (kind % 5) {
    case 0: return mk(`${d.name} belongs to which drug class?`, d.cls, others(d, pool).filter((x) => x.cls !== d.cls).map((x) => x.cls), `${d.name} is a ${d.cls.toLowerCase()}. ${short(d.mech, 160)}`);
    case 1: return mk(`Which statement best describes how ${d.name} works?`, d.mech, others(d, pool).map((x) => x.mech), `${d.name} (${d.cls.toLowerCase()}): ${short(d.mech, 200)}`);
    case 2: return mk(`${d.name} is mainly used for:`, d.why, others(d, pool).filter((x) => x.group !== d.group || x.cls !== d.cls).map((x) => x.why), `${d.name}: ${short(d.why, 200)}`);
    case 3: { const ae = d.ae?.[0]; if (!ae) return null; const bad = others(d, pool).flatMap((x) => x.ae || []).filter((a) => !(d.ae || []).some((y) => y.toLowerCase().slice(0, 12) === a.toLowerCase().slice(0, 12))); return mk(`Which of these is a recognised adverse effect of ${d.name}?`, ae, bad, `${d.name}: ${(d.ae || []).slice(0, 4).map((x) => short(x, 60)).join("; ")}.`); }
    default: { if (!d.caution) return null; return mk(`Which caution applies to ${d.name}?`, d.caution, others(d, pool).map((x) => x.caution).filter(Boolean), `${d.name}: ${short(d.caution, 200)}`); }
  }
}

/** `n` pharmacology MCQs for the text on the page (a different kind of question for each drug). */
export function pharmMcqs(text: string, n = 5): PharmMcq[] {
  const out: PharmMcq[] = [];
  let k = Math.floor(Math.random() * 5);
  for (const d of pickDrugs(text, n * 3)) {
    for (let t = 0; t < 5 && out.length < n; t++) { const q = drugMcq(d, k++); if (q) { out.push(q); break; } }
    if (out.length >= n) break;
  }
  return out;
}

/** A flashcard (bold answer, explaining lines, related line) on one drug. */
export function drugCard(d: PDrug, kind: number): PharmCard {
  const ae = (d.ae || []).slice(0, 3).map((x) => short(x, 70));
  switch (kind % 3) {
    case 0: return { question: `${d.name}: class and mechanism of action?`, answer: `**${d.cls}**\n- Mechanism: ${short(d.mech, 200)}\n- Main use: ${short(d.why, 130)}\nRelated: other ${d.group.toLowerCase()} drugs` };
    case 1: return { question: `${d.name}: what is it used for, and what must you watch for?`, answer: `**${short(d.why, 110)}**\n${ae.map((x) => `- Side effect: ${x}`).join("\n")}${d.caution ? `\n- Caution: ${short(d.caution, 110)}` : ""}\nRelated: ${d.cls}` };
    default: return { question: `Which drug is a ${d.cls.toLowerCase()} used for ${short(d.why, 70).toLowerCase().replace(/\.$/, "")}?`, answer: `**${d.name}**\n- Class: ${d.cls}\n- Mechanism: ${short(d.mech, 160)}\nRelated: ${d.group}` };
  }
}

export function pharmCards(text: string, n: number): PharmCard[] { return pickDrugs(text, n).map((d, i) => drugCard(d, i + Math.floor(Math.random() * 3))); }
