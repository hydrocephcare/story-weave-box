import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Row { id: string; note_slug: string; author: string; body: string; hidden: boolean; created_at: string }
type Db = { from: (t: string) => any };

/** /admin/comments: the newest comments under the notes, with one tap to hide (kept in the database) or delete. */
export default function AdminComments() {
  const db = supabase as unknown as Db;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    const r = await db.from("note_comments").select("id,note_slug,author,body,hidden,created_at").order("created_at", { ascending: false }).limit(100);
    if (r.error) setMsg(/relation|does not exist|schema cache/i.test(r.error.message) ? "setup" : r.error.message); else { setRows(r.data ?? []); setMsg(""); }
    setBusy(false);
  }, [db]);
  useEffect(() => { void load(); }, [load]);

  const hide = async (c: Row, hidden: boolean) => {
    const { error } = await db.from("note_comments").update({ hidden }).eq("id", c.id);
    if (error) setMsg(error.message); else setRows((x) => x.map((y) => (y.id === c.id ? { ...y, hidden } : y)));
  };
  const del = async (c: Row) => {
    if (!window.confirm("Delete this comment for good?")) return;
    const { error } = await db.from("note_comments").delete().eq("id", c.id);
    if (error) setMsg(error.message); else setRows((x) => x.filter((y) => y.id !== c.id));
  };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Comments</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">The newest comments under the notes. Hide one to take it off the page (it stays here), or delete it.</p>
      {msg === "setup" ? <p className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm">The comments table is not set up yet.</p> : msg && <p className="mt-4 text-sm text-muted-foreground" role="status">{msg}</p>}
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : rows.length === 0 && msg !== "setup" ? <p className="mt-8 text-muted-foreground">No comments yet.</p> : (
        <ul className="mt-6 space-y-3">
          {rows.map((c) => (
            <li key={c.id} className={`rounded-xl border p-4 ${c.hidden ? "border-dashed border-border opacity-60" : "border-border"}`}>
              <p className="text-xs text-muted-foreground"><b className="text-foreground">{c.author}</b> on <Link to={`/notes/${c.note_slug}`} className="font-semibold text-primary hover:underline">{c.note_slug}</Link> · {new Date(c.created_at).toLocaleString()}{c.hidden ? " · hidden" : ""}</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px]">{c.body}</p>
              <div className="mt-2 flex gap-2 text-xs font-bold">
                <button type="button" onClick={() => void hide(c, !c.hidden)} className="rounded-full border border-border px-3 py-1 hover:border-primary hover:text-primary">{c.hidden ? "Show again" : "Hide"}</button>
                <button type="button" onClick={() => void del(c)} className="rounded-full border border-border px-3 py-1 hover:border-destructive hover:text-destructive">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
