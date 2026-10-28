import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Lightbulb, Clock, AlertTriangle, LogOut, Lock, CheckCircle, Phone, Loader2, Flag, ArrowLeft, ArrowRight, Grid3x3 } from "lucide-react";
import OmpathMark from "@/components/ai/OmpathMark";
import { openAI } from "@/lib/aiEvents";
import { shortTitle } from "@/lib/examMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackAnswer } from "@/lib/answer-tracker";
import { picksOf, restoreAnswers } from "@/lib/examAnswers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface McqQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation?: string;
}

interface StudentInfo {
  name: string;
  university: string;
  course: string;
}

interface Props {
  questions: McqQuestion[];
  title: string;
  setId?: string;
  timeLimitMinutes?: number;
  studentInfo?: StudentInfo;
  unitName?: string;
  onExit: () => void;
  freeLimit?: number;
  examPrice?: number;
  isPaid?: boolean;
  paymentStatus?: "idle" | "pending" | "completed" | "failed";
  phoneInput?: string;
  onPhoneChange?: (v: string) => void;
  onPay?: () => void;
  onRetryPay?: () => void;
}

// ── Persistence ──────────────────────────────────────────────────────────────

interface PersistedExam {
  setId: string;
  answers: [number, number][];
  /** the text of each chosen option, so the answers still line up if the options are later shown in another order */
  picks?: [number, string][];
  submittedAt: number;
  elapsed: number;
  score: number;
  total: number;
  studentName: string;
  title: string;
  submitReason: string;
}

interface PersistedExamSession {
  sessionId: string;
  answers: [number, number][];
  picks?: [number, string][];
  elapsed: number;
}

const storageKey = (id: string) => `exam_result_${id}`;
const sessionStorageKey = (id: string) => `exam_session_${id}`;
const STUDENT_CREDS_KEY = "student_credentials";

function saveToStorage(data: PersistedExam) {
  try { localStorage.setItem(storageKey(data.setId), JSON.stringify(data)); } catch {}
}

function loadFromStorage(id: string): PersistedExam | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSessionToStorage(data: PersistedExamSession) {
  try { localStorage.setItem(sessionStorageKey(data.sessionId), JSON.stringify(data)); } catch {}
}

function loadSessionFromStorage(id: string): PersistedExamSession | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearSessionFromStorage(id: string) {
  try { localStorage.removeItem(sessionStorageKey(id)); } catch {}
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type SubmitReason = "manual" | "timeout" | "tab_switch";

// ─────────────────────────────────────────────────────────────────────────────

export default function ExamMode({
  questions, title, setId,
  timeLimitMinutes, studentInfo, unitName,
  onExit,
  freeLimit = 0,
  examPrice = 5,
  isPaid = true,
  paymentStatus = "idle",
  phoneInput = "",
  onPhoneChange,
  onPay,
  onRetryPay,
}: Props) {
  const { isAdmin } = useAuth();
  const [answers, setAnswers] = useState<Map<number, number>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [submitReason, setSubmitReason] = useState<SubmitReason>("manual");
  const [startTime, setStartTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [displayAnswers, setDisplayAnswers] = useState<Map<number, number>>(new Map());
  const [savedScore, setSavedScore] = useState<number | null>(null);   // the score recorded at submission, for results saved before option texts were kept
  const submittedRef = useRef(false);
  const sessionId = setId || `local_${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const timeLimit = timeLimitMinutes ? timeLimitMinutes * 60 : undefined;
  const remaining = timeLimit ? Math.max(0, timeLimit - elapsed) : undefined;

  // Paywall — exam free up to freeLimit MCQs, then paused until isPaid
  const isPaywalled = freeLimit > 0 && !isPaid && answers.size >= freeLimit;
  const [pausedMs, setPausedMs] = useState(0);
  const pauseStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPaywalled && pauseStartRef.current === null) {
      pauseStartRef.current = Date.now();
    } else if (!isPaywalled && pauseStartRef.current !== null) {
      setPausedMs((p) => p + (Date.now() - (pauseStartRef.current as number)));
      pauseStartRef.current = null;
    }
  }, [isPaywalled]);

  // ── On mount: restore submitted result or in-progress session ──
  useEffect(() => {
    if (setId) {
      const savedResult = loadFromStorage(setId);
      if (savedResult) {
        submittedRef.current = true;
        setSubmitted(true);
        setSubmitReason(savedResult.submitReason as SubmitReason);
        setElapsed(savedResult.elapsed);
        setDisplayAnswers(restoreAnswers(savedResult.answers, savedResult.picks, questions));
        if (!savedResult.picks && typeof savedResult.score === "number") setSavedScore(savedResult.score);
        return;
      }
    }

    const savedSession = loadSessionFromStorage(sessionId);
    if (savedSession) {
      const restoredAnswers = restoreAnswers(savedSession.answers, savedSession.picks, questions);
      setAnswers(restoredAnswers);
      setElapsed(savedSession.elapsed);
      setStartTime(Date.now() - savedSession.elapsed * 1000);
    }
  }, [setId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps -- restore once per exam; the questions of an exam do not change while it is open

  // ── Timer ──
  useEffect(() => {
    if (submitted) return;
    const id = setInterval(() => {
      const pauseAdj = pausedMs + (pauseStartRef.current ? Date.now() - pauseStartRef.current : 0);
      setElapsed(Math.max(0, Math.floor((Date.now() - startTime - pauseAdj) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime, submitted, pausedMs, isPaywalled]);

  // ── Persist in-progress session ──
  useEffect(() => {
    if (submitted) return;
    saveSessionToStorage({
      sessionId,
      answers: [...answers.entries()],
      picks: picksOf(answers, questions),
      elapsed,
    });
  }, [answers, elapsed, submitted, sessionId, questions]);

  // ── Fullscreen ──
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  // ── Block copy/paste/right-click (students only — admin can copy freely) ──
  useEffect(() => {
    if (isAdmin) return;
    const block = (e: Event) => e.preventDefault();
    ["copy", "cut", "paste", "contextmenu"].forEach((ev) => document.addEventListener(ev, block));
    return () => ["copy", "cut", "paste", "contextmenu"].forEach((ev) => document.removeEventListener(ev, block));
  }, [isAdmin]);

  // ── No-select style ──
  useEffect(() => {
    if (isAdmin) return;
    const s = document.createElement("style");
    s.id = "exam-no-select";
    s.textContent = `.exam-container * { user-select: none; -webkit-user-select: none; }`;
    document.head.appendChild(s);
    return () => s.remove();
  }, [isAdmin]);

  // ── Submit ──
  const doSubmit = useCallback(async (reason: SubmitReason) => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const now = Date.now();
    const currentElapsed = Math.floor((now - startTime) / 1000);
    const correctCount = [...answers.entries()].filter(([qi, oi]) => questions[qi].correct_answer === oi).length;

    if (setId) {
      saveToStorage({
        setId,
        answers: [...answers.entries()],
        picks: picksOf(answers, questions),
        submittedAt: now,
        elapsed: currentElapsed,
        score: correctCount,
        total: questions.length,
        studentName: studentInfo?.name || "",
        title,
        submitReason: reason,
      });
    }

    clearSessionFromStorage(sessionId);

    if (studentInfo) {
      try {
        localStorage.setItem(STUDENT_CREDS_KEY, JSON.stringify(studentInfo));
      } catch {}
    }

    setSubmitted(true);
    setSubmitReason(reason);
    setElapsed(currentElapsed);
    setDisplayAnswers(new Map(answers));

    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    if (setId) {
      for (const [qIdx, selectedOpt] of answers.entries()) {
        const q = questions[qIdx];
        trackAnswer({
          mcq_set_id: setId,
          question_index: qIdx,
          question_text: q.question,
          selected_answer: selectedOpt,
          correct_answer: q.correct_answer,
          is_correct: selectedOpt === q.correct_answer,
        });
      }
    }

    if (studentInfo && setId) {
      try {
        await supabase.from("exam_results").insert({
          exam_id: setId,
          exam_title: title,
          unit: unitName || "General",
          student_name: studentInfo.name,
          university: studentInfo.university,
          course: studentInfo.course,
          mcq_score: correctCount,
          mcq_total: questions.length,
          time_taken_seconds: currentElapsed,
          submit_reason: reason,
        });
      } catch (e) {
        console.error("DB save failed:", e);
      }
    }
  }, [answers, questions, setId, studentInfo, title, unitName, startTime, sessionId]);

  useEffect(() => {
    if (submittedRef.current || !timeLimit) return;
    if (elapsed >= timeLimit) doSubmit("timeout");
  }, [elapsed, timeLimit, doSubmit]);

  useEffect(() => {
    if (submittedRef.current) return;
    const onVis = () => { if (document.hidden) doSubmit("tab_switch"); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); };
  }, [doSubmit]);

  const selectAnswer = (qIdx: number, optIdx: number) => {
    if (submitted) return;
    setAnswers((prev) => new Map(prev).set(qIdx, optIdx));
  };

  const [cur, setCur] = useState(0);
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "wrong" | "skipped" | "flagged">("all");
  const toggleFlag = (i: number) => setFlags((f) => { const n = new Set(f); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  useEffect(() => {
    if (submitted) return;
    const onKey = (e: KeyboardEvent) => {
      if (showExitConfirm || showSubmitConfirm || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      const oi = "abcd".indexOf(k);
      if (k.length === 1 && oi >= 0 && oi < (questions[cur]?.options.length || 0)) selectAnswer(cur, oi);
      else if (k === "arrowright") setCur((c) => Math.min(questions.length - 1, c + 1));
      else if (k === "arrowleft") setCur((c) => Math.max(0, c - 1));
      else if (k === "f") toggleFlag(cur);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, cur, questions, showExitConfirm, showSubmitConfirm]);

  const answered = answers.size;
  const total = questions.length;
  const unanswered = total - answered;

  const correctCount = savedScore ?? [...displayAnswers.entries()].filter(
    ([qi, oi]) => questions[qi]?.correct_answer === oi
  ).length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const handleExitWithSave = () => {
    saveSessionToStorage({
      sessionId,
      answers: [...answers.entries()],
      picks: picksOf(answers, questions),
      elapsed,
    });
    setShowExitConfirm(false);
    onExit();
  };

  const timeColor =
    remaining !== undefined
      ? remaining <= 60 ? "text-red-500 bg-red-500/10"
        : remaining <= 300 ? "text-amber-500 bg-amber-500/10"
        : "text-primary bg-primary/10"
      : "text-primary bg-primary/10";

  // ── DIALOGS ──
  const ExitDialog = () => (
    <AnimatePresence>
      {showExitConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <motion.div
            initial={{ scale: 0.92 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.92 }}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-full bg-destructive/10 p-2">
                <LogOut className="h-5 w-5 text-destructive" />
              </div>
              <h3 className="font-serif text-base font-bold text-foreground">Exit Exam?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              Your progress is <strong className="text-foreground">saved automatically</strong>.
            </p>
            <p className="text-xs text-muted-foreground mb-5">
              You can come back and continue this exam from where you stopped.
            </p>
            <div className="flex gap-3">
              <Button variant="destructive" onClick={handleExitWithSave} className="flex-1">
                Save & Exit
              </Button>
              <Button variant="outline" onClick={() => setShowExitConfirm(false)} className="flex-1">
                Keep Going
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const SubmitDialog = () => (
    <AnimatePresence>
      {showSubmitConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <motion.div
            initial={{ scale: 0.92 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.92 }}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <h3 className="font-serif text-base font-bold text-foreground mb-2">Submit Exam?</h3>
            {unanswered > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {unanswered} question{unanswered > 1 ? "s" : ""} unanswered — marked wrong.
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-1">
              Answered <strong className="text-foreground">{answered}/{total}</strong> questions.
            </p>
            <p className="text-xs text-muted-foreground mb-5">
              Your score and full answer review will be shown immediately after submission.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowSubmitConfirm(false);
                  doSubmit("manual");
                }}
                className="flex-1"
              >
                Submit Now
              </Button>
              <Button variant="outline" onClick={() => setShowSubmitConfirm(false)} className="flex-1">
                Review First
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── RESULTS ───────────────────────────────────────────────────────────────
  if (submitted) {
    const wrongIdx = questions.map((_, i) => i).filter((i) => displayAnswers.has(i) && displayAnswers.get(i) !== questions[i].correct_answer);
    const skippedIdx = questions.map((_, i) => i).filter((i) => !displayAnswers.has(i));
    const verdict = pct >= 80 ? "Excellent" : pct >= 60 ? "Good job" : pct >= 50 ? "Nearly there" : "Keep studying";
    const tone = pct >= 80 ? "stroke-emerald-500" : pct >= 60 ? "stroke-sky-500" : pct >= 50 ? "stroke-amber-500" : "stroke-rose-500";
    const r = 54, circ = 2 * Math.PI * r;
    const reasonNote: Record<SubmitReason, string | null> = {
      manual: null,
      timeout: "Time ran out, so the exam was submitted for you.",
      tab_switch: "The exam was submitted because you left the page.",
    };
    const shownIdx = filter === "wrong" ? wrongIdx : filter === "skipped" ? skippedIdx : filter === "flagged" ? [...flags].sort((a, b) => a - b) : questions.map((_, i) => i);
    const tab = (k: typeof filter, label: string, n: number) => (
      <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${filter === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{label} <span className="opacity-60">{n}</span></button>
    );

    return (
      <div className="min-h-screen bg-background px-4 pb-24 pt-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {reasonNote[submitReason] && (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" /> {reasonNote[submitReason]}</div>
          )}

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="flex flex-col items-center gap-6 p-7 text-center sm:flex-row sm:text-left">
              <div className="relative h-36 w-36 shrink-0">
                <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={`${pct} percent`}>
                  <circle cx="64" cy="64" r={r} fill="none" strokeWidth="11" className="stroke-muted" />
                  <circle cx="64" cy="64" r={r} fill="none" strokeWidth="11" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} className={`${tone} transition-all duration-1000`} />
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-4xl font-bold tabular-nums">{pct}%</span><span className="text-xs font-semibold text-muted-foreground">{correctCount} / {total}</span></span>
              </div>
              <div className="w-full min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your result</p>
                <h2 className="mt-1 font-serif text-3xl font-bold">{verdict}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{shortTitle(title, unitName ? `Weekly Exam: ${unitName}` : "")}</p>
                {studentInfo && <p className="mt-1 text-xs text-muted-foreground">{studentInfo.name} · {studentInfo.university}</p>}
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {([[correctCount, "Correct", "text-emerald-600 dark:text-emerald-300"], [wrongIdx.length, "Wrong", "text-rose-600 dark:text-rose-300"], [skippedIdx.length, "Skipped", "text-amber-600 dark:text-amber-300"], [formatTime(elapsed), "Time", "text-foreground"]] as const).map(([n, l, c]) => (
                    <div key={l} className="rounded-xl bg-muted/60 px-2 py-2"><p className={`text-lg font-bold tabular-nums ${c}`}>{n}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</p></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border bg-muted/30 px-5 py-4">
              {wrongIdx.length > 0 && (
                <button type="button" onClick={() => openAI(`I just sat the exam "${title}" and got these wrong. For each, explain the core idea in two lines, then tell me what to revise:\n${wrongIdx.slice(0, 10).map((i, n) => `${n + 1}. ${questions[i].question} (answer: ${questions[i].options[questions[i].correct_answer]})`).join("\n")}`)} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow"><OmpathMark className="h-6 w-6" /> Explain my mistakes</button>
              )}
              <Button variant="outline" onClick={onExit} className="rounded-full">Back to Exam Center</Button>
            </div>
          </motion.div>

          <div className="flex flex-wrap gap-1.5" aria-label="Question map">
            {questions.map((q, i) => {
              const a = displayAnswers.get(i);
              const cls = a === undefined ? "bg-muted text-muted-foreground" : a === q.correct_answer ? "bg-emerald-500 text-white" : "bg-rose-500 text-white";
              return <a key={i} href={`#q-${i}`} onClick={() => setFilter("all")} className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${cls}`}>{i + 1}</a>;
            })}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {tab("all", "All", total)}{tab("wrong", "Wrong", wrongIdx.length)}{tab("skipped", "Skipped", skippedIdx.length)}{flags.size > 0 && tab("flagged", "Flagged", flags.size)}
          </div>

          <div className="space-y-4">
            {shownIdx.length === 0 && <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing here. {filter === "wrong" ? "No wrong answers." : ""}</p>}
            {shownIdx.map((qi) => {
              const q = questions[qi];
              const selected = displayAnswers.get(qi);
              const ok = selected === q.correct_answer;
              return (
                <article id={`q-${qi}`} key={qi} className={`scroll-mt-20 rounded-2xl border p-5 ${selected === undefined ? "border-border bg-card" : ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${selected === undefined ? "bg-muted text-muted-foreground" : ok ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>{qi + 1}</span>
                    <p className="pt-0.5 text-[15px] font-semibold leading-relaxed break-words">{q.question}</p>
                  </div>
                  {selected === undefined && <p className="ml-11 mt-2 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">Skipped</p>}
                  <div className="ml-0 mt-3 space-y-1.5 sm:ml-11">
                    {q.options.map((opt, oi) => {
                      const right = oi === q.correct_answer, mine = selected === oi;
                      return (
                        <div key={oi} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${right ? "border-emerald-500 bg-emerald-500/10" : mine ? "border-rose-500 bg-rose-500/10" : "border-border bg-card/60"}`}>
                          <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${right ? "border-emerald-500 bg-emerald-500 text-white" : mine ? "border-rose-500 bg-rose-500 text-white" : "border-border text-muted-foreground"}`}>{right ? <Check className="h-3 w-3" /> : mine ? <X className="h-3 w-3" /> : String.fromCharCode(65 + oi)}</span>
                          <span className="flex-1 break-words leading-snug">{opt}</span>
                          {mine && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Your answer</span>}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div className="mt-3 flex gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:ml-11">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p className="text-sm leading-relaxed break-words">{q.explanation}</p>
                    </div>
                  )}
                  {!ok && (
                    <button type="button" onClick={() => openAI(`Explain this exam question simply and tell me what the examiner wants:\n${q.question}\nOptions: ${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("; ")}\nCorrect answer: ${String.fromCharCode(65 + q.correct_answer)}`)} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline sm:ml-11"><OmpathMark className="h-5 w-5" /> Explain with Ompath AI</button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── EXAM IN PROGRESS (one question at a time, with a map of all of them) ──
  const q = questions[Math.min(cur, total - 1)];
  const selected = answers.get(cur);
  const locked = freeLimit > 0 && !isPaid && cur >= freeLimit;
  const lowTime = remaining !== undefined && remaining <= 120;
  const palette = (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
      {questions.map((_, i) => {
        const state = i === cur ? "border-primary bg-primary text-primary-foreground" : answers.has(i) ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/50";
        return (
          <button key={i} type="button" onClick={() => { setCur(i); setPaletteOpen(false); }} aria-label={`Question ${i + 1}${answers.has(i) ? ", answered" : ""}${flags.has(i) ? ", flagged" : ""}`} className={`relative flex h-9 items-center justify-center rounded-lg border text-xs font-bold transition-colors ${state}`}>
            {i + 1}{flags.has(i) && <Flag className="absolute -right-1 -top-1 h-3 w-3 fill-amber-500 text-amber-500" aria-hidden />}
          </button>
        );
      })}
    </div>
  );

  // drawn straight on the page body, above everything (the AI button, scroll arrow and site banner must not show during an exam)
  return createPortal(
    <div style={{ zIndex: 2147483000 }} className="exam-container fixed inset-0 flex flex-col overflow-hidden bg-background">
      {ExitDialog()}
      {SubmitDialog()}

      <header className="shrink-0 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-sm font-bold sm:text-base">{shortTitle(title, unitName ? `Weekly Exam: ${unitName}` : "")}</p>
            <p className="truncate text-[11px] text-muted-foreground">{unitName}{studentInfo ? ` · ${studentInfo.name}` : ""}</p>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-base font-bold tabular-nums ${timeColor} ${lowTime ? "animate-pulse" : ""}`} aria-live="off"><Clock className="h-4 w-4" aria-hidden /> {remaining !== undefined ? formatTime(remaining) : formatTime(elapsed)}</div>
          <button type="button" onClick={() => setShowExitConfirm(true)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LogOut className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Save & exit</span></button>
        </div>
        <div className="h-1 w-full bg-secondary"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${(answered / total) * 100}%` }} /></div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-6 px-4">
        <main className="min-w-0 flex-1 overflow-y-auto py-6 pb-32">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Question {cur + 1} of {total}</p>
              <button type="button" onClick={() => toggleFlag(cur)} aria-pressed={flags.has(cur)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${flags.has(cur) ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-border text-muted-foreground hover:text-foreground"}`}><Flag className={`h-3.5 w-3.5 ${flags.has(cur) ? "fill-amber-500" : ""}`} aria-hidden /> {flags.has(cur) ? "Flagged" : "Flag for review"}</button>
            </div>

            {locked && isPaywalled ? (
              <div className="mt-6 rounded-3xl border border-primary/30 bg-card p-7 text-center shadow-sm">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Lock className="h-5 w-5" /></div>
                <h3 className="font-serif text-lg font-bold">Unlock the full exam</h3>
                <p className="mt-1 text-sm text-muted-foreground">Question {freeLimit + 1} onward is locked. Pay <strong className="text-foreground">KES {examPrice}</strong> to continue.</p>
                <p className="mb-4 mt-1 text-[11px] text-amber-600 dark:text-amber-400">The timer is paused while you pay.</p>
                {paymentStatus === "pending" ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-3"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /><p className="mt-2 text-sm font-medium">Check your phone</p><p className="text-xs text-muted-foreground">Enter your M-Pesa PIN to complete.</p></div>
                ) : paymentStatus === "failed" ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3"><p className="text-sm font-medium">Payment failed</p><Button size="sm" variant="outline" className="mt-2" onClick={onRetryPay}>Try again</Button></div>
                ) : paymentStatus === "completed" ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-3"><CheckCircle className="mx-auto h-5 w-5 text-primary" /><p className="mt-2 text-sm font-medium">Unlocked. Continue your exam.</p></div>
                ) : (
                  <div className="mx-auto max-w-xs space-y-3">
                    <Input type="tel" placeholder="Safaricom number e.g. 0712 345 678" value={phoneInput} onChange={(e) => onPhoneChange?.(e.target.value)} className="h-11 text-center" />
                    <Button onClick={onPay} disabled={!phoneInput.trim()} className="w-full gap-2"><Phone className="h-4 w-4" /> Pay KES {examPrice} via M-Pesa</Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <h1 className="mt-4 font-serif text-xl font-bold leading-snug sm:text-2xl">{q.question}</h1>
                <div className="mt-6 space-y-3" role="radiogroup" aria-label="Answer options">
                  {q.options.map((opt, oi) => {
                    const on = selected === oi;
                    return (
                      <button key={oi} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => selectAnswer(cur, oi)} className={`flex w-full items-start gap-3.5 rounded-2xl border-2 p-4 text-left text-base leading-snug transition-all ${on ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"} ${locked ? "pointer-events-none opacity-50" : ""}`}>
                        <span className={`mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>{String.fromCharCode(65 + oi)}</span>
                        <span className="flex-1 pt-0.5 break-words">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <p className="mt-6 hidden text-xs text-muted-foreground sm:block">Shortcuts: A–D answer · ← → move · F flag</p>
          </div>
        </main>

        <aside className="hidden w-[260px] shrink-0 overflow-y-auto py-6 lg:block">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Questions</p>
            {palette}
            <div className="mt-4 space-y-1.5 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-primary/40 bg-primary/15" /> Answered ({answered})</p>
              <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-border bg-card" /> Not yet ({unanswered})</p>
              <p className="flex items-center gap-2"><Flag className="h-3 w-3 fill-amber-500 text-amber-500" /> Flagged ({flags.size})</p>
            </div>
          </div>
        </aside>
      </div>

      {paletteOpen && (
        <div className="fixed inset-0 z-[250] flex items-end bg-black/50 lg:hidden" onClick={() => setPaletteOpen(false)}>
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="font-serif text-lg font-bold">All questions</p><button type="button" onClick={() => setPaletteOpen(false)} className="rounded-full p-1.5 hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></button></div>
            {palette}
          </div>
        </div>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <button type="button" onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-bold transition hover:bg-muted disabled:opacity-40"><ArrowLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Previous</span></button>
          <button type="button" onClick={() => setPaletteOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:bg-muted lg:hidden"><Grid3x3 className="h-4 w-4" aria-hidden /> {answered}/{total}</button>
          <p className="hidden flex-1 text-center text-xs lg:block">
            {unanswered > 0 ? <span className="font-semibold text-amber-600 dark:text-amber-400">{unanswered} unanswered</span> : <span className="font-semibold text-emerald-600 dark:text-emerald-400">All answered</span>}
            {lowTime && <span className="ml-2 font-bold text-red-500">· {formatTime(remaining as number)} left</span>}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {cur < total - 1 ? (
              <button type="button" onClick={() => setCur((c) => Math.min(total - 1, c + 1))} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:brightness-110">Next <ArrowRight className="h-4 w-4" aria-hidden /></button>
            ) : null}
            <button type="button" onClick={() => setShowSubmitConfirm(true)} disabled={answered === 0} className={`inline-flex h-11 items-center rounded-full px-5 text-sm font-bold transition disabled:opacity-40 ${cur >= total - 1 ? "bg-primary text-primary-foreground hover:brightness-110" : "border border-border hover:bg-muted"}`}>Submit ({answered}/{total})</button>
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  );
}

export function loadSavedCredentials(): { name: string; university: string; course: string } | null {
  try {
    const raw = localStorage.getItem("student_credentials");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
