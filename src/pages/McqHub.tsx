import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, FolderOpen, ListChecks, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateMetaTags } from "@/lib/seo";
import { isPublicMcqSet } from "@/lib/content-policy";
import { examUnit, examYear, shortTitle, type CatalogRow } from "@/lib/examMeta";
import { useMyYear } from "@/hooks/useMyYear";

const YEARS = [1, 2, 3, 4, 5, 6];

/** One naming rule for banks: "Topic: MCQs". The list shows the topic, sorted A to Z within its unit. */
const topicOf = (title: string, category: string) => shortTitle(title, category).replace(/\s*[:—–-]?\s*MCQs?$/i, "").trim();
const done = (id: string): number | null => {
  try { const j = JSON.parse(localStorage.getItem(`mcq_practice_${id}`) || "null"); return j && Number(j.total) ? Math.round((Number(j.score) / Number(j.total)) * 100) : null; } catch { return null; }
};

/** The MCQ library: browse by year, open a unit folder, pick a bank. Reads like the notes library, not like the exam hall. */
export default function McqHub() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [q, setQ] = useState("");
  const { year: myYear } = useMyYear();
  // a student who has chosen a year sees that year's banks only; everyone else can browse any year
  const year = myYear ?? (Number(/(\d)/.exec(params.get("year") || "")?.[1]) || null);
  const unit = params.get("unit");

  useEffect(() => {
    updateMetaTags({ title: "MCQ Library", description: "Practice multiple-choice questions by year and unit for Kenyan medical and health-science students, with an explanation for every answer." });
    let live = true;
    (supabase as any).rpc("exam_catalog", undefined, { get: true }).then(({ data }: { data: CatalogRow[] | null }) => { if (live) setRows((data || []).filter(isPublicMcqSet).filter((r) => r.kind === "bank" && r.question_count > 0)); });
    return () => { live = false; };
  }, []);

  const go = (next: { year?: number | null; unit?: string | null }) => {
    const p = new URLSearchParams(params);
    if ("year" in next) { if (next.year) p.set("year", `Year ${next.year}`); else p.delete("year"); p.delete("unit"); }
    if ("unit" in next) { if (next.unit) p.set("unit", next.unit); else p.delete("unit"); }
    setParams(p);
  };

  const all = rows || [];
  const inYear = useMemo(() => (year ? all.filter((r) => examYear(r.category, r.title) === year) : all), [all, year]);
  const folders = useMemo(() => {
    const m = new Map<string, { banks: number; questions: number }>();
    for (const r of inYear) { const u = examUnit(r.category); const f = m.get(u) || { banks: 0, questions: 0 }; f.banks++; f.questions += r.question_count; m.set(u, f); }
    return [...m.entries()].sort((a, b) => b[1].questions - a[1].questions);
  }, [inYear]);
  const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => inYear.filter((r) => (needles.length || unit) && (!unit || examUnit(r.category) === unit) && needles.every((w) => `${r.title} ${examUnit(r.category)}`.toLowerCase().includes(w))).sort((a, b) => topicOf(a.title, a.category).localeCompare(topicOf(b.title, b.category), undefined, { sensitivity: "base", numeric: true })), [inYear, unit, q]);
  const yearCount = (y: number) => all.filter((r) => examYear(r.category, r.title) === y).length;
  const loading = rows === null;
  const showList = needles.length > 0 || !!unit;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-gradient-to-b from-primary/10 to-background">
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-8 sm:pt-10">
          <nav className="flex items-center gap-1 text-sm font-semibold text-muted-foreground" aria-label="Breadcrumb">
            <button type="button" onClick={() => go({ year: null })} className="hover:text-foreground">MCQ Library</button>
            {year && <><ChevronRight className="h-3.5 w-3.5" aria-hidden /><button type="button" onClick={() => go({ year })} className="hover:text-foreground">Year {year}</button></>}
            {unit && <><ChevronRight className="h-3.5 w-3.5" aria-hidden /><span className="text-foreground">{unit}</span></>}
          </nav>
          <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">{unit || (year ? `Year ${year} MCQs` : "MCQ Library")}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">Read a question, choose your answer, and the explanation opens right under it. Work through a bank in any order, at your own pace. For a timed paper, use the <Link to="/exams" className="font-semibold text-primary hover:underline">Exam Center</Link>.</p>
          <label className="relative mt-5 block max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a topic, e.g. cardiology" aria-label="Search MCQs" className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <div className={`mt-5 flex gap-2 overflow-x-auto pb-1 ${myYear ? "hidden" : ""}`} role="tablist" aria-label="Year">
            <button type="button" role="tab" aria-selected={!year} onClick={() => go({ year: null })} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ${!year ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}>All years</button>
            {YEARS.map((y) => <button key={y} type="button" role="tab" aria-selected={year === y} onClick={() => go({ year: y })} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ${year === y ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}>Year {y} <span className="opacity-60">{yearCount(y)}</span></button>)}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />)}</div>
        ) : showList ? (
          <div>
            {unit && <button type="button" onClick={() => go({ unit: null })} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> All units</button>}
            <p className="mb-3 text-sm font-semibold text-muted-foreground">{list.length} question bank{list.length === 1 ? "" : "s"} · A to Z</p>
            {list.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Nothing matches. Try a shorter search.</p> : (
              <ul className="divide-y divide-border border-y border-border">
                {list.map((r) => {
                  const score = done(r.id); const y = examYear(r.category, r.title);
                  return (
                    <li key={r.id}>
                      <Link to={`/mcqs/${(r.slug || "").trim() || r.id}`} className="group flex items-center gap-4 px-1 py-4 transition-colors hover:bg-primary/5">
                        <ListChecks className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-serif text-[17px] font-bold">{topicOf(r.title, r.category)}</span>
                          <span className="block truncate text-sm text-muted-foreground">{[examUnit(r.category), y ? `Year ${y}` : "", `${r.question_count} questions`].filter(Boolean).join(" · ")}</span>
                        </span>
                        {score !== null && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">{score}%</span>}
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : folders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <FolderOpen className="mx-auto h-9 w-9 text-muted-foreground/60" aria-hidden />
            <h2 className="mt-3 font-serif text-xl font-bold">No MCQs for Year {year} yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Banks are added as notes are published.</p>
            <button type="button" onClick={() => go({ year: null })} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">See all years</button>
          </div>
        ) : (
          <div className="grid gap-x-10 sm:grid-cols-2">
            {folders.map(([name, f]) => (
              <button key={name} type="button" onClick={() => go({ unit: name })} className="group flex items-start gap-4 border-b border-border py-4 text-left transition hover:text-primary">
                <FolderOpen className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0"><span className="block font-serif text-lg font-bold leading-snug">{name}</span><span className="mt-1 block text-sm text-muted-foreground">{f.banks} bank{f.banks === 1 ? "" : "s"} · {f.questions} questions</span></span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
