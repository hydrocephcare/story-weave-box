// The dental and medical parts of Ompath Study are one library: these are the MBChB notes that cover the same ground as each dental unit.
export interface BridgeLink { to: string; label: string }
const B = (to: string, label: string): BridgeLink => ({ to, label });

const MAP: [RegExp, BridgeLink[]][] = [
  [/anatomy/i, [B("/library/year-1/anatomy", "Year 1 Anatomy library"), B("/library/year-2/anatomy", "Year 2 Anatomy library")]],
  [/physiology/i, [B("/library/year-1/physiology", "Year 1 Physiology library"), B("/library/year-2/physiology", "Year 2 Physiology library")]],
  [/oral biology/i, [B("/library/year-1/oral-biology-and-dental-bds", "Oral Biology & Dental (BDS) library"), B("/library/year-1/anatomy", "Year 1 Anatomy library")]],
  [/oral pathology|oral medicine/i, [B("/library/year-3/pathology", "Year 3 Pathology library"), B("/library/year-1/oral-biology-and-dental-bds", "Oral Biology & Dental (BDS) library")]],
  [/biostat/i, [B("/library/year-2/epidemiology-and-biostatistics", "Epidemiology & Biostatistics library"), B("/library/year-3/research-methodology", "Research Methodology library")]],
  [/community health|health education|health promotion/i, [B("/library/year-2/epidemiology-and-biostatistics", "Epidemiology & Biostatistics library"), B("/library/year-3/nutrition-and-dietetics", "Nutrition & Dietetics library")]],
];

/** MBChB notes that overlap with a dental unit, always with a way into the whole topic index. */
export const bridgeFor = (unitTitle: string): BridgeLink[] => [...(MAP.find(([re]) => re.test(unitTitle))?.[1] ?? []), B("/topics", "All topics A–Z (MBChB)")];
