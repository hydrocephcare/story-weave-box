import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { topicPath } from "@/lib/topics";

interface Row { slug: string; name: string; category: string | null; updated_at: string }

/** Topic pages written by the site (AI-assisted, saved once) and the newest ones first, so a page that was just published is easy to find. */
export default function LatestTopics() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let on = true;
    Promise.resolve((supabase as unknown as { from: (t: string) => any }).from("topic_pages").select("slug,name,category,updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(12))
      .then((r: { data: Row[] | null }) => { if (on) setRows(r.data ?? []); })
      .catch(() => { if (on) setRows([]); });
    return () => { on = false; };
  }, []);
  if (!rows?.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 pt-2 pb-8" aria-label="Newly published topic pages">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Just published</p>
          <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">New topic pages</h2>
        </div>
        <Link to="/topics" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">All topics <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2.5">
        {rows.map((r) => (
          <li key={r.slug}><Link to={topicPath(r.slug)} className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-[15px] font-semibold hover:border-primary/60 hover:text-primary">{r.name}</Link></li>
        ))}
      </ul>
    </section>
  );
}
