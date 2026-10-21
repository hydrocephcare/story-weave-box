import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, FileText, Search, X } from "lucide-react";
import { PAPER_INDEX as ALL_INDEX, paperPath, type PaperMeta } from "@/lib/dentalPapers";
import { useSection } from "@/lib/sections";
import { supabase } from "@/integrations/supabase/client";

/** /<section>/papers: every past paper of the section, grouped by unit, newest first, with a search. */
export default function DentalPapers() {
  const [params] = useSearchParams();
  const sec = useSection();
  const PAPER_INDEX = useMemo(() => ALL_INDEX.filter((p) => p.section === sec.slug), [sec.slug]);
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [group, setGroup] = useState("");
  const [year, setYear] = useState(() => params.get("year") ?? "");
  const [prog, setProg] = useState(() => params.get("programme") ?? "");
  const years = useMemo(() => [...new Set(PAPER_INDEX.map((p) => p.year).filter(Boolean))].sort().reverse(), []);
  const progs = useMemo(() => [...new Set(PAPER_INDEX.flatMap((p) => p.programmes))].sort(), []);
  const groupNames = useMemo(() => [...new Set(PAPER_INDEX.map((p) => p.group))], []);
  const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
  // what a paper is about, beyond its title: its AI-written topics and keywords, and the wording of its questions (so topic and keyword links always find the paper)
  const [about, setAbout] = useState<Record<string, string>>({});
  useEffect(() => {
    let on = true;
    void (async () => {
      const out: Record<string, string> = {};
      try { const m = await import("@/data/dentalQuestions.json"); for (const r of m.default as [string, string, string][]) out[r[0]] = `${out[r[0]] ?? ""} ${r[2]}`.toLowerCase(); } catch { /* titles only */ }
      try { const { data } = await (supabase as any).from("paper_seo").select("slug, description, keywords, topics"); for (const r of (data ?? []) as { slug: string; description: string; keywords: string[]; topics: string[] }[]) out[r.slug] = `${out[r.slug] ?? ""} ${r.description} ${(r.keywords ?? []).join(" ")} ${(r.topics ?? []).join(" ")}`.toLowerCase(); } catch { /* titles only */ }
      if (on) setAbout(out);
    })();
    return () => { on = false; };
  }, []);
  const list = useMemo(() => PAPER_INDEX.filter((p) => (!group || p.group === group) && (!year || p.year === year) && (!prog || p.programmes.includes(prog)) && needles.every((w) => `${p.title} ${p.unitCode} ${p.unitTitle} ${p.date} ${p.programme} ${p.sitting}`.toLowerCase().includes(w) || (about[p.slug] ?? "").includes(w))), [q, group, year, prog, about]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const m = new Map<string, PaperMeta[]>();
    for (const p of list) (m.get(p.unitTitle) ?? m.set(p.unitTitle, []).get(p.unitTitle)!).push(p);
    for (const rows of m.values()) rows.sort((a, b) => String(b.year).localeCompare(String(a.year)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <Helmet>
        <title>{`All ${sec.name} past papers with answers | Ompath Study`}</title>
        <meta name="description" content="Dental Sciences past papers typed out to read and practise: human physiology, anatomy, oral health and more, by unit, with the paper laid out as it was printed." />
        <link rel="canonical" href={`https://www.ompathstudy.com/${sec.slug}/papers`} />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Dental</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">Past papers</h1>
      <p className="mt-2 text-sm text-muted-foreground">{PAPER_INDEX.length} paper{PAPER_INDEX.length === 1 ? "" : "s"}. Open one to read its questions, or use the Paper view button to see it as it was printed.</p>
      <label className="relative mt-5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a unit, code or year, e.g. physiology 2022" aria-label="Search dental past papers" className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-9 text-sm outline-none focus:border-primary" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
      </label>
      {groupNames.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Department">
          {["", ...groupNames].map((g) => <button key={g || "all"} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)} className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold ${group === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{g || "All"}</button>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year" className="h-10 rounded-full border border-input bg-background px-4 font-semibold"><option value="">Any year</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <select value={prog} onChange={(e) => setProg(e.target.value)} aria-label="Programme" className="h-10 max-w-full rounded-full border border-input bg-background px-4 font-semibold"><option value="">Any programme</option>{progs.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        {(year || prog || group || q) && <button type="button" onClick={() => { setYear(""); setProg(""); setGroup(""); setQ(""); }} className="font-bold text-primary hover:underline">Clear filters</button>}
      </div>
      {groups.length === 0 ? <p className="mt-12 text-center text-sm text-muted-foreground">No papers match that.</p> : (
        <div className="mt-6 space-y-8">
          {groups.map(([unit, rows]) => (
            <section key={unit}>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{unit} · {rows.length}</h2>
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {rows.map((p) => (
                  <li key={p.slug}>
                    <Link to={paperPath(p.slug)} className="group flex items-center gap-3 py-3.5">
                      <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold group-hover:text-primary">{p.sitting || "Exam"}{p.date ? ` · ${p.date}` : ""}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.unitCode} · {p.programme} · {p.questions} questions{p.complete ? "" : " · partly readable"}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-primary/50 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
