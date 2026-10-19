import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { loadReadIds, loadTrail, type TrailItem } from "@/lib/readingTrail";
import { buildBlogPath } from "@/lib/store";

const clean = (t: string) => t.replace(/^(?:[\p{Extended_Pictographic}☀-➿]|️)+/gu, "").replace(/\s*[—–-]\s*Notes$/i, "").trim();
const unitOf = (c: string) => c.replace(/^Year\s*\d\s*:\s*/i, "");
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};
const linkFor = (i: TrailItem) => `${buildBlogPath({ id: i.id, title: i.title, slug: i.slug, category: i.category } as never)}${i.at > 0.05 && i.at < 0.95 ? `?at=${i.at.toFixed(3)}` : ""}`;

/** "Continue reading": the note you were in the middle of, with a bar and a link that opens it at the same spot, then what you read before. Follows your account across devices. */
export default function ContinueReading({ className = "", year, noteIds, unread }: { className?: string; year?: number; /** limit the list to these notes (a unit) */ noteIds?: Set<string>; /** this unit's notes, to list the ones not read yet */ unread?: { id: string; title: string; to: string }[] }) {
  const { user, loading } = useAuth();
  const [trail, setTrail] = useState<TrailItem[] | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    let on = true;
    loadTrail(user?.id ?? null, year || noteIds ? 200 : 8).then((t) => { if (on) setTrail(noteIds ? t.filter((i) => noteIds.has(i.id)).slice(0, 8) : year ? t.filter((i) => new RegExp(`^Year\\s*${year}\\b`, "i").test(i.category)).slice(0, 8) : t); });
    if (unread) void loadReadIds(user?.id ?? null).then((r) => { if (on) setReadIds(r); });
    return () => { on = false; };
  }, [user?.id, loading, year]);

  const notRead = (unread ?? []).filter((n) => !readIds.has(n.id)).slice(0, 5);
  if (!trail || (trail.length === 0 && notRead.length === 0)) return null;
  if (trail.length === 0) return (
    <section className={className} aria-label="Not read yet">
      <h2 className="font-serif text-xl font-bold text-foreground">Start reading</h2>
      <ul className="mt-1 divide-y divide-border">{notRead.map((n) => <li key={n.id}><Link to={n.to} className="flex items-center gap-2.5 py-2.5 text-sm hover:text-primary"><BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 flex-1 truncate font-medium text-foreground">{clean(n.title)}</span></Link></li>)}</ul>
    </section>
  );
  const current = trail.find((t) => !t.done) ?? trail[0];
  const rest = trail.filter((t) => t.id !== current.id).slice(0, 5);

  return (
    <section className={className} aria-label="Continue reading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-foreground">Continue reading</h2>
        <span className="text-[11px] text-muted-foreground">{user ? "Saved to your account, on every device" : "Sign in to keep this on every device"}</span>
      </div>
      <Link to={linkFor(current)} className="group mt-3 block border-l-[3px] border-primary/60 py-1 pl-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{current.at > 0.05 && !current.done ? "Pick up where you left off" : "Last note you opened"}</p>
        <p className="mt-0.5 font-serif text-lg font-bold leading-snug text-foreground group-hover:text-primary">{clean(current.title)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{unitOf(current.category)} · {ago(current.openedAt)}</p>
        {current.at > 0.02 && (
          <div className="mt-2 flex items-center gap-2" aria-label={`${Math.round(current.at * 100)} percent read`}>
            <div className="h-1.5 w-40 max-w-[55%] overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.min(1, current.at) * 100)}%` }} /></div>
            <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(Math.min(1, current.at) * 100)}% read</span>
          </div>
        )}
      </Link>
      {rest.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Read recently</p>
          <ul className="mt-1 divide-y divide-border">
            {rest.map((i) => (
              <li key={i.id}>
                <Link to={linkFor(i)} className="flex items-center gap-2.5 py-2 text-sm hover:text-primary">
                  {i.done ? <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Read" /> : <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{clean(i.title)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{unitOf(i.category)} · {ago(i.openedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notRead.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Not read yet</p>
          <ul className="mt-1 divide-y divide-border">{notRead.filter((n) => n.id !== current.id).map((n) => <li key={n.id}><Link to={n.to} className="flex items-center gap-2.5 py-2 text-sm hover:text-primary"><BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 flex-1 truncate font-medium text-foreground">{clean(n.title)}</span></Link></li>)}</ul>
        </div>
      )}
    </section>
  );
}
