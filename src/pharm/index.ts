import { DRUGS } from "@/clinical/extras/drugs";
import { COMMON_DRUGS, CV, BLOOD, ENDO, RESP, INF, VIRAL, CNS, PAIN, GI, WOMEN, EMERG } from "./drugsCommon";
import { CYTO, ONC_DRUGS, SUPPORT, TARGET } from "./drugsOnc";
import { MORE_DRUGS } from "./drugsMore";
import type { PDrug } from "./types";

const GROUP_OF: Record<string, string> = {
  furosemide: CV, gtn: CV, labetalol: CV, propranolol: CV, ace: CV, spiro: CV,
  aspirin: BLOOD, heparin: BLOOD, alteplase: BLOOD, txa: BLOOD, hydroxyurea: BLOOD,
  ceftriaxone: INF, "ampicillin-gent": INF, benzylpen: INF, tetanus: INF, silver: INF, "ceftaz-meto": INF, doxy: INF, gentamicin: INF,
  artesunate: VIRAL, rhze: VIRAL,
  insulin: ENDO, metformin: ENDO,
  salbutamol: RESP, ipratropium: RESP, prednisolone: RESP,
  magsulph: WOMEN, oxytocin: WOMEN, misoprostol: WOMEN,
  diazepam: CNS, haloperidol: CNS, risperidone: CNS, fluoxetine: CNS, lithium: CNS, thiamine: CNS, methylphenidate: CNS,
  morphine: PAIN, paracetamol: PAIN,
  "ors-zinc": GI, octreotide: GI,
  "ca-gluc": EMERG, dextrose: EMERG, oxygen: EMERG,
};

export const DRUG_GROUPS = [CYTO, TARGET, SUPPORT, CV, BLOOD, ENDO, RESP, INF, VIRAL, CNS, PAIN, GI, WOMEN, EMERG];

export const ALL_PDRUGS: PDrug[] = [
  ...ONC_DRUGS,
  ...COMMON_DRUGS,
  ...MORE_DRUGS,
  ...DRUGS.map((d) => ({ ...d, group: GROUP_OF[d.id] ?? EMERG })),
];

export const pdrugById = (id: string) => ALL_PDRUGS.find((d) => d.id === id);
export const isCancer = (g: string) => g.startsWith("Cancer");
