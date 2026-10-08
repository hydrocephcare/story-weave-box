import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Shuffle } from "lucide-react";
import { Answer } from "@/components/ai/AnswerText";
import UpgradeCard from "@/components/ai/UpgradeCard";
import { spendFreeReveal } from "@/lib/ompathAi";
import { findEssays, type EssayQuestion } from "@/lib/ompathAiTools";
import { reportAiFailure } from "@/lib/aiHealth";

/** Essay and short-answer questions from the site, five at a time. The model answer stays hidden until you tap; the first few a day are free. */
export default function EssayPractice({ topic, year, canReveal }: { topic: string; year: number | null; canReveal: boolean }) {
  const [all, setAll] = useState<EssayQuestion[] | null>(null);
  const [shown, setShown] = useState<EssayQuestion[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [needPay, setNeedPay] = useState<string | null>(null);
  const at = useRef(0);
  const [base, setBase] = useState(0); // position of the first question shown, so the numbers keep counting
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  const next = (list: EssayQuestion[]) => { const from = at.current >= list.length ? 0 : at.current; setShown(list.slice(from, from + 5)); setBase(from); at.current = from + 5; setOpen(new Set()); setNeedPay(null); };
  useEffect(() => { let on = true; void findEssays(topic, year).then((l) => { if (!on) return; setAll(l); at.current = 0; next(l); }, (e) => { void reportAiFailure("essay", topic, e, "Empty essay message"); if (on) setAll([]); }); return () => { on = false; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [topic, year]);

  if (all === null) return <p className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Finding essay questions…</p>;
  if (!all.length) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">I could not find essay questions on “{topic}” yet. Try the unit name, for example “GIT physiology”.</p>;

  const toggle = (q: EssayQuestion) => {
    if (!open.has(q.id) && !canReveal && !spendFreeReveal("essay", q.id)) { setNeedPay(q.id); return; }
    setNeedPay(null);
    setOpen((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; });
  };

  return (
    <section className="space-y-3" aria-label="Essay practice">
      <ol ref={listRef} className="space-y-3" style={{ scrollMarginTop: 8 }}>
        {shown.map((q, i) => (
          <li key={q.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{q.kind}</span>
              {q.marks && <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-foreground/70">{q.marks} marks</span>}
              <span className="truncate font-medium text-muted-foreground">{q.category.replace(/^Weekly Exam:\s*/i, "")}</span>
            </div>
            <p className="text-sm font-semibold leading-snug"><span className="mr-1.5 text-primary">{base + i + 1}.</span>{q.question}</p>
            <button type="button" onClick={() => toggle(q)} aria-expanded={open.has(q.id)} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
              {open.has(q.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{open.has(q.id) ? "Hide model answer" : "Reveal model answer"}
            </button>
            {needPay === q.id && <div className="mt-2.5"><UpgradeCard kind="answers" /></div>}
            {open.has(q.id) && <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"><Answer text={q.answer} compact /></div>}
          </li>
        ))}
      </ol>
      {all.length > 5 && <button type="button" disabled={busy} aria-busy={busy} onClick={() => { if (busy) return; setBusy(true); window.setTimeout(() => { next(all); setBusy(false); window.setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }, 450); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-80">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />} {busy ? "Loading…" : "5 more"}</button>}
    </section>
  );
}
