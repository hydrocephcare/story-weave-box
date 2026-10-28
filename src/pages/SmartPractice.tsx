import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyYear, yearOfCategory } from "@/hooks/useMyYear";
import { Skeleton } from "@/components/ui/skeleton";
import QuizRunner, { toItems, type QItem } from "@/components/QuizRunner";

type Perf = { units: { category: string; answered: number; correct: number }[] } | null;
type Mistake = { set_id: string; idx: number; question: string; correct: number; options: string[] | null; explanation: string | null; category: string };
const SIZE = 10;
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** /smart-practice: ten questions built from the student's own mistakes and weakest units. */
export default function SmartPractice() {
  const { user } = useAuth();
  const { year } = useMyYear();
  const [items, setItems] = useState<QItem[] | null | undefined>(undefined);
  const [why, setWhy] = useState("");
  const [result, setResult] = useState<{ score: number; wrong: QItem[] } | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let on = true;
    setItems(undefined); setResult(null);
    void (async () => {
      const db = supabase as any;
      const [perfRes, misRes] = await Promise.all([db.rpc("my_performance"), db.rpc("my_mistakes", { p_limit: 40 })]);
      const perf = perfRes.data as Perf, mistakes = ((misRes.data ?? []) as Mistake[]).filter((m) => !year || yearOfCategory(m.category) === year);
      const picked: QItem[] = shuffle(mistakes)
        .filter((m) => Array.isArray(m.options) && m.options.length >= 2)
        .slice(0, 5)
        .map((m) => ({ key: `${m.set_id}:${m.idx}`, setId: m.set_id, idx: m.idx, question: m.question, options: m.options as string[], correct: m.correct, explanation: m.explanation ?? undefined, category: m.category }));
      const seen = new Set(picked.map((p) => p.key));
      const weak = (perf?.units ?? []).filter((u) => (!year || yearOfCategory(u.category) === year) && u.answered >= 5).map((u) => ({ category: u.category, pct: u.correct / u.answered })).sort((a, b) => a.pct - b.pct).slice(0, 3);
      for (const w of weak) {
        if (picked.length >= SIZE) break;
        const { data } = await db.from("mcq_sets").select("id,category,questions").eq("published", true).is("deleted_at", null).eq("category", w.category).limit(6);
        const pool = shuffle<QItem>(((data ?? []) as { id: string; category: string; questions: unknown }[]).flatMap((st) => toItems(st.id, st.category, st.questions))).filter((q) => !seen.has(q.key));
        for (const q of pool) { if (picked.length >= SIZE) break; seen.add(q.key); picked.push(q); }
      }
      // a student with little history yet still gets ten questions: top up from that year's own MCQ sets
      if (picked.length < SIZE && year) {
        const { data } = await db.from("mcq_sets").select("id,category,questions").eq("published", true).is("deleted_at", null).ilike("category", `Year ${year}:%`).limit(12);
        const pool = shuffle<QItem>(((data ?? []) as { id: string; category: string; questions: unknown }[]).flatMap((st) => toItems(st.id, st.category, st.questions))).filter((q) => !seen.has(q.key));
        for (const q of pool) { if (picked.length >= SIZE) break; seen.add(q.key); picked.push(q); }
      }
      if (!on) return;
      setWhy(weak.length ? `Built from your mistakes and your weakest units: ${weak.map((w) => w.category).join(", ")}.` : mistakes.length ? "Built from questions you got wrong." : "");
      setItems(picked.length ? shuffle(picked) : null);
    })().catch(() => on && setItems(null));
    return () => { on = false; };
  }, [round, year]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>Smart practice | Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl font-bold sm:text-4xl"><Sparkles className="h-7 w-7 text-primary" aria-hidden /> Smart practice</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ten questions picked for you{year ? ` from Year ${year}` : ""}: the ones you missed, plus your weakest units. {why}</p>

      {!user && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sign in and answer some MCQs first. Smart practice learns from your answers. <Link to="/login" className="font-bold text-primary hover:underline">Sign in</Link></p>}
      {user && items === undefined && <div className="mt-8 space-y-3"><Skeleton className="h-6 w-full" /><Skeleton className="h-64 w-full" /></div>}
      {user && items === null && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nothing to build from yet. Answer a few questions in <Link to="/mcqs" className="font-bold text-primary hover:underline">MCQs</Link>, then come back.</p>}

      {user && items && !result && <div className="mt-6"><QuizRunner key={round} items={items} onDone={(score, wrong) => setResult({ score, wrong })} /></div>}

      {result && items && (
        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <Trophy className="mx-auto h-9 w-9 text-primary" aria-hidden />
          <p className="mt-2 font-serif text-3xl font-bold">{result.score} / {items.length}</p>
          <p className="text-sm text-muted-foreground">{result.score >= 8 ? "Excellent. These topics are getting solid." : result.score >= 5 ? "Good progress. Review what you missed." : "Keep going: every miss is saved to your notebook."}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setRound((r) => r + 1)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">Another ten</button>
            <Link to="/mistakes" className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary">My mistakes</Link>
            <Link to="/performance" className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary">My performance</Link>
            <Link to="/challenge" className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary">Challenge a friend</Link>
          </div>
        </div>
      )}
    </main>
  );
}
