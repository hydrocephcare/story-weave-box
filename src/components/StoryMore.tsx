import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildStoryPath } from "@/lib/seo";

type Row = { id: string; title: string; slug?: string | null; category: string; cover_image_url?: string | null; reading_time_minutes?: number | null };

/** "Keep reading": three other stories on the same topic (or the latest ones when nothing matches). */
export default function StoryMore({ id, category }: { id: string; category?: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const base = () => supabase.from("stories").select("id,title,slug,category,cover_image_url,reading_time_minutes").eq("published", true).is("deleted_at", null).neq("id", id);
      let list: Row[] = [];
      if (category && category !== "Uncategorized") { const r = await base().eq("category", category).order("created_at", { ascending: false }).limit(3); list = (r.data ?? []) as Row[]; }
      if (list.length < 3) { const r = await base().order("created_at", { ascending: false }).limit(6); const more = ((r.data ?? []) as Row[]).filter((x) => !list.some((y) => y.id === x.id)); list = [...list, ...more].slice(0, 3); }
      if (live) setRows(list);
    })().catch(() => undefined);
    return () => { live = false; };
  }, [id, category]);
  if (!rows.length) return null;
  return (
    <section className="not-prose mt-12" aria-label="Keep reading">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">Keep reading</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <Link key={r.id} to={buildStoryPath(r)} className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md">
            {r.cover_image_url
              ? <img src={r.cover_image_url} alt="" loading="lazy" className="h-28 w-full object-cover" />
              : <div className="flex h-28 items-center justify-center bg-gradient-to-br from-primary/15 to-amber-500/10"><BookOpen className="h-8 w-8 text-foreground/25" /></div>}
            <div className="p-3.5">
              <p className="line-clamp-2 font-serif text-[15px] font-bold leading-snug group-hover:text-primary">{r.title}</p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{r.category && r.category !== "Uncategorized" ? r.category : "Story"}{r.reading_time_minutes ? ` · ${r.reading_time_minutes} min read` : ""}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
