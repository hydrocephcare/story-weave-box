import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = { id: string; created_at: string; source: string; message: string; url: string | null; user_agent: string | null; seen: boolean };
const db = supabase as any;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Errors visitors hit, sent here automatically. Newest first; mark them seen or clear them. */
export default function AdminErrors() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await db.from("client_errors").select("id,created_at,source,message,url,user_agent,seen").order("created_at", { ascending: false }).limit(40);
    setRows((data ?? []) as Row[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const unseen = (rows ?? []).filter((r) => !r.seen).length;
  const markSeen = async () => { setBusy(true); await db.from("client_errors").update({ seen: true }).eq("seen", false); await load(); setBusy(false); };
  const clear = async () => { if (!window.confirm("Delete all error reports?")) return; setBusy(true); await db.from("client_errors").delete().not("id", "is", null); await load(); setBusy(false); };
  if (rows === null) return null;
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5" aria-label="Errors from visitors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 font-serif text-xl font-bold"><AlertTriangle className={`h-5 w-5 ${unseen ? "text-rose-500" : "text-muted-foreground"}`} /> Errors from visitors {unseen > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{unseen} new</span>}</h2>
        {rows.length > 0 && (
          <div className="flex gap-2">
            <button type="button" onClick={() => void markSeen()} disabled={busy || unseen === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mark seen</button>
            <button type="button" onClick={() => void clear()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-rose-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
          </div>
        )}
      </div>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No errors reported. They appear here by themselves when a visitor hits one.</p> : (
        <ul className="mt-3 divide-y divide-border/70">
          {rows.map((r) => (
            <li key={r.id} className={`py-2.5 text-sm ${r.seen ? "opacity-60" : ""}`}>
              <p className="font-semibold text-foreground">{r.message}</p>
              <p className="mt-0.5 break-all text-xs text-muted-foreground">{when(r.created_at)} · {r.source}{r.url ? ` · ${r.url.replace(/^https?:\/\/[^/]+/, "")}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
