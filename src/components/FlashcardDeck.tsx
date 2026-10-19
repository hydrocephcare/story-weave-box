import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, RotateCcw, Shuffle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setProgress } from "@/lib/study";
import { useKeywordLinks } from "@/lib/keyword-link";
import { renderFlashcardMarkdown, renderInline } from "@/components/FlashcardViewer";
import { buildMcqPath } from "@/lib/store";
import { cleanTopicTitle } from "../../supabase/functions/_shared/topicTitle.js";

type Card = { question: string; answer: string };
type Saved = { order: number[]; pos: number; known: number[]; learning: number[] };
const KEY = "deck:";

const topicName = (t: string) => cleanTopicTitle(String(t).replace(/\s*[:—–-]?\s*(Flashcards?|Cards)$/i, ""));
const load = (id: string, n: number): Saved => {
  try { const s = JSON.parse(localStorage.getItem(KEY + id) || "null") as Saved | null; if (s && Array.isArray(s.order) && s.order.length === n) return s; } catch { /* none */ }
  return { order: Array.from({ length: n }, (_, i) => i), pos: 0, known: [], learning: [] };
};

/**
 * The flashcard deck, built for a phone held in one hand: the card is on screen straight away, tap it to flip, swipe it left for the next card and
 * right for the previous one, and say whether you knew it. Progress is remembered per deck; the end screen offers the cards you are still learning.
 */
export default function FlashcardDeck({ setId, title, cards, category }: { setId: string; title: string; cards: Card[]; category: string }) {
  const { user } = useAuth();
  const ctx = useKeywordLinks();
  const [st, setSt] = useState<Saved>(() => load(setId, cards.length));
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const drag = useRef<{ x: number; y: number; t: number; active: boolean; horiz: boolean | null }>({ x: 0, y: 0, t: 0, active: false, horiz: null });
  const [mcq, setMcq] = useState<string | null>(null);

  const total = st.order.length;
  const finished = st.pos >= total;
  const idx = st.order[Math.min(st.pos, total - 1)];
  const card = cards[idx];
  const name = topicName(title);

  useEffect(() => { try { localStorage.setItem(KEY + setId, JSON.stringify(st)); } catch { /* storage blocked */ } }, [st, setId]);
  useEffect(() => { setFlipped(false); }, [st.pos]);

  const go = useCallback((dir: 1 | -1) => {
    if (leaving) return;
    if (dir === 1 && st.pos >= total) return;
    if (dir === -1 && st.pos === 0) return;
    setLeaving(dir);
    window.setTimeout(() => { setSt((s) => ({ ...s, pos: Math.max(0, Math.min(total, s.pos + dir)) })); setLeaving(0); setDx(0); }, 160);
  }, [leaving, st.pos, total]);

  const verdict = useCallback((knew: boolean) => {
    if (finished) return;
    setSt((s) => ({ ...s, known: knew ? [...new Set([...s.known, idx])] : s.known.filter((i) => i !== idx), learning: knew ? s.learning.filter((i) => i !== idx) : [...new Set([...s.learning, idx])] }));
    go(1);
  }, [finished, idx, go]);

  const restart = (only?: number[]) => {
    const order = only ? [...only].sort(() => Math.random() - 0.5) : Array.from({ length: cards.length }, (_, i) => i);
    setSt({ order, pos: 0, known: only ? st.known.filter((i) => !only.includes(i)) : [], learning: [] });
  };
  const shuffle = () => setSt((s) => ({ ...s, order: [...s.order].sort(() => Math.random() - 0.5), pos: 0 }));

  // keyboard
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === "1") verdict(false);
      else if (e.key === "2") verdict(true);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [go, verdict]);

  // when the deck is finished: record it in the account and find the matching MCQ bank
  useEffect(() => {
    if (!finished) return;
    void setProgress(user?.id ?? null, "flashcard", setId, { status: st.learning.length ? "in_progress" : "completed", progress_percent: Math.round((st.known.length / Math.max(1, cards.length)) * 100) }).catch(() => undefined);
    void (async () => {
      try {
        const { data: fs } = await (supabase as any).from("flashcard_sets").select("source_reference").eq("id", setId).maybeSingle();
        if (!fs?.source_reference) return;
        const { data: m } = await (supabase as any).from("mcq_sets").select("id,title,slug").eq("source_reference", fs.source_reference).eq("published", true).is("deleted_at", null).limit(1);
        if (m && m[0]) setMcq(buildMcqPath(m[0]));
      } catch { /* optional */ }
    })();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // swipe
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, t: Date.now(), active: true, horiz: null }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d.active) return;
    const mx = e.clientX - d.x, my = e.clientY - d.y;
    if (d.horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) d.horiz = Math.abs(mx) > Math.abs(my) * 1.2;
    if (d.horiz) setDx(mx);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; if (!d.active) return; d.active = false;
    const mx = e.clientX - d.x;
    if (d.horiz && Math.abs(mx) > 70) { go(mx < 0 ? 1 : -1); return; }
    setDx(0);
    if (!d.horiz && Date.now() - d.t < 400 && Math.abs(mx) < 8) setFlipped((f) => !f);
  };

  const learningLeft = st.learning.length;
  const seg = useMemo(() => st.order.map((ci, p) => (st.known.includes(ci) ? "bg-emerald-500" : st.learning.includes(ci) ? "bg-amber-500" : p === st.pos ? "bg-primary" : "bg-muted")), [st]);

  const header = (
    <div className="flex items-center gap-2 pb-2 pt-1">
      <Link to="/flashcards" aria-label="Back to flashcards" className="-ml-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[17px] font-bold leading-tight text-foreground">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{category.replace(/^Year\s*\d\s*:\s*/i, "")} · {cards.length} cards</p>
      </div>
      <span className="text-sm font-bold tabular-nums text-muted-foreground">{Math.min(st.pos + 1, total)}<span className="font-normal">/{total}</span></span>
      <button type="button" onClick={shuffle} aria-label="Shuffle the cards" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Shuffle className="h-4 w-4" /></button>
      <button type="button" onClick={() => restart()} aria-label="Start again" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCcw className="h-4 w-4" /></button>
    </div>
  );
  const bar = <div className="flex gap-[2px]" aria-hidden>{seg.map((c, i) => <span key={i} className={`h-1 flex-1 rounded-full ${c}`} />)}</div>;

  if (finished) {
    const knew = st.known.length;
    return (
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
        {header}{bar}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Deck complete</p>
          <p className="mt-2 font-serif text-5xl font-bold tabular-nums">{knew}<span className="text-2xl text-muted-foreground"> / {cards.length}</span></p>
          <p className="mt-1 text-sm text-muted-foreground">{learningLeft ? `${learningLeft} still to learn` : "You knew every card. Come back in a few days to keep it fresh."}</p>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
            {learningLeft > 0 && <button type="button" onClick={() => restart(st.learning)} className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Review the {learningLeft} I am still learning</button>}
            {mcq && <Link to={mcq} className="rounded-full border border-border px-5 py-3 text-sm font-bold text-foreground hover:bg-muted">Test yourself with the MCQs</Link>}
            <button type="button" onClick={() => restart()} className="px-5 py-3 text-sm font-bold text-primary hover:underline">Start again</button>
          </div>
        </div>
      </div>
    );
  }

  const style: React.CSSProperties = { transform: `translateX(${leaving ? leaving * -140 : dx}px) rotate(${(leaving ? leaving * -8 : dx / 18)}deg)`, opacity: leaving ? 0 : 1 - Math.min(0.35, Math.abs(dx) / 500), transition: drag.current.active && !leaving ? "none" : "transform 160ms ease-out, opacity 160ms ease-out", touchAction: "pan-y" };
  const face = "absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)] sm:p-7";

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      {header}{bar}
      <div className="relative mt-3 flex flex-1 items-stretch justify-center" style={{ minHeight: "min(60dvh, 30rem)" }}>
        <div className="w-full max-w-md select-none" style={{ perspective: "1400px" }}>
          <div className="relative h-full min-h-[min(60dvh,30rem)] w-full cursor-pointer" style={style} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" tabIndex={0} aria-label={flipped ? "Answer. Tap to see the question." : "Question. Tap to see the answer."}>
            <div className="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: flipped ? "rotateY(180deg)" : "none" }}>
              <div className={face} style={{ backfaceVisibility: "hidden" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Question</p>
                <div className="flex flex-1 items-center justify-center overflow-y-auto py-4 text-center font-serif text-[22px] font-semibold leading-snug text-foreground sm:text-2xl">{renderInline(card?.question || "", "q", ctx)}</div>
                <p className="text-center text-xs text-muted-foreground">Tap to flip · swipe for the next card</p>
              </div>
              <div className={`${face} border-primary/30`} style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Answer</p>
                <div className="mt-2 flex-1 overflow-y-auto pr-1 text-[15px] leading-relaxed text-foreground/90 sm:text-base">{renderFlashcardMarkdown(card?.answer || "", ctx)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-4 grid w-full max-w-md grid-cols-[auto_1fr_1fr_auto] items-center gap-2 pb-2">
        <button type="button" onClick={() => go(-1)} disabled={st.pos === 0} aria-label="Previous card" className="rounded-full p-3 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" onClick={() => verdict(false)} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-amber-500/15 py-3 text-sm font-bold text-amber-700 dark:text-amber-300"><X className="h-4 w-4" /> Still learning</button>
        <button type="button" onClick={() => verdict(true)} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-500/15 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" /> Got it</button>
        <button type="button" onClick={() => go(1)} aria-label="Next card" className="rounded-full p-3 text-muted-foreground hover:bg-muted"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
