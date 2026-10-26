/**
 * Works out which clinical unit a note belongs to from its own words, with no AI: the admin publisher uses it before asking a model,
 * so a Surgery note is filed under Surgery even when it mentions physiology. The Surgery word list follows the Year 4 surgery outline.
 */
type Unit = { year: number; name: string; words: string[] };

const UNITS: Unit[] = [
  { year: 4, name: "Surgery", words: [
    "appendicitis", "appendicectomy", "appendectomy", "peritonitis", "acute abdomen", "intestinal obstruction", "bowel obstruction", "volvulus", "intussusception",
    "hernia", "strangulated", "perforated", "peptic ulcer perforation", "laparotomy", "laparoscopic", "cholecystectomy", "cholecystitis", "cholangitis", "obstructive jaundice",
    "thyroidectomy", "goitre", "breast lump", "triple assessment", "fibroadenoma", "haemorrhoid", "anal fissure", "fistula-in-ano", "perianal abscess",
    "trauma", "abcde", "haemorrhagic shock", "burns", "tbsa", "skin graft", "wound healing", "surgical site infection", "necrotising fasciitis", "diabetic foot",
    "postoperative", "perioperative", "preoperative", "anastomotic", "ileus", "surgical", "surgery", "operative", "ward round", "mcburney", "rovsing", "guarding", "rigidity",
    "testicular torsion", "acute urinary retention", "bph", "chest drain", "pneumothorax", "compartment syndrome", "acute limb ischaemia", "varicose",
  ] },
  { year: 4, name: "Internal Medicine", words: [
    "heart failure", "myocardial infarction", "hypertension", "diabetes mellitus", "diabetic ketoacidosis", "copd", "asthma", "pneumonia", "tuberculosis", "hiv", "stroke",
    "cirrhosis", "nephrotic", "nephritic", "chronic kidney disease", "anaemia", "leukaemia", "lymphoma", "rheumatoid", "lupus", "epilepsy", "meningitis", "malaria",
  ] },
  { year: 4, name: "Paediatrics", words: [
    "neonate", "neonatal", "newborn", "infant", "paediatric", "pediatric", "kwashiorkor", "marasmus", "immunisation", "milestones", "bronchiolitis", "febrile convulsion", "imci", "growth chart",
  ] },
  { year: 4, name: "Psychiatry", words: ["schizophrenia", "psychosis", "bipolar", "depression", "anxiety disorder", "mental state examination", "antipsychotic", "psychiatric", "suicide"] },
  { year: 4, name: "Obstetrics and Gynaecology", words: ["antenatal", "labour", "postpartum", "pre-eclampsia", "eclampsia", "ectopic pregnancy", "cervical cancer", "fibroids", "gynaecological", "obstetric", "caesarean", "menorrhagia"] },
];

const count = (hay: string, w: string) => { let n = 0, i = hay.indexOf(w); while (i >= 0 && n < 6) { n++; i = hay.indexOf(w, i + w.length); } return n; };

/** "Year 4: Surgery" and the like, or "" when the note does not clearly belong to one clinical unit. */
export function detectUnit(title: string, content: string): string {
  const t = title.toLowerCase();
  const body = content.toLowerCase().slice(0, 12000);
  const scored = UNITS.map((u) => {
    let score = 0;
    for (const w of u.words) { if (t.includes(w)) score += 4; score += Math.min(count(body, w), 3); }
    if (t.includes(u.name.toLowerCase())) score += 8;
    if (new RegExp(`\b${u.name.toLowerCase().replace(/ and /, ".{1,6}")}\b`).test(body.slice(0, 600))) score += 6;
    return { u, score };
  }).sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (best.score < 10 || best.score < (next?.score ?? 0) * 1.6) return "";
  const said = /\byear\s*([4-6])\b/i.exec(`${title}\n${content.slice(0, 1500)}`);
  const year = said ? Number(said[1]) : best.u.year;
  return `Year ${year}: ${best.u.name}`;
}
