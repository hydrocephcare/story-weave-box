// Clinical reasoning simulator — data shapes. A case is data only, so more cases can be added (or generated) without touching the engine.

export type Rotation = "medicine" | "obgyn" | "paeds" | "surgery" | "psychiatry";
export type Skill = "history" | "examination" | "differentials" | "investigations" | "interpretation" | "emergency" | "management" | "pathophysiology" | "consultant" | "presentation" | "problemlist" | "pharmacology" | "reporting" | "imaging" | "communication";

export const ROTATIONS: { id: Rotation; label: string; short: string; emoji: string; blurb: string }[] = [
  { id: "medicine", label: "Internal Medicine", short: "Medicine", emoji: "🩺", blurb: "Cardiac, respiratory, renal, endocrine, neurology, haematology, infections, GI" },
  { id: "obgyn", label: "Obstetrics & Gynaecology", short: "Obs & Gynae", emoji: "🤰", blurb: "Antenatal, labour, haemorrhage, hypertensive disorders, gynae emergencies" },
  { id: "paeds", label: "Paediatrics", short: "Paeds", emoji: "🧒", blurb: "Children are not small adults: danger signs, weight-based care, neonates" },
  { id: "surgery", label: "Surgery", short: "Surgery", emoji: "🔪", blurb: "Acute abdomen, trauma, burns, vascular, breast and thyroid" },
  { id: "psychiatry", label: "Psychiatry", short: "Psychiatry", emoji: "🧠", blurb: "History, MSE, risk, and telling psychiatric from medical causes" },
];

export const SKILLS: { id: Skill; label: string }[] = [
  { id: "history", label: "History taking" }, { id: "examination", label: "Examination" }, { id: "differentials", label: "Differentials" },
  { id: "investigations", label: "Choosing investigations" }, { id: "interpretation", label: "Interpreting results" }, { id: "emergency", label: "Emergency response" },
  { id: "management", label: "Management" }, { id: "pathophysiology", label: "Pathophysiology" }, { id: "consultant", label: "Consultant questions" },
  { id: "presentation", label: "Case presentation" }, { id: "problemlist", label: "Problem list" }, { id: "pharmacology", label: "Drug reasoning" },
  { id: "reporting", label: "Examination reporting" }, { id: "imaging", label: "Imaging & ECG" }, { id: "communication", label: "Counselling" },
];

export const BODY_SYSTEMS = ["Cardiovascular", "Respiratory", "Renal / urinary", "Gastrointestinal / hepatobiliary", "Neurological", "Endocrine / metabolic", "Haematological", "Infective / immune", "Musculoskeletal / trauma", "Obstetric / gynaecological", "Psychiatric", "Toxic / drug-related"] as const;

export interface HxItem { id: string; group: string; label: string; def: string; why?: string }
export interface ExItem { id: string; group: string; label: string; def: string; looking: string; img?: string; imgAlt?: string }
export interface Ix { id: string; group: string; label: string; result: string; meaning: string; use: "key" | "useful" | "low"; note?: string; img?: string; imgAlt?: string }
export interface Ddx {
  name: string; aliases: string[]; tier: "likely" | "possible" | "dangerous";
  why: string; for: string[]; against: string[]; separate: { ask: string; exam: string; ix: string };
}
export interface Opt { t: string; ok: boolean; why: string }
export interface MCQ {
  id: string; skill: Skill; q: string; options: Opt[]; multi?: boolean;
  hints: string[]; explain: string; /** shown only after this investigation was requested */ after?: string;
}
export interface Event { when: "after-exam" | "after-ix" | "before-mgmt"; title: string; text: string; vitals: string; q: MCQ }
export interface Twist { text: string; q: MCQ }

export interface CaseDef {
  id: string; rotation: Rotation; title: string; level: 1 | 2 | 3; setting: string; tags: string[];
  /** Body systems that genuinely contribute (for the "first thoughts" step). */
  involved: string[];
  emergency?: boolean;
  vignette: string;
  hx: Record<string, string>; hxKey: string[]; hxExtra?: HxItem[];
  ex: Record<string, string>; exKey: string[]; exExtra?: ExItem[];
  hsets: string[]; esets: string[];
  ix: Ix[]; interpret: MCQ[];
  ddx: Ddx[];
  event?: Event; twist?: Twist;
  dx: { q: MCQ };
  mgmt: MCQ;
  consultant: MCQ[];
  chain: { risk: string; patho: string; symptoms: string; signs: string; ix: string; dx: string; mx: string; comp: string };
  mustKnow: string[]; thinkIf: [string, string][];
  /** Where to revise the topic on the site (search term). */
  revise: string;
}

export interface ReasonDrill {
  id: string; finding: string; context: string;
  mechanisms: Opt[]; systems: Opt[]; diseases: Opt[];
  ask: string[]; exam: string[]; ix: string[]; danger: string;
}
