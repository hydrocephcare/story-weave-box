import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildStoryPath } from "@/lib/seo";

interface Row { id: string; title: string; category: string; created_at: string; cover_image_url: string | null; meta_description: string | null; tags: string[] | null }

/** The newest student stories, on the homepage, with a one-tap way to write one. */
export default function HomeStories() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let on = true;
    supabase.from("stories").select("id,title,category,created_at,cover_image_url,meta_description,tags").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(3)
      .then(({ data }) => { if (on) setRows((data ?? []) as unknown as Row[]); }, () => { if (on) setRows([]); });
    return () => { on = false; };
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14" aria-labelledby="home-stories">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="home-stories" className="font-serif text-xl font-bold text-foreground sm:text-2xl">Student stories</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Real experiences and advice from medical school, first year to final year</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/stories?write=1" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"><PenLine className="h-4 w-4" /> Share yours</Link>
          <Link to="/stories" className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary hover:text-primary">All stories <ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>

      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : rows.length === 0 ? (
        <Link to="/stories?write=1" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center hover:border-primary/50">
          <BookOpen className="h-8 w-8 text-muted-foreground/40" />
          <strong className="font-serif text-lg">Be the first to share a story</strong>
          <span className="text-sm text-muted-foreground">What has medical school been like for you?</span>
        </Link>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {rows.map((s) => {
            const y = Number(s.tags?.find((t) => /^year-[1-6]$/.test(t))?.slice(5)) || 0;
            return (
              <Link key={s.id} to={buildStoryPath(s)} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md">
                {s.cover_image_url
                  ? <img src={s.cover_image_url} alt="" loading="lazy" className="h-32 w-full object-cover" />
                  : <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-teal-500/25 to-indigo-500/10"><BookOpen className="h-8 w-8 text-foreground/25" /></div>}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.category && s.category !== "Uncategorized" && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{s.category}</span>}
                    {y > 0 && <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11px] font-semibold text-foreground/70">Year {y}</span>}
                  </div>
                  <h3 className="mt-2 line-clamp-2 font-serif text-base font-bold leading-snug group-hover:text-primary">{s.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.meta_description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
