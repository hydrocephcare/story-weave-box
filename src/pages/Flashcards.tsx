import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Layers, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildFlashcardPath, getCategoryDisplayName } from "@/lib/store";
import { updateMetaTags } from "@/lib/seo";
import { useScopedYear, yearOfCategory } from "@/hooks/useMyYear";
import { useDueCount, useMyDecks } from "@/lib/myDecks";
import { DAILY_GOAL, doneToday, starredKeys, streak } from "@/lib/deckStats";
import { cleanTopicTitle } from "../../supabase/functions/_shared/topicTitle.js";

interface Row { id: string; title: string; slug: string | null; category: string; created_at: string; card_count: number; source_reference: string | null }

const name = (t: string) => cleanTopicTitle(String(t).replace(/\s*[:—–-]?\s*Flashcards?$/i, ""));
const progressOf = (id: string): { pos: number; known: number; total: number } | null => {
  try { const s = JSON.parse(localStorage.getItem(`deck:${id}`) || "null"); return s && Array.isArray(s.order) ? { pos: s.pos, known: (s.known || []).length, total: s.order.length } : null; } catch { return null; }
};

/** Flashcards: first the decks for what you have read, then your year's decks by unit, flat and quick to scan. */
export default function Flashcards() {
  const { year } = useScopedYear();
  const mine = useMyDecks();
  const due = useDueCount();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unit, setUnit] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(40);

  useEffect(() => {
    updateMetaTags({ title: "Flashcards", description: "Flashcards made from the Ompath Study notes: flip, swipe and revise by unit. A deck is made for every note you read." });
    let on = true;
    void Promise.resolve((supabase as any).rpc("flashcard_catalog")).then(({ data }: { data: Row[] | null }) => { if (on) setRows(data ?? []); }, () => { if (on) setRows([]); });
    return () => { on = false; };
  }, []);

  const inYear = useMemo(() => (rows ?? []).filter((r) => !year || yearOfCategory(r.category) === year || yearOfCategory(r.category) === null), [rows, year]);
  const units = useMemo(() => { const m = new Map<string, number>(); for (const r of inYear) { const u = getCategoryDisplayName(r.category); m.set(u, (m.get(u) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([n]) => n); }, [inYear]);
  const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => inYear
    .filter((r) => (!unit || getCategoryDisplayName(r.category) === unit) && needles.every((w) => `${name(r.title)} ${getCategoryDisplayName(r.category)}`.toLowerCase().includes(w)))
    .sort((a, b) => getCategoryDisplayName(a.category).localeCompare(getCategoryDisplayName(b.category)) || name(a.title).localeCompare(name(b.title), undefined, { sensitivity: "base", numeric: true })), [inYear, unit, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of list.slice(0, shown)) { const u = getCategoryDisplayName(r.category); (m.get(u) ?? m.set(u, []).get(u)!).push(r); }
    return [...m.entries()];
  }, [list, shown]);

  const row = (r: { id: string; title: string; slug: string | null; category: string; card_count?: number }) => {
    const p = progressOf(r.id);
    const done = p && p.total > 0 && p.pos >= p.total && p.known >= p.total;
    return (
      <li key={r.id}>
        <Link to={buildFlashcardPath({ id: r.id, title: r.title, slug: r.slug })} className="group flex items-center gap-3 py-3">
          <Layers className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold text-foreground group-hover:text-primary">{name(r.title)}</span>
            <span className="block truncate text-xs text-muted-foreground">{getCategoryDisplayName(r.category)}{r.card_count ? ` · ${r.card_count} cards` : ""}{p && p.pos > 0 && !done ? ` · card ${Math.min(p.pos + 1, p.total)} of ${p.total}` : ""}</span>
          </span>
          {done ? <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Finished" /> : <ArrowRight className="h-4 w-4 shrink-0 text-primary/50 transition-transform group-hover:translate-x-0.5" aria-hidden />}
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Flashcards</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">Tap a card to flip it, swipe for the next one. A deck is made for every note you read, and it appears here for you.</p>

      <Link to="/flashcards/today" className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground">
        <span><span className="block text-xs font-bold uppercase tracking-[0.16em] opacity-80">Today</span><span className="block text-lg font-bold">{due > 0 ? `${due} card${due === 1 ? "" : "s"} due` : "Daily flashcards"}</span><span className="block text-xs opacity-80">Spaced so you remember them: the cards you miss come back sooner.</span></span>
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
      </Link>

      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground"><span><b className="text-foreground">{doneToday()}</b> / {DAILY_GOAL} cards today</span>{streak() > 0 && <span><b className="text-orange-500">{streak()}</b> day streak</span>}{starredKeys().size > 0 && <Link to="/flashcards/today?starred=1" className="font-bold text-primary hover:underline">Revise {starredKeys().size} starred</Link>}</p>

      {mine && mine.length > 0 && (
        <section className="mt-7" aria-label="From what you read">
          <h2 className="font-serif text-xl font-bold">From what you read</h2>
          <p className="text-xs text-muted-foreground">Decks for the notes you have finished, newest first.</p>
          <ul className="mt-1 divide-y divide-border border-y border-border">{mine.slice(0, 6).map((d) => row({ ...d, card_count: (rows ?? []).find((r) => r.id === d.id)?.card_count }))}</ul>
        </section>
      )}

      <section className="mt-9" aria-label="All decks">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl font-bold">{year ? `Year ${year} decks` : "All decks"}</h2>
          <span className="text-xs text-muted-foreground">{rows ? `${list.length} deck${list.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(40); }} placeholder="Search a topic, e.g. asthma" aria-label="Search flashcards" className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-9 text-sm outline-none focus:border-primary" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
        </label>
        {units.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Unit">
            <button type="button" role="tab" aria-selected={!unit} onClick={() => { setUnit(""); setShown(40); }} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${!unit ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>All units</button>
            {units.map((u) => <button key={u} type="button" role="tab" aria-selected={unit === u} onClick={() => { setUnit(u); setShown(40); }} className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold ${unit === u ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{u}</button>)}
          </div>
        )}

        {rows === null ? <div className="mt-6 space-y-3" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
          : list.length === 0 ? <p className="mt-10 text-center text-sm text-muted-foreground">No decks here yet. A deck is made for each note, a few every minute.</p>
          : (
            <div className="mt-4 space-y-6">
              {groups.map(([u, items]) => (
                <div key={u}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{u} · {items.length}</h3>
                  <ul className="mt-1 divide-y divide-border border-y border-border">{items.map((r) => row(r))}</ul>
                </div>
              ))}
              {list.length > shown && <button type="button" onClick={() => setShown((n) => n + 40)} className="mx-auto block rounded-full px-6 py-2.5 text-sm font-bold text-primary hover:underline">Show more ({list.length - shown} left)</button>}
            </div>
          )}
      </section>
    </div>
  );
}
