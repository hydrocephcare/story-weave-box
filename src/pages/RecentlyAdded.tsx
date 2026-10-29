import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { loadReadIds } from "@/lib/readingTrail";
import { Helmet } from "react-helmet-async";
import { BookOpen, Check, FileQuestion, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath, buildMcqPath, getCategoryDisplayName, getPublishedArticleSummaries } from "@/lib/store";
import { useScopedYear, yearOfCategory } from "@/hooks/useMyYear";
import { visibleToYear } from "@/lib/noteRank";
import LoadMoreButton from "@/components/LoadMoreButton";
import { STATIC_NOTES } from "@/data/staticNotes";

interface Item { key: string; kind: "note" | "mcq"; id: string; title: string; category: string; at: number; to: string }

const DAY = 86_400_000;
const midnight = (t: number) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
// calendar days in the reader's own time zone, so something from last night is "Yesterday" after midnight
const bucket = (t: number) => { const d = Math.round((midnight(Date.now()) - midnight(t)) / DAY); return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? "This week" : d < 31 ? "This month" : "Earlier"; };
const BUCKETS = ["Today", "Yesterday", "This week", "This month", "Earlier"];
const ago = (t: number) => { const m = Math.max(1, Math.round((Date.now() - t) / 60_000)); if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} h ago`; const d = Math.round(h / 24); return d === 1 ? "yesterday" : `${d} days ago`; };

/** /recent: everything added to the site lately, newest first, for your year by default. */
export default function RecentlyAdded() {
  const { year: myYear } = useScopedYear();
  const [items, setItems] = useState<Item[] | null>(null);
  const [pick, setPick] = useState<number | "all" | null>(null);
  const [type, setType] = useState<"all" | "note" | "mcq">("all");
  const [shown, setShown] = useState(40);
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unit, setUnit] = useState<string>("");
  useEffect(() => { let on = true; loadReadIds(user?.id ?? null).then((r) => { if (on) setRead(r); }); return () => { on = false; }; }, [user?.id]);
  const urlYear = Number(params.get("year")) || null;

  useEffect(() => {
    let on = true;
    void (async () => {
      const [notes, sets] = await Promise.all([
        getPublishedArticleSummaries().catch(() => []),
        Promise.resolve(supabase.from("mcq_sets").select("id,title,slug,category,created_at").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(80)).then((r) => r.data ?? [], () => []),
      ]);
      if (!on) return;
      const list: Item[] = [
        ...notes.map((a) => ({ key: `n${a.id}`, id: a.id, kind: "note" as const, title: a.title, category: a.category, at: Date.parse(a.created_at ?? "") || 0, to: buildBlogPath(a) })),
        ...(sets as { id: string; title: string; slug: string | null; category: string; created_at: string }[]).map((s) => ({ key: `m${s.id}`, id: s.id, kind: "mcq" as const, title: s.title, category: s.category, at: Date.parse(s.created_at) || 0, to: buildMcqPath({ id: s.id, title: s.title, slug: s.slug }) })),
        ...STATIC_NOTES.filter((n) => !n.paper).map((n) => ({ key: `s${n.slug}`, id: `s${n.slug}`, kind: "note" as const, title: n.title, category: `Year ${n.year}: ${n.unit}`, at: Date.parse(n.updated) || 0, to: `/notes/${n.slug}` })),
      ].filter((i) => i.at > 0).sort((a, b) => b.at - a.at);
      setItems(list);
    })();
    return () => { on = false; };
  }, []);

  const year = myYear ?? pick ?? urlYear ?? "all";
  const years = useMemo(() => [...new Set((items ?? []).map((i) => yearOfCategory(i.category)).filter((y): y is number => y !== null && (!myYear || y <= myYear)))].sort(), [items, myYear]);
  const filtered = useMemo(() => (items ?? []).filter((i) => visibleToYear(i.category, myYear) && (type === "all" || i.kind === type) && (year === "all" || yearOfCategory(i.category) === year || yearOfCategory(i.category) === null) && (!unit || getCategoryDisplayName(i.category) === unit) && (!unreadOnly || i.kind !== "note" || !read.has(i.id))), [items, type, year, unit, unreadOnly, read]);
  const units = useMemo(() => { const m = new Map<string, number>(); for (const i of items ?? []) if (year === "all" || yearOfCategory(i.category) === year) m.set(getCategoryDisplayName(i.category), (m.get(getCategoryDisplayName(i.category)) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n]) => n); }, [items, year]);
  const groups = useMemo(() => BUCKETS.map((b) => [b, filtered.slice(0, shown).filter((i) => bucket(i.at) === b)] as const).filter(([, l]) => l.length), [filtered, shown]);

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>Recently added | Ompath Study</title><meta name="description" content="The newest notes and MCQs added to Ompath Study, for your year." /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Recently added</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">New notes and MCQs, newest first. It opens on your own year; switch to see the others.</p>

      <div className={`mt-5 flex flex-wrap gap-1.5 ${myYear ? "hidden" : ""}`} role="group" aria-label="Year">
        {years.map((y) => <button key={y} type="button" onClick={() => { setPick(y); setShown(40); }} aria-pressed={year === y} className={chip(year === y)}>Year {y}{y === myYear ? " · yours" : ""}</button>)}
        <button type="button" onClick={() => { setPick("all"); setShown(40); }} aria-pressed={year === "all"} className={chip(year === "all")}>All years</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Type">
        {([["all", "Everything"], ["note", "Notes"], ["mcq", "MCQs"]] as const).map(([k, label]) => <button key={k} type="button" onClick={() => { setType(k); setShown(40); }} aria-pressed={type === k} className={chip(type === k)}>{label}</button>)}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
        <button type="button" onClick={() => setUnreadOnly((v) => !v)} aria-pressed={unreadOnly} className={chip(unreadOnly)}>{unreadOnly ? "Showing: not read yet" : "Not read yet"}</button>
        {units.length > 1 && <select value={unit} onChange={(e) => { setUnit(e.target.value); setShown(40); }} aria-label="Unit" className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold"><option value="">All units</option>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>}
      </div>

      {items === null ? <p className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        : filtered.length === 0 ? <p className="mt-12 text-center text-sm text-muted-foreground">Nothing new here yet. Try “All years”.</p>
        : (
          <div className="mt-6 space-y-7">
            {groups.map(([name, list]) => (
              <section key={name}>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{name} · {list.length}</h2>
                <ul className="divide-y divide-border border-t border-border">
                  {list.map((i) => (
                    <li key={i.key}>
                      <Link to={i.to} className="flex items-start gap-3 px-1 py-3 hover:bg-muted/50">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{i.kind === "note" ? <BookOpen className="h-4 w-4" /> : <FileQuestion className="h-4 w-4" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-sm font-semibold leading-snug">{i.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{i.kind === "note" ? "Note" : "MCQs"} · {getCategoryDisplayName(i.category)} · {ago(i.at)}</span>
                        </span>
                        {i.kind === "note" && read.has(i.id) && <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-500"><Check className="h-3.5 w-3.5" aria-hidden /> Read</span>}
                        {Date.now() - i.at < 3 * DAY && !read.has(i.id) && <span className="mt-1 shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase text-black">New</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {filtered.length > shown && <LoadMoreButton onMore={() => setShown((n) => n + 40)} className="mx-auto flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-bold hover:border-primary">Show older ({filtered.length - shown} more)</LoadMoreButton>}
          </div>
        )}
    </main>
  );
}
