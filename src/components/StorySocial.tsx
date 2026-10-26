import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BadgeCheck, Eye, Loader2, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Comment = { id: string; user_id: string; author_name: string; avatar_url?: string | null; body: string; verified: boolean; created_at: string };

const db = supabase as any;
const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/** The read count in the story's details row. One read is counted per visit and story. */
export function StoryReads({ storyId }: { storyId: string }) {
  const [views, setViews] = useState<number | null>(null);
  useEffect(() => {
    const key = `ompath_read_${storyId}`;
    let seen = false; try { seen = sessionStorage.getItem(key) === "1"; } catch { /* ignore */ }
    if (seen) { void db.from("story_stats").select("views").eq("story_id", storyId).maybeSingle().then(({ data }: { data: { views: number } | null }) => setViews(data?.views ?? null)); return; }
    try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    void db.rpc("bump_story_view", { p_story: storyId }).then(({ data }: { data: number | null }) => setViews(typeof data === "number" ? data : null));
  }, [storyId]);
  if (views === null) return null;
  return <span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />{compact(views)} read{views === 1 ? "" : "s"}</span>;
}

export function StoryComments({ storyId }: { storyId: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await db.from("story_comments").select("id,user_id,author_name,avatar_url,body,verified,created_at").eq("story_id", storyId).is("deleted_at", null).order("created_at", { ascending: true }).limit(200);
    setList((data ?? []) as Comment[]); setLoading(false);
  }, [storyId]);
  useEffect(() => { void load(); }, [load]);

  const myName = useMemo(() => {
    const m = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
    return (m.full_name || m.name || user?.email?.split("@")[0] || "A reader").toString().trim().slice(0, 60);
  }, [user]);

  const myPhoto = useMemo(() => {
    const m = (user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
    const u = m.avatar_url || m.picture || "";
    return /^https:\/\//i.test(u) ? u : "";
  }, [user]);

  const send = async () => {
    const body = text.replace(/\s+/g, " ").trim();
    if (!user || busy || body.length < 2) return;
    if ((body.match(/https?:\/\/|www\./gi) ?? []).length > 0) { toast({ title: "No links please", description: "Comments are for kind words and questions." }); return; }
    try { if (Date.now() - Number(localStorage.getItem("ompath_last_comment") ?? 0) < 20_000) { toast({ title: "One moment", description: "Please wait a few seconds between comments." }); return; } } catch { /* ignore */ }
    setBusy(true);
    const { error } = await db.from("story_comments").insert({ story_id: storyId, user_id: user.id, author_name: myName, avatar_url: myPhoto || null, body: body.slice(0, 800), verified: Boolean(user.email_confirmed_at) });
    setBusy(false);
    if (error) { toast({ title: "Could not post", description: error.message, variant: "destructive" }); return; }
    try { localStorage.setItem("ompath_last_comment", String(Date.now())); } catch { /* ignore */ }
    setText(""); void load();
  };
  const remove = async (id: string) => {
    if (!user) return;
    const { error } = await db.from("story_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    if (error) toast({ title: "Could not delete", description: error.message, variant: "destructive" }); else void load();
  };

  return (
    <section className="not-prose mx-auto mt-10 max-w-[44rem]" aria-label="Comments">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">Conversation {list.length > 0 && <span className="text-muted-foreground">· {list.length}</span>}</p>
      {user ? (
        <div className="mt-3 rounded-2xl border border-border bg-card p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 800))} rows={3} placeholder="Say something kind, or ask the writer a question." className="w-full resize-none bg-transparent px-1 text-sm leading-relaxed outline-none" />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{text.length}/800 · posting as {myName}</span>
            <button type="button" onClick={() => void send()} disabled={busy || text.trim().length < 2} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post</button>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground"><Link to={`/login?redirect=${encodeURIComponent(location.pathname)}`} className="font-bold text-primary hover:underline">Log in</Link> to join the conversation.</p>
      )}
      <ul className="mt-4 space-y-3">
        {loading && <li className="text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></li>}
        {list.map((c) => (
          <li key={c.id} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-emerald-500 text-sm font-bold text-primary-foreground">{c.avatar_url ? <img src={c.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : (c.author_name[0] || "?").toUpperCase()}</span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-muted/50 px-3.5 py-2.5">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold">{c.author_name}{c.verified && <BadgeCheck className="h-4 w-4 text-sky-500" aria-label="Verified" />}<span className="text-[11px] font-normal text-muted-foreground">{ago(c.created_at)}</span>
                {user?.id === c.user_id && <button type="button" onClick={() => void remove(c.id)} aria-label="Delete your comment" className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}</p>
              <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
