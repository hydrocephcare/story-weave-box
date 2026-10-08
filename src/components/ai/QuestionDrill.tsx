import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, Shuffle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Answer } from "@/components/ai/AnswerText";
import { SUBJECT_LABEL, loadBanks, pickQuestions, sectionFor, sectionsOf, type Bank, type BankQuestion, type Subject } from "@/lib/questionBank";

const SELECT = "h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm font-semibold outline-none focus:border-primary";

/**
 * Spot questions from the anatomy banks, inside Ompath AI: choose Gross anatomy, Histology or Embryology, narrow to a region or tissue,
 * and get five good questions at a time (ones with pictures first). The picture is shown right here and the answer opens on tap.
 */
export default function QuestionDrill({ subject: initialSubject, topic, canReveal, onNeedSubscribe, onOpen }: { subject: Subject; topic: string; canReveal: boolean; onNeedSubscribe: () => void; onOpen: (href: string) => void }) {
  const [subject, setSubject] = useState<Subject>(initialSubject);
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [section, setSection] = useState("");
  const [picked, setPicked] = useState<BankQuestion[]>([]);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const draw = useCallback((b: Bank[], sec: string) => {
    const next = pickQuestions(b, sec, 5, seen.current);
    next.forEach((q) => seen.current.add(q.id));
    setPicked(next); setShown(new Set());
  }, []);

  useEffect(() => {
    let on = true;
    setBanks(null); setPicked([]); seen.current = new Set();
    void loadBanks(subject).then((b) => {
      if (!on) return;
      setBanks(b);
      const sec = first.current ? sectionFor(sectionsOf(b), topic) : "";
      first.current = false;
      setSection(sec);
      draw(b, sec);
    });
    return () => { on = false; };
  }, [subject, topic, draw]);

  const sections = useMemo(() => (banks ? sectionsOf(banks) : []), [banks]);
  const total = useMemo(() => (banks ?? []).reduce((n, b) => n + b.questions.length, 0), [banks]);
  const inSection = sections.find((s) => s.name === section)?.count ?? total;
  const main = banks?.[0];

  const reveal = (q: BankQuestion) => {
    if (!canReveal) { onNeedSubscribe(); return; }
    setShown((s) => { const n = new Set(s); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-3" aria-label="Question drill">
      <div className="flex flex-wrap gap-2">
        <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} aria-label="Subject" className={SELECT}>
          {(Object.keys(SUBJECT_LABEL) as Subject[]).map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
        </select>
        <select value={section} onChange={(e) => { setSection(e.target.value); if (banks) { seen.current = new Set(); draw(banks, e.target.value); } }} aria-label="Section" disabled={!banks} className={SELECT}>
          <option value="">All sections ({total})</option>
          {sections.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
        </select>
      </div>

      {banks === null ? (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Getting the questions…</p>
      ) : picked.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">No {SUBJECT_LABEL[subject].toLowerCase()} questions are on the site yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {picked.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-border bg-background p-3">
              <p className="text-sm font-semibold leading-snug"><span className="mr-1.5 text-primary">{i + 1}.</span>{q.question}</p>
              {q.image && (
                <button type="button" onClick={() => setZoom({ src: q.image!, alt: q.imageAlt ?? q.question })} className="mt-2 block w-full overflow-hidden rounded-lg border border-border bg-muted" aria-label="Enlarge the picture">
                  <img src={q.image} alt={q.imageAlt ?? ""} loading="lazy" decoding="async" className="mx-auto max-h-72 w-full object-contain" />
                </button>
              )}
              <button type="button" onClick={() => reveal(q)} aria-expanded={shown.has(q.id)} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
                {shown.has(q.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {shown.has(q.id) ? "Hide answer" : canReveal ? "Reveal answer" : "Reveal (subscribers)"}
              </button>
              {shown.has(q.id) && <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"><Answer text={q.answer} compact /></div>}
            </li>
          ))}
        </ol>
      )}

      {banks && picked.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => draw(banks, section)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"><Shuffle className="h-4 w-4" /> 5 more</button>
          {main && <button type="button" onClick={() => onOpen(main.href)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-bold hover:border-primary hover:text-primary"><ExternalLink className="h-4 w-4" /> Open the full bank</button>}
          <span className="text-xs text-muted-foreground">{inSection} questions here</span>
        </div>
      )}

      <Dialog open={Boolean(zoom)} onOpenChange={(o) => { if (!o) setZoom(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-auto p-2 sm:p-4">
          <DialogTitle className="sr-only">Picture</DialogTitle>
          <DialogDescription className="sr-only">{zoom?.alt}</DialogDescription>
          {zoom && <img src={zoom.src} alt={zoom.alt} className="mx-auto max-h-[80dvh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
