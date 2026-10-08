import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, Loader2, Shuffle, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Answer } from "@/components/ai/AnswerText";
import UpgradeCard from "@/components/ai/UpgradeCard";
import { FREE_DAILY_PICTURES, countPictures, picturesUsedToday } from "@/lib/ompathAi";
import { SUBJECT_LABEL, loadBanks, pickQuestions, sectionFor, sectionsOf, type Bank, type BankQuestion, type Subject } from "@/lib/questionBank";

const SELECT = "h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm font-semibold outline-none focus:border-primary";
const MISSED_KEY = "ompath_missed_v1";
const MISSED = "__missed__";

const readMissed = (): BankQuestion[] => { try { const v = JSON.parse(localStorage.getItem(MISSED_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeMissed = (list: BankQuestion[]) => { try { localStorage.setItem(MISSED_KEY, JSON.stringify(list.slice(-120))); } catch { /* storage full */ } };

/**
 * Spot questions from the anatomy banks, inside Ompath AI: choose Gross anatomy, Histology or Embryology, narrow to a region or tissue,
 * and get five good questions at a time (ones with pictures first). The picture is shown right here, the answer opens on tap,
 * "Explain" asks the AI to teach it, and questions marked "Missed" are kept so they can be revised later.
 * Free accounts get a daily number of picture questions; the first set is always free.
 */
export default function QuestionDrill({ subject: initialSubject, topic, canReveal, onNeedSubscribe, onOpen, onExplain }: { subject: Subject; topic: string; canReveal: boolean; onNeedSubscribe: () => void; onOpen: (href: string) => void; onExplain: (q: BankQuestion) => void }) {
  const [subject, setSubject] = useState<Subject>(initialSubject);
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [section, setSection] = useState("");
  const [picked, setPicked] = useState<BankQuestion[]>([]);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<BankQuestion[]>(readMissed);
  const [marked, setMarked] = useState<Record<string, "got" | "missed">>({});
  const [blocked, setBlocked] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [, bump] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const myMissed = useMemo(() => missed.filter((q) => banks?.some((b) => b.id === q.bankId)), [missed, banks]);

  const draw = useCallback((b: Bank[], sec: string, counted: boolean, mine: BankQuestion[]) => {
    if (counted && !canReveal && picturesUsedToday() >= FREE_DAILY_PICTURES) { setBlocked(true); return; }
    setBlocked(false);
    const source = sec === MISSED ? [{ id: "missed", title: "Missed", href: "", subject: "gross" as Subject, questions: mine }] : b;
    const next = pickQuestions(source, sec === MISSED ? "" : sec, 5, seen.current);
    next.forEach((q) => seen.current.add(q.id));
    if (counted && !canReveal) countPictures(next.filter((q) => q.image).length);
    setPicked(next); setShown(new Set()); setMarked({}); bump((n) => n + 1);
  }, [canReveal]);

  useEffect(() => {
    let on = true;
    setBanks(null); setPicked([]); seen.current = new Set();
    void loadBanks(subject).then((b) => {
      if (!on) return;
      setBanks(b);
      const sec = first.current ? sectionFor(sectionsOf(b), topic) : "";
      first.current = false;
      setSection(sec);
      // opening the drill is always free; only asking for more is counted
      if (!canReveal && picturesUsedToday() >= FREE_DAILY_PICTURES) setBlocked(true); else draw(b, sec, false, []);
    });
    return () => { on = false; };
  }, [subject, topic, draw, canReveal]);

  const sections = useMemo(() => (banks ? sectionsOf(banks) : []), [banks]);
  const total = useMemo(() => (banks ?? []).reduce((n, b) => n + b.questions.length, 0), [banks]);
  const inSection = section === MISSED ? myMissed.length : sections.find((s) => s.name === section)?.count ?? total;
  const main = banks?.[0];
  const left = Math.max(0, FREE_DAILY_PICTURES - picturesUsedToday());

  const reveal = (q: BankQuestion) => {
    if (!canReveal) { onNeedSubscribe(); return; }
    setShown((s) => { const n = new Set(s); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; });
  };
  const mark = (q: BankQuestion, how: "got" | "missed") => {
    setMarked((m) => ({ ...m, [q.id]: how }));
    const rest = missed.filter((x) => x.question !== q.question || x.bankId !== q.bankId);
    const next = how === "missed" ? [...rest, q] : rest;
    setMissed(next); writeMissed(next);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-3" aria-label="Question drill">
      <div className="flex flex-wrap gap-2">
        <select value={subject} onChange={(e) => { setSubject(e.target.value as Subject); setBlocked(false); }} aria-label="Subject" className={SELECT}>
          {(Object.keys(SUBJECT_LABEL) as Subject[]).map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
        </select>
        <select value={section} onChange={(e) => { setSection(e.target.value); if (banks) { seen.current = new Set(); draw(banks, e.target.value, true, myMissed); } }} aria-label="Section" disabled={!banks} className={SELECT}>
          <option value="">All sections ({total})</option>
          {myMissed.length > 0 && <option value={MISSED}>My missed questions ({myMissed.length})</option>}
          {sections.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
        </select>
      </div>

      {banks === null ? (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Getting the questions…</p>
      ) : blocked ? (
        <div className="mt-3"><UpgradeCard kind="pictures" /></div>
      ) : picked.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">{section === MISSED ? "Nothing missed here. Well done." : `No ${SUBJECT_LABEL[subject].toLowerCase()} questions are on the site yet.`}</p>
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
              {shown.has(q.id) && (
                <div className="mt-2 space-y-2.5">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"><Answer text={q.answer} compact /></div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => mark(q, "got")} aria-pressed={marked[q.id] === "got"} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${marked[q.id] === "got" ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:border-emerald-500"}`}><Check className="h-3.5 w-3.5" /> Got it</button>
                    <button type="button" onClick={() => mark(q, "missed")} aria-pressed={marked[q.id] === "missed"} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${marked[q.id] === "missed" ? "border-destructive bg-destructive text-white" : "border-border hover:border-destructive"}`}><X className="h-3.5 w-3.5" /> Missed it</button>
                    <button type="button" onClick={() => onExplain(q)} className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/10"><Sparkles className="h-3.5 w-3.5" /> Explain</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {banks && !blocked && picked.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => draw(banks, section, true, myMissed)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"><Shuffle className="h-4 w-4" /> 5 more</button>
          {main && section !== MISSED && <button type="button" onClick={() => onOpen(main.href)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-bold hover:border-primary hover:text-primary"><ExternalLink className="h-4 w-4" /> Open the full bank</button>}
          <span className="text-xs text-muted-foreground">{inSection} questions here{!canReveal ? ` · ${left} free picture questions left today` : ""}</span>
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
