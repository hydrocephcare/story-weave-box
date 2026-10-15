import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadStoredPage, writeDeepNotes } from "@/lib/topics";

type Db = { from: (t: string) => any };
interface Row { slug: string; name: string; category: string | null; deepAt: string | null; v2: boolean; down: number; up: number }

/**
 * /admin/thin-topics: every topic page, with whether its deep exam notes exist. Students write them by tapping "Deep exam notes" on a page; here you can
 * write the ones you want ready now, one tap each. Pages students voted down come first. Writing uses AI credits, once per page.
 */
export default function AdminThinTopics() {
  const db = supabase as unknown as Db;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [p, v] = await Promise.all([
        db.from("topic_pages").select("slug,name,category,deepAt:content->deep->>generatedAt,hasDeep:content->deep->>model,v2:content->deep->facts").eq("status", "published").limit(2000),
        db.from("topic_votes").select("slug,vote").limit(20000),
      ]);
      const votes = new Map<string, { up: number; down: number }>();
      for (const x of (v.data ?? []) as { slug: string; vote: number }[]) { const c = votes.get(x.slug) ?? { up: 0, down: 0 }; if (x.vote > 0) c.up++; else c.down++; votes.set(x.slug, c); }
      const all = ((p.data ?? []) as (Omit<Row, "up" | "down" | "v2"> & { hasDeep: string | null; v2: unknown })[]).map((r) => ({ ...r, deepAt: r.deepAt ?? r.hasDeep, v2: Boolean(r.v2), up: votes.get(r.slug)?.up ?? 0, down: votes.get(r.slug)?.down ?? 0 }));
      setRows(all.sort((a, b) => Number(a.v2) - Number(b.v2) || b.down - a.down || a.name.localeCompare(b.name)));
      setBusy(false);
    })();
  }, [db]);

  const write = async (r: Row) => {
    setMsg((m) => ({ ...m, [r.slug]: "Writing, about 40 seconds..." }));
    const page = await loadStoredPage(r.slug);
    if (!page) { setMsg((m) => ({ ...m, [r.slug]: "Could not read the page." })); return; }
    const out = await writeDeepNotes(r.slug, r.name, r.category ?? "", page);
    if ("deep" in out) { setMsg((m) => ({ ...m, [r.slug]: "Written and saved." })); setRows((all) => all.map((x) => (x.slug === r.slug ? { ...x, deepAt: "now", v2: true } : x))); }
    else setMsg((m) => ({ ...m, [r.slug]: out.error === "busy" ? "The writer is busy. Try again in a minute." : "It could not be written just now." }));
  };

  const without = rows.filter((r) => !r.v2).length;
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/admin/tools" className="text-sm font-semibold text-primary hover:underline">← Admin tools</Link>
      <h1 className="mt-2 font-serif text-4xl font-bold">Deep exam notes</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">{busy ? "Loading…" : `${rows.length - without} of ${rows.length} topic pages have deep notes.`} Students write them by tapping “Deep exam notes” on a page; write the ones you want ready now here. Each is written once and costs AI credits once.</p>
      {busy ? <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" /> : (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {rows.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link to={`/topic/${r.slug}`} className="font-semibold hover:underline">{r.name}</Link>
                <p className="text-sm text-muted-foreground">{r.v2 ? "Full deep notes ready" : r.deepAt ? "First version only" : "No deep notes yet"} · 👍 {r.up} · 👎 {r.down}</p>
                {msg[r.slug] && <p className="text-sm text-primary">{msg[r.slug]}</p>}
              </div>
              {!r.v2 && <button type="button" onClick={() => void write(r)} className="rounded-full border border-primary/50 bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary hover:bg-primary/20">{r.deepAt ? "Write the full version" : "Write deep notes"}</button>}
            </li>
          ))}
          {!rows.length && <li className="px-4 py-6 text-muted-foreground">No topic pages yet.</li>}
        </ul>
      )}
    </main>
  );
}
