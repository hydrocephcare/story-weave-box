import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { loadReadIds, loadTrail, type TrailItem } from "@/lib/readingTrail";

export interface BallNote { id: string; title: string; to: string }

const clean = (t: string) => t.replace(/^(?:[\p{Extended_Pictographic}☀-➿]|️)+/gu, "").replace(/\s*[—–-]\s*Notes$/i, "").trim();

/**
 * Your progress in this unit (or year), as a small round ball in the corner of the screen: it shows the percentage read, and a tap opens what you
 * last read here, what to read next, and how much is done. It follows your account, so the phone and the laptop show the same thing.
 */
export default function ReadingBall({ scope, notes }: { scope: string; notes: BallNote[] }) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [trail, setTrail] = useState<TrailItem[]>([]);
  useEffect(() => {
    if (loading) return;
    let on = true;
    void Promise.all([loadReadIds(user?.id ?? null), loadTrail(user?.id ?? null, 200)]).then(([r, t]) => { if (on) { setRead(r); setTrail(t); } });
    return () => { on = false; };
  }, [user?.id, loading, open]);

  const ids = useMemo(() => new Set(notes.map((n) => n.id)), [notes]);
  const done = useMemo(() => notes.filter((n) => read.has(n.id)).length, [notes, read]);
  const pct = notes.length ? Math.round((done / notes.length) * 100) : 0;
  const here = useMemo(() => trail.filter((t) => ids.has(t.id)), [trail, ids]);
  const current = here.find((t) => !t.done) ?? here[0];
  const next = useMemo(() => notes.filter((n) => !read.has(n.id) && n.id !== current?.id).slice(0, 5), [notes, read, current]);
  if (!notes.length) return null;

  const path = (t: TrailItem) => notes.find((n) => n.id === t.id)?.to ?? "/";
  const at = (t: TrailItem) => (t.at > 0.05 && t.at < 0.95 ? `?at=${t.at.toFixed(3)}` : "");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Your progress in ${scope}: ${pct}% read. Tap to see more.`}
        className="fixed bottom-28 left-3 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-border"
        style={{ background: `conic-gradient(hsl(var(--primary)) ${pct * 3.6}deg, hsl(var(--muted)) 0deg)` }}>
        <span className="flex h-11 w-11 flex-col items-center justify-center rounded-full bg-background leading-none">
          <span className="text-[13px] font-extrabold tabular-nums text-foreground">{pct}%</span>
          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">read</span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-serif text-xl">{scope}</SheetTitle>
            <SheetDescription>{done} of {notes.length} notes read{user ? " · saved to your account" : " · sign in to keep this on every device"}</SheetDescription>
          </SheetHeader>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>

          {current && (
            <Link to={`${path(current)}${at(current)}`} onClick={() => setOpen(false)} className="mt-5 block border-l-[3px] border-primary/60 py-1 pl-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{current.at > 0.05 && !current.done ? "Pick up where you left off" : "Last read here"}</p>
              <p className="mt-0.5 font-serif text-lg font-bold leading-snug text-foreground">{clean(current.title)}</p>
              {current.at > 0.02 && <p className="mt-0.5 text-xs text-muted-foreground">{Math.round(Math.min(1, current.at) * 100)}% read</p>}
            </Link>
          )}

          {here.filter((t) => t.id !== current?.id).length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Read recently</p>
              <ul className="mt-1 divide-y divide-border">
                {here.filter((t) => t.id !== current?.id).slice(0, 6).map((t) => (
                  <li key={t.id}><Link to={`${path(t)}${at(t)}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 py-2.5 text-sm">
                    {t.done ? <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Read" /> : <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate font-medium">{clean(t.title)}</span>
                  </Link></li>
                ))}
              </ul>
            </div>
          )}

          {next.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Not read yet</p>
              <ul className="mt-1 divide-y divide-border">
                {next.map((n) => (
                  <li key={n.id}><Link to={n.to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 py-2.5 text-sm"><BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 flex-1 truncate font-medium">{clean(n.title)}</span></Link></li>
                ))}
              </ul>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
