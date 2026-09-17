/**
 * One accent colour per core discipline. Borrowed from the way Geeky Medics and
 * AMBOSS colour-code their resource tiles: the colour is the primary wayfinding
 * cue, so a student scanning 100+ Year 3 notes recognises "pathology" before
 * they read a single word.
 */
export type SubjectKey =
  | "path" | "micro" | "pharm" | "anat" | "physio" | "biochem" | "community" | "exam";

export const SUBJECT_LABELS: Record<SubjectKey, string> = {
  path: "Pathology",
  micro: "Microbiology",
  pharm: "Pharmacology",
  anat: "Anatomy",
  physio: "Physiology",
  biochem: "Biochemistry",
  community: "Community Health",
  exam: "Exams & Papers",
};

export function getSubjectKey(text: string): SubjectKey {
  const t = (text || "").toLowerCase();
  if (/exam|past paper|cat\b|timetable|revision|spot|practical|crash/.test(t)) return "exam";
  if (/pathology|pathol|histopath|cytopath|oncopath|neuropath|hematopath|carcinoma|tumour|tumor/.test(t)) return "path";
  if (/microbio|bacteriolog|virolog|mycolog|parasitolog|immunolog|transfusion|infection/.test(t)) return "micro";
  if (/pharmac|drug|therapeutic|toxicolog/.test(t)) return "pharm";
  if (/anatom|histolog|embryolog|dissection|osteolog|limb|pelvis|perineum/.test(t)) return "anat";
  if (/physiolog|cardiovascular|respirator|renal|neurophys|endocrine phys/.test(t)) return "physio";
  if (/biochem|chemical patholog|metabol|molecular|genetic|nutrition/.test(t)) return "biochem";
  if (/community|public health|epidemiolog|statistic|behavio/.test(t)) return "community";
  return "path";
}

/**
 * Single, quiet accent. The earlier per-discipline rainbow made every list and
 * tile look like a colour chart; the site now uses one restrained ink tone so
 * typography and hierarchy do the wayfinding instead of colour.
 */
export function subjectColor(_key: SubjectKey, alpha = 1): string {
  return `hsl(var(--ink-soft) / ${alpha})`;
}