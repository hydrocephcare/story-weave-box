import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import plan from "@/data/dupePlan.json";

type Db = { from: (t: string) => any };
interface Page { id: string; words: number; title: string; category: string; slug: string }

/**
 * /admin/duplicates: pages whose text repeats another page (found by scripts/imed/content-dupes.mjs). Each group shows the page to keep and the copies.
 * "Hide this copy" unpublishes the copy (it can be restored from the database); the kept page stays. Nothing happens without a tap.
 */
export default function AdminDuplicates() {
  const db = supabase as unknown as Db;
  const [state, setState] = useState<Record<string, "live" | "hidden">>({});
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const ids = (plan.groups as { hide: Page[] }[]).flatMap((g) => g.hide.map((h) => h.id));
      const r = await db.from("articles").select("id,published,deleted_at").in("id", ids);
      const s: Record<string, "live" | "hidden"> = {};
      for (const row of (r.data ?? []) as { id: string; published: boolean; deleted_at: string | null }[]) s[row.id] = row.published && !row.deleted_at ? "live" : "hidden";
      setState(s); setBusy(false);
    })();
  }, [db]);

  const hide = async (p: Page) => {
    const { error } = await db.from("articles").update({ published: false, deleted_at: new Date().toISOString() }).eq("id", p.id);
    if (error) setMsg(error.message); else { setState((s) => ({ ...s, [p.id]: "hidden" })); setMsg(`Hidden: ${p.title}`); }
  };
  const link = (p: Page) => (p.slug ? `/blog/${p.slug}` : `/blog/${p.id}`);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Repeated pages</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">These pages carry the same text as another page (checked on {plan.made}). Open both if you want to compare, then hide the copy. The page marked Keep is the fuller one and stays.</p>
      {msg && <p className="mt-4 text-sm text-muted-foreground" role="status">{msg}</p>}
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : (
        <ul className="mt-8 space-y-6">
          {(plan.groups as { keep: Page; hide: Page[] }[]).map((g) => (
            <li key={g.keep.id} className="rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Keep</p>
              <a href={link(g.keep)} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">{g.keep.title}</a>
              <p className="text-xs text-muted-foreground">{g.keep.category} · {g.keep.words} words</p>
              {g.hide.map((h) => (
                <div key={h.id} className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Copy</p>
                    <a href={link(h)} target="_blank" rel="noopener" className="font-semibold hover:text-primary hover:underline">{h.title}</a>
                    <p className="text-xs text-muted-foreground">{h.category} · {h.words} words</p>
                  </div>
                  {state[h.id] === "hidden" ? <span className="text-sm font-bold text-muted-foreground">Hidden</span> : <button type="button" onClick={() => void hide(h)} className="h-10 rounded-lg border border-border px-4 text-sm font-bold hover:border-destructive hover:text-destructive">Hide this copy</button>}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
