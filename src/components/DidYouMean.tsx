import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useTopicIndex } from "@/lib/topics";
import { aiSuggestions, localSuggestions, type Suggestion } from "@/lib/spell";

/** Shown when a typed term finds nothing: topics that match despite spelling mistakes, then the AI's best guesses, each one tap away. */
export default function DidYouMean({ query, className = "" }: { query: string; className?: string }) {
  const items = useTopicIndex();
  const [ai, setAi] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const q = query.trim();
  const local = items ? localSuggestions(items, q) : [];
  useEffect(() => {
    setAi([]);
    if (q.length < 3) return;
    const ctl = new AbortController();
    setBusy(true);
    const t = window.setTimeout(() => { void aiSuggestions(q, ctl.signal).then((s) => { setAi(s); setBusy(false); }); }, 350);
    return () => { window.clearTimeout(t); ctl.abort(); setBusy(false); };
  }, [q]);
  const seen = new Set(local.map((s) => s.name.toLowerCase()));
  const all = [...local, ...ai.filter((s) => !seen.has(s.name.toLowerCase()))].slice(0, 7);
  if (q.length < 3 || (!all.length && !busy)) return null;
  return (
    <section className={className} aria-label="Did you mean">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden />Did you mean</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {all.map((s) => <Link key={s.path} to={s.path} className="rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold text-foreground hover:bg-primary/10">{s.name}</Link>)}
        {busy && !all.length && <span className="h-9 w-32 animate-pulse rounded-full bg-muted" aria-label="Looking for suggestions" />}
      </div>
    </section>
  );
}
