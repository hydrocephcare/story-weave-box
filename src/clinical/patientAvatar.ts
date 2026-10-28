// An illustrated portrait for every case, built from the age and sex written in its vignette, so new AI-written cases get one with no extra work.
// Pictures come from DiceBear's "lorelei" set (CC0, free to use, no credit needed). They are drawings, never photographs of real people,
// so no real person's face is ever shown as a patient with a disease.

export interface Patient { sex: "male" | "female" | "unknown"; ageYears: number | null; infant: boolean }

const DASH = "[\\s\\u2010-\\u2015-]*";

/** Reads "a 62-year-old man", "an 8-month-old girl", "a newborn" and similar from the vignette. */
export function readPatient(vignette: string): Patient {
  const v = vignette || "";
  const years = new RegExp(`(\\d{1,3})${DASH}(?:year|yr)s?${DASH}old`, "i").exec(v);
  const small = new RegExp(`(\\d{1,3})${DASH}(?:month|week|day)s?${DASH}old`, "i").exec(v);
  const infant = !years && (!!small || /\b(newborn|neonate|infant|baby)\b/i.test(v));
  const ageYears = years ? Number(years[1]) : infant ? 0 : null;
  const female = /\b(woman|girl|female|mother|pregnant|gravida|primigravida|multigravida|she|her)\b/i.test(v);
  const male = /\b(man|boy|male|father|he|his)\b/i.test(v);
  return { sex: female && !male ? "female" : male && !female ? "male" : female ? "female" : "unknown", ageYears, infant };
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const SKIN = ["8d5524", "a1683a", "6b4423", "7a4a24", "c68642"];

/** The portrait address, or null for a baby (shown as an icon instead). */
export function avatarUrl(id: string, vignette: string): string | null {
  const p = readPatient(vignette);
  if (p.infant) return null;
  const h = hash(id);
  const age = p.ageYears ?? 35;
  const params = new URLSearchParams({ seed: id, size: "192", radius: "50", backgroundColor: "e6f1ee", skinColor: SKIN[h % SKIN.length] });
  if (age >= 60) { params.set("hairColor", h % 2 ? "ffffff" : "c9c9c9"); params.set("glasses", "variant01,variant02,variant03"); params.set("glassesProbability", "60"); }
  else if (age >= 40) params.set("hairColor", h % 3 === 0 ? "4a4a4a" : "1a1a1a");
  else params.set("hairColor", "1a1a1a");
  if (p.sex === "male" && age >= 16) { params.set("beardProbability", age >= 30 ? "35" : "15"); }
  else { params.set("beardProbability", "0"); }
  if (p.sex === "female") params.set("earringsProbability", age >= 14 ? "55" : "0");
  else params.set("earringsProbability", "0");
  return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`;
}

export function patientLine(vignette: string): string {
  const p = readPatient(vignette);
  const who = p.infant ? "Infant" : p.ageYears === null ? "Patient" : `${p.ageYears} years`;
  return `${who}${p.sex === "male" ? ", male" : p.sex === "female" ? ", female" : ""}`;
}
