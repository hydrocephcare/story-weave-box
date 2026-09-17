import { useCallback, useEffect, useState } from "react";
import { Check, X, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseSlideDeck, type Slide } from "@/components/SlideDeck";

/**
 * Admin review queue for reader-submitted plate corrections.
 * Each row shows the actual plate image and the current answer key next to
 * the reader's suggestion so an approval decision takes one glance.
 */

interface CorrectionRow {
  id: string;
  article_id: string;
  slide_number: string;
  slide_prompt: string | null;
  suggestion: string;
  submitter_name: string | null;
  status: string;
  created_at: string;
}

type Ctx = { title: string; slug: string | null; slide?: Slide };

export function SlideCorrectionsAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [ctx, setCtx] = useState<Record<string, Ctx>>({});
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("slide_corrections")
      .select("id, article_id, slide_number, slide_prompt, suggestion, submitter_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Could not load corrections", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (data || []) as CorrectionRow[];
    setRows(list);

    const ids = Array.from(new Set(list.map((r) => r.article_id)));
    if (ids.length) {
      const { data: arts } = await supabase.from("articles").select("id, title, slug, content").in("id", ids);
      const map: Record<string, Ctx> = {};
      for (const r of list) {
        const art = (arts || []).find((a: any) => a.id === r.article_id) as any;
        if (!art) continue;
        const deck = parseSlideDeck(art.content || "");
        map[r.id] = {
          title: art.title,
          slug: art.slug || null,
          slide: deck?.slides.find((s) => s.number === r.slide_number),
        };
      }
      setCtx(map);
    } else setCtx({});
    setLoading(false);
  }, [filter, toast]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await supabase
      .from("slide_corrections")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: status === "approved" ? "Correction approved — now live on the plate" : "Correction rejected" });
    setRows((prev) => (filter === "all" ? prev.map((r) => (r.id === id ? { ...r, status } : r)) : prev.filter((r) => r.id !== id)));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {f}
          </button>
        ))}
        <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading corrections…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">No {filter === "all" ? "" : filter} corrections.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const c = ctx[r.id];
            return (
              <div key={r.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-primary px-1.5 text-xs font-bold text-primary-foreground">{r.slide_number}</span>
                  <span className="text-sm font-semibold text-foreground">{c?.title || "Article"}</span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{r.status}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {r.submitter_name ? `${r.submitter_name} · ` : ""}{new Date(r.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-2">
                  <div>
                    {c?.slide?.image ? (
                      <a href={c.slide.image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border bg-muted/40">
                        <img src={c.slide.image} alt={c.slide.alt || r.slide_prompt || `Plate ${r.slide_number}`} loading="lazy" decoding="async" className="max-h-72 w-full object-contain" />
                      </a>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No image found for this plate.</p>
                    )}
                    <p className="mt-2 text-[13px] font-medium text-foreground">{c?.slide?.prompt || r.slide_prompt}</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Current answer key</p>
                      {c?.slide?.rows?.length ? (
                        <ul className="space-y-1 rounded-lg border border-border p-3 text-[13px] leading-relaxed text-foreground">
                          {c.slide.rows.map((row, i) => (
                            <li key={i}>
                              {row.label && <span className="mr-1 font-mono text-xs font-bold text-primary">{row.label}:</span>}
                              {row.term}
                              {row.detail && <span className="block text-muted-foreground">{row.detail}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No parsed answers.</p>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">Reader suggests</p>
                      <p className="whitespace-pre-wrap rounded-lg border border-primary/30 bg-primary/5 p-3 text-[13px] leading-relaxed text-foreground">{r.suggestion}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={busy === r.id || r.status === "approved"}
                        onClick={() => setStatus(r.id, "approved")}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                      </button>
                      <button
                        disabled={busy === r.id || r.status === "rejected"}
                        onClick={() => setStatus(r.id, "rejected")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                      {c?.slug && (
                        <a href={`/blog/${c.slug}#slide-${r.slide_number}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <ExternalLink className="h-3.5 w-3.5" /> Open plate
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}