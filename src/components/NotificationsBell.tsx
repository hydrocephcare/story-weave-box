import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BookOpen, FileQuestion, Megaphone, Trophy, UserCheck, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { loadContestPlatform } from "@/lib/contest-store";
import { useSiteConfig } from "@/lib/siteConfig";
import { useMyYear, yearOfCategory } from "@/hooks/useMyYear";

interface Notice { id: string; kind: "exam" | "note" | "contest" | "notice" | "request" | "message"; /** the year this is for; empty = everyone */ year?: number | null; title: string; to: string; at: number; /** an admin request that has not been looked at yet */ unseen?: boolean }
interface AccessRequest { user_id: string; email: string | null; entered_text: string | null; created_at: string; admin_seen: boolean }

const SEEN_KEY = "ompath_notif_seen";
const WEEKS = 3 * 7 * 86_400_000;
const DISMISS_KEY = "ompath_notif_dismissed";
const readDismissed = (): string[] => { try { const v = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); return Array.isArray(v) ? v.slice(-200) : []; } catch { return []; } };
const writeDismissed = (ids: string[]) => { try { localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-200))); } catch { /* storage blocked */ } };
const readSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
const writeSeen = (t: number) => { try { localStorage.setItem(SEEN_KEY, String(t)); } catch { /* storage blocked */ } };

let memo: { at: number; items: Notice[] } | null = null;
async function load(): Promise<Notice[]> {
  if (memo && Date.now() - memo.at < 5 * 60_000) return memo.items;
  const recent = (t: "mcq_sets" | "articles") =>
    supabase.from(t).select("id,title,slug,category,created_at").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(60);
  const [exams, notes, contests] = await Promise.all([
    Promise.resolve(recent("mcq_sets")).catch(() => ({ data: [] })),
    Promise.resolve(recent("articles")).catch(() => ({ data: [] })),
    loadContestPlatform().catch(() => ({ contests: [] })),
  ]);
  const items: Notice[] = [
    ...((exams.data ?? []) as { id: string; title: string; slug: string | null; category: string | null; created_at: string }[]).map((r) => ({ id: `exam:${r.id}`, kind: "exam" as const, year: yearOfCategory(r.category), title: r.title, to: `/mcqs/${r.slug || r.id}`, at: Date.parse(r.created_at) })),
    ...((notes.data ?? []) as { id: string; title: string; slug: string | null; category: string | null; created_at: string }[]).map((r) => ({ id: `note:${r.id}`, kind: "note" as const, year: yearOfCategory(r.category), title: r.title, to: `/blog/${r.slug || r.id}`, at: Date.parse(r.created_at) })),
    ...contests.contests.filter((c) => !/closed|archived|complete|cancel/i.test(String(c.stage))).slice(0, 3).map((c) => ({ id: `contest:${c.id}`, kind: "contest" as const, title: c.title, to: `/contests/${c.slug}`, at: Date.parse(c.startsAt ?? "") || Date.now() - 86_400_000 })),
  ].filter((n) => Number.isFinite(n.at) && Date.now() - n.at < WEEKS).sort((a, b) => b.at - a.at);
  memo = { at: Date.now(), items };
  return items;
}

const ICON = { exam: FileQuestion, note: BookOpen, contest: Trophy, notice: Megaphone, request: UserCheck, message: Megaphone } as const;
const LABEL = { exam: "New exam", note: "New note", contest: "Contest", notice: "Notice", request: "Access request", message: "Message" } as const;
const ago = (t: number) => { const m = Math.max(1, Math.round((Date.now() - t) / 60_000)); if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; return `${Math.round(h / 24)}d ago`; };

/** What is new since you last looked: notices, exams, notes and contests. */
export default function NotificationsBell() {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  /** What "new" meant when the list was opened, so the dots stay visible while you read it. */
  const [since, setSince] = useState(readSeen);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const { isAdmin, user } = useAuth();
  const { year: myYear } = useMyYear();
  const [messages, setMessages] = useState<Notice[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const { announcement: a } = useSiteConfig();

  useEffect(() => { load().then(setItems).catch(() => setItems([])); }, []);

  // messages the admin sent to this student (already sent to their year or to everyone)
  useEffect(() => {
    if (!user) { setMessages([]); return; }
    let on = true;
    void Promise.resolve((supabase as unknown as { from: (t: string) => any }).from("user_notifications").select("id,title,action_url,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: { id: string; title: string; action_url: string | null; created_at: string }[] | null }) => {
        if (!on) return;
        setMessages((data ?? []).map((r) => ({ id: `msg:${r.id}`, kind: "message" as const, title: r.title, to: (r.action_url ?? "/").replace(/^https?:\/\/(www\.)?ompathstudy\.com/i, "") || "/", at: Date.parse(r.created_at) })).filter((n) => Date.now() - n.at < WEEKS));
      }, () => undefined);
    return () => { on = false; };
  }, [user]);

  // The admin hears about students whose admission number did not match.
  useEffect(() => {
    if (!isAdmin) { setRequests([]); return; }
    let on = true;
    const get = async () => {
      try {
        const { data } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: AccessRequest[] | null }> } } } })
          .from("student_access").select("user_id,email,entered_text,created_at,admin_seen").eq("status", "pending").order("created_at", { ascending: false });
        if (on) setRequests(data ?? []);
      } catch { if (on) setRequests([]); }
    };
    void get();
    const t = window.setInterval(get, 60_000);
    return () => { on = false; window.clearInterval(t); };
  }, [isAdmin]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const all = useMemo<Notice[]>(() => {
    const notice: Notice[] = a.enabled && a.text ? [{ id: "notice", kind: "notice", title: a.text, to: a.link || "/", at: Date.now() }] : [];
    const asks: Notice[] = requests.map((r) => ({ id: `request:${r.user_id}`, kind: "request", title: `${r.email ?? "A student"} asked for MKU access${r.entered_text ? ` (typed "${r.entered_text}")` : ""}`, to: "/admin#students", at: Date.parse(r.created_at) || Date.now(), unseen: !r.admin_seen }));
    // new notes and exams are for signed-in students, and only for their own year (items for every year are shown when the year is not known yet)
    const mine = !user ? [] : (["exam", "note"] as const).flatMap((k) => items.filter((n) => n.kind === k && (!myYear || !n.year || n.year === myYear)).slice(0, 6));
    const rest = !user ? [] : items.filter((n) => n.kind === "contest");
    return [...asks, ...notice, ...messages, ...mine, ...rest].sort((x, y) => (x.kind === "request" ? -1 : y.kind === "request" ? 1 : y.at - x.at)).filter((n) => n.kind === "request" || !dismissed.includes(n.id));
  }, [a.enabled, a.text, a.link, items, requests, dismissed, user, myYear, messages]);
  const unread = all.filter((n) => (n.kind === "request" ? n.unseen : n.at > seen && n.kind !== "notice")).length;

  const markAllSeen = () => {
    const now = Date.now(); writeSeen(now); setSeen(now);
    if (isAdmin && requests.some((r) => !r.admin_seen)) {
      void (supabase as unknown as { rpc: (n: string) => Promise<unknown> }).rpc("admin_mark_requests_seen").then(() => setRequests((rs) => rs.map((r) => ({ ...r, admin_seen: true })))).catch(() => undefined);
    }
  };
  // Opening the list counts as having looked at it, so the badge clears straight away.
  const toggle = () => {
    if (!open) { setSince(seen); markAllSeen(); }
    setOpen(!open);
  };
  const dismiss = (id: string) => { const next = [...dismissed, id]; setDismissed(next); writeDismissed(next); };
  const clearAll = () => { const next = [...dismissed, ...all.filter((n) => n.kind !== "request").map((n) => n.id)]; setDismissed(next); writeDismissed(next); };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={toggle} aria-label={unread ? `${unread} new notifications` : "Notifications"} aria-expanded={open} aria-haspopup="dialog" className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white">
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-none text-black">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-14 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between px-2 pb-1 pt-1"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What is new</p>{all.some((n) => n.kind !== "request") && <button type="button" onClick={clearAll} className="text-[11px] font-bold text-primary hover:underline">Clear all</button>}</div>
          {!user && <p className="px-2 py-2 text-sm text-muted-foreground"><Link to="/login" onClick={() => setOpen(false)} className="font-bold text-primary hover:underline">Log in</Link> to see new notes and exams for your year.</p>}
          {user && !myYear && <p className="px-2 pb-1 text-[11px] text-muted-foreground">Add your year in your account to see only what is new for you.</p>}
          {all.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">{user ? "You are all caught up." : ""}</p> : (
            <ul>
              {all.map((n) => {
                const Icon = ICON[n.kind]; const fresh = n.kind === "request" ? Boolean(n.unseen) : n.at > since && n.kind !== "notice";
                return (
                  <li key={n.id} className="flex items-start">
                    <Link to={n.to} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2 py-2 text-foreground hover:bg-muted">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${fresh ? "bg-amber-400/20 text-amber-600" : "bg-primary/10 text-primary"}`}><Icon className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0 flex-1"><span className="line-clamp-2 block text-[13px] font-semibold leading-snug">{n.title}</span><span className="block text-[11px] text-muted-foreground">{n.kind === "notice" ? "Notice" : `${LABEL[n.kind]} · ${ago(n.at)}`}</span></span>
                      {fresh && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="New" />}
                    </Link>
                    {n.kind !== "request" && <button type="button" onClick={() => dismiss(n.id)} aria-label="Dismiss this notification" className="mt-2 shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-1 flex justify-between border-t border-border px-2 pt-2 text-[11px] font-bold text-primary"><Link to="/recent" onClick={() => setOpen(false)} className="hover:underline">Recently added</Link><Link to="/exams" onClick={() => setOpen(false)} className="hover:underline">All exams</Link><Link to="/blog" onClick={() => setOpen(false)} className="hover:underline">All notes</Link><Link to="/contests" onClick={() => setOpen(false)} className="hover:underline">Contests</Link></div>
        </div>
      )}
    </div>
  );
}
