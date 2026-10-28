import { useEffect, useMemo, useState } from "react";
import { useScopedYear, yearOfCategory } from "@/hooks/useMyYear";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildMcqPath } from "@/lib/store";
import { Skeleton } from "@/components/ui/skeleton";

type Mistake = { set_id: string; set_title: string; set_slug: string | null; category: string; idx: number; question: string; selected: number; correct: number; options: string[] | null; explanation: string | null; at: string };

/** /mistakes: every question the student's latest attempt got wrong, with the right answer and the explanation. */
export default function MyMistakes() {
  const [items, setItems] = useState<Mistake[] | null | undefined>(undefined);
  const [unit, setUnit] = useState("");
  const { year } = useScopedYear();
  const [done, setDone] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mistakes-understood") || "[]")); } catch { return new Set(); }
  });
  useEffect(() => {
    let on = true;
    void Promise.resolve((supabase as any).rpc("my_mistakes", { p_limit: 100 })).then(({ data }: { data: Mistake[] | null }) => { if (on) setItems(data ?? null); }, () => { if (on) setItems(null); });
    return () => { on = false; };
  }, []);

  const key = (m: Mistake) => `${m.set_id}:${m.idx}`;
  const mark = (m: Mistake) => setDone((prev) => {
    const next = new Set(prev); next.add(key(m));
    try { localStorage.setItem("mistakes-understood", JSON.stringify([...next])); } catch { /* the list still updates on screen */ }
    return next;
  });
  const open = useMemo(() => (items ?? []).filter((m) => !done.has(key(m)) && (!year || yearOfCategory(m.category) === year)), [items, done, year]);
  const units = useMemo(() => [...new Set(open.map((m) => m.category))].sort(), [open]);
  const shown = open.filter((m) => !unit || m.category === unit);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>My mistakes | Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">My mistakes</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Questions you last got wrong, with the right answer and why. Answer one correctly again and it leaves this list. <Link to="/performance" className="font-bold text-primary hover:underline">See your scores</Link></p>

      {items === undefined && <div className="mt-8 space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>}
      {items === null && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sign in and answer some MCQs, and the ones you miss will collect here.</p>}
      {items && open.length === 0 && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nothing to fix right now. Well done.</p>}

      {open.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold">{open.length} to review</span>
          {units.length > 1 && (
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold">
              <option value="">All units</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
        </div>
      )}

      <ul className="mt-4 space-y-4">
        {shown.map((m) => (
          <li key={key(m)} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{m.category}</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug">{m.question}</p>
            {Array.isArray(m.options) && (
              <ul className="mt-3 space-y-1.5">
                {m.options.map((o, i) => {
                  const right = i === m.correct, wrong = i === m.selected && !right;
                  return (
                    <li key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${right ? "border-emerald-500/50 bg-emerald-500/10" : wrong ? "border-rose-500/50 bg-rose-500/10" : "border-border"}`}>
                      {right ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct answer" /> : wrong ? <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Your answer" /> : <span className="w-4 shrink-0" />}
                      <span>{o}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {m.explanation && <p className="mt-3 rounded-lg bg-primary/5 p-3 text-sm"><strong>Why:</strong> {m.explanation}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Link to={buildMcqPath({ id: m.set_id, title: m.set_title, slug: m.set_slug })} className="font-bold text-primary hover:underline">Practise this set</Link>
              <button type="button" onClick={() => mark(m)} className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary">I understand this</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
