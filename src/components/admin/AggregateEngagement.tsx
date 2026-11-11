import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Engagement = {
  counts: { searches: number; courseOpens: number; resourceOpens: number; mcqAnswers: number; flashcardReviews: number; examStarts: number; examCompletes: number };
  topSearches: { term: string; searches: number }[];
  topResources: { path: string; opens: number }[];
};

export default function AggregateEngagement() {
  const [data, setData] = useState<Engagement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: result, error: issue } = await (supabase as any).rpc("admin_site_engagement", { p_days: 30 });
    if (issue) setError(issue.message || "Could not load aggregate engagement.");
    else setData(result as Engagement);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="mt-8 rounded-xl border border-border p-4 sm:p-5" aria-label="Aggregate study engagement">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-serif text-xl font-bold">Study engagement · aggregate only</h2><p className="mt-1 text-xs text-muted-foreground">Last 30 days. No individual student activity is available here.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-semibold"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}/> Refresh</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {data && <>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Searches",data.counts.searches],["Course opens",data.counts.courseOpens],["Resource opens",data.counts.resourceOpens],
          ["MCQ answers",data.counts.mcqAnswers],["Flashcard reviews",data.counts.flashcardReviews],["Exam starts",data.counts.examStarts],["Exam completions",data.counts.examCompletes]
        ].map(([label,value])=><div key={String(label)}><p className="font-serif text-2xl font-bold">{Number(value).toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div><h3 className="text-sm font-bold">Common search topics</h3><p className="text-xs text-muted-foreground">Only terms with at least five searches are displayed.</p>
          {data.topSearches.length ? <ul className="mt-2 space-y-2 text-sm">{data.topSearches.map(x=><li key={x.term} className="flex justify-between gap-3"><span className="truncate">{x.term}</span><span className="text-muted-foreground">{x.searches}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No search topic has reached the display threshold.</p>}
        </div>
        <div><h3 className="text-sm font-bold">Popular resources</h3><p className="text-xs text-muted-foreground">Grouped page-open totals; never linked to a student.</p>
          {data.topResources.length ? <ul className="mt-2 space-y-2 text-sm">{data.topResources.map(x=><li key={x.path} className="flex justify-between gap-3"><span className="truncate">{x.path}</span><span className="text-muted-foreground">{x.opens}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Resource totals will build as students use the updated site.</p>}
        </div>
      </div>
    </>}
  </section>;
}
