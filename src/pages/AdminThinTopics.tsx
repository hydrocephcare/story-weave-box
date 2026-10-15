import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rewriteDeeper } from "@/lib/topics";

type Db = { from: (t: string) => any };
interface Row { slug: string; name: string; category: string | null; sections: unknown[] | null; exam: unknown[] | null; down: number; up: number }

/**
 * /admin/thin-topics: topic pages written before the deep layout (fewer than 9 sections or 8 examiner questions) and pages students voted down.
 * A thin page is upgraded once, on its own, the first time a student reads it; this list lets you do the most-wanted ones yourself, one tap each.
 */
export default function AdminThinTopics() {
  const db = supabase as unknown as Db;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [p, v] = await Promise.all([
        db.from("topic_pages").select("slug,name,category,sections:content->sections,exam:content->exam").eq("status", "published").limit(2000),
        db.from("topic_votes").select("slug,vote").limit(20000),
      ]);
      const votes = new Map<string, { up: number; down: number }>();
      for (const x of (v.data ?? []) as { slug: string; vote: number }[]) { const c = votes.get(x.slug) ?? { up: 0, down: 0 }; if (x.vote > 0) c.up++; else c.down++; votes.set(x.slug, c); }
      const all = ((p.data ?? []) as Omit<Row, "up" | "down">[]).map((r) => ({ ...r, up: votes.get(r.slug)?.up ?? 0, down: votes.get(r.slug)?.down ?? 0 }));
      setRows(all.filter((r) => (r.sections?.length ?? 0) < 9 || (r.exam?.length ?? 0) < 8 || r.down > 0).sort((a, b) => b.down - a.down || (a.sections?.length ?? 0) - (b.sections?.length ?? 0)));
      setBusy(false);
    })();
  }, [db]);

  const upgrade = async (r: Row) => { setMsg((m) => ({ ...m, [r.slug]: "Writing, about 40 seconds..." })); const out = await rewriteDeeper(r.slug, r.name, r.category ?? ""); setMsg((m) => ({ ...m, [r.slug]: out })); };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Thin and voted-down topic pages</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">{busy ? "Loading…" : `${rows.length} page(s). Each is also upgraded on its own the first time a student reads it, so you only need to do the ones you want fixed now.`} Rewriting uses AI credits.</p>
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {rows.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link to={`/topic/${r.slug}`} className="font-semibold hover:underline">{r.name}</Link>
                <p className="text-sm text-muted-foreground">{r.sections?.length ?? 0} sections · {r.exam?.length ?? 0} questions · 👍 {r.up} · 👎 {r.down}</p>
                {msg[r.slug] && <p className="text-sm text-primary">{msg[r.slug]}</p>}
              </div>
              <button type="button" onClick={() => void upgrade(r)} className="rounded-full border border-primary/50 bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary hover:bg-primary/20">Rewrite deeper</button>
            </li>
          ))}
          {!rows.length && <li className="px-4 py-6 text-muted-foreground">Nothing thin right now.</li>}
        </ul>
      )}
    </main>
  );
}
