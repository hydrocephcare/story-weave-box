import { useCallback, useEffect, useState } from "react";
import { FilePlus2, Loader2, MessageCircle, RefreshCw, SearchX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { findHits } from "@/lib/ompathAi";
import { saveAnswerAsDraft } from "@/lib/answerToNote";
import { openAI } from "@/lib/aiEvents";

interface Asked { cache_key: string; question: string; answer: string; uses: number; created_at: string }
interface Gap { query: string; n: number; last: string }

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Admin: what students ask Ompath AI, and what they search for and do not find. A good answer becomes a draft note in one tap. */
export default function AiQuestionsAdmin() {
  const { toast } = useToast();
  const [asked, setAsked] = useState<Asked[] | null>(null);
  const [gaps, setGaps] = useState<Gap[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setAsked(null); setGaps(null);
    const a = await Promise.resolve(db.from("ai_answer_cache").select("cache_key,question,answer,uses,created_at").order("uses", { ascending: false }).order("created_at", { ascending: false }).limit(80)).then((r: { data: Asked[] | null }) => r.data ?? [], () => []);
    setAsked(a);
    const s = await Promise.resolve(db.from("search_queries").select("query,normalized_query,created_at").eq("results_count", 0).order("created_at", { ascending: false }).limit(1500)).then((r: { data: { query: string; normalized_query: string | null; created_at: string }[] | null }) => r.data ?? [], () => []);
    const by = new Map<string, Gap>();
    for (const r of s) {
      const k = (r.normalized_query || r.query).trim().toLowerCase();
      if (k.length < 3) continue;
      const g = by.get(k);
      if (g) g.n += 1; else by.set(k, { query: r.query.trim(), n: 1, last: r.created_at });
    }
    setGaps([...by.values()].sort((x, y) => y.n - x.n).slice(0, 40));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const draft = async (a: Asked) => {
    setBusy(a.cache_key);
    try {
      const found = await findHits(a.question).catch(() => ({ hits: [], parsed: null }));
      const { article, draft: d } = await saveAnswerAsDraft(a.question, a.answer, found.hits);
      setDone((m) => ({ ...m, [a.cache_key]: article.id }));
      toast({ title: "Saved as a draft note", description: `“${d.title}” in ${d.category || "no category yet"}. Open Admin → Articles to read it, set the category and publish.` });
    } catch (e) { toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" }); }
    setBusy(null);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl font-bold text-foreground">What students ask</h2>
        <p className="text-sm text-muted-foreground">The questions asked most in Ompath AI, and the searches that found nothing. A good answer can become a note on the site, which Google can then index. Drafts are private until you publish them.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" /> Refresh</Button>
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-2 font-bold"><MessageCircle className="h-4 w-4 text-primary" /> Most asked questions</h3>
        {asked === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          : asked.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet. Answers are saved here once students start asking.</p> : (
            <ul className="space-y-2">
              {asked.map((a) => (
                <li key={a.cache_key} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold">{a.question}</p>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">asked {a.uses + 1}×</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.answer.replace(/[#*>|`-]/g, " ").replace(/\s+/g, " ").slice(0, 220)}…</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button size="sm" disabled={busy === a.cache_key || Boolean(done[a.cache_key])} onClick={() => void draft(a)}>{busy === a.cache_key ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-1.5 h-4 w-4" />}{done[a.cache_key] ? "Draft saved" : "Make a draft note"}</Button>
                    <Button size="sm" variant="outline" onClick={() => openAI(a.question)}>Open in the AI</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-2 font-bold"><SearchX className="h-4 w-4 text-primary" /> Searches that found nothing</h3>
        <p className="mb-2 text-xs text-muted-foreground">Topics students want and the site does not have. Tap one to ask the AI; if the answer is good, use “Publish as a note” under it.</p>
        {gaps === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          : gaps.length === 0 ? <p className="text-sm text-muted-foreground">No empty searches recorded. Good.</p> : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {gaps.map((g) => (
                <li key={g.query}><button type="button" onClick={() => openAI(g.query)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary"><span className="min-w-0 truncate font-semibold">{g.query}</span><span className="shrink-0 text-[11px] font-bold text-muted-foreground">{g.n}×</span></button></li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
