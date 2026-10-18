import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, BookOpen, ChevronRight, Layers, ListChecks, RotateCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { mdToHtml } from "@/lib/miniMarkdown";
import { affiliatesFor, useMonetise } from "@/lib/monetise";

/**
 * A short pause between two paragraphs of a study note: a few questions, flashcards, a related note to read in a pop-up, or a book.
 * It is chosen from what the student has read so far, loads only when it is about to scroll into view (the space is held so the page never jumps),
 * and can be closed with one tap. No box: a thin rule and plain text, like the rest of the note.
 */
export type BreakKind = "quiz" | "cards" | "read" | "books";

interface Mcq { question: string; options: string[]; correct_answer: number; explanation?: string }
interface Card { question: string; answer: string }
interface Note { id: string; title: string; meta_description: string | null }

const STOP = new Set("about after again also because before between could during every other should their there these those through under which while would with from have this that into than then them what when where will your".split(" "));
const words = (text: string) => [...new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 4 && !STOP.has(w)))];
const overlap = (text: string, keys: string[]) => { const t = text.toLowerCase(); return keys.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0); };
/** Best matches for what was just read, with a little randomness so a returning reader does not see the same thing twice. */
function pick<T>(items: T[], textOf: (x: T) => string, keys: string[], n: number): T[] {
  return items.map((x) => ({ x, s: overlap(textOf(x), keys) + Math.random() * 1.2 })).sort((a, b) => b.s - a.s).slice(0, n).map((r) => r.x);
}

function useNearScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "700px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return { ref, near };
}

const Label = ({ icon: Icon, children }: { icon: typeof Layers; children: string }) => (
  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary"><Icon className="h-3.5 w-3.5" aria-hidden />{children}</p>
);

function Quiz({ questions }: { questions: Mcq[] }) {
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const q = questions[i];
  const next = () => { setChosen(null); setShown(false); setI((n) => n + 1); };
  if (!q) return <p className="mt-2 text-sm text-muted-foreground">That is all for this pause. Keep reading.</p>;
  const reveal = shown || chosen !== null;
  return (
    <div className="mt-2">
      <p className="text-[15px] font-semibold leading-snug text-foreground">{q.question}</p>
      <ul className="mt-2 space-y-1">
        {q.options.map((o, k) => {
          const right = reveal && k === q.correct_answer, wrong = chosen === k && k !== q.correct_answer;
          return (
            <li key={k}>
              <button type="button" disabled={reveal} onClick={() => setChosen(k)} className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[14px] leading-snug transition-colors ${right ? "bg-emerald-500/15 text-foreground" : wrong ? "bg-destructive/10 text-foreground" : "hover:bg-primary/5"}`}>
                <span className="mt-px font-bold text-primary">{String.fromCharCode(65 + k)}.</span><span className="min-w-0 break-words">{o}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {reveal && q.explanation && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{q.explanation}</p>}
      <div className="mt-2 flex items-center gap-4 text-sm font-semibold">
        {!reveal && <button type="button" onClick={() => setShown(true)} className="text-primary hover:underline">Show answer</button>}
        {reveal && <button type="button" onClick={next} className="inline-flex items-center gap-1 text-primary hover:underline">{i + 1 < questions.length ? "Next question" : "Done"}<ChevronRight className="h-4 w-4" /></button>}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{i + 1} of {questions.length}</span>
      </div>
    </div>
  );
}

function Flash({ cards }: { cards: Card[] }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = cards[i];
  if (!c) return <p className="mt-2 text-sm text-muted-foreground">That is all for this pause. Keep reading.</p>;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setFlip((f) => !f)} className="block w-full border-l-[3px] border-primary/50 py-1 pl-3 text-left" aria-label={flip ? "Show the question" : "Show the answer"}>
        {!flip ? <p className="text-[15px] font-semibold leading-snug text-foreground">{c.question}</p>
          : <div className="note-body text-[14px] leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: mdToHtml(c.answer, { skipTitle: true }) }} />}
      </button>
      <div className="mt-2 flex items-center gap-4 text-sm font-semibold">
        <button type="button" onClick={() => setFlip((f) => !f)} className="inline-flex items-center gap-1 text-primary hover:underline"><RotateCw className="h-3.5 w-3.5" />{flip ? "Show question" : "Show answer"}</button>
        <button type="button" onClick={() => { setFlip(false); setI((n) => n + 1); }} className="inline-flex items-center gap-1 text-primary hover:underline">{i + 1 < cards.length ? "Next card" : "Done"}<ChevronRight className="h-4 w-4" /></button>
        <span className="ml-auto text-xs font-normal text-muted-foreground">{i + 1} of {cards.length}</span>
      </div>
    </div>
  );
}

function NotePopup({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    if (!note) { setHtml(null); return; }
    let live = true;
    (supabase as any).from("articles").select("content").eq("id", note.id).maybeSingle().then(({ data }: { data: { content?: string } | null }) => {
      if (live) setHtml(mdToHtml(String(data?.content || "").slice(0, 14000), { skipTitle: true }));
    });
    return () => { live = false; };
  }, [note]);
  return (
    <Dialog open={!!note} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle className="pr-6 font-serif text-xl">{note?.title}</DialogTitle>
        <DialogDescription className="sr-only">A related note, shown here so you can read it and go back to where you were.</DialogDescription>
        {html === null ? <div className="space-y-2" aria-busy="true"><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-5/6 animate-pulse rounded bg-muted" /></div>
          : <div className="note-body text-[15px] leading-7" dangerouslySetInnerHTML={{ __html: html }} />}
        <button type="button" onClick={onClose} className="mt-2 self-start rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to my reading</button>
      </DialogContent>
    </Dialog>
  );
}

interface Props { kind: BreakKind; articleId: string; category: string; title: string; readText: string }

/** One pause. Renders nothing at all when it has nothing relevant to offer (and takes back the space it was holding). */
const ReadingBreak = memo(function ReadingBreak({ kind, articleId, category, title, readText }: Props) {
  const { ref, near } = useNearScreen<HTMLDivElement>();
  const [closed, setClosed] = useState(false);
  const [state, setState] = useState<{ kind: BreakKind; mcq?: Mcq[]; cards?: Card[]; notes?: Note[] } | "none" | null>(null);
  const [open, setOpen] = useState<Note | null>(null);
  const { affiliates } = useMonetise();
  const keys = useMemo(() => words(`${title} ${readText.slice(-1800)}`).slice(0, 40), [title, readText]);
  const titleKeys = useMemo(() => words(title).slice(0, 6), [title]);
  /** A question belongs here only if it names the subject of the note, or shares at least two words with what was just read. */
  const onTopic = (text: string) => overlap(text, titleKeys) >= 1 || overlap(text, keys) >= 2;
  const books = useMemo(() => affiliatesFor(affiliates, `${title} ${readText.slice(0, 4000)}`), [affiliates, title, readText]);

  useEffect(() => {
    if (!near || state !== null || closed) return;
    let live = true;
    const order: BreakKind[] = [kind, ...(["quiz", "cards", "read", "books"] as BreakKind[]).filter((k) => k !== kind)];
    (async () => {
      for (const k of order) {
        try {
          if (k === "quiz") {
            const { data } = await (supabase as any).from("mcq_sets").select("questions").eq("published", true).eq("category", category).is("deleted_at", null).limit(4);
            const all: Mcq[] = ((data || []) as { questions: Mcq[] }[]).flatMap((r) => (Array.isArray(r.questions) ? r.questions : [])).filter((q) => q?.question && Array.isArray(q.options) && q.options.length >= 4 && Number.isInteger(q.correct_answer));
            const rel = all.filter((q) => onTopic(`${q.question} ${q.options.join(" ")}`));
            if (rel.length >= 2) { if (live) setState({ kind: k, mcq: pick(rel, (q) => `${q.question} ${q.options.join(" ")}`, keys, 3) }); return; }
          } else if (k === "cards") {
            const { data } = await (supabase as any).from("flashcard_sets").select("cards").eq("published", true).eq("category", category).limit(4);
            const all: Card[] = ((data || []) as { cards: Card[] }[]).flatMap((r) => (Array.isArray(r.cards) ? r.cards : [])).filter((c) => c?.question && c?.answer);
            const rel = all.filter((c) => onTopic(`${c.question} ${c.answer}`));
            if (rel.length >= 2) { if (live) setState({ kind: k, cards: pick(rel, (c) => `${c.question} ${c.answer}`, keys, 4) }); return; }
          } else if (k === "read") {
            const { data } = await (supabase as any).from("articles").select("id, title, meta_description").eq("published", true).eq("category", category).is("deleted_at", null).neq("id", articleId).limit(12);
            const notes = ((data || []) as Note[]).filter((n) => !/mcq|question|exam|paper|quiz|bank/i.test(n.title));
            if (notes.length) { if (live) setState({ kind: k, notes: pick(notes, (n) => `${n.title} ${n.meta_description || ""}`, keys, 2) }); return; }
          } else if (k === "books" && books.length) { if (live) setState({ kind: k }); return; }
        } catch { /* try the next kind */ }
      }
      if (live) setState("none");
    })();
    return () => { live = false; };
  }, [near, state, closed, kind, category, articleId, keys, books.length]);

  if (closed || state === "none") return null;
  const ready = state;
  const k = ready ? ready.kind : kind;
  return (
    <div ref={ref} className="not-prose my-8 border-y border-border py-4" style={state === null ? { minHeight: 150 } : undefined} data-reading-break={k}>
      {ready && (
        <>
          <div className="flex items-start justify-between gap-3">
            {k === "quiz" && <Label icon={ListChecks}>Quick check on what you just read</Label>}
            {k === "cards" && <Label icon={Layers}>Flip and recall</Label>}
            {k === "read" && <Label icon={BookOpen}>Worth a read next to this</Label>}
            {k === "books" && <Label icon={BookMarked}>To read next</Label>}
            <button type="button" onClick={() => setClosed(true)} aria-label="Close and keep reading" className="-mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          {k === "quiz" && ready.mcq && <Quiz questions={ready.mcq} />}
          {k === "cards" && ready.cards && <Flash cards={ready.cards} />}
          {k === "read" && ready.notes && (
            <ul className="mt-2 space-y-2">
              {ready.notes.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => setOpen(n)} className="group block w-full text-left">
                    <span className="block text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary">{n.title}</span>
                    {n.meta_description && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">{n.meta_description}</span>}
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary">Read it here <ChevronRight className="h-3.5 w-3.5" /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {k === "books" && (
            <ul className="mt-2 space-y-2">
              {books.map((a) => <li key={a.id}><a href={a.url} target="_blank" rel="noopener noreferrer sponsored" className="text-[15px] font-semibold text-foreground hover:text-primary">{a.title}<span className="ml-1.5 text-xs font-normal text-muted-foreground">{a.label}</span></a></li>)}
              <li className="text-[11px] text-muted-foreground">Some links may earn Ompath Study a small commission at no cost to you.</li>
            </ul>
          )}
          <NotePopup note={open} onClose={() => setOpen(null)} />
        </>
      )}
    </div>
  );
});

export default ReadingBreak;

/** Where to put the pauses among `count` top-level pieces of a note, and which kind goes where. Stable for one note (the same note always gets the same plan). */
export function planBreaks(articleId: string, count: number, hasBooks: boolean): { at: number; kind: BreakKind }[] {
  if (count < 18) return [];
  let h = 0;
  for (const ch of articleId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const jitter = (n: number) => ((h >>> n) % 7) - 3;               // a few paragraphs either way, so the pauses do not sit at the same spot on every note
  const kinds: BreakKind[] = ["quiz", "cards", "read", ...(hasBooks ? (["books"] as BreakKind[]) : [])];
  const turn = h % kinds.length;
  const stops = count >= 60 ? [0.28, 0.55, 0.82] : count >= 32 ? [0.4, 0.75] : [0.55];
  return stops.map((p, n) => ({ at: Math.max(6, Math.min(count - 4, Math.round(count * p) + jitter(n * 3))), kind: kinds[(turn + n) % kinds.length] }));
}

/**
 * Shows a long note a screenful at a time: the first pieces appear at once so reading can start, the rest are added in small slices while the
 * browser is idle (a grey placeholder holds the place), so the screen never locks while a long page is built.
 */
export function ProgressiveList({ items, first = 24, slice = 20 }: { items: React.ReactNode[]; first?: number; slice?: number }) {
  // a link to a heading further down, or a search highlight, needs the whole page to exist
  const needsAll = () => typeof window !== "undefined" && (!!window.location.hash || /[?&](q|highlight|hl)=/.test(window.location.search));
  const [shown, setShown] = useState(() => (needsAll() ? items.length : Math.min(items.length, first)));
  useEffect(() => {
    const all = () => setShown(items.length);
    const onClick = (e: Event) => { const a = (e.target as HTMLElement | null)?.closest?.("a[href^=\"#\"], button[data-toc]"); if (a) all(); };
    window.addEventListener("hashchange", all);
    document.addEventListener("pointerdown", onClick, true);
    return () => { window.removeEventListener("hashchange", all); document.removeEventListener("pointerdown", onClick, true); };
  }, [items.length]);
  useEffect(() => { setShown((n) => Math.min(items.length, Math.max(n, first))); }, [items.length, first]);
  useEffect(() => {
    if (shown >= items.length) { window.dispatchEvent(new Event("ompath:note-ready")); return; }
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    const go = () => setShown((n) => Math.min(items.length, n + slice));
    const id = idle ? idle(go, { timeout: 250 }) : window.setTimeout(go, 60);
    return () => { if (idle && cancel) cancel(id); else window.clearTimeout(id); };
  }, [shown, items.length, slice]);
  return (
    <div>
      {items.slice(0, shown)}
      {shown < items.length && (
        <div className="space-y-3 py-4" aria-busy="true" aria-label="Loading the rest of the page">
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      )}
    </div>
  );
}
