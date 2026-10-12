import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Compass, ChevronRight } from "lucide-react";
import { DOMAIN_STYLE, topicPath, useTopicIndex } from "@/lib/topics";
import { cn } from "@/lib/utils";

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Topics in this note": the subjects a note talks about (a disease, a bone, a process), each one a tap away from its own full page.
 * Works on any note or blog, so every page gets a way into the topic library. Shows nothing until it finds at least two.
 */
export default function NoteTopics({ text, title = "", className }: { text: string; title?: string; className?: string }) {
  const index = useTopicIndex();
  const found = useMemo(() => {
    if (!index?.length || !text) return [];
    const hay = text.slice(0, 60_000).toLowerCase();
    const own = title.toLowerCase();
    const scored: { t: (typeof index)[number]; n: number }[] = [];
    for (const t of index) {
      if (t.n.length < 5 || t.d < 2 || (own && own.includes(t.n.toLowerCase()))) continue;
      const m = hay.match(new RegExp(`(?<![a-z0-9-])${escRe(t.n.toLowerCase())}(?![a-z0-9-])`, "g"));
      if (m) scored.push({ t, n: m.length });
    }
    return scored.sort((a, b) => b.n - a.n || b.t.d - a.t.d).slice(0, 8).map((x) => x.t);
  }, [index, text, title]);

  if (found.length < 2) return null;
  return (
    <section aria-label="Topics in this note" className={cn("rounded-2xl border border-border bg-card p-4 print:hidden", className)}>
      <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Compass className="h-3.5 w-3.5 text-primary" aria-hidden /> Topics in this note</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {found.map((t) => {
          const st = DOMAIN_STYLE[t.c] ?? DOMAIN_STYLE.Medicine;
          return (
            <li key={t.s}>
              <Link to={topicPath(t.s)} className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-background py-2.5 pl-4 pr-3 transition hover:border-primary/50 hover:shadow-sm">
                <span className={cn("absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b", st.hue)} aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-snug group-hover:text-primary">{t.n}</span><span className="block text-[11px] text-muted-foreground">{t.c}{t.q ? ` · ${t.q} questions` : ""}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
