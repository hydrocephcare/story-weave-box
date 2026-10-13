/** Three hues per subject for the moving colour behind the opening block of a page. */
export const SUBJECT_HUES: Record<string, [number, number, number]> = {
  Anatomy: [8, 32, 330], Physiology: [212, 190, 262], "Biochemistry & genetics": [188, 262, 150], Pharmacology: [32, 12, 48],
  "Microbiology & immunology": [142, 84, 190], Pathology: [268, 330, 212], Psychiatry: [238, 280, 180], Paediatrics: [198, 48, 130],
  "Obstetrics & gynaecology": [330, 12, 280], Surgery: [352, 214, 28], "Public health": [166, 120, 200], Medicine: [174, 205, 268],
};
const YEAR_HUES: Record<number, [number, number, number]> = { 1: [174, 150, 205], 2: [212, 190, 262], 3: [268, 330, 212], 4: [8, 32, 330], 5: [32, 12, 48], 6: [142, 84, 190] };

const RULES: [RegExp, string][] = [
  [/obstet|gynae|gyne|pregnan|labou?r|antenatal|contracept|maternal|ovar|uter|placent/i, "Obstetrics & gynaecology"],
  [/paed|pediat|child|neonat|growth and development/i, "Paediatrics"],
  [/psych|mental|behaviou?r|schizo|depress|anxiety/i, "Psychiatry"],
  [/surg|trauma|orthop|fracture|hernia|burn/i, "Surgery"],
  [/public health|epidem|communit|biostat|preventive|vaccin/i, "Public health"],
  [/pharm|drug|antibiotic|therap|dose/i, "Pharmacology"],
  [/microb|virolog|bacteri|parasit|mycolog|immun|infect|entomolog|sepsis|malaria|tubercul|hiv/i, "Microbiology & immunology"],
  [/patholog|neoplas|cancer|carcinom|leuk|lymphom|haemat|hemat|anaemi|anemi|tumou?r/i, "Pathology"],
  [/anat|embryo|histolog|bone|muscle|nerve|artery|vein|joint/i, "Anatomy"],
  [/physiolog|neurophys|homeosta|renal function|action potential/i, "Physiology"],
  [/biochem|genetic|molecular|metabol|enzyme|vitamin|dna|rna/i, "Biochemistry & genetics"],
];

/** The three hues for whatever a page is about: a subject name, a title, a category or a year. */
export function hueFor(text: string, year?: number | null): [number, number, number] {
  const t = String(text || "");
  const exact = SUBJECT_HUES[t];
  if (exact) return exact;
  for (const [re, subject] of RULES) if (re.test(t)) return SUBJECT_HUES[subject];
  if (year && YEAR_HUES[year]) return YEAR_HUES[year];
  return SUBJECT_HUES.Medicine;
}
