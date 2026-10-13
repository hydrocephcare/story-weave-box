import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Layers, Sparkles } from "lucide-react";
import { STATIC_NOTES } from "@/data/staticNotes";
import { loadTopicIndex, slugFromName, topicPath, type TopicIndexItem } from "@/lib/topics";
import { openAI } from "@/lib/aiEvents";

/**
 * Under a search box: study notes and topic pages that match what was typed (even when the list below finds nothing),
 * a page on the subject itself, and Ompath AI one tap away. Nothing is boxed: just a short, flowing list.
 */
export default function SearchExtras({ query, year }: { query: string; year?: number | null }) {
  const q = query.trim();
  const [index, setIndex] = useState<TopicIndexItem[]>([]);
  useEffect(() => { let on = true; void loadTopicIndex().then((i) => on && setIndex(i)).catch(() => undefined); return () => { on = false; }; }, []);

  const found = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return { notes: [], topics: [] };
    const hit = (s: string) => { const l = s.toLowerCase(); return tokens.every((t) => l.includes(t)); };
    const notes = STATIC_NOTES.filter((n) => hit(`${n.title} ${n.unit}`)).sort((a, b) => Number(b.year === year) - Number(a.year === year)).slice(0, 5);
    const topics = index.filter((t) => hit(`${t.n} ${(t.a ?? []).join(" ")}`)).sort((a, b) => Number(b.ai) - Number(a.ai) || a.n.length - b.n.length).slice(0, 5);
    return { notes, topics };
  }, [q, year, index]);

  if (q.length < 2) return null;
  const slug = slugFromName(q);
  const looksLikeSubject = /^[A-Za-z][A-Za-z0-9 '’()\-,./&]{2,59}$/.test(q) && q.split(/\s+/).length <= 5;
  const row = "group flex items-center gap-3 py-2";

  return (
    <div className="mt-5 space-y-5" aria-label="More on the site">
      {(found.notes.length > 0 || found.topics.length > 0) && (
        <ul className="space-y-1">
          {found.notes.map((n) => (
            <li key={n.slug}><Link to={`/notes/${n.slug}`} className={row}><BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 flex-1"><span className="block truncate font-semibold group-hover:text-primary">{n.title}</span><span className="block truncate text-xs text-muted-foreground">Note · Year {n.year} · {n.unit}</span></span></Link></li>
          ))}
          {found.topics.map((t) => (
            <li key={t.s}><Link to={topicPath(t.s)} className={row}><Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 flex-1"><span className="block truncate font-semibold group-hover:text-primary">{t.n}</span><span className="block truncate text-xs text-muted-foreground">Topic · {t.c}</span></span></Link></li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => openAI(`Explain ${q} for a medical student, then list what an examiner expects.`)} className="inline-flex h-11 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 text-sm font-bold transition hover:bg-primary/15 active:scale-[.97]"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Ask Ompath AI about “{q.length > 24 ? `${q.slice(0, 24)}…` : q}”</button>
        {looksLikeSubject && !found.topics.some((t) => t.s === slug) && <Link to={topicPath(slug)} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-bold transition hover:border-primary/60 active:scale-[.97]"><Layers className="h-4 w-4" aria-hidden /> Open a page on “{q.length > 24 ? `${q.slice(0, 24)}…` : q}”</Link>}
      </div>
    </div>
  );
}
