import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ClipboardCheck, Layers, Loader2, Square, Volume2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { srs } from "@/lib/srs";
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

async function call(mode: "cards" | "quiz", title: string, text: string) {
  const r = await fetch("/api/page-study", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, title, text }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Ompath AI could not do this just now. Please try again.");
  return j;
}

/** Three things to do with the page you are reading: turn it into flashcards for daily review, quiz yourself on it, or listen to it. */
export default function StudyTools({ title, path, text, className = "" }: { title: string; path: string; text: string; className?: string }) {
  const [busy, setBusy] = useState<"" | "cards" | "quiz">("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [quiz, setQuiz] = useState<Q[] | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (canSpeak) window.speechSynthesis.cancel(); }; }, [canSpeak]);

  const btn = "inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-bold transition hover:border-primary/60 hover:bg-primary/5 active:scale-[.97] disabled:opacity-60";

  const makeCards = async () => {
    setBusy("cards"); setNote(null);
    try {
      const { cards } = await call("cards", title, text);
      const n = srs.add(cards, { title, path });
      if (alive.current) setNote({ ok: true, text: n ? `${n} flashcards added to your daily review.` : "These cards are already in your review." });
    } catch (e) { if (alive.current) setNote({ ok: false, text: (e as Error).message }); } finally { if (alive.current) setBusy(""); }
  };
  const makeQuiz = async () => {
    setBusy("quiz"); setNote(null);
    try { const { questions } = await call("quiz", title, text); if (alive.current) { setPicked({}); setQuiz(spread(questions)); } }
    catch (e) { if (alive.current) setNote({ ok: false, text: (e as Error).message }); } finally { if (alive.current) setBusy(""); }
  };
  const listen = () => {
    if (!canSpeak) return;
    const synth = window.speechSynthesis;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const chunks = text.replace(/\s+/g, " ").match(/.{1,220}(?:[.!?]\s|$)/g) ?? [text];
    synth.cancel();
    chunks.slice(0, 40).forEach((c, i, arr) => { const u = new SpeechSynthesisUtterance(c.trim()); u.rate = 0.98; if (i === arr.length - 1) u.onend = () => setSpeaking(false); synth.speak(u); });
    setSpeaking(true);
  };

  const score = quiz ? quiz.filter((q, i) => picked[i] === q.answer).length : 0;
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={makeCards} disabled={Boolean(busy)}>{busy === "cards" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4 text-primary" aria-hidden />} Make flashcards</button>
        <button type="button" className={btn} onClick={makeQuiz} disabled={Boolean(busy)}>{busy === "quiz" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />} Test me on this page</button>
        {canSpeak && <button type="button" className={btn} onClick={listen}>{speaking ? <Square className="h-4 w-4 text-primary" aria-hidden /> : <Volume2 className="h-4 w-4 text-primary" aria-hidden />} {speaking ? "Stop" : "Listen"}</button>}
      </div>
      {note && <p className={cn("mt-3 text-sm font-semibold", note.ok ? "text-primary" : "text-destructive")} role="status">{note.text} {note.ok && <Link to="/review" className="underline">Review now</Link>}</p>}

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
