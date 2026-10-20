import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Flame, Keyboard, Mic, Sparkles, Star, Type, Undo2, Volume2 } from "lucide-react";
import SafeTextarea from "@/components/SafeTextarea";
import { listen, matchPercent, recallSupported, sayAloud, stopAloud } from "@/lib/voiceRecall";
import { openAI } from "@/lib/aiEvents";
import { DAILY_GOAL, bury, buriedKeys, doneToday, getScale, recordReview, setScale, speak, starredKeys, streak, toggleStar } from "@/lib/deckStats";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setProgress } from "@/lib/study";
import { useKeywordLinks } from "@/lib/keyword-link";
import { renderFlashcardMarkdown } from "@/components/FlashcardViewer";
import { buildMcqPath } from "@/lib/store";
import { cardKey, isDue, label, loadStates, requeueGap, saveState, schedule, type CardState, type Rating } from "@/lib/deckSrs";
import { pharmCards } from "@/lib/pharmDrill";
import { cleanTopicTitle } from "../../supabase/functions/_shared/topicTitle.js";

export interface DeckCard { question: string; answer: string; setId: string; idx: number }

const topicName = (t: string) => cleanTopicTitle(String(t).replace(/\s*[:—–-]?\s*(Flashcards?|Cards)$/i, ""));
const BTN: { r: Rating; text: string; cls: string }[] = [
  { r: "again", text: "Again", cls: "bg-muted text-foreground hover:bg-muted/70" },
  { r: "hard", text: "Hard", cls: "bg-muted text-foreground hover:bg-muted/70" },
  { r: "good", text: "Good", cls: "bg-primary text-primary-foreground hover:opacity-90" },
  { r: "easy", text: "Easy", cls: "border border-primary/40 text-primary hover:bg-primary/10" },
];

/**
 * The flashcard deck, built for a phone held in one hand and for real memorising: the card is on screen at once, tap to flip, then say how well you knew it
 * (Again, Hard, Good, Easy). Cards you miss come back in this session; cards you know come back after longer and longer gaps, and the ones due today
 * are the ones you are shown. Swipe left to put a card back at the end, swipe right to undo your last answer.
 */
export default function FlashcardDeck({ cards: base, title, category, mode = "deck", mcqSource }: { cards: DeckCard[]; title: string; category: string; mode?: "deck" | "today"; mcqSource?: string | null }) {
  const { user } = useAuth();
  const [extra, setExtra] = useState<DeckCard[]>([]);
  const [adding, setAdding] = useState(false);
  // after every ten cards of a deck comes one pharmacology card (a drug you must know), so drug facts are rehearsed all the time
  const pharm = useMemo<DeckCard[]>(() => (mode === "deck" && base.length >= 8 && !/pharmac/i.test(category) ? pharmCards(`${title} ${base.map((c) => c.question).join(" ")}`, Math.floor(base.length / 10) + 1).map((c, i) => ({ ...c, setId: "pharm", idx: i })) : []), [base, mode, category, title]);
  const cards = useMemo(() => [...base, ...pharm, ...extra], [base, pharm, extra]);
  const cardsRef = useRef(cards); cardsRef.current = cards;
  const ctx = useKeywordLinks();
  const [states, setStates] = useState<Record<string, CardState> | null>(null);
  const [queue, setQueue] = useState<number[] | null>(null);
  const [total, setTotal] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [history, setHistory] = useState<{ ci: number; prev: CardState | undefined; was: number[] }[]>([]);
  const [stats, setStats] = useState({ done: 0, again: 0 });
  const [all, setAll] = useState(false);
  const [mcq, setMcq] = useState<string | null>(null);
  const [noMore, setNoMore] = useState(false);
  const ansRef = useRef<HTMLDivElement>(null);
  const [scale, setScaleState] = useState(() => getScale());
  const [stars, setStars] = useState<Set<string>>(() => starredKeys());
  const drag = useRef<{ x: number; y: number; t: number; active: boolean; horiz: boolean | null }>({ x: 0, y: 0, t: 0, active: false, horiz: null });

  // load this reader's card states, then build the queue: cards due now, then new ones (or everything when asked)
  useEffect(() => {
    let on = true;
    void loadStates(user?.id ?? null).then((m) => {
      if (!on) return;
      setStates(m);
      const cs = base;
      const key = (ci: number) => cardKey(cs[ci].setId, cs[ci].idx);
      const hid = buriedKeys();
      const idxs = cs.map((_, i) => i).filter((i) => !hid.has(cardKey(cs[i].setId, cs[i].idx)));
      const due = idxs.filter((i) => isDue(m[key(i)])).sort((a, b) => m[key(a)].due - m[key(b)].due);
      const fresh = idxs.filter((i) => !m[key(i)]);
      let q = mode === "today" || !all ? [...due, ...fresh] : idxs;
      if (pharm.length) { const withPharm: number[] = []; q.forEach((i, n) => { withPharm.push(i); if ((n + 1) % 10 === 0 && pharm[Math.floor(n / 10)]) withPharm.push(base.length + Math.floor(n / 10)); }); q = withPharm; }
      setQueue(q); setTotal(q.length); setHistory([]); setStats({ done: 0, again: 0 }); setFlipped(false);
    });
    return () => { on = false; };
  }, [user?.id, base, all, mode, pharm]); // eslint-disable-line react-hooks/exhaustive-deps

  const finished = queue !== null && queue.length === 0;
  const ci = queue && queue.length ? queue[0] : -1;
  const card = ci >= 0 ? cards[ci] : null;
  const st = card && states ? states[cardKey(card.setId, card.idx)] : undefined;

  // How you recall: just think, type what you remember, or say it aloud. What you wrote or said is compared with the key words of the answer, and the rating
  // that fits is suggested (you still choose). Speaking listens by itself, notices when you stop, and flips the card.
  type Recall = "think" | "type" | "speak";
  const [recall, setRecall] = useState<Recall>(() => { try { const m = localStorage.getItem("deck-mode"); return m === "type" || m === "speak" ? m : localStorage.getItem("deck-typed") === "1" ? "type" : "think"; } catch { return "think"; } });
  const [typed, setTyped] = useState("");
  const [alts, setAlts] = useState<string[]>([]);
  const [voice, setVoice] = useState<"idle" | "listening" | "nothing" | "denied">("idle");
  const [voiceOk, setVoiceOk] = useState(false);          // the microphone has been allowed once, so the next cards can start listening by themselves
  const [autoFlip, setAutoFlip] = useState(() => { try { return localStorage.getItem("deck-autoflip") !== "0"; } catch { return true; } });
  const [readAloud, setReadAloud] = useState(() => { try { return localStorage.getItem("deck-readaloud") === "1"; } catch { return false; } });
  const listenRef = useRef<{ stop: () => void } | null>(null);
  const listenId = useRef(0);
  const flipTimer = useRef(0);
  const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
  const stopListening = useCallback(() => { listenId.current++; window.clearTimeout(flipTimer.current); try { listenRef.current?.stop(); } catch { /* none */ } listenRef.current = null; }, []);
  const startListening = useCallback(() => {
    if (!recallSupported()) return;
    stopAloud(); stopListening();
    const id = ++listenId.current;
    setVoice("listening"); setTyped(""); setAlts([]);
    listenRef.current = listen({
      onText: (t) => { if (id === listenId.current) setTyped(t); },
      onEnd: (text, a, why) => {
        if (id !== listenId.current) return;
        listenRef.current = null; setAlts(a);
        if (why === "denied") { setVoice("denied"); return; }
        if (!text) { setVoice(why === "stopped" ? "idle" : "nothing"); return; }
        setVoice("idle"); setVoiceOk(true); setTyped(text);
        if (autoFlip) flipTimer.current = window.setTimeout(() => setFlipped(true), 450);
      },
    });
    if (!listenRef.current) setVoice("idle");
  }, [autoFlip, stopListening]);
  useEffect(() => { stopListening(); stopAloud(); setFlipped(false); setTyped(""); setAlts([]); setVoice("idle"); }, [ci, stopListening]);
  useEffect(() => () => { stopListening(); stopAloud(); }, [stopListening]);
  // speak mode: once the microphone is allowed, every new card starts listening by itself
  useEffect(() => {
    if (recall !== "speak" || !voiceOk || flipped || !card || !recallSupported()) return;
    const t = window.setTimeout(() => startListening(), 600);
    return () => window.clearTimeout(t);
  }, [ci, recall, voiceOk]); // eslint-disable-line react-hooks/exhaustive-deps
  // switching away from speaking, or flipping the card, ends the listening; the answer can be read aloud
  useEffect(() => { if (recall !== "speak" || flipped) stopListening(); }, [recall, flipped, stopListening]);
  useEffect(() => { if (recall === "speak" && flipped && readAloud && card) sayAloud(card.answer); }, [flipped]); // eslint-disable-line react-hooks/exhaustive-deps
  const match = recall !== "think" && typed.trim() && card ? matchPercent(card.answer, typed, alts) : null;
  const suggest: Rating | null = match === null ? null : match >= 70 ? "good" : match >= 40 ? "hard" : "again";
  // the whole answer is always on the card: the text shrinks until it fits, so there is never anything to scroll
  useLayoutEffect(() => {
    const el = ansRef.current; if (!el) return;
    let z = scale; (el.style as CSSStyleDeclaration & { zoom: string }).zoom = String(z);
    while (el.scrollHeight > el.clientHeight + 1 && z > 0.5) { z = Math.round((z - 0.04) * 100) / 100; (el.style as CSSStyleDeclaration & { zoom: string }).zoom = String(z); }
  }, [ci, flipped, scale, card?.answer]);

  const rate = useCallback((r: Rating) => {
    if (!queue || !queue.length || !card || !states) return;
    const prev = states[cardKey(card.setId, card.idx)];
    const next = schedule(prev, r);
    const key = cardKey(card.setId, card.idx);
    setStates({ ...states, [key]: next });
    if (card.setId !== "pharm") void saveState(user?.id ?? null, card.setId, card.idx, next);
    const gap = requeueGap(r, next);
    const rest = queue.slice(1);
    const q = gap > 0 ? [...rest.slice(0, gap), ci, ...rest.slice(gap)] : rest;
    recordReview();
    setHistory((h) => [...h.slice(-30), { ci, prev, was: queue }]);
    setStats((s) => ({ done: s.done + 1, again: s.again + (r === "again" ? 1 : 0) }));
    setQueue(q);
  }, [queue, card, states, ci, user?.id]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last || !states) return;
    const c = cards[last.ci]; const key = cardKey(c.setId, c.idx);
    const next = { ...states };
    if (last.prev) next[key] = last.prev; else delete next[key];
    setStates(next);
    if (last.prev) void saveState(user?.id ?? null, c.setId, c.idx, last.prev);
    setQueue(last.was); setHistory((h) => h.slice(0, -1)); setStats((s) => ({ done: Math.max(0, s.done - 1), again: s.again }));
  }, [history, states, cards, user?.id]);

  /** After a session: up to 20 more cards from other decks of the same unit that this reader has not seen yet. */
  const addMore = useCallback(async () => {
    if (!states || adding) return;
    setAdding(true);
    try {
      const have = new Set(cardsRef.current.map((c) => c.setId));
      const { data } = await (supabase as any).from("flashcard_sets").select("id,cards").eq("category", category).eq("published", true).is("deleted_at", null).limit(40);
      const sets = ((data || []) as { id: string; cards: { question: string; answer: string }[] }[]).filter((r) => !have.has(r.id) && Array.isArray(r.cards)).sort(() => Math.random() - 0.5);
      const more: DeckCard[] = [];
      for (const r of sets) { r.cards.forEach((c, idx) => { if (more.length < 20 && c?.question && c?.answer && !states[cardKey(r.id, idx)]) more.push({ question: c.question, answer: c.answer, setId: r.id, idx }); }); if (more.length >= 20) break; }
      if (more.length) {
        const start = cardsRef.current.length;
        cardsRef.current = [...cardsRef.current, ...more];
        setExtra((e) => [...e, ...more]);
        setQueue(more.map((_, i) => start + i)); setTotal(more.length); setStats({ done: 0, again: 0 }); setHistory([]); setFlipped(false);
      } else setNoMore(true);
    } catch { setNoMore(true); }
    setAdding(false);
  }, [states, adding, category]);

  const hide = useCallback(() => { if (!card || !queue) return; bury(cardKey(card.setId, card.idx)); setQueue(queue.slice(1)); }, [card, queue]);

  const skip = useCallback(() => { if (!queue || queue.length < 2) return; setLeaving(true); window.setTimeout(() => { setQueue((q) => (q ? [...q.slice(1), q[0]] : q)); setLeaving(false); setDx(0); }, 160); }, [queue]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      else if (flipped && e.key === "1") rate("again");
      else if (flipped && e.key === "2") rate("hard");
      else if (flipped && e.key === "3") rate("good");
      else if (flipped && e.key === "4") rate("easy");
      else if (e.key === "ArrowLeft") undo();
      else if (e.key === "ArrowRight") skip();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [flipped, rate, undo, skip]);

  // finished: record in the account and find the matching MCQ bank
  useEffect(() => {
    if (!finished || !cards.length) return;
    if (mode === "deck") void setProgress(user?.id ?? null, "flashcard", cards[0].setId, { status: "completed", progress_percent: 100 }).catch(() => undefined);
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // the question bank made from the same note is one tap away the whole time, not only at the end
  useEffect(() => {
    if (mcqSource) void (async () => {
      try {
        const { data: m } = await (supabase as any).from("mcq_sets").select("id,title,slug").eq("source_reference", mcqSource).eq("published", true).is("deleted_at", null).limit(1);
        if (m && m[0]) setMcq(buildMcqPath(m[0]));
      } catch { /* optional */ }
    })();
  }, [mcqSource]);

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
    if (d.horiz && Math.abs(mx) > 70) { if (mx < 0) skip(); else { undo(); setDx(0); } return; }
    setDx(0);
    if (!d.horiz && Date.now() - d.t < 400 && Math.abs(mx) < 8) setFlipped((f) => !f);
  };

  const counts = useMemo(() => {
    let n = 0, l = 0, d = 0;
    for (const i of queue ?? []) { const x = states?.[cardKey(cards[i].setId, cards[i].idx)]; if (!x) n++; else if (x.reps === 0) l++; else d++; }
    return { n, l, d };
  }, [queue, states, cards]);
  const name = mode === "today" ? "Today's flashcards" : topicName(title);
  const nextDue = useMemo(() => {
    if (!states) return null;
    const dues = cards.map((c) => states[cardKey(c.setId, c.idx)]?.due).filter((d): d is number => !!d && d > Date.now());
    return dues.length ? Math.min(...dues) : null;
  }, [states, cards, finished]); // eslint-disable-line react-hooks/exhaustive-deps
  const when = (t: number) => { const h = (t - Date.now()) / 3_600_000; return h < 1 ? "within the hour" : h < 24 ? `in ${Math.round(h)} hours` : `in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"}`; };

  const header = (
    <div className="flex items-center gap-2 pb-2 pt-1">
      <Link to="/flashcards" aria-label="Back to flashcards" className="-ml-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[18px] font-bold leading-tight text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{mode === "today" ? "Due cards and a few new ones" : `${category.replace(/^Year\s*\d\s*:\s*/i, "")} · ${cards.length} cards`}</p>
      </div>
      {streak() > 0 && <span className="inline-flex items-center gap-1 text-sm font-bold text-orange-500" title="Days in a row"><Flame className="h-4 w-4" aria-hidden />{streak()}</span>}
      <span className="flex items-center gap-2 text-sm font-bold tabular-nums" title="New · Learning · To review"><span className="text-sky-500">{counts.n}</span><span className="text-rose-500">{counts.l}</span><span className="text-emerald-600">{counts.d}</span></span>
      <button type="button" onClick={undo} disabled={!history.length} aria-label="Undo the last answer" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
    </div>
  );
  const bar = <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${total ? Math.min(100, (stats.done / (stats.done + (queue?.length ?? 0) || 1)) * 100) : 0}%` }} /></div>;

  if (queue === null) return <div className="flex min-h-[60dvh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" /></div>;

  if (finished) {
    const sure = stats.done > 0 ? Math.round(((stats.done - stats.again) / stats.done) * 100) : null;
    return (
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
        {header}{bar}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{stats.done ? "Session complete" : "All caught up"}</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{doneToday()} of {DAILY_GOAL} cards today{streak() > 0 ? ` · ${streak()} day streak` : ""}</p>
          {stats.done > 0 ? <p className="mt-2 font-serif text-5xl font-bold tabular-nums">{stats.done}<span className="text-2xl text-muted-foreground"> cards</span></p> : <p className="mt-2 font-serif text-3xl font-bold">Nothing due right now</p>}
          <p className="mt-2 max-w-xs text-[15px] text-muted-foreground">
            {sure !== null ? `${sure}% without needing "Again". ` : ""}{nextDue ? `Your next cards are due ${when(nextDue)}. Coming back then is what makes them stick.` : "Come back tomorrow for the next ones."}
          </p>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
            {mode === "deck" && stats.done > 0 && !noMore && <button type="button" onClick={() => void addMore()} disabled={adding} className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">{adding ? "Finding cards…" : "Add 20 more cards"}</button>}
            {mode === "deck" && noMore && <p className="text-xs text-muted-foreground">No unseen cards left in this unit yet.</p>}
            {mode === "deck" && <button type="button" onClick={() => setAll(true)} className="rounded-full border border-border px-5 py-3 text-sm font-bold hover:bg-muted">Study every card anyway</button>}
            {mode === "deck" && mcq && <Link to={mcq} className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Test yourself with the MCQs</Link>}
            <Link to="/flashcards" className="px-5 py-3 text-sm font-bold text-primary hover:underline">More decks</Link>
          </div>
        </div>
      </div>
    );
  }

  const style: React.CSSProperties = { transform: `translateX(${leaving ? -140 : dx}px) rotate(${leaving ? -8 : dx / 18}deg)`, opacity: leaving ? 0 : 1 - Math.min(0.35, Math.abs(dx) / 500), transition: drag.current.active && !leaving ? "none" : "transform 160ms ease-out, opacity 160ms ease-out", touchAction: "pan-y" };
  const face = "absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)] sm:p-7";
  const learningNote = st && st.reps === 0 && st.lapses > 0 ? "Learning again" : st ? `Seen ${st.reps}×` : "New card";

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      {header}{bar}
      <div className="relative mt-3 flex flex-1 items-stretch justify-center" style={{ minHeight: "min(58dvh, 30rem)" }}>
        <div className="w-full max-w-md select-none sm:max-w-xl" style={{ perspective: "1400px" }}>
          <div className="relative h-full min-h-[min(58dvh,30rem)] w-full cursor-pointer" style={style} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="button" tabIndex={0} aria-label={flipped ? "Answer. Tap to see the question." : "Question. Tap to see the answer."}>
            <div className="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: flipped ? "rotateY(180deg)" : "none" }}>
              <div className={face} style={{ backfaceVisibility: "hidden" }}>
                <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Question · {learningNote}</p>{card && <button type="button" aria-label={stars.has(cardKey(card.setId, card.idx)) ? "Remove star" : "Star this card to revise it again"} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); const k = cardKey(card.setId, card.idx); toggleStar(k); setStars(starredKeys()); }} className="-mr-1 rounded-full p-1.5"><Star className={`h-5 w-5 ${stars.has(cardKey(card.setId, card.idx)) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} /></button>}</div>
                <div style={{ zoom: scale }} className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto py-4 text-center font-serif text-[26px] font-semibold leading-snug text-foreground sm:text-[28px] [&_img]:mx-auto [&_img]:max-h-[40dvh] [&_img]:rounded-xl [&_p]:text-center [&_p]:leading-snug">{renderFlashcardMarkdown(card?.question || "", ctx)}</div>
                <p className="text-center text-xs text-muted-foreground">Tap to flip · swipe left to skip · swipe right to undo · keys 1–4 rate</p>
              </div>
              <div className={`${face} border-primary/30`} style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Answer</p>
                <div ref={ansRef} className="mt-2 flex flex-1 flex-col gap-2 overflow-hidden pr-1 text-left [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto text-[18px] leading-relaxed text-foreground sm:text-[19px] [&_strong]:font-bold [&_strong]:text-primary [&_img]:mx-auto [&_img]:my-2 [&_img]:max-h-[40dvh] [&_img]:rounded-xl [&_li]:my-1 [&_li]:text-[17px] [&_li]:leading-snug [&_p]:text-[17px] [&_p]:leading-snug">{renderFlashcardMarkdown(card?.answer || "", ctx)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-2 flex w-full max-w-md sm:max-w-xl items-center justify-center gap-1 text-muted-foreground">
        <button type="button" onClick={() => speak(flipped ? card?.answer || "" : card?.question || "")} aria-label="Read aloud" className="rounded-full p-2 hover:bg-muted hover:text-foreground"><Volume2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => { const n = scale >= 1.3 ? 0.9 : scale >= 1.1 ? 1.3 : 1.15; setScale(n); setScaleState(n); }} aria-label="Change text size" className="rounded-full p-2 hover:bg-muted hover:text-foreground"><Type className="h-4 w-4" /></button>
        <button type="button" onClick={() => card && openAI(`Explain this to me simply, with the mechanism and a clinical example: ${card.question.replace(/[*]+/g, "")}`)} aria-label="Ask Ompath AI to explain this card" className="rounded-full p-2 hover:bg-muted hover:text-foreground"><Sparkles className="h-4 w-4" /></button>
        <span className="mx-1 inline-flex rounded-full bg-muted p-0.5" role="group" aria-label="How you recall">
          {([["think", Eye, "Think it through"], ["type", Keyboard, "Type what you remember"], ["speak", Mic, "Say what you remember"]] as const).map(([m, Icon, label]) => (
            <button key={m} type="button" aria-pressed={recall === m} aria-label={label} title={label} onClick={() => { setRecall(m); keep("deck-mode", m); setTyped(""); setAlts([]); setVoice("idle"); }} className={`rounded-full p-1.5 ${recall === m ? "bg-primary text-primary-foreground" : "hover:text-foreground"}`}><Icon className="h-4 w-4" /></button>
          ))}
        </span>
        <button type="button" onClick={hide} aria-label="Never show this card again" className="rounded-full p-2 hover:bg-muted hover:text-foreground"><EyeOff className="h-4 w-4" /></button>
      </div>
      {mcq && <Link to={mcq} className="mx-auto mt-1 block w-full max-w-md text-center text-sm font-bold text-primary hover:underline sm:max-w-xl">Test yourself with MCQs on this topic →</Link>}
      <div className="sticky bottom-0 z-10 mx-auto mt-2 w-full max-w-md sm:max-w-xl bg-background/95 pb-3 pt-1 backdrop-blur">
        {!flipped ? (
          <>
            {recall === "type" && <SafeTextarea value={typed} onValueChange={setTyped} onKeyDown={(e) => e.stopPropagation()} rows={2} placeholder="Type what you remember, then show the answer" className="mb-2 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-[16px] outline-none focus:border-primary" />}
            {recall === "speak" && (
              <div className="mb-2 text-center">
                {!recallSupported() ? <p className="py-2 text-sm text-muted-foreground">Voice recall needs Chrome or Edge on this device. Use Type, or just flip the card.</p> : (
                  <>
                    <div className="flex items-center justify-center gap-3">
                      <button type="button" onClick={() => (voice === "listening" ? (stopListening(), setVoice("idle")) : startListening())} aria-label={voice === "listening" ? "Stop listening" : "Start speaking"} className={`relative flex h-16 w-16 items-center justify-center rounded-full ${voice === "listening" ? "bg-rose-500 text-white" : "bg-primary text-primary-foreground"}`}>
                        {voice === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" aria-hidden />}
                        <Mic className="relative h-7 w-7" />
                      </button>
                    </div>
                    <p className="mt-2 min-h-[2.5rem] px-2 text-sm leading-snug text-foreground/85">
                      {voice === "listening" ? (typed ? `“${typed}”` : "Listening… say what you remember") : voice === "nothing" ? "I did not hear anything. Tap the microphone to try again." : voice === "denied" ? "Allow the microphone for this site in your browser, then tap again." : typed ? `“${typed}”` : voiceOk ? "Starting the microphone…" : "Tap the microphone and say what you remember"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={autoFlip} onChange={(e) => { setAutoFlip(e.target.checked); keep("deck-autoflip", e.target.checked ? "1" : "0"); }} /> Flip when I stop</label>
                      <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={readAloud} onChange={(e) => { setReadAloud(e.target.checked); keep("deck-readaloud", e.target.checked ? "1" : "0"); }} /> Read the answer aloud</label>
                    </div>
                  </>
                )}
              </div>
            )}
            <button type="button" onClick={() => setFlipped(true)} className={`w-full rounded-full py-4 text-base font-bold ${recall === "speak" && voice === "listening" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>{recall === "speak" && typed && voice !== "listening" ? "Flip now" : "Show answer"}</button>
          </>
        ) : (
          <>
          {match !== null && (
            <div className="mb-2 text-center">
              <p className="line-clamp-2 text-sm italic leading-snug text-foreground/80">You {recall === "speak" ? "said" : "wrote"}: “{typed}”</p>
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">You matched {match}% of the key words{suggest ? ` · suggested: ${suggest === "again" ? "Again" : suggest === "hard" ? "Hard" : "Good"}` : ""}</p>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
            {BTN.map((b) => (
              <button key={b.r} type="button" onClick={() => rate(b.r)} className={`flex flex-col items-center rounded-xl px-1 py-3 transition-colors ${b.cls} ${suggest === b.r ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                <span className="text-[15px] font-bold">{b.text}</span>
                <span className="mt-0.5 text-[11px] font-medium opacity-70">{label(st, b.r)}</span>
              </button>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
