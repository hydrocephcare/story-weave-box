// "Exam mode" for a note: keeps the introduction and the sections an examiner draws on (high-yield points, tricky questions, differentials, cases, practice questions)
// and hides the rest, so a student can revise a whole system quickly the night before. Works on the note's rendered HTML, section by section.
const KEEP = /high[-\s]?yield|exam|tricky|differential|clinical case|case\b|practice questions|investigations|management|diagnosis|key points|summary|red flag/i;

export function examOnly(html: string): string {
  const parts = html.split(/(?=<h2[\s>])/);
  if (parts.length < 3) return html;
  const keep = parts.filter((p, i) => {
    if (i === 0) return true; // the introduction before the first section
    const title = (p.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "").replace(/<[^>]+>/g, "");
    return KEEP.test(title);
  });
  return keep.length >= 2 ? keep.join("") : html;
}

export const examSectionCount = (html: string) => (html.match(/<h2[\s>]/g) ?? []).length;

/** Whether a section with this heading is kept in exam mode (the contents list uses it too, so it only lists what is shown). */
export const isExamTitle = (title: string) => KEEP.test(title);
