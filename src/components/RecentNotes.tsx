import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCategoryDisplayName, getYearFromCategory } from "@/lib/store";
import { STATIC_NOTES } from "@/data/staticNotes";

interface Item { key: string; title: string; to: string; year: number; unit: string; at: number }
interface Card { id: string; year: number; unit: string; items: Item[]; latest: number; all: string }

const NEW_FOR = 14 * 86_400_000;
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

let dbMemo: Promise<Item[]> | null = null;
function loadRecentArticles(): Promise<Item[]> {
  dbMemo ??= Promise.resolve(
    supabase.from("articles").select("id,title,slug,category,created_at").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(80),
  ).then((r) => ((r.data ?? []) as { id: string; title: string; slug: string | null; category: string; created_at: string }[])
    .map((a) => {
      const y = getYearFromCategory(a.category);
      return y ? { key: `a:${a.id}`, title: a.title, to: `/blog/${a.slug || a.id}`, year: Number(y.slice(5)), unit: getCategoryDisplayName(a.category), at: Date.parse(a.created_at) } : null;
    })
    .filter((x): x is Item => Boolean(x) && Number.isFinite((x as Item).at)))
    .catch(() => [] as Item[]);
  return dbMemo;
}

/** The newest notes on the site, grouped by year and unit, so something you have just added is easy to find. */
export default function RecentNotes() {
  const [fromDb, setFromDb] = useState<Item[]>([]);
  const [year, setYear] = useState<number | "all">("all");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { let on = true; loadRecentArticles().then((l) => { if (on) setFromDb(l); }); return () => { on = false; }; }, []);

  const { cards, years } = useMemo(() => {
    const own: Item[] = STATIC_NOTES.filter((n) => !n.paper).map((n, i) => ({ key: `s:${n.slug}`, title: n.title, to: `/notes/${n.slug}`, year: n.year, unit: n.unit, at: Date.parse(n.updated) - i }));
    const byUnit = new Map<string, Card>();
    for (const it of [...own, ...fromDb]) {
      const id = `${it.year}|${it.unit}`;
      let c = byUnit.get(id);
      if (!c) { c = { id, year: it.year, unit: it.unit, items: [], latest: 0, all: it.key.startsWith("s:") ? `/notes?year=${it.year}` : `/blog?year=${encodeURIComponent(`Year ${it.year}`)}` }; byUnit.set(id, c); }
      c.items.push(it);
      c.latest = Math.max(c.latest, it.at);
    }
    const list = [...byUnit.values()].map((c) => ({ ...c, items: c.items.sort((a, b) => b.at - a.at) })).sort((a, b) => b.latest - a.latest);
    return { cards: list, years: [...new Set(list.map((c) => c.year))].sort() };
  }, [fromDb]);

  const shown = cards.filter((c) => year === "all" || c.year === year);
  const visible = showAll ? shown : shown.slice(0, 6);
  if (cards.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 pt-10 sm:pt-14" aria-labelledby="recent-notes-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="recent-notes-title" className="font-serif text-xl font-bold text-foreground sm:text-2xl">New study notes</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">The newest notes, by year and unit</p>
        </div>
        <Link to="/notes" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline sm:text-sm">All notes <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>

      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Year">
        {(["all", ...years] as const).map((y) => (
          <button key={y} type="button" role="tab" aria-selected={year === y} onClick={() => { setYear(y); setShowAll(false); }} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${year === y ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary"}`}>{y === "all" ? "All years" : `Year ${y}`}</button>
        ))}
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => {
          const fresh = Date.now() - c.latest < NEW_FOR;
          return (
            <li key={c.id} className="flex flex-col rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Year {c.year}</p>
                  <h3 className="font-serif text-base font-bold leading-snug text-foreground">{c.unit}</h3>
                </div>
                <div className="shrink-0 text-right">
                  {fresh && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">New</span>}
                  <p className="mt-1 text-[10px] text-muted-foreground">{when(c.latest)}</p>
                </div>
              </div>
              <ul className="mt-2 space-y-0.5">
                {c.items.slice(0, 4).map((it) => (
                  <li key={it.key}><Link to={it.to} className="flex items-start gap-1.5 rounded-md px-1 py-1 text-[13px] font-medium leading-snug text-foreground hover:bg-muted hover:text-primary"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="line-clamp-2">{it.title}</span></Link></li>
                ))}
              </ul>
              <Link to={c.all} className="mt-auto pt-2 text-xs font-bold text-primary hover:underline">{c.items.length > 4 ? `+${c.items.length - 4} more in ` : "All "}{c.unit.split("/")[0]} →</Link>
            </li>
          );
        })}
      </ul>
      {shown.length > 6 && !showAll && (
        <div className="mt-4 flex justify-center"><button type="button" onClick={() => setShowAll(true)} className="rounded-full border border-border px-5 py-2 text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-primary">Show {shown.length - 6} more units</button></div>
      )}
    </section>
  );
}
