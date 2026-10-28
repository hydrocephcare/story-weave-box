import { useEffect, useState } from "react";
import type { CaseDef, Rotation } from "./types";
import { MEDICINE_1 } from "./cases/medicine1";
import { MEDICINE_2 } from "./cases/medicine2";
import { MEDICINE_3 } from "./cases/medicine3";
import { MEDICINE_4 } from "./cases/medicine4";
import { OBGYN_1 } from "./cases/obgyn1";
import { OBGYN_2 } from "./cases/obgyn2";
import { PAEDS_1 } from "./cases/paeds1";
import { PAEDS_2 } from "./cases/paeds2";
import { SURGERY_1 } from "./cases/surgery1";
import { SURGERY_2 } from "./cases/surgery2";
import { PSYCH_1 } from "./cases/psych1";
import { PSYCH_2 } from "./cases/psych2";

// More cases can be added by dropping another file of CaseDef[] into ./cases and listing it here.
export const ALL_CASES: CaseDef[] = [...MEDICINE_1, ...MEDICINE_2, ...MEDICINE_3, ...MEDICINE_4, ...OBGYN_1, ...OBGYN_2, ...PAEDS_1, ...PAEDS_2, ...SURGERY_1, ...SURGERY_2, ...PSYCH_1, ...PSYCH_2];

/** The cases that ship with the site. The daily picks (case of the day, daily dose) use only these, so a day can be replayed later exactly as it was. */
export const BUILTIN_CASES: CaseDef[] = [...ALL_CASES];

let loading: Promise<void> | null = null;
/** Cases the AI wrote from the notes are added to ALL_CASES once, when first asked for (one cached request). */
export function loadGeneratedCases(): Promise<void> {
  if (!loading) {
    loading = fetch("/api/ai-cases")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CaseDef[]) => { for (const d of Array.isArray(rows) ? rows : []) if (d?.id && !ALL_CASES.some((c) => c.id === d.id)) ALL_CASES.push(d); })
      .catch(() => { loading = null; });
  }
  return loading;
}
/** Re-renders the page once the written cases have arrived. */
export function useGeneratedCases(): boolean {
  const [ready, setReady] = useState(ALL_CASES.length > BUILTIN_CASES.length);
  useEffect(() => { let on = true; loadGeneratedCases().then(() => on && setReady(true)); return () => { on = false; }; }, []);
  return ready;
}

export const getCase = (id: string) => ALL_CASES.find((c) => c.id === id);
export const casesFor = (rotation: Rotation) => ALL_CASES.filter((c) => c.rotation === rotation);
export { ROTATIONS, SKILLS, BODY_SYSTEMS } from "./types";
