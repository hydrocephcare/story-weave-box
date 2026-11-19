import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight, Eye, EyeOff, Loader2, RotateCcw, Lock, Clock, Pause, Play } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OmpathMark from "@/components/ai/OmpathMark";
import { Helmet } from "react-helmet-async";
import { trackAnswer } from "@/lib/answer-tracker";
import { trackEngagement } from "@/lib/analytics";
import { openAI } from "@/lib/aiEvents";
import { isExamLike, resolveMcqSet, shuffleOptions, type McqSetRow } from "@/lib/mcqSet";
import { examUnit, examYear, shortTitle } from "@/lib/examMeta";
import { resourceSeoTitle } from "@/lib/resourceSeoTitle";
import { getSetting } from "@/lib/store";
import { useAccess } from "@/lib/access";
import { Paywall } from "@/components/Paywall";

const LETTERS = "ABCDEF";
const mixOrder = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
type PracticeSnapshot = {
  qs?: McqSetRow["questions"];
  first?: [number, number][];
  wrong?: [number, number[]][];
  solved?: number[];
  shown?: number[];
  timerMinutes?: number;
  timerStatus?: "idle" | "running" | "paused" | "finished";
  remainingSeconds?: number | null;
  timerEndsAt?: number | null;
  sessionStartedAt?: number | null;
};
const practiceKey = (id: string) => `ompath_mcq_session_${id}`;
function loadPractice(id: string): PracticeSnapshot {
  try { const value = JSON.parse(localStorage.getItem(practiceKey(id)) || "null"); return value && typeof value === "object" ? value : {}; }
  catch { return {}; }
}
function savePractice(id: string, value: PracticeSnapshot) {
  try { localStorage.setItem(practiceKey(id), JSON.stringify(value)); } catch { /* device storage may be unavailable */ }
}
type PracticeRecord = { id: string; score: number; attempted: number; total: number; durationSeconds: number; timerMinutes: number | null; completedAt: number; };
function loadPracticeHistory(id: string): PracticeRecord[] {
  try { const v = JSON.parse(localStorage.getItem(`ompath_mcq_history_${id}`) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

/**
 * A question bank as a reading page. A wrong choice is marked and you may try again; the answer opens when you get it right or tap "Show answer".
 * Your score counts the first try only, so retrying teaches without inflating it.
 */
function Bank({ set }: { set: McqSetRow }) {
  const [qs, setQs] = useState(() => loadPractice(set.id).qs || set.questions);
  const access = useAccess();
  const [mcqPaywallEnabled, setMcqPaywallEnabled] = useState(false);
  const [freeRatio, setFreeRatio] = useState(0.25);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const freeLimit = Math.min(qs.length, Math.max(1, Math.ceil(qs.length * freeRatio)));
  useEffect(() => {
    let active = true;
    Promise.all([getSetting("mcq_paywall_enabled"), getSetting("paywall_free_ratio"), getSetting("mcq_paywall_excluded_ids")]).then(([enabled, ratio, excluded]) => {
      if (!active) return;
      setMcqPaywallEnabled(enabled === "true");
      const parsed = Number(ratio);
      setFreeRatio(Number.isFinite(parsed) ? Math.min(0.9, Math.max(0.05, parsed)) : 0.25);
      try { const ids = JSON.parse(excluded || "[]"); setExcludedIds(Array.isArray(ids) ? ids.map(String) : []); } catch { setExcludedIds([]); }
    }).catch(() => { if (active) setMcqPaywallEnabled(false); });
    return () => { active = false; };
  }, []);
  const isLocked = (index: number) => mcqPaywallEnabled && !access.isFree && !excludedIds.includes(set.id) && !excludedIds.includes(set.slug || "") && index >= freeLimit && !access.hasPass && !access.isAdmin;   // Reset mixes the questions and their options again, so positions cannot be memorised
  const [first, setFirst] = useState<Map<number, number>>(() => new Map(loadPractice(set.id).first || []));          // the first choice made on each question (this is what is scored)
  const [wrong, setWrong] = useState<Map<number, number[]>>(() => new Map(loadPractice(set.id).wrong || []));        // wrong choices already tried, per question
  const [solved, setSolved] = useState<Set<number>>(() => new Set(loadPractice(set.id).solved || []));               // answered correctly (on any try)
  const [shown, setShown] = useState<Set<number>>(() => new Set(loadPractice(set.id).shown || []));                 // answer revealed without solving
  const [only, setOnly] = useState<"all" | "missed">("all");
  const [panelOpen, setPanelOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const restored = useRef(loadPractice(set.id));
  const [timerMinutes, setTimerMinutes] = useState(() => Math.max(1, Math.min(240, Number(restored.current.timerMinutes) || 10)));
  const [timerStatus, setTimerStatus] = useState<"idle" | "running" | "paused" | "finished">(() => restored.current.timerStatus || "idle");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => restored.current.remainingSeconds ?? null);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(() => restored.current.timerEndsAt ?? null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(() => restored.current.sessionStartedAt ?? null);
  const [history, setHistory] = useState<PracticeRecord[]>(() => loadPracticeHistory(set.id));
  const savedRecordForSession = useRef(false);

  const pick = useCallback((i: number, oi: number) => {
    if (isLocked(i) || timerStatus === "finished") return;
    if (solved.has(i) || shown.has(i) || (wrong.get(i) ?? []).includes(oi)) return;
    const q = qs[i];
    if (!sessionStartedAt) setSessionStartedAt(Date.now());
    if (!first.has(i)) {
      setFirst((m) => new Map(m).set(i, oi));
      void trackAnswer({ mcq_set_id: set.id, question_index: i, question_text: q.question, selected_answer: oi, correct_answer: q.correct_answer, is_correct: oi === q.correct_answer }).catch(() => {});
      void trackEngagement("mcq_answer", { course: set.category, resource_type: "mcq", correct: oi === q.correct_answer });
    }
    if (oi === q.correct_answer) setSolved((s) => new Set(s).add(i));
    else setWrong((m) => new Map(m).set(i, [...(m.get(i) ?? []), oi]));
  }, [solved, shown, wrong, first, qs, set.id, mcqPaywallEnabled, freeLimit, access.hasPass, access.isAdmin, sessionStartedAt, timerStatus]);

  const done = new Set([...solved, ...shown]);
  const answered = done.size;
  const correct = [...first].filter(([i, oi]) => qs[i].correct_answer === oi).length;
  const missed = qs.map((_, i) => i).filter((i) => done.has(i) && !(first.get(i) !== undefined && first.get(i) === qs[i].correct_answer));
  const tried = first.size;
  const pct = tried ? Math.round((correct / tried) * 100) : 0;
  const finished = answered === qs.length;
  const timedOut = timerStatus === "finished";
  const attemptFinished = finished || timedOut;
  const elapsedSeconds = timerStatus === "running" && timerEndsAt ? Math.max(0, timerMinutes * 60 - Math.ceil((timerEndsAt - Date.now()) / 1000)) : timerStatus === "paused" || timerStatus === "finished" ? Math.max(0, timerMinutes * 60 - (remainingSeconds ?? 0)) : 0;

  useEffect(() => {
    if (timerStatus !== "running" || !timerEndsAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) { setTimerStatus("finished"); setTimerEndsAt(null); }
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [timerStatus, timerEndsAt]);

  const remainingToSave = timerStatus === "running" ? null : remainingSeconds;
  useEffect(() => {
    savePractice(set.id, { qs, first: [...first], wrong: [...wrong], solved: [...solved], shown: [...shown], timerMinutes, timerStatus, remainingSeconds: remainingToSave, timerEndsAt, sessionStartedAt });
  }, [set.id, qs, first, wrong, solved, shown, timerMinutes, timerStatus, remainingToSave, timerEndsAt, sessionStartedAt]);

  useEffect(() => {
    if (!attemptFinished || savedRecordForSession.current) return;
    const recordId = `${set.id}-${sessionStartedAt || "untimed"}`;
    if (loadPracticeHistory(set.id).some((item) => item.id === recordId)) { savedRecordForSession.current = true; return; }
    savedRecordForSession.current = true;
    const record: PracticeRecord = {
      id: recordId,
      score: correct,
      attempted: tried,
      total: qs.length,
      durationSeconds: elapsedSeconds,
      timerMinutes: timerStatus === "idle" ? null : timerMinutes,
      completedAt: Date.now(),
    };
    const next = [record, ...loadPracticeHistory(set.id)].slice(0, 20);
    try { localStorage.setItem(`ompath_mcq_history_${set.id}`, JSON.stringify(next)); } catch { /* best effort */ }
    setHistory(next);
  }, [attemptFinished, set.id, sessionStartedAt, correct, tried, qs.length, elapsedSeconds, timerStatus, timerMinutes]);

  const startTimer = () => {
    const now = Date.now();
    const left = timerStatus === "paused" && remainingSeconds !== null ? remainingSeconds : timerMinutes * 60;
    setRemainingSeconds(left);
    setTimerEndsAt(now + left * 1000);
    setSessionStartedAt(sessionStartedAt || now);
    setTimerStatus("running");
    savedRecordForSession.current = false;
  };
  const pauseTimer = () => {
    if (!timerEndsAt) return;
    setRemainingSeconds(Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
    setTimerEndsAt(null);
    setTimerStatus("paused");
  };
  const resetAttempt = () => {
    savedRecordForSession.current = false;
    setQs((cur) => shuffleOptions(mixOrder(cur), String(Math.random())));
    setFirst(new Map()); setWrong(new Map()); setSolved(new Set()); setShown(new Set()); setOnly("all");
    setTimerStatus("idle"); setRemainingSeconds(null); setTimerEndsAt(null); setSessionStartedAt(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const formatClock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  useEffect(() => {
    if (!finished) return;
    try { localStorage.setItem(`mcq_practice_${set.id}`, JSON.stringify({ score: correct, total: qs.length, at: Date.now() })); } catch { /* storage blocked */ }
  }, [finished, correct, qs.length, set.id]);
  const indices = qs.map((_, i) => i).filter((i) => only === "all" || missed.includes(i));
  const lockedCount = qs.filter((_, i) => isLocked(i)).length;
  const unit = examUnit(set.category), year = examYear(set.category, set.title), title = shortTitle(set.title, set.category);
  const reveal = (i: number) => { if (!sessionStartedAt) setSessionStartedAt(Date.now()); setShown((s) => new Set(s).add(i)); };
  const allShown = shown.size === qs.length;

  const progress = (
    <div>
          <div className="flex items-baseline justify-between"><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Progress</p><p className="text-sm font-bold tabular-nums">{answered}/{qs.length}</p></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
          <p className="mt-2 text-sm text-muted-foreground">{tried ? <><strong className={pct >= 60 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}>{pct}%</strong> right first time</> : "Not started"}</p>
          <div className="mt-3 grid grid-cols-8 gap-1 lg:grid-cols-5">
            {qs.map((q, i) => {
              const f = first.get(i);
              const cls = !done.has(i) ? ((wrong.get(i) ?? []).length ? "text-rose-500" : "text-muted-foreground hover:text-foreground") : f === q.correct_answer ? "bg-emerald-500 text-white" : "bg-rose-500 text-white";
              return <a key={i} href={`#q${i + 1}`} onClick={() => setPanelOpen(false)} className={`flex h-8 items-center justify-center rounded-md text-xs font-bold ${cls}`}>{i + 1}</a>;
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs font-bold">
            <button type="button" onClick={() => setShown(allShown ? new Set() : new Set(qs.map((_, i) => i).filter((i) => !isLocked(i))))} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">{allShown ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />} {allShown ? "Hide all" : "Reveal all"}</button>
            <button type="button" onClick={resetAttempt} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Start over</button>
          </div>
    </div>
  );
  const tone = !tried ? "bg-muted text-foreground" : pct >= 70 ? "bg-emerald-500 text-white" : pct >= 40 ? "bg-amber-500 text-white" : "bg-rose-500 text-white";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:pt-8">
      {/* phone: progress lives in a tab on the left edge; tap it to slide the panel out (no block above the questions) */}
      <button type="button" onClick={() => setPanelOpen(true)} aria-label={`Progress: ${answered} of ${qs.length} answered. Tap for details.`} className={`fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-xl px-1.5 py-3 text-[11px] font-extrabold tabular-nums shadow-md lg:hidden ${tone}`} style={{ writingMode: "vertical-rl" }}>
        {answered}/{qs.length}{tried ? ` · ${pct}%` : ""}
      </button>
      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl gap-0 overflow-y-auto rounded-2xl border-border bg-background p-0 sm:w-[calc(100%-2rem)]">
          <DialogHeader className="border-b border-border px-5 py-4 text-left sm:px-7">
            <DialogTitle className="font-serif text-xl font-bold sm:text-2xl">Unlock this question bank</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">{lockedCount} locked questions in “{title}”. Choose a plan or redeem an access code. Your current page and progress will be preserved.</DialogDescription>
          </DialogHeader>
          <div className="p-3 sm:p-5">
            <Paywall settings={access.settings} hiddenCount={lockedCount} label="MCQ bank" onUnlocked={(pass) => { access.applyPass(pass); setUnlockOpen(false); }} headline={`Unlock ${lockedCount} questions`} blurb={`Get access to all ${qs.length} questions in this bank, including answers and explanations.`} />
          </div>
        </DialogContent>
      </Dialog>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto">
          <SheetHeader className="text-left"><SheetTitle className="font-serif">Your progress</SheetTitle><SheetDescription>{title}</SheetDescription></SheetHeader>
          <div className="mt-4">{progress}</div>
        </SheetContent>
      </Sheet>
      <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/mcqs" className="hover:text-foreground">MCQ Library</Link>
        {year && <><ChevronRight className="h-3.5 w-3.5" aria-hidden /><Link to={`/mcqs?year=Year ${year}`} className="hover:text-foreground">Year {year}</Link></>}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden /><Link to={`/mcqs?${year ? `year=Year ${year}&` : ""}unit=${encodeURIComponent(unit)}`} className="hover:text-foreground">{unit}</Link>
      </nav>
      <h1 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{qs.length} questions · pick an answer; retry wrong choices · optional practice timer</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          {progress}
        </aside>

        <div className="min-w-0">
          <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-label="Practice timer">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Clock className="h-5 w-5" /></span>
                <div><p className="text-sm font-bold">Practice timer</p><p className="text-xs text-muted-foreground">Optional · track your answering speed</p></div>
              </div>
              <div className="text-right"><p className={`font-mono text-2xl font-bold tabular-nums ${timerStatus === "finished" ? "text-destructive" : "text-foreground"}`}>{timerStatus === "idle" ? formatClock(timerMinutes * 60) : formatClock(remainingSeconds ?? 0)}</p><p className="text-[11px] text-muted-foreground">{timerStatus === "running" ? "Time remaining" : timerStatus === "paused" ? "Paused" : timerStatus === "finished" ? "Time is up" : "Set your time limit"}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">Minutes
                <input type="number" min={1} max={240} step={1} disabled={timerStatus === "running" || timerStatus === "finished"} value={timerMinutes} onChange={(e) => setTimerMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </label>
              {timerStatus === "idle" && <button type="button" onClick={startTimer} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"><Play className="h-4 w-4" /> Start</button>}
              {timerStatus === "running" && <button type="button" onClick={pauseTimer} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"><Pause className="h-4 w-4" /> Pause</button>}
              {timerStatus === "paused" && <button type="button" onClick={startTimer} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"><Play className="h-4 w-4" /> Resume</button>}
              {(timerStatus === "paused" || timerStatus === "finished") && <button type="button" onClick={() => { setTimerStatus("idle"); setRemainingSeconds(null); setTimerEndsAt(null); setSessionStartedAt(null); savedRecordForSession.current = false; }} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Reset timer</button>}
            </div>
            {timerStatus !== "idle" && <p className="mt-3 text-xs text-muted-foreground">{tried} answered · {elapsedSeconds ? (elapsedSeconds / 60).toFixed(1) : "0.0"} min elapsed · {elapsedSeconds > 0 ? (tried / (elapsedSeconds / 60)).toFixed(1) : "0.0"} questions/min</p>}
            {timerStatus === "finished" && <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-sm font-bold">Time is up — your practice result</p><div className="mt-2 grid grid-cols-3 gap-2 text-center"><div><p className="text-xl font-bold tabular-nums">{correct}/{tried || 0}</p><p className="text-[10px] uppercase text-muted-foreground">Correct</p></div><div><p className="text-xl font-bold tabular-nums">{tried}/{qs.length}</p><p className="text-[10px] uppercase text-muted-foreground">Attempted</p></div><div><p className="text-xl font-bold tabular-nums">{tried && elapsedSeconds ? (tried / (elapsedSeconds / 60)).toFixed(1) : "0.0"}</p><p className="text-[10px] uppercase text-muted-foreground">Questions/min</p></div></div><p className="mt-2 text-xs text-muted-foreground">Your answers and result are saved on this device. Start over to begin another attempt.</p></div>}
            {history.length > 0 && <details className="mt-3 border-t border-border pt-3"><summary className="cursor-pointer text-xs font-bold text-muted-foreground">Previous attempts ({history.length})</summary><div className="mt-2 space-y-2">{history.slice(0,5).map((record) => <div key={record.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs"><span className="min-w-0 truncate">{new Date(record.completedAt).toLocaleString()}</span><span className="shrink-0 font-bold tabular-nums">{record.score}/{record.total} · {record.durationSeconds ? formatClock(record.durationSeconds) : "Untimed"}</span></div>)}</div></details>}
          </section>
          {missed.length > 0 && (
            <div className="mb-4 flex gap-4 text-sm font-bold" role="group" aria-label="Show">
              {(["all", "missed"] as const).map((k) => <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={only === k ? "text-primary underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>{k === "all" ? "All questions" : `Missed first time (${missed.length})`}</button>)}
            </div>
          )}
          {(() => {
            const lockedIndices = indices.filter((index) => isLocked(index));
            const firstLockedIndex = lockedIndices[0];
            const visibleLockedQuestions = lockedIndices.map((index) => ({ index, question: qs[index] }));
            return indices.map((i) => {
              const q = qs[i];
              const tries = wrong.get(i) ?? [];
              const open = solved.has(i) || shown.has(i);
              const locked = isLocked(i);

              if (locked && i !== firstLockedIndex) return null;

              if (locked && i === firstLockedIndex) {
                return (
                  <section key="mcq-paywall-section" id="mcq-paywall" className="scroll-mt-24 border-t border-border pt-6">
                    <div className="relative z-10 mx-auto max-w-xl rounded-2xl border border-primary/30 bg-card px-5 py-5 text-center shadow-[0_12px_36px_rgba(0,0,0,0.10)] sm:px-7 sm:py-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
                      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                        <Lock className="h-5 w-5" />
                      </span>
                      <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">Free preview complete</p>
                      <h2 className="mt-1 font-serif text-2xl font-bold leading-tight text-foreground">Unlock ${lockedCount} questions</h2>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                        Continue practising with all remaining questions, answer keys and explanations.
                      </p>
                      <button type="button" onClick={() => setUnlockOpen(true)} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition duration-200 hover:-translate-y-0.5 hover:brightness-95 hover:shadow-md active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto sm:min-w-64">
                        <Lock className="h-4 w-4" /> Unlock ${lockedCount} questions
                      </button>
                      <p className="mt-2 text-xs text-muted-foreground">One secure checkout. Your place on this page is preserved.</p>
                    </div>

                    <div className="relative isolate mt-5 overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
                      <div aria-hidden="true" className="pointer-events-none select-none space-y-0 blur-[2px] opacity-85">
                        {visibleLockedQuestions.map(({ index, question }) => (
                          <article key={index} id={`q${index + 1}`} className="border-b border-border/50 px-4 py-6 last:border-b-0 sm:px-6">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Question {index + 1} · Member preview</p>
                            <p className="mt-2 font-serif text-lg font-bold leading-snug text-foreground">{question.question}</p>
                            <div className="mt-3 space-y-1">
                              {question.options.slice(0, 4).map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center gap-3 px-2 py-2.5 text-sm text-foreground">
                                  <span className="h-5 w-5 shrink-0 rounded-full bg-muted-foreground/25" />
                                  <span>{option}</span>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/5 via-background/15 to-background/35" />
                      <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border/80 bg-background/90 px-4 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur-[2px]">
                          <Lock className="h-3.5 w-3.5" /> ${lockedCount} member questions
                        </span>
                      </div>
                    </div>
                  </section>
                );
              }

              return (
                <article key={i} id={`q${i + 1}`} className="scroll-mt-24 border-t border-border py-6 first:border-t-0 first:pt-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Question {i + 1}</p>
                  <h2 className="mt-1.5 font-serif text-lg font-bold leading-snug sm:text-xl">{q.question}</h2>
                  <div className="mt-3 space-y-1" role="group" aria-label={`Options for question ${i + 1}`}>
                    {q.options.map((opt, oi) => {
                      const right = oi === q.correct_answer, was = tries.includes(oi);
                      const style = open ? (right ? "bg-emerald-500/10" : was ? "bg-rose-500/10 text-muted-foreground" : "text-muted-foreground") : was ? "bg-rose-500/10 text-muted-foreground line-through decoration-rose-500/50" : "hover:bg-primary/5";
                      return (
                        <button key={oi} type="button" disabled={open || was || timerStatus === "finished"} onClick={() => pick(i, oi)} aria-label={`Option ${LETTERS[oi]}: ${opt}${was ? " (not correct)" : ""}`} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] leading-snug transition-colors ${style}`}>
                          <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${open && right ? "bg-emerald-500 text-white" : was ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"}`}>{LETTERS[oi]}</span>
                          <span className="flex-1">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!open ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 text-sm">
                      {tries.length > 0 && <span className="font-semibold text-rose-600 dark:text-rose-300">Not quite. Try again.</span>}
                      <button type="button" disabled={timerStatus === "finished"} onClick={() => reveal(i)} className="font-bold text-muted-foreground hover:text-foreground">Show answer</button>
                    </div>
                  ) : (
                    <div className="mt-3 border-l-[3px] border-primary/60 px-4 py-1">
                      <p className={`text-sm font-bold ${first.get(i) === q.correct_answer ? "text-emerald-600 dark:text-emerald-300" : "text-foreground"}`}>{first.get(i) === q.correct_answer ? "Correct first time." : solved.has(i) ? `Correct${tries.length ? ` after ${tries.length} ${tries.length === 1 ? "try" : "tries"}` : ""}.` : "Answer revealed."} The answer is {LETTERS[q.correct_answer]}.</p>
                      {q.explanation && <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{q.explanation}</p>}
                      <button type="button" onClick={() => openAI(`Explain this question like I am a medical student and tell me what the examiner wants:\n${q.question}\nOptions: ${q.options.map((o, k) => `${LETTERS[k]}. ${o}`).join(" | ")}\nAnswer: ${LETTERS[q.correct_answer]}`)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><OmpathMark className="h-4 w-4" /> Explain this with Ompath AI</button>
                    </div>
                  )}
                </article>
              );
            });
          })()}

          {attemptFinished && (
            <section className="border-t border-border pt-8 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Bank complete</p>
              <p className="mt-1 font-serif text-3xl font-bold tabular-nums">{correct} / {qs.length} <span className="text-lg text-muted-foreground">({Math.round((correct / qs.length) * 100)}% first time)</span></p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {missed.length > 0 && <button type="button" onClick={() => { setOnly("missed"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Review the {missed.length} I missed</button>}
                <button type="button" onClick={reset} className="rounded-full px-5 py-2.5 text-sm font-bold text-primary hover:underline">Start again</button>
                <Link to={`/mcqs?${year ? `year=Year ${year}&` : ""}unit=${encodeURIComponent(unit)}`} className="rounded-full px-5 py-2.5 text-sm font-bold text-primary hover:underline">More in {unit}</Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** /mcqs/:id : a practice bank. Timed exams are handed to the exam page. */
export default function McqSet() {
  const { id } = useParams();
  const [set, setSet] = useState<McqSetRow | null | undefined>(undefined);
  useEffect(() => { let live = true; setSet(undefined); if (id) resolveMcqSet(id).then((s) => live && setSet(s)); return () => { live = false; }; }, [id]);
  const title = useMemo(() => (set ? shortTitle(set.title, set.category) : ""), [set]);
  if (set === undefined) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  if (!set) return <Navigate to="/mcqs" replace />;
  if (isExamLike(set)) return <Navigate to={`/exams/${(set.slug || set.id)}/start`} replace />;
  return (
    <div className="min-h-screen bg-background">
      <Helmet><title>{resourceSeoTitle(set.title, set.slug, set.category, "MCQs")}</title><meta name="description" content={`${set.questions.length} practice questions with explanations: ${title}.`} /></Helmet>
      <Bank key={set.id} set={set} />
    </div>
  );
}
