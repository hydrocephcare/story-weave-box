// One clean name for a topic, from the (often messy) title of a note: no lecture numbers, no course codes, no SHOUTING.
//   "1.a) ACUTE RHEUMATIC FEVER MB chB IV"  ->  "Acute rheumatic fever"
//   "L26- GI bleeding"                       ->  "GI bleeding"
//   "7b TUBULOINTERSTITIAL DISEASES"         ->  "Tubulointerstitial diseases"
// Shared by the site and the edge functions that name question banks, flashcard decks and essays.
const KEEP = new Set(("HIV AIDS TB CVS GIT GI CNS PNS AKI CKD UTI COPD DM ECG EEG MRI CT DNA RNA ATP ICU ENT ARDS DKA HTN MI DVT PE IV IM BP GFR ALL AML CLL CML SLE RA PCR STI TORCH ADHD VSD ASD PDA TOF OSCE CAT MCQ ABG ECHO COVID RSV EBV CMV HBV HCV HPV").split(" "));

export function cleanTopicTitle(raw) {
  const original = String(raw ?? "").replace(/\s+/g, " ").trim();
  let t = original.replace(/_+/g, " ").replace(/\.(pptx?|docx?|pdf)$/i, "");
  // lecture and topic numbers at the start: "Lecture 3 -", "L26-", "Topic 2:", "1.a)", "7b ", "15.10.21"
  t = t.replace(/^(?:(?:lecture|lec|l|topic|unit|week|session|chapter|ch)\s*\.?\s*\d+[a-z]?\s*[-–—:.)]*\s*)+/i, "");
  t = t.replace(/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*/, "");
  t = t.replace(/^(?:(?:\d+\s*[a-z]?|[a-z])\s*[.)\-–—:]+\s*)+/i, "");
  t = t.replace(/^\d+\s*[a-z]\s+(?=[A-Za-z])/i, "").replace(/^\d+\s+(?=[A-Za-z])/, "");
  // course and file noise anywhere
  t = t.replace(/\b(?:MB\s*ch\s*B(?:\s*(?:IV|III|II|I|[1-6]))?|MBChB|MKU|PPTX?|slides?|handouts?|lecture notes?|study notes?|notes?)\b/gi, " ");
  t = t.replace(/\(\s*\d+\s*\)\s*$/g, "").replace(/\s[-–—]\s*\d+\s*$/g, "").replace(/[-–—]\d+$/g, "");
  t = t.replace(/\s+/g, " ").replace(/^[\s\-–—:.,;|]+|[\s\-–—:.,;|]+$/g, "");
  const letters = t.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length > 3 && upper / letters.length > 0.6) {
    t = t.toLowerCase().replace(/\b[a-z]+\b/g, (w) => (KEEP.has(w.toUpperCase()) ? w.toUpperCase() : w));
  }
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length < 3) return original.slice(0, 70);
  return t.length > 70 ? t.slice(0, 70).replace(/\s+\S*$/, "") : t;
}
