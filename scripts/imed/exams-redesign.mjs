// One-off: the exams page gets a compact header, year chips, a search box and unit chips, and tidier exam cards. The loading, filtering by year and starting an exam are unchanged.
import fs from "node:fs";
const f = "src/pages/Exams.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("exam-controls")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

need("  const [searchParams] = useSearchParams();");
s = s.replace("  const [searchParams] = useSearchParams();", "  const [searchParams, setSearchParams] = useSearchParams();");

// filters on top of the year filter
need("  const allExams = useMemo(() => [sampleExam, ...filteredExamSets], [filteredExamSets]);");
s = s.replace("  const allExams = useMemo(() => [sampleExam, ...filteredExamSets], [filteredExamSets]);", `  const [q, setQ] = useState("");
  const [unitPick, setUnitPick] = useState<string | null>(null);
  const yearChips = useMemo(() => [...new Set(examSets.map((e) => getYearFromCategory(e.category)).filter(Boolean) as string[])].sort(), [examSets]);
  const unitChips = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of filteredExamSets) { const u = inferUnit(e); n.set(u, (n.get(u) ?? 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredExamSets]);
  const allExams = useMemo(() => {
    const needles = q.toLowerCase().split(/\\s+/).filter(Boolean);
    const list = filteredExamSets.filter((e) => (!unitPick || inferUnit(e) === unitPick) && needles.every((w) => \`\${e.title} \${inferUnit(e)}\`.toLowerCase().includes(w)));
    return unitPick || needles.length ? list : [sampleExam, ...list];
  }, [filteredExamSets, q, unitPick]);`);

// the page
const a = s.indexOf('  return (\n    <div className="min-h-screen bg-background">');
need('  return (\n    <div className="min-h-screen bg-background">');
const body = `  const chip = (on: boolean) => \`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors \${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"}\`;
  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-4 py-7 sm:py-9">
        <div className="mx-auto max-w-6xl">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Trophy className="h-3.5 w-3.5" aria-hidden /> Timed exams</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-foreground sm:text-5xl">Exam Center</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">Timed multiple-choice exams from your unit content, marked at the end with the answers explained. {loading ? "" : \`\${examSets.length + 1} exams available.\`}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"><Heart className="h-3.5 w-3.5" aria-hidden /> Each exam is KES {examPrice}; it keeps Ompath Study free for health students.</p>
          <ContentCredit />
        </div>
      </section>

      <section className="exam-controls mx-auto max-w-6xl px-4 pt-6">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Year">
          <button type="button" onClick={() => setSearchParams({})} aria-pressed={selectedYear === "All"} className={chip(selectedYear === "All")}>All years</button>
          {yearChips.map((y) => <button key={y} type="button" onClick={() => { setSearchParams({ year: y }); setUnitPick(null); }} aria-pressed={selectedYear === y} className={chip(selectedYear === y)}>{y}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exams, e.g. pathology, physiology" aria-label="Search exams" className="max-w-sm" />
          <span className="text-sm text-muted-foreground">{loading ? "" : \`\${allExams.length} shown\`}</span>
        </div>
        {unitChips.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Unit">
            <button type="button" onClick={() => setUnitPick(null)} aria-pressed={!unitPick} className={chip(!unitPick)}>Every unit</button>
            {unitChips.map(([u, n]) => <button key={u} type="button" onClick={() => setUnitPick(unitPick === u ? null : u)} aria-pressed={unitPick === u} className={chip(unitPick === u)}>{u} <span className="text-xs opacity-70">{n}</span></button>)}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : allExams.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">No exams match. Try another year or a shorter search.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {allExams.slice(0, visible).map((exam) => {
              const isSample = exam.id === "sample-exam";
              const unitName = inferUnit(exam);
              const yearTag = getYearFromCategory(exam.category);
              return (
                <article key={exam.id} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                  <div className="h-1.5 bg-gradient-to-r from-primary via-primary/60 to-violet-400" aria-hidden />
                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{unitName}</span>
                      {yearTag && <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{yearTag}</span>}
                    </div>
                    <h2 className="font-serif text-lg font-bold leading-snug text-foreground">{exam.title}</h2>
                    <p className="mt-2 flex items-center gap-3 text-xs font-semibold text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> Timed</span><span className="inline-flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" aria-hidden /> Marked with answers</span></p>
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold">FREE</span>
                      <Button size="sm" onClick={() => navigate(isSample ? \`/exams/\${exam.id}/start\` : buildExamPath(exam))} className="gap-1.5">Start exam <ArrowRight className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!loading && allExams.length > visible && (
          <div className="flex justify-center pt-2">
            <LoadMoreButton onMore={() => setVisible((v) => v + 12)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent">Show more exams</LoadMoreButton>
          </div>
        )}
      </section>
    </div>
  );
}
`;
s = s.slice(0, a) + body;
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("exams redesigned");
