import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, FileText, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath, getCategoryDisplayName, getYearFromCategory } from "@/lib/store";
import { STATIC_NOTES } from "@/data/staticNotes";
import { topicPath } from "@/lib/topics";
import { cn } from "@/lib/utils";

interface Row { key: string; title: string; to: string; kind: "Note" | "Past paper" | "Topic" | "Blog"; year: number | null; unit: string; at: number }

let dbMemo: Promise<Row[]> | null = null;
function loadDb(): Promise<Row[]> {
  dbMemo ??= (async () => {
    const [a, t] = await Promise.all([
      Promise.resolve(supabase.from("articles").select("id,title,slug,category,created_at").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(60)).catch(() => ({ data: null })),
      Promise.resolve((supabase as unknown as { from: (x: string) => any }).from("topic_pages").select("slug,name,category,updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(30)).catch(() => ({ data: null })),
    ]);
    const rows: Row[] = [];
    for (const r of (a.data ?? []) as { id: string; title: string; slug: string | null; category: string; created_at: string }[]) {
      const y = getYearFromCategory(r.category);
      rows.push({ key: `a:${r.id}`, title: r.title, to: buildBlogPath(r), kind: /past paper|cat\b|exam/i.test(r.title) ? "Past paper" : "Blog", year: y ? Number(y.slice(5)) : null, unit: getCategoryDisplayName(r.category), at: Date.parse(r.created_at) });
    }
    for (const r of (t.data ?? []) as { slug: string; name: string; category: string | null; updated_at: string }[]) rows.push({ key: `t:${r.slug}`, title: r.name, to: topicPath(r.slug), kind: "Topic", year: null, unit: r.category || "Medicine", at: Date.parse(r.updated_at) });
    return rows.filter((r) => Number.isFinite(r.at));
  })();
  return dbMemo;
}

const ago = (at: number) => {
  // calendar days in the reader's own time zone: a note from last night is "Yesterday" after midnight, not "Today"
  const midnight = (t: number) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const d = Math.round((midnight(Date.now()) - midnight(at)) / 86_400_000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
const ICON = { Note: BookOpen, "Past paper": FileText, Topic: Layers, Blog: BookOpen } as const;

/**
 * The newest things published, newest first, across the whole site or for one year. Notes, past papers, blogs and topic pages all
 * appear here the moment they are published, so nothing has to be hunted for.
 */
export default function RecentlyPublished({ year, limit = 8, className }: { year?: number; limit?: number; className?: string }) {
  const [db, setDb] = useState<Row[]>([]);
  useEffect(() => { let on = true; void loadDb().then((r) => on && setDb(r)); return () => { on = false; }; }, []);

  const rows = useMemo(() => {
    const own: Row[] = STATIC_NOTES.map((n, i) => ({ key: `s:${n.slug}`, title: n.title, to: `/notes/${n.slug}`, kind: n.paper ? "Past paper" as const : "Note" as const, year: n.year, unit: n.unit, at: Date.parse(n.updated) + i * 1000 })).filter((r) => Number.isFinite(r.at));
    // GitHub-published clinical resources are static app routes, not Supabase articles.
    // Register them here so they appear in Recently published even when no database row exists.
    const clinicalReleases: Row[] = [
      { key: "release:imed-osce-2019", title: "Internal Medicine OSCEs 2019", to: "/clinical/osce-2019", kind: "Topic", year: 4, unit: "Internal Medicine · OSCEs", at: Date.parse("2026-10-21T14:25:23Z") },
      { key: "release:imed-osce-stations", title: "Internal Medicine picture stations", to: "/clinical/osce-stations", kind: "Topic", year: 4, unit: "Internal Medicine · Clinical images", at: Date.parse("2026-10-21T13:04:27Z") },
    ];
    return [...own, ...db, ...clinicalReleases]
      .filter((r) => (year ? r.year === year : true))
      .filter((r) => r.kind !== "Past paper" || !/question bank/i.test(r.title))
      .sort((a, b) => b.at - a.at)
      .filter((r, i, all) => all.findIndex((o) => o.to === r.to) === i)
      .slice(0, limit);
  }, [db, year, limit]);

  if (!rows.length) return null;
  return (
    <section aria-label="Recently published" className={cn("mx-auto max-w-6xl px-5", className)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{year ? "For your year" : "Fresh on the site"}</p>
          <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{year ? `New in Year ${year}` : "Recently published"}</h2>
        </div>
        <Link to={year ? `/recent?year=${year}` : "/recent"} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline">See all new <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </div>
      <ul className="mt-5 space-y-1">
        {rows.map((r) => {
          const Icon = ICON[r.kind];
          return (
            <li key={r.key} className="min-w-0">
              <Link to={r.to} className="group flex min-w-0 items-center gap-3 py-2.5">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold leading-snug group-hover:text-primary">{r.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.kind}{r.year ? ` · Year ${r.year}` : ""} · {r.unit}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{ago(r.at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
