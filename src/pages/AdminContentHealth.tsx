import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath } from "@/lib/store";
import { analyse, balanceLetters, titleKey, type HealthReport } from "@/lib/contentHealth";

interface Row { id: string; title: string; category: string; slug: string; content: string }
const select = "h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-primary";

/** Admin: every blog of Years 1 to 3 checked for the faults that make a page look unfinished, worst first, with one-tap fixes where they are safe. */
export default function AdminContentHealth() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("all");
  const [code, setCode] = useState("all");
  const [msg, setMsg] = useState("");
  const [undo, setUndo] = useState<{ id: string; old: string } | null>(null);
  const [plan, setPlan] = useState<{ id: string; changed: number; skipped: number; content: string } | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const all: Row[] = [];
      for (let from = 0; from < 3000; from += 150) {
        const { data, error } = await supabase.from("articles").select("id,title,category,slug,content").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).range(from, from + 149);
        if (error || !data?.length) break;
        all.push(...(data as Row[]));
        if (data.length < 150) break;
      }
      if (on) { setRows(all.filter((r) => /^Year [123]\b/i.test(r.category || "") || !/^Stories/i.test(r.category || ""))); setLoading(false); }
    })();
    return () => { on = false; };
  }, []);

  const reports = useMemo(() => {
    const dupCount = new Map<string, number>();
    for (const r of rows) { const k = titleKey(r.title); if (k.length > 8) dupCount.set(k, (dupCount.get(k) ?? 0) + 1); }
    const out = new Map<string, HealthReport>();
    for (const r of rows) {
      const rep = analyse(r);
      if ((dupCount.get(titleKey(r.title)) ?? 0) > 1) { rep.issues.push({ code: "dup", label: "Same title as another page", weight: 2 }); rep.score += 2; }
      out.set(r.id, rep);
    }
    return out;
  }, [rows]);

  const shown = useMemo(() => rows
    .filter((r) => year === "all" || new RegExp(`^Year ${year}\\b`, "i").test(r.category || ""))
    .filter((r) => (reports.get(r.id)?.issues.length ?? 0) > 0 && (code === "all" || reports.get(r.id)!.issues.some((i) => i.code === code)))
    .sort((a, b) => (reports.get(b.id)?.score ?? 0) - (reports.get(a.id)?.score ?? 0)), [rows, reports, year, code]);

  const counts = useMemo(() => { const m = new Map<string, { label: string; n: number }>(); for (const rep of reports.values()) for (const i of rep.issues) m.set(i.code, { label: i.label.replace(/\(.*\)|\d+/g, "").trim(), n: (m.get(i.code)?.n ?? 0) + 1 }); return [...m.entries()].sort((a, b) => b[1].n - a[1].n); }, [reports]);

  const apply = async (id: string, content: string, old: string) => {
    const { error } = await supabase.from("articles").update({ content }).eq("id", id);
    if (error) { setMsg(error.message); return; }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, content } : r)));
    setUndo({ id, old }); setPlan(null); setMsg("Saved. You can undo it below until you leave this page.");
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Admin</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Content health</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">Every published blog, checked for thin or picture-only pages, scan noise, chat leftovers, odd titles and weak question banks. Worst first.</p>

      {loading ? <p className="mt-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading every page…</p> : (
        <>
          <p className="mt-6 text-sm text-muted-foreground">{rows.length} pages checked. <strong className="text-foreground">{[...reports.values()].filter((r) => r.issues.length).length}</strong> have something to look at.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <select className={select} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year"><option value="all">All years</option>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}</select>
            <select className={select} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Fault"><option value="all">Every fault</option>{counts.map(([c, v]) => <option key={c} value={c}>{v.label} ({v.n})</option>)}</select>
          </div>
          {msg && <p className="mt-4 text-sm font-semibold text-primary" role="status">{msg}</p>}
          {undo && <button type="button" onClick={async () => { await apply(undo.id, undo.old, rows.find((r) => r.id === undo.id)?.content ?? ""); setUndo(null); setMsg("Undone."); }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><RotateCcw className="h-4 w-4" /> Undo the last change</button>}

          <ul className="mt-6 space-y-7">
            {shown.slice(0, 80).map((r) => {
              const rep = reports.get(r.id)!;
              const canBalance = rep.issues.some((i) => i.code === "letters" || i.code === "runs");
              return (
                <li key={r.id}>
                  <Link to={buildBlogPath({ id: r.id, title: r.title, slug: r.slug })} target="_blank" className="font-serif text-xl font-bold leading-snug hover:text-primary">{r.title}</Link>
                  <p className="text-xs text-muted-foreground">{r.category}{rep.questions ? ` · ${rep.questions} questions` : ""}</p>
                  <ul className="mt-2 space-y-0.5 text-[15px] text-foreground/80">{rep.issues.map((i) => <li key={i.code}>· {i.label}</li>)}</ul>
                  {canBalance && (
                    <div className="mt-3">
                      {plan?.id === r.id ? (
                        <p className="text-sm">The options of {plan.changed} questions will be reordered ({plan.skipped} left alone because they refer to each other). <button type="button" className="ml-2 font-bold text-primary hover:underline" onClick={() => void apply(r.id, plan.content, r.content)}>Save it</button> <button type="button" className="ml-3 font-semibold text-muted-foreground hover:underline" onClick={() => setPlan(null)}>Cancel</button></p>
                      ) : (
                        <button type="button" className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-bold hover:border-primary/60" onClick={() => { const res = balanceLetters(r.id, r.content); setPlan({ id: r.id, ...res }); }}>Balance the answer letters</button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="text-muted-foreground">Nothing found with these filters.</li>}
          </ul>
          {shown.length > 80 && <p className="mt-6 text-sm text-muted-foreground">Showing the worst 80 of {shown.length}.</p>}
        </>
      )}
    </main>
  );
}
