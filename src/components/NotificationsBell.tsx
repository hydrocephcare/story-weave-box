import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BookOpen, FileQuestion, Megaphone, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadContestPlatform } from "@/lib/contest-store";
import { useSiteConfig } from "@/lib/siteConfig";

interface Notice { id: string; kind: "exam" | "note" | "contest" | "notice"; title: string; to: string; at: number }

const SEEN_KEY = "ompath_notif_seen";
const WEEKS = 3 * 7 * 86_400_000;
const readSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
const writeSeen = (t: number) => { try { localStorage.setItem(SEEN_KEY, String(t)); } catch { /* storage blocked */ } };

let memo: { at: number; items: Notice[] } | null = null;
async function load(): Promise<Notice[]> {
  if (memo && Date.now() - memo.at < 5 * 60_000) return memo.items;
  const recent = (t: "mcq_sets" | "articles") =>
    supabase.from(t).select("id,title,slug,created_at").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(6);
  const [exams, notes, contests] = await Promise.all([
    Promise.resolve(recent("mcq_sets")).catch(() => ({ data: [] })),
    Promise.resolve(recent("articles")).catch(() => ({ data: [] })),
    loadContestPlatform().catch(() => ({ contests: [] })),
  ]);
  const items: Notice[] = [
    ...((exams.data ?? []) as { id: string; title: string; slug: string | null; created_at: string }[]).map((r) => ({ id: `exam:${r.id}`, kind: "exam" as const, title: r.title, to: `/mcqs/${r.slug || r.id}`, at: Date.parse(r.created_at) })),
    ...((notes.data ?? []) as { id: string; title: string; slug: string | null; created_at: string }[]).map((r) => ({ id: `note:${r.id}`, kind: "note" as const, title: r.title, to: `/blog/${r.slug || r.id}`, at: Date.parse(r.created_at) })),
    ...contests.contests.filter((c) => !/closed|archived|complete|cancel/i.test(String(c.stage))).slice(0, 3).map((c) => ({ id: `contest:${c.id}`, kind: "contest" as const, title: c.title, to: `/contests/${c.slug}`, at: Date.parse(c.startsAt ?? "") || Date.now() - 86_400_000 })),
  ].filter((n) => Number.isFinite(n.at) && Date.now() - n.at < WEEKS).sort((a, b) => b.at - a.at);
  memo = { at: Date.now(), items };
  return items;
}

const ICON = { exam: FileQuestion, note: BookOpen, contest: Trophy, notice: Megaphone } as const;
const ago = (t: number) => { const m = Math.max(1, Math.round((Date.now() - t) / 60_000)); if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; return `${Math.round(h / 24)}d ago`; };

/** What is new since you last looked: notices, exams, notes and contests. */
export default function NotificationsBell() {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const ref = useRef<HTMLDivElement>(null);
  const { announcement: a } = useSiteConfig();

  useEffect(() => { load().then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const all = useMemo<Notice[]>(() => {
    const notice: Notice[] = a.enabled && a.text ? [{ id: "notice", kind: "notice", title: a.text, to: a.link || "/", at: Date.now() }] : [];
    return [...notice, ...items];
  }, [a.enabled, a.text, a.link, items]);
  const unread = all.filter((n) => n.at > seen && n.kind !== "notice").length;

  const toggle = () => {
    setOpen((o) => {
      if (o) { const now = Date.now(); writeSeen(now); setSeen(now); }
      return !o;
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={toggle} aria-label={unread ? `${unread} new notifications` : "Notifications"} aria-expanded={open} aria-haspopup="dialog" className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white">
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-none text-black">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-14 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What is new</p>
          {all.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">You are all caught up.</p> : (
            <ul>
              {all.map((n) => {
                const Icon = ICON[n.kind]; const fresh = n.at > seen && n.kind !== "notice";
                return (
                  <li key={n.id}>
                    <Link to={n.to} onClick={() => { const now = Date.now(); writeSeen(now); setSeen(now); setOpen(false); }} className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-foreground hover:bg-muted">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${fresh ? "bg-amber-400/20 text-amber-600" : "bg-primary/10 text-primary"}`}><Icon className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0 flex-1"><span className="line-clamp-2 block text-[13px] font-semibold leading-snug">{n.title}</span><span className="block text-[11px] text-muted-foreground">{n.kind === "notice" ? "Notice" : `${n.kind === "exam" ? "New exam" : n.kind === "note" ? "New note" : "Contest"} · ${ago(n.at)}`}</span></span>
                      {fresh && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="New" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-1 flex justify-between border-t border-border px-2 pt-2 text-[11px] font-bold text-primary"><Link to="/exams" onClick={() => setOpen(false)} className="hover:underline">All exams</Link><Link to="/blog" onClick={() => setOpen(false)} className="hover:underline">All notes</Link><Link to="/contests" onClick={() => setOpen(false)} className="hover:underline">Contests</Link></div>
        </div>
      )}
    </div>
  );
}
