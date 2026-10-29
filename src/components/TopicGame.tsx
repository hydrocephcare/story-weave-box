import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Gamepad2, Layers, Loader2, RotateCcw, Sparkles, Users, X } from "lucide-react";
import CatchField from "@/components/CatchField";
import { useMyYear } from "@/hooks/useMyYear";
import { fitsCatch, shuffle, type ZoneQuestion } from "@/lib/zone";
import { buildGame } from "@/lib/zoneGames";
import { cn } from "@/lib/utils";

// "Want to play to understand this further?": at the end of a note, games made from that note, on the spot, played alone.
// Word Catch (words drift across the screen, tap the one that matches the description) and Tap to reveal (flip a card, say whether you knew it).

const made = new Map<string, ZoneQuestion[]>();
const plain = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, " ").replace(/[#*_>`|]/g, " ").replace(/\s+/g, " ").trim();
const desc = (q: string) => q.split("\n").slice(1).join(" ") || q;

function LocalCatch({ qs, onAgain }: { qs: ZoneQuestion[]; onAgain: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<ZoneQuestion[]>([]);
  const q = qs[i];
  const pick = (k: number) => {
    if (picked !== null || !q) return;
    setPicked(k);
    const ok = k === q.correct;
    if (ok) setScore((s) => s + 1); else setMissed((m) => [...m, q]);
    window.setTimeout(() => { setPicked(null); setI((x) => x + 1); }, ok ? 900 : 2600);
  };
  if (!q) return (
    <div className="text-center">
      <p className="font-serif text-3xl font-bold">{score} <span className="text-lg font-normal text-muted-foreground">of {qs.length}</span></p>
      <p className="mt-1 text-sm text-muted-foreground">{score === qs.length ? "Every one. You understand this note." : score >= qs.length * 0.7 ? "Strong. A look at the ones you missed and you have it." : "Worth another read of the note, then try again."}</p>
      {missed.length > 0 && <ul className="mt-3 space-y-2 text-left text-sm">{missed.map((m, k) => <li key={k} className="rounded-xl border border-border p-3"><p className="text-muted-foreground">{desc(m.q)}</p><p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400"><Check className="mr-1 inline h-3.5 w-3.5" aria-hidden />{m.options[m.correct]}</p></li>)}</ul>}
      <button type="button" onClick={onAgain} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"><RotateCcw className="h-4 w-4" aria-hidden /> Play again</button>
    </div>
  );
  const catchIt = fitsCatch(q.options);
  return (
    <div key={i} className="animate-in fade-in duration-300">
      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground"><span>{i + 1} of {qs.length}</span><span className="text-primary">{score} right</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(i / qs.length) * 100}%` }} /></div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{catchIt ? "Tap the word that matches" : "Pick the one that matches"}</p>
      <p className="mt-1 rounded-xl bg-muted/50 px-4 py-3 text-[16px] leading-snug">{desc(q.q)}</p>
      {catchIt
        ? <CatchField options={q.options} picked={picked} correct={picked !== null ? q.correct : null} locked={picked !== null} onPick={pick} seed={q.q} />
        : <ul className="mt-3 space-y-2">{q.options.map((o, k) => <li key={k}><button type="button" disabled={picked !== null} onClick={() => pick(k)} className={cn("w-full rounded-xl border px-3.5 py-3 text-left text-[15px]", picked !== null && k === q.correct ? "border-emerald-500 bg-emerald-500/10" : picked === k ? "border-rose-500 bg-rose-500/10" : "border-border")}>{o}</button></li>)}</ul>}
      {picked !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className={picked === q.correct ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-rose-500"} style={{ animation: `zone-fill ${picked === q.correct ? 900 : 2600}ms linear forwards` }} /></div>}
      {picked !== null && q.explanation && <p className="mt-3 rounded-lg bg-primary/5 p-3 text-sm"><strong>{q.options[q.correct]}.</strong> {q.explanation.replace(/^[^:]+:\s*/, "")}</p>}
    </div>
  );
}

function RevealDeck({ qs, onAgain }: { qs: ZoneQuestion[]; onAgain: () => void }) {
  const [queue, setQueue] = useState(() => qs.map((_, k) => k));
  const [shown, setShown] = useState(false);
  const [known, setKnown] = useState(0);
  const total = useRef(qs.length);
  const cur = queue.length ? qs[queue[0]] : null;
  const rate = (knew: boolean) => { setShown(false); if (knew) setKnown((k) => k + 1); setQueue((q) => (knew ? q.slice(1) : [...q.slice(1), q[0]])); };
  if (!cur) return (
    <div className="text-center"><Check className="mx-auto h-8 w-8 text-emerald-600" aria-hidden /><p className="mt-2 font-serif text-2xl font-bold">All {total.current} known</p><p className="text-sm text-muted-foreground">Every card you missed came round again until you had it.</p>
      <button type="button" onClick={onAgain} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"><RotateCcw className="h-4 w-4" aria-hidden /> Go again</button></div>
  );
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground"><span>{queue.length} left</span><span className="text-primary">{known} known</span></div>
      <button type="button" onClick={() => setShown(true)} aria-live="polite" className={cn("mt-2 flex min-h-[170px] w-full flex-col items-center justify-center rounded-2xl border-2 p-5 text-center transition-colors", shown ? "border-emerald-500/60 bg-emerald-500/5" : "border-dashed border-primary/50 bg-primary/5")}>
        {!shown
          ? <><span className="text-[16px] leading-snug">{desc(cur.q)}</span><span className="mt-3 text-xs font-bold uppercase tracking-wider text-primary">Tap to reveal</span></>
          : <><span className="font-serif text-2xl font-bold">{cur.options[cur.correct]}</span>{cur.explanation && <span className="mt-2 text-sm text-muted-foreground">{cur.explanation.replace(/^[^:]+:\s*/, "")}</span>}</>}
      </button>
      {shown && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => rate(false)} className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/50 px-4 py-3 text-sm font-bold text-rose-700 dark:text-rose-400"><X className="h-4 w-4" aria-hidden /> Again</button><button type="button" onClick={() => rate(true)} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" aria-hidden /> I knew it</button></div>}
    </div>
  );
}

/** Shown at the end of a note that is long enough to learn from; nothing for papers and question banks. */
export default function TopicGame({ title, category, content, className }: { title: string; category?: string | null; content: string; className?: string }) {
  const { year } = useMyYear();
  const [mode, setMode] = useState<"idle" | "loading" | "catch" | "reveal">("idle");
  const [qs, setQs] = useState<ZoneQuestion[]>([]);
  const [err, setErr] = useState("");
  const text = useMemo(() => plain(content), [content]);
  const paperLike = /past paper|\bcats?\b|exam|mcq|question bank|quiz|marathon|timetable|course outline/i.test(title);
  if (text.length < 1200 || paperLike) return null;

  const start = async (kind: "catch" | "reveal") => {
    setErr(""); setMode("loading");
    try {
      let list = made.get(title);
      if (!list) {
        const r = await buildGame("catch", title, year, 10, category ?? "", { context: text.slice(0, 2600), contextFirst: true });
        list = r.questions;
        if (list.length >= 3) made.set(title, list);
      }
      if (!list || list.length < 3) { setErr("I could not make a game from this note just now. Try again in a moment."); setMode("idle"); return; }
      setQs(shuffle(list)); setMode(kind);
    } catch { setErr("I could not make a game from this note just now. Try again in a moment."); setMode("idle"); }
  };

  return (
    <section aria-label="Play to understand this note" className={cn("rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 print:hidden", className)}>
      <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><Gamepad2 className="h-5 w-5 text-primary" aria-hidden /> Want to play to understand this further?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Games made from this note, just now. No typing: tap.</p>
      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void start("catch")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"><Sparkles className="h-4 w-4" aria-hidden /> Word Catch</button>
          <button type="button" onClick={() => void start("reveal")} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold hover:border-primary"><Layers className="h-4 w-4" aria-hidden /> Tap to reveal</button>
          <Link to={`/friend-zone?topic=${encodeURIComponent(title)}&game=catch`} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold hover:border-primary"><Users className="h-4 w-4" aria-hidden /> Challenge a friend</Link>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
      {mode === "loading" && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Reading the note and making your game…</p>}
      {(mode === "catch" || mode === "reveal") && (
        <div className="mt-4 rounded-xl border border-border bg-card p-3 sm:p-4">
          {mode === "catch" ? <LocalCatch qs={qs} onAgain={() => { setQs(shuffle(qs)); setMode("idle"); void start("catch"); }} /> : <RevealDeck qs={qs} onAgain={() => { setQs(shuffle(qs)); setMode("idle"); void start("reveal"); }} />}
          <div className="mt-3 flex justify-end gap-3 text-xs font-bold"><button type="button" onClick={() => setMode("idle")} className="text-muted-foreground hover:text-primary">Other games</button></div>
        </div>
      )}
    </section>
  );
}
