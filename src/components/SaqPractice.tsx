import { useEffect, useMemo, useState } from "react";
import { Check, Eye, RotateCcw, Trophy } from "lucide-react";

export type Saq = { question: string; answer: string; marks?: number };

/** The marking key: lines that start with "-", "•" or "1." become tick-able points; anything else is shown as a plain model answer. */
const pointsOf = (answer: string): string[] => {
  const lines = String(answer || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^([-•*]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, ""));
  return bullets.length >= 2 ? bullets : [];
};

type Saved = { text: Record<number, string>; shown: number[]; ticks: Record<number, number[]> };
const load = (key: string): Saved => {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); if (v && v.text && v.shown && v.ticks) return v; } catch { /* a private window starts fresh */ }
  return { text: {}, shown: [], ticks: {} };
};

/** Short-answer practice: write your answer, reveal the marking key, tick the points you covered, and see your mark. */
export default function SaqPractice({ id, questions }: { id: string; questions: Saq[] }) {
  const key = `saq-practice:${id}`;
  const [state, setState] = useState<Saved>(() => load(key));
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* the page still works without saving */ } }, [key, state]);

  const rows = useMemo(() => questions.map((q) => { const pts = pointsOf(q.answer); return { q, pts, marks: pts.length || Number(q.marks) || 0 }; }), [questions]);
  const shown = new Set(state.shown);
  const earned = (i: number) => (state.ticks[i] ?? []).length;
  const markable = rows.filter((r) => r.pts.length);
  const doneRows = markable.filter((_, k) => shown.has(rows.indexOf(markable[k])));
  const totalMarks = doneRows.reduce((n, r) => n + r.marks, 0);
  const totalEarned = rows.reduce((n, r, i) => n + (shown.has(i) && r.pts.length ? earned(i) : 0), 0);
  const pct = totalMarks ? Math.round((100 * totalEarned) / totalMarks) : 0;
  const finished = rows.length > 0 && rows.every((_, i) => shown.has(i));

  const setText = (i: number, v: string) => setState((s) => ({ ...s, text: { ...s.text, [i]: v } }));
  const reveal = (i: number) => setState((s) => (s.shown.includes(i) ? s : { ...s, shown: [...s.shown, i] }));
  const toggle = (i: number, p: number) => setState((s) => {
    const cur = new Set(s.ticks[i] ?? []); cur.has(p) ? cur.delete(p) : cur.add(p);
    return { ...s, ticks: { ...s.ticks, [i]: [...cur] } };
  });
  const reset = () => setState({ text: {}, shown: [], ticks: {} });

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-1 mb-4 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur sm:top-16">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">{shown.size} of {rows.length} answered</span>
          <span className="flex items-center gap-3">
            {totalMarks > 0 && <span className="font-bold text-primary">{totalEarned}/{totalMarks} marks · {pct}%</span>}
            {state.shown.length > 0 && <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restart</button>}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={shown.size}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${rows.length ? (100 * shown.size) / rows.length : 0}%` }} />
        </div>
      </div>

      <ol className="space-y-4">
        {rows.map((r, i) => {
          const open = shown.has(i);
          const got = earned(i);
          return (
            <li key={i} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                <p className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug">{r.q.question}</p>
                {r.marks > 0 && <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold">{r.marks} marks</span>}
              </div>

              <textarea
                value={state.text[i] ?? ""}
                onChange={(e) => setText(i, e.target.value)}
                rows={open ? 3 : 5}
                placeholder="Write your answer here, as you would in the exam. Then check it against the marking key."
                aria-label={`Your answer to question ${i + 1}`}
                className="mt-3 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-primary"
              />

              {!open && (
                <button type="button" onClick={() => reveal(i)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">
                  <Eye className="h-4 w-4" aria-hidden /> Show marking key
                </button>
              )}

              {open && r.pts.length > 0 && (
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Marking key: tick every point you covered</p>
                  <ul className="mt-2 space-y-1.5">
                    {r.pts.map((p, k) => {
                      const on = (state.ticks[i] ?? []).includes(k);
                      return (
                        <li key={k}>
                          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm leading-snug transition-colors ${on ? "border-emerald-500/50 bg-emerald-500/10" : "border-transparent hover:bg-muted"}`}>
                            <input type="checkbox" checked={on} onChange={() => toggle(i, k)} className="sr-only" />
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background"}`} aria-hidden>{on && <Check className="h-3.5 w-3.5" />}</span>
                            <span>{p}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-sm font-bold">You scored {got}/{r.marks}</p>
                </div>
              )}

              {open && r.pts.length === 0 && (
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Model answer</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.q.answer}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {finished && totalMarks > 0 && (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <Trophy className="h-8 w-8 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-serif text-xl font-bold">{totalEarned} / {totalMarks} marks ({pct}%)</p>
            <p className="text-sm text-muted-foreground">{pct >= 70 ? "Strong. You are ready for this topic." : pct >= 50 ? "A pass, but revise the points you missed." : "Revise the note, then try again."}</p>
          </div>
        </div>
      )}
    </div>
  );
}
