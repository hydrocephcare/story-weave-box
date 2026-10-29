import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath } from "@/lib/store";

type P = { id: string; title: string; slug: string | null; category: string; content_type: string | null };

/** The year's past papers and CATs, on the first screen of every year: the newest few and a button to all of them. */
export default function YearPapersStrip({ year }: { year: number }) {
  const [rows, setRows] = useState<P[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    const q = (supabase as any).from("articles").select("id,title,slug,category,content_type", { count: "exact" }).eq("published", true).is("deleted_at", null).eq("content_kind", "past_paper").ilike("category", `Year ${year}:%`).order("created_at", { ascending: false }).limit(3);
    Promise.resolve(q).then(({ data, count }: { data: P[] | null; count: number | null }) => { if (on) { setRows(data ?? []); setTotal(count); } }, () => { if (on) setRows([]); });
    return () => { on = false; };
  }, [year]);
  const link = `/papers?year=${year}`;
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label={`Year ${year} past papers`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Past papers</p>
          <h2 className="font-serif text-xl font-bold text-foreground">Year {year} past papers and CATs</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{total ? `${total} on the site, grouped by unit, each with answers.` : "Questions with answers, grouped by unit."}</p>
        </div>
        <Link to={link} className="hidden shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 sm:inline-flex">Open all <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
      </div>
      {!!rows?.length && (
        <ul className="mt-3 space-y-1">
          {rows.map((p) => (
            <li key={p.id}><Link to={buildBlogPath(p as any)} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/50"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 text-sm font-semibold leading-snug text-foreground">{p.title}</span><span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${p.content_type === "CAT" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary"}`}>{p.content_type === "CAT" ? "CAT" : "Exam"}</span></Link></li>
          ))}
        </ul>
      )}
      <Link to={link} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 sm:hidden">Open all Year {year} papers <ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </section>
  );
}
