/** Short, readable names for exam and question-bank titles, and the unit / year they belong to. */

export type SetKind = "exam" | "bank" | "past_paper";

export interface CatalogRow {
  id: string;
  title: string;
  slug: string | null;
  category: string;
  created_at: string;
  question_count: number;
  kind: SetKind;
  exam_year: string | null;
  university: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "Weekly Exam: Year 3: Medical Virology" -> "Medical Virology". */
export function examUnit(category: string): string {
  const c = String(category || "").replace(/^Weekly Exam\s*:?\s*/i, "").replace(/^Year\s*\d\s*:\s*/i, "").trim();
  return c || "General";
}

export function examYear(category: string, title = ""): number | null {
  const m = /Year\s*(\d)/i.exec(category || "") || /Year\s*(\d)/i.exec(title || "");
  return m ? Number(m[1]) : null;
}

export function isWeekly(title: string, category = ""): boolean {
  return /^Weekly\b/i.test(title) || /^Weekly Exam/i.test(category);
}

/** The date inside a weekly exam title ("... Exam - October 16, 2026 ...") as "16 Oct 2026", or null. */
export function weeklyDate(title: string): string | null {
  const m = new RegExp(`(${LONG_MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i").exec(title);
  if (!m) return null;
  return `${Number(m[2])} ${MONTHS[LONG_MONTHS.indexOf(m[1].toLowerCase())]} ${m[3]}`;
}

const cut = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:(—–-]+$/, "") + "…");

/** A short display title. Weekly exams become their unit; long past-paper titles lose the course code and "with Answers". */
export function shortTitle(title: string, category = ""): string {
  const t = String(title || "").trim();
  if (isWeekly(t, category)) {
    const m = /^Weekly\s+(.+?)\s+Exam\b/i.exec(t);
    const unit = (m?.[1] || examUnit(category)).replace(/^Year\s*\d\s*:\s*/i, "").trim();
    return unit || "Weekly exam";
  }
  const s = t
    .replace(/\s*\((?:section|sections)\s+[^)]*\)\s*$/i, "")
    .replace(/\s+[—–-]\s+(?:MKU|UoN|JKUAT|KU)\b.*$/i, "")
    .replace(/\s+[—–-]\s+[A-Z]{3,5}\s?\d{3,4}\b.*$/, "")
    .replace(/\s+(?:MCQs?|Q\s*(?:&|and)\s*A)\s+(?:with|and)\s+(?:answers|explanations).*$/i, " MCQs")
    .replace(/\s+[—–-]\s+MCQ Bank$/i, " MCQs")
    .replace(/\s+/g, " ")
    .trim();
  return cut(s || t, 46);
}

/** One quiet line under the title: "Pathology · Year 3 · 30 questions". */
export function metaLine(row: Pick<CatalogRow, "category" | "title" | "question_count" | "exam_year">): string {
  const y = examYear(row.category, row.title);
  const parts = [examUnit(row.category), y ? `Year ${y}` : "", row.exam_year || "", row.question_count ? `${row.question_count} questions` : ""].filter(Boolean);
  return parts.join(" · ");
}

/** Exam links go to the timed exam page, question banks to the practice page. */
export function setPath(row: Pick<CatalogRow, "id" | "slug" | "kind" | "title">): string {
  const key = (row.slug || "").trim() || row.id;
  return row.kind === "bank" ? `/mcqs/${key}` : `/exams/${key}/start`;
}
