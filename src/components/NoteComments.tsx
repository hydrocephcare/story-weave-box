import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Row { id: string; user_id: string; author: string; body: string; created_at: string }
type Db = { from: (t: string) => any };

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
/** "Mary Wanjiku" becomes "Mary W."; an e-mail address is never shown. */
const nameOf = (u: { email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
  const full = String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim();
  if (full) { const [a, ...rest] = full.split(/\s+/); return rest.length ? `${a} ${rest[rest.length - 1][0]}.` : a; }
  return "Student";
};

/** Questions and answers under a note. Anyone can read; signed-in students can write; you can delete your own, and the admin can remove any. */
export default function NoteComments({ slug, title }: { slug: string; title: string }) {
  const db = supabase as unknown as Db;
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [off, setOff] = useState(false); // the table is not set up yet: the section stays out of the way

  const load = useCallback(async () => {
    const r = await db.from("note_comments").select("id,user_id,author,body,created_at").eq("note_slug", slug).order("created_at", { ascending: false }).limit(50);
    if (r.error) { setOff(true); return; }
    setRows(r.data ?? []);
  }, [db, slug]);
  useEffect(() => { setRows(null); setOff(false); void load(); }, [load]);

  const post = async () => {
    const body = text.trim();
    if (!user || body.length < 2) return;
    setBusy(true); setMsg("");
    const { error } = await db.from("note_comments").insert({ note_slug: slug, user_id: user.id, author: nameOf(user as never), body: body.slice(0, 1500) });
    setBusy(false);
    if (error) { setMsg("Your comment could not be posted. Try again in a moment."); return; }
    setText(""); void load();
  };
  const remove = async (id: string) => {
    const { error } = await db.from("note_comments").delete().eq("id", id);
    if (!error) setRows((r) => (r ?? []).filter((x) => x.id !== id));
  };

  if (off) return null;
  return (
    <section aria-label="Comments" className="mt-12 print:hidden">
      <h2 className="flex items-center gap-2 font-serif text-2xl font-bold"><MessageSquare className="h-5 w-5 text-primary" aria-hidden /> Questions and comments{rows && rows.length ? <span className="text-base font-semibold text-muted-foreground">· {rows.length}</span> : null}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ask about {title}, share a mnemonic, or point out a mistake. Keep it kind and about the note.</p>
      {user ? (
        <div className="mt-4 rounded-2xl border border-border bg-card p-3">
          <label htmlFor="note-comment" className="sr-only">Write a comment</label>
          <textarea id="note-comment" value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} rows={3} placeholder="Write a question or comment…" className="w-full resize-y rounded-lg border border-border bg-background p-3 text-[15px] outline-none focus:border-primary" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{text.length}/1500 · shown as {nameOf(user as never)}</span>
            <button type="button" onClick={() => void post()} disabled={busy || text.trim().length < 2} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Post</button>
          </div>
          {msg && <p className="mt-2 text-sm text-destructive" role="status">{msg}</p>}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-4 text-sm"><Link to="/login" className="font-bold text-primary hover:underline">Sign in</Link> to ask a question or leave a comment. It is free.</p>
      )}
      <ul className="mt-5 space-y-3">
        {rows === null ? <li className="text-sm text-muted-foreground">Loading…</li> : rows.length === 0 ? <li className="text-sm text-muted-foreground">No comments yet. Be the first to ask.</li> : rows.map((c) => (
          <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold">{c.author} <span className="font-medium text-muted-foreground">· {ago(c.created_at)}</span></p>
              {(user?.id === c.user_id || isAdmin) && <button type="button" onClick={() => void remove(c.id)} aria-label="Delete this comment" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" aria-hidden /></button>}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-6">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
