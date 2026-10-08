// Turns what a student types ("pls i need psych notes for yr 4") into something the search can use:
// the words worth searching, the year, what kind of material they want, and spelling/abbreviation variants.
// Pure functions, no network: covered by src/test/ompath-ai-query.test.ts.

export type Wanted = "notes" | "papers" | "mcqs" | "flashcards" | "files" | "timetable" | "answer";

export interface ParsedQuery {
  raw: string;
  /** The topic words with the filler removed ("psychiatry"). */
  topic: string;
  /** Extra phrases that mean the same thing ("psychiatry", "mental health", "depression"). */
  expansions: string[];
  year: number | null;
  wants: Wanted;
  /** True when the student asked for a place or a list (notes, papers, files) rather than a question. */
  isLookup: boolean;
  /** True when it reads like a real question that should be answered in words. */
  isQuestion: boolean;
}

const FILLER = new Set(("i need want give me show find get pls please can you could would tell explain what whats is are was how do does to the a an of on about for some any all my in and with by from at me us " +
  "notes note materials material resources resource files file pdf pdfs slides ppt study guide revision reading handouts handout topic topics regarding concerning related help looking look search bring open").split(" "));

/** Short forms students actually type, and what they stand for. */
const ABBREVIATIONS: Record<string, string> = {
  psych: "psychiatry", psy: "psychiatry", peds: "paediatrics", paeds: "paediatrics", pead: "paediatrics", paed: "paediatrics", pediatrics: "paediatrics", pediatric: "paediatrics",
  obs: "obstetrics", obgyn: "obstetrics gynaecology", "ob/gyn": "obstetrics gynaecology", "o&g": "obstetrics gynaecology", gyn: "gynaecology", gynecology: "gynaecology", obstetrics: "obstetrics",
  surg: "surgery", ortho: "orthopaedics", orthopedics: "orthopaedics", derm: "dermatology", ophtha: "ophthalmology", opth: "ophthalmology", ent: "ear nose throat otorhinolaryngology",
  med: "internal medicine", im: "internal medicine", cvs: "cardiovascular", cns: "central nervous system neurology", git: "gastrointestinal", gi: "gastrointestinal", resp: "respiratory", msk: "musculoskeletal",
  renal: "renal kidney", tb: "tuberculosis", htn: "hypertension", dm: "diabetes mellitus", mi: "myocardial infarction", copd: "chronic obstructive pulmonary disease", uti: "urinary tract infection",
  hiv: "hiv aids", aids: "hiv aids", pph: "postpartum haemorrhage", pe: "pulmonary embolism", dvt: "deep vein thrombosis", ckd: "chronic kidney disease", aki: "acute kidney injury", ards: "acute respiratory distress syndrome",
  anatomy: "anatomy", histo: "histology", physio: "physiology", biochem: "biochemistry", path: "pathology", pharm: "pharmacology", micro: "microbiology", haem: "haematology", heme: "haematology",
  mcq: "mcq", mcqs: "mcq", saq: "saq", laq: "laq", cat: "cat", cats: "cat", osce: "osce",
};

/** American / British spellings and common variants, so "anemia" finds "anaemia". */
const SPELLING: [RegExp, string][] = [
  [/\bpedi/g, "paedi"], [/\bgyne/g, "gynae"], [/\banemi/g, "anaemi"], [/\bhemat/g, "haemat"], [/\bhemo/g, "haemo"], [/\besophag/g, "oesophag"], [/\bedema/g, "oedema"], [/\bdiarrhea/g, "diarrhoea"],
  [/\bhemorrh/g, "haemorrh"], [/\bleukemi/g, "leukaemi"], [/\bischemi/g, "ischaemi"], [/\btumor/g, "tumour"], [/\bfetal/g, "foetal"], [/\bfetus/g, "foetus"], [/\borthoped/g, "orthopaed"], [/\banesth/g, "anaesth"],
];

/** Topics students ask about by name, and the neighbouring words that also lead to the right notes. */
const TOPIC_EXPANSIONS: Record<string, string[]> = {
  psychiatry: ["psychiatry", "mental health", "depression", "schizophrenia", "bipolar", "psychosis", "anxiety", "mental state examination"],
  paediatrics: ["paediatrics", "child health", "neonate", "newborn", "immunisation", "growth and development", "kwashiorkor"],
  obstetrics: ["obstetrics", "pregnancy", "antenatal", "labour", "postpartum", "pre-eclampsia", "miscarriage"],
  gynaecology: ["gynaecology", "menstruation", "ovarian", "cervical cancer", "fibroids", "endometriosis", "pelvic inflammatory disease"],
  surgery: ["surgery", "surgical", "trauma", "acute abdomen", "hernia", "burns", "appendicitis"],
  "internal medicine": ["internal medicine", "medicine", "cardiology", "nephrology", "endocrinology", "diabetes", "hypertension"],
  orthopaedics: ["orthopaedics", "fracture", "bone", "joint", "musculoskeletal"],
  dermatology: ["dermatology", "skin", "rash", "eczema", "psoriasis"],
  ophthalmology: ["ophthalmology", "eye", "cataract", "glaucoma"],
  "ear nose throat otorhinolaryngology": ["ent", "ear", "nose", "throat", "otitis", "tonsil"],
  pharmacology: ["pharmacology", "drugs", "adverse effects", "mechanism of action"],
  radiology: ["radiology", "x-ray", "imaging", "ultrasound", "ct"],
  "family medicine": ["family medicine", "community health", "primary care"],
};

const WANT_PATTERNS: [Wanted, RegExp][] = [
  ["papers", /\b(past\s*papers?|papers?|exams?|cats?|continuous assessment|supplementary|end of (year|semester|trimester)|main exam)\b/i],
  ["mcqs", /\b(mcqs?|multiple choice|quiz|questions?\s+on|practice questions?|sba)\b/i],
  ["flashcards", /\b(flash\s*cards?|flashcards?|recall cards?)\b/i],
  ["timetable", /\b(timetable|time table|schedule|classes|lectures? today|venue)\b/i],
  ["files", /\b(files?|pdfs?|slides?|ppt|textbooks?|books?|library|handouts?)\b/i],
  ["notes", /\b(notes?|summary|summaries|revision|study guide|overview|high[- ]yield)\b/i],
];

/** Words that say what kind of thing is wanted, not what it is about: they are not part of the topic. */
const WANT_WORDS: Record<Exclude<Wanted, "answer" | "notes">, Set<string>> = {
  papers: new Set("past paper papers exam exams cat cats continuous assessment supplementary main end of year semester trimester questions".split(" ")),
  mcqs: new Set("mcq mcqs multiple choice quiz quizzes questions question practice sba test me".split(" ")),
  flashcards: new Set("flashcard flashcards flash cards recall card".split(" ")),
  timetable: new Set("timetable time table schedule classes lectures lecture venue today".split(" ")),
  files: new Set("file files pdf pdfs slides slide ppt textbook textbooks book books library handout handouts".split(" ")),
};

/** Words students misspell most; a typo within a couple of letters of one of these is read as that word ("phyciaty" -> "psychiatry"). */
const VOCAB = ("psychiatry paediatrics obstetrics gynaecology pharmacology pathology physiology anatomy biochemistry microbiology immunology histology haematology cardiology nephrology neurology dermatology " +
  "ophthalmology orthopaedics radiology surgery medicine tuberculosis hypertension diabetes pneumonia asthma anaemia schizophrenia depression epilepsy stroke malaria hepatitis cirrhosis leukaemia lymphoma " +
  "appendicitis pancreatitis meningitis tonsillitis bronchitis arthritis osteoporosis thyroid cholera typhoid pregnancy eclampsia contraception embryology parasitology bacteriology virology mycology entomology " +
  "epidemiology biostatistics genetics pharmacokinetics antibiotics inflammation neoplasia atherosclerosis myocardial infarction angina arrhythmia embolism thrombosis oedema shock sepsis dehydration " +
  "cardiovascular respiratory gastrointestinal endocrinology rheumatology urology neurosurgery anaesthesia emergency toxicology forensic ethics communication histopathology cytopathology " +
  "dementia delirium anxiety bipolar psychosis addiction nephrotic nephritic glomerulonephritis hydrocephalus pleural effusion pneumothorax emphysema cirrhosis jaundice").split(" ");
const VOCAB_SET = new Set(VOCAB);

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** The one vocabulary word a misspelt word is clearly meant to be, or the word itself. */
export function fixTypo(w: string): string {
  if (w.length < 6 || VOCAB_SET.has(w) || ABBREVIATIONS[w] || /\d/.test(w)) return w;
  const limit = w.length >= 8 ? 3 : 2;
  let best = "", bestD = 99, tie = false;
  for (const v of VOCAB) {
    if (Math.abs(v.length - w.length) > limit) continue;
    const d = distance(w, v);
    if (d < bestD) { best = v; bestD = d; tie = false; } else if (d === bestD) tie = true;
  }
  return bestD <= limit && !tie ? best : w;
}

const QUESTION_RE = /^(what|why|how|when|where|which|who|explain|define|describe|differentiate|compare|list|outline|discuss|is|are|does|do|can|should|tell me|give me the)\b|\?\s*$/i;

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim().replace(/\s+/g, " ");
  let s = raw.toLowerCase();
  for (const [re, rep] of SPELLING) s = s.replace(re, rep);

  // "year 4", "yr4", "y4", "4th year", "fourth year"
  let year: number | null = null;
  const ordinal: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6 };
  const ym = s.match(/\b(?:year|yr|y)\s*-?\s*([1-6])\b/) || s.match(/\b([1-6])(?:st|nd|rd|th)\s+year\b/) || s.match(/\b(first|second|third|fourth|fifth|sixth)\s+year\b/);
  if (ym) year = /^\d$/.test(ym[1]) ? Number(ym[1]) : ordinal[ym[1]] ?? null;
  if (ym) s = s.replace(ym[0], " ");

  let wants: Wanted = "answer";
  for (const [w, re] of WANT_PATTERNS) if (re.test(s)) { wants = w; break; }
  const isQuestion = QUESTION_RE.test(raw) && wants === "answer";
  if (wants === "answer" && !isQuestion && raw.split(" ").length <= 4) wants = "notes";

  const words = s.replace(/[^a-z0-9/&' -]/g, " ").split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (FILLER.has(w)) continue;
    if (wants !== "answer" && wants !== "notes" && WANT_WORDS[wants].has(w)) continue;
    kept.push(ABBREVIATIONS[w] ?? fixTypo(w));
  }
  const topic = kept.join(" ").replace(/\s+/g, " ").trim() || s.trim();

  const expansions = new Set<string>();
  for (const [key, list] of Object.entries(TOPIC_EXPANSIONS)) {
    if (topic.includes(key) || list.slice(0, 1).some((l) => topic.includes(l))) list.forEach((l) => expansions.add(l));
  }
  // each meaningful word on its own widens recall for long topics ("nephrotic syndrome in children")
  const parts = topic.split(" ").filter((w) => w.length >= 4);
  if (parts.length > 1) parts.forEach((p) => expansions.add(p));
  expansions.delete(topic);

  const isLookup = wants === "notes" || wants === "papers" || wants === "files" || wants === "mcqs" || wants === "flashcards" || wants === "timetable";
  return { raw, topic, expansions: [...expansions].slice(0, 8), year, wants, isLookup, isQuestion };
}

/** Words to score passages with: the topic words plus their expansions, lower-cased, de-duplicated. */
export function scoringTerms(p: ParsedQuery): string[] {
  const set = new Set<string>();
  for (const phrase of [p.topic, ...p.expansions.slice(0, 4)]) for (const w of phrase.split(/[^a-z0-9]+/)) if (w.length >= 3 && !FILLER.has(w)) set.add(w);
  return [...set];
}

/** Follow-up buttons offered under an answer. */
export function followUps(p: ParsedQuery): string[] {
  const t = p.topic;
  if (!t) return [];
  const out = [`Quiz me on ${t}`, `Past papers on ${t}`, `High-yield points for ${t}`];
  if (p.wants === "notes") out.unshift(`Explain ${t} simply`);
  return out.slice(0, 4);
}
