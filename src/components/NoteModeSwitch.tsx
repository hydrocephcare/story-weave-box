import { BookOpen, Zap } from "lucide-react";

const NOT_A_NOTE = /\b(mcqs?|questions?|exam|papers?|quiz|saq|laq|osce|answers?|cat)\b/i;
const HEADING = /^#{1,4}\s+\S/;
const BULLET = /^\s*([-*•]|\d+[.)])\s+\S/;
const KEEP_ALL = /key points?|summary|take[- ]?home|high[- ]?yield|remember/i;
const PER_SECTION = 5;

/** Only study notes get the switch: not question banks, papers or exams, and not short pieces. */
export function canCondense(a: { title?: string | null; category?: string | null; content_kind?: string | null; content?: string | null }): boolean {
  const text = a.content || "";
  if (text.length < 1500 || NOT_A_NOTE.test(`${a.title || ""} ${a.content_kind || ""}`)) return false;
  if (/\*\*Answer:?\*\*/i.test(text.slice(0, 60000))) return false;
  return text.split("\n").filter((l) => HEADING.test(l)).length >= 3;
}

/** The quick-revision view of a note: every heading, the first few bullets of each section, all tables and the whole "Key points" section. Paragraph text is left for the full note. */
export function condenseNote(content: string): string {
  const out: string[] = [];
  let keepAll = false;
  let bullets = 0;
  let hasBody = true;
  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (HEADING.test(line)) {
      // a heading whose section kept nothing is dropped
      if (!hasBody && out.length && HEADING.test(out[out.length - 1])) out.pop();
      keepAll = KEEP_ALL.test(line);
      bullets = 0;
      hasBody = false;
      out.push("", line, "");
      continue;
    }
    if (!line.trim()) continue;
    if (line.trimStart().startsWith("|")) { out.push(line); hasBody = true; continue; }
    if (BULLET.test(line)) {
      if (keepAll || bullets < PER_SECTION) { out.push(line); hasBody = true; }
      bullets++;
      continue;
    }
    if (keepAll) { out.push("", line); hasBody = true; }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Full note / Quick revision, in the page's own colours. */
export default function NoteModeSwitch({ quick, onChange }: { quick: boolean; onChange: (quick: boolean) => void }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors";
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden" role="group" aria-label="Note view">
      <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
        <button type="button" onClick={() => onChange(false)} aria-pressed={!quick} className={`${base} ${!quick ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><BookOpen className="h-4 w-4" aria-hidden /> Full note</button>
        <button type="button" onClick={() => onChange(true)} aria-pressed={quick} className={`${base} ${quick ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><Zap className="h-4 w-4" aria-hidden /> Quick revision</button>
      </div>
      {quick && <span className="text-xs text-muted-foreground">Headings, key bullets and tables only. Switch back for the full explanation.</span>}
    </div>
  );
}
