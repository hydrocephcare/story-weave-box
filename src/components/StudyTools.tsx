import { useEffect, useRef, useState } from "react";
import ListenControl from "@/components/ListenControl";
import { Link } from "react-router-dom";
import { Check, ClipboardCheck, FileText, Image as ImageIcon, Layers, Loader2, X } from "lucide-react";
import { openAI } from "@/lib/aiEvents";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { generatedFlashcardPath, saveGeneratedFlashcardDeck } from "@/lib/generatedFlashcards";
import { useAccess } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";
import { cn } from "@/lib/utils";

interface Q { q: string; options: string[]; answer: number; why: string }

/** Put the right answer in a different place in each question, never twice in a row. */
function spread(qs: Q[]): Q[] {
  let prev = -1;
  return qs.map((q, n) => {
    const choices = [0, 1, 2, 3].filter((i) => i !== prev);
    const target = choices[(n * 7 + q.q.length) % choices.length];
    const opts = q.options.slice();
    [opts[q.answer], opts[target]] = [opts[target], opts[q.answer]];
    prev = target;
    return { ...q, options: opts, answer: target };
  });
}

interface Essay { q: string; marks: number; points: string[]; answer: string }

// free limits per device per day (subscribers and the admin have none): the AI behind these costs real money
const FREE_PER_DAY: Record<"cards" | "quiz" | "essays", number> = { cards: 6, quiz: 8, essays: 4 };
const usedKey = (m: string) => `ompath_study_${m}_${new Date().toISOString().slice(0, 10)}`;
const used = (m: string) => { try { return Number(localStorage.getItem(usedKey(m)) ?? 0); } catch { return 0; } };
const spendOne = (m: string) => { try { localStorage.setItem(usedKey(m), String(used(m) + 1)); } catch { /* ignore */ } };

async function call(mode: "cards" | "quiz" | "essays", title: string, text: string) {
  const r = await fetch("/api/page-study", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, title, text }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Ompath AI could not do this just now. Please try again.");
  return j;
}

/** Three things to do with the page you are reading: turn it into flashcards for daily review, quiz yourself on it, or listen to it. */
export default function StudyTools({ title, path, text, className = "", pictures = false }: { title: string; path: string; text: string; className?: string; pictures?: boolean }) {
  const [busy, setBusy] = useState<"" | "cards" | "quiz" | "essays">("");
  const { hasPass } = useAccess();
  const { isAdmin } = useAuth();
  const unlimited = hasPass || isAdmin;
  const [essays, setEssays] = useState<Essay[] | null>(null);
  const [openEssay, setOpenEssay] = useState<number | null>(null);
  const allowed = (m: "cards" | "quiz" | "essays") => {
    if (unlimited || used(m) < FREE_PER_DAY[m]) return true;
    setNote({ ok: false, text: `You have used today's ${FREE_PER_DAY[m]} free ones.` });
    openSubscribePrompt("Subscribe for unlimited flashcards, quizzes and essay practice.");
    return false;
  };
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [reviewPath, setReviewPath] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Q[] | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const btn = "inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-bold transition hover:border-primary/60 hover:bg-primary/5 active:scale-[.97] disabled:opacity-60";

  const makeCards = async () => {
    if (!allowed("cards")) return;
    setBusy("cards"); setNote(null); setReviewPath(null);
    try {
      const { cards } = await call("cards", title, text);
      const deck = saveGeneratedFlashcardDeck(title, path, cards);
      spendOne("cards");
      if (alive.current) {
        setReviewPath(generatedFlashcardPath(deck.id));
        setNote({ ok: true, text: `${deck.cards.length} flashcards ready in the standard flashcard reviewer.` });
      }
    } catch (e) { if (alive.current) setNote({ ok: false, text: (e as Error).message }); } finally { if (alive.current) setBusy(""); }
  };
  const makeEssays = async () => {
    if (!allowed("essays")) return;
    setBusy("essays"); setNote(null);
    try { const { essays: e } = await call("essays", title, text); spendOne("essays"); if (alive.current) { setOpenEssay(null); setEssays(e); } }
    catch (e) { if (alive.current) setNote({ ok: false, text: (e as Error).message }); } finally { if (alive.current) setBusy(""); }
  };
  const makeQuiz = async () => {
    if (!allowed("quiz")) return;
    setBusy("quiz"); setNote(null);
    try { const { questions } = await call("quiz", title, text); spendOne("quiz"); if (alive.current) { setPicked({}); setQuiz(spread(questions)); } }
    catch (e) { if (alive.current) setNote({ ok: false, text: (e as Error).message }); } finally { if (alive.current) setBusy(""); }
  };
  const score = quiz ? quiz.filter((q, i) => picked[i] === q.answer).length : 0;
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={makeCards} disabled={Boolean(busy)}>{busy === "cards" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4 text-primary" aria-hidden />} Make flashcards</button>
        <button type="button" className={btn} onClick={makeQuiz} disabled={Boolean(busy)}>{busy === "quiz" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />} Test me on this page</button>
        <button type="button" className={btn} onClick={makeEssays} disabled={Boolean(busy)}>{busy === "essays" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-primary" aria-hidden />} Essay questions</button>
        {pictures && <button type="button" className={btn} onClick={() => openAI(`Give me anatomy spot questions on ${title}`)}><ImageIcon className="h-4 w-4 text-primary" aria-hidden /> Picture questions</button>}
        <ListenControl text={text} path={path} btnClass={btn} />
      </div>
      {note && <p className={cn("mt-3 text-sm font-semibold", note.ok ? "text-primary" : "text-destructive")} role="status">{note.text} {note.ok && <Link to={reviewPath || "/flashcards"} className="underline">Review now</Link>}</p>}

      <Dialog open={Boolean(essays)} onOpenChange={(o) => !o && setEssays(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="font-serif text-2xl">Essay questions: {title}</DialogTitle>
          <DialogDescription className="sr-only">Five essay questions with marking points and model answers</DialogDescription>
          <ol className="space-y-8">
            {(essays ?? []).map((e, i) => (
              <li key={i}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Essay {i + 1} · {e.marks} marks</p>
                <p className="mt-1 font-serif text-xl font-bold leading-snug">{e.q}</p>
                <button type="button" onClick={() => setOpenEssay(openEssay === i ? null : i)} aria-expanded={openEssay === i} className="mt-3 inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-bold hover:border-primary/60">{openEssay === i ? "Hide the model answer" : "Show the model answer"}</button>
                {openEssay === i && (
                  <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-foreground/85">
                    {e.points.length > 0 && (<><p className="font-semibold text-foreground">Marking points</p><ul className="space-y-1.5">{e.points.map((p, k) => <li key={k} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{p}</li>)}</ul></>)}
                    <p className="font-semibold text-foreground">Model answer</p>
                    {e.answer.split(/\n+/).map((p, k) => <p key={k}>{p}</p>)}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(quiz)} onOpenChange={(o) => !o && setQuiz(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogTitle className="font-serif text-2xl">Test yourself: {title}</DialogTitle>
          <DialogDescription className="sr-only">Five questions made from this page</DialogDescription>
          <ol className="space-y-8">
            {(quiz ?? []).map((q, i) => (
              <li key={i}>
                <p className="font-semibold leading-snug">{i + 1}. {q.q}</p>
                <ul className="mt-3 space-y-2">
                  {q.options.map((o, k) => {
                    const done = picked[i] !== undefined, right = k === q.answer, chosen = picked[i] === k;
                    return (
                      <li key={k}><button type="button" disabled={done} onClick={() => setPicked((p) => ({ ...p, [i]: k }))} className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] leading-snug transition", !done && "border-border hover:border-primary/60 hover:bg-primary/5", done && right && "border-emerald-500/60 bg-emerald-500/10", done && chosen && !right && "border-red-500/60 bg-red-500/10", done && !chosen && !right && "border-border opacity-60")}>
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">{"ABCD"[k]}</span><span className="min-w-0 flex-1">{o}</span>
                        {done && right && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct" />}{done && chosen && !right && <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Your answer" />}
                      </button></li>
                    );
                  })}
                </ul>
                {picked[i] !== undefined && q.why && <p className="mt-2 text-sm text-muted-foreground">{q.why}</p>}
              </li>
            ))}
          </ol>
          {quiz && Object.keys(picked).length === quiz.length && <p className="font-serif text-xl font-bold">You got {score} of {quiz.length}.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
