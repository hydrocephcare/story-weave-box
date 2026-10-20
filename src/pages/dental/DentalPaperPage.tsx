import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, ChevronRight, Eye, EyeOff, FileText, Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import PaperSheet from "@/components/dental/PaperSheet";
import { loadAnswers, loadSeo, type PaperSeo } from "@/lib/dentalAnswers";
import { answerUnits } from "@/lib/dentalKeys";
import { PAPER_INDEX, loadPaper, paperPath, questionCount, totalMarks, type DentalPaper, type PaperItem, type PaperPart } from "@/lib/dentalPapers";

const SITE = "https://www.ompathstudy.com";
type Rating = "got" | "missed";

const plain = (md: string) => md.replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "").replace(/\s*\n\s*/g, ". ").replace(/\.\.+/g, ".").trim();
const marksLabel = (m?: number | null) => (m ? <span className="shrink-0 text-sm font-semibold text-muted-foreground">{m} mark{m === 1 ? "" : "s"}</span> : null);

/** A model answer: lines starting with "- " become bullets, **bold** is kept. */
function Answer({ text }: { text: string }) {
  const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") ? <strong key={i}>{x.slice(2, -2)}</strong> : x));
  const bullet = /^\s*[-•*]\s+/;
  return (
    <div className="mt-2 space-y-1.5 border-l-2 border-emerald-500/60 pl-4 text-[15.5px] leading-relaxed">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">Model answer</p>
      {text.split("\n").filter((l) => l.trim()).map((l, i) => (bullet.test(l) ? <p key={i} className="flex gap-2"><span className="text-primary">•</span><span>{bold(l.replace(bullet, ""))}</span></p> : <p key={i} className="font-semibold">{bold(l)}</p>))}
    </div>
  );
}

function SubParts({ parts }: { parts?: PaperPart[] }) {
  if (!parts?.length) return null;
  return (
    <ol className="mt-1.5 space-y-1 pl-5 text-[16px] leading-relaxed">
      {parts.map((p, i) => (
        <li key={i}><div className="flex items-baseline justify-between gap-3"><p className="min-w-0 flex-1"><span className="mr-1.5 font-semibold text-primary">{p.l ? `${p.l})` : "•"}</span>{p.text}</p>{marksLabel(p.marks)}</div><SubParts parts={p.parts} /></li>
      ))}
    </ol>
  );
}

/** The answer under a question or part: shown straight away when reading, behind a button (with a got-it / missed-it check) when testing yourself. */
function AnswerArea({ k, answers, test, shown, toggle, ratings, rate }: { k: string; answers: Record<string, string>; test: boolean; shown: Set<string>; toggle: (k: string) => void; ratings: Record<string, Rating>; rate: (k: string, r: Rating) => void }) {
  const a = answers[k]; if (!a) return null;
  if (!test) return <Answer text={a} />;
  const open = shown.has(k);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => toggle(k)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">{open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{open ? "Hide answer" : "Show answer"}</button>
      {open && <><Answer text={a} />
        <div className="mt-2 flex items-center gap-4 text-sm"><span className="text-muted-foreground">Did you have it?</span>
          <button type="button" onClick={() => rate(k, "got")} className={`inline-flex items-center gap-1 font-bold ${ratings[k] === "got" ? "text-emerald-600" : "text-muted-foreground hover:text-foreground"}`}><Check className="h-4 w-4" />Got it</button>
          <button type="button" onClick={() => rate(k, "missed")} className={`inline-flex items-center gap-1 font-bold ${ratings[k] === "missed" ? "text-rose-600" : "text-muted-foreground hover:text-foreground"}`}><X className="h-4 w-4" />Missed it</button>
        </div></>}
    </div>
  );
}

/** One dental past paper, set out question by question with each answer straight under it, plus a button that shows the paper as it was printed. */
export default function DentalPaperPage() {
  const { slug = "" } = useParams();
  const [paper, setPaper] = useState<DentalPaper | null | undefined>(undefined);
  const [view, setView] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [seo, setSeo] = useState<PaperSeo | null>(null);
  const [test, setTest] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  useEffect(() => {
    let on = true; setPaper(undefined); setAnswers({}); setSeo(null); setShown(new Set()); setTest(false);
    try { setRatings(JSON.parse(localStorage.getItem(`dental_study_${slug}`) || "{}")); } catch { setRatings({}); }
    void loadPaper(slug).then((p) => { if (on) setPaper(p); }).catch(() => { if (on) setPaper(null); });
    void loadAnswers(slug).then((a) => { if (on) setAnswers(a); });
    void loadSeo(slug).then((s) => { if (on) setSeo(s); });
    return () => { on = false; };
  }, [slug]);
  const rate = (k: string, r: Rating) => setRatings((p) => { const n = { ...p, [k]: p[k] === r ? undefined : r } as Record<string, Rating>; try { localStorage.setItem(`dental_study_${slug}`, JSON.stringify(n)); } catch { /* private mode */ } return n; });
  const toggle = (k: string) => setShown((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const items = useMemo(() => (paper ? paper.pages.flatMap((pg) => pg.items) : []), [paper]);
  const units = useMemo(() => items.filter((it) => it.t === "q").flatMap((it) => answerUnits(it).map((u, i) => ({ ...u, text: it.parts?.length ? `${it.text} ${it.parts[i]?.l ?? ""}) ${it.parts[i]?.text ?? ""}`.replace(/\s+/g, " ").trim() : it.text }))), [items]);
  const ready = units.filter((u) => answers[u.key]).length;

  if (paper === undefined) return <div className="mx-auto max-w-3xl px-5 py-16" aria-busy="true"><div className="h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}</div></div>;
  if (paper === null) return <div className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="font-serif text-3xl font-bold">Paper not found</h1><Link to="/dental/papers" className="mt-5 inline-block font-bold text-primary hover:underline">All dental past papers →</Link></div>;

  const q = questionCount(paper), marks = totalMarks(paper);
  const meta = PAPER_INDEX.find((p) => p.slug === paper.slug);
  const when = paper.dateLabel || paper.date;
  const catSlug = paper.categorySlug || meta?.categorySlug || "other-units";
  const related = PAPER_INDEX.filter((p) => p.unitSlug === (paper.unitSlug || meta?.unitSlug) && p.slug !== paper.slug).slice(0, 8);
  const desc = (seo?.description || `${paper.unitTitle} (${paper.unitCode}) ${paper.sitting || "exam"} past paper from ${paper.university}${when ? `, ${when}` : ""}: ${q} questions${marks ? `, ${marks} marks` : ""}, set out question by question with model answers.`).replace(/\s+/g, " ");
  const url = `${SITE}/dental/papers/${paper.slug}`;
  const graph: unknown[] = [
    { "@type": "BreadcrumbList", itemListElement: [["Dental", `${SITE}/dental`], [paper.category || "Past papers", `${SITE}/dental/category/${catSlug}`], [paper.unitTitle, `${SITE}/dental/units/${paper.unitSlug}`], [paper.title, url]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) },
    { "@type": "LearningResource", name: paper.title, description: desc, educationalLevel: paper.programmes?.join(", ") || paper.programme, inLanguage: "en", learningResourceType: "Exam paper", keywords: seo?.keywords?.join(", "), about: seo?.topics, isAccessibleForFree: true, publisher: { "@type": "Organization", name: "Ompath Study", url: SITE }, url },
  ];
  const faq = units.filter((u) => answers[u.key]).slice(0, 10).map((u) => ({ "@type": "Question", name: u.text.slice(0, 300), acceptedAnswer: { "@type": "Answer", text: plain(answers[u.key]).slice(0, 700) } }));
  if (faq.length) graph.push({ "@type": "FAQPage", mainEntity: faq });
  const ld = { "@context": "https://schema.org", "@graph": graph };
  const rated = Object.values(ratings).filter(Boolean);
  const nav = items.filter((it) => it.t === "q");

  const QuestionRow = (it: PaperItem, i: number) => {
    const us = answerUnits(it);
    const area = (k: string) => <AnswerArea k={k} answers={answers} test={test} shown={shown} toggle={toggle} ratings={ratings} rate={rate} />;
    return (
      <li key={i} id={`q${it.n}`} className="mt-8 list-none scroll-mt-20">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 flex-1 text-[17px] leading-relaxed"><span className="mr-2 font-serif text-lg font-bold text-primary">{it.n}.</span>{it.text}</p>
          {!it.parts?.length && marksLabel(it.marks)}
        </div>
        {!it.parts?.length ? area(us[0].key) : (
          <div className="mt-3 space-y-5 border-l-2 border-primary/25 pl-4">
            {it.parts.map((p, j) => (
              <div key={j}>
                <div className="flex items-baseline justify-between gap-3 text-[16.5px] leading-relaxed"><p className="min-w-0 flex-1"><span className="mr-1.5 font-semibold text-primary">{p.l ? `${p.l})` : "•"}</span>{p.text}</p>{marksLabel(p.marks)}</div>
                <SubParts parts={p.parts} />
                {us[j] && area(us[j].key)}
              </div>
            ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <Helmet>
        <title>{`${paper.unitTitle}, ${paper.sitting || "Exam"} ${when}: past paper with answers | Ompath Study`}</title>
        <meta name="description" content={desc.slice(0, 300)} />
        {seo?.keywords?.length ? <meta name="keywords" content={seo.keywords.join(", ")} /> : null}
        <link rel="canonical" href={url} />
        <meta property="og:site_name" content="Ompath Study" /><meta property="og:title" content={`${paper.title} | Past paper with answers`} /><meta property="og:description" content={desc.slice(0, 200)} /><meta property="og:type" content="article" /><meta property="og:url" content={url} />
        <meta name="twitter:card" content="summary" /><meta name="twitter:title" content={paper.title} /><meta name="twitter:description" content={desc.slice(0, 200)} />
        <script type="application/ld+json">{JSON.stringify(ld)}</script>
      </Helmet>
      <main className="mx-auto max-w-3xl px-5 pb-28 pt-8 sm:px-6 sm:pt-12">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link to="/dental" className="hover:text-foreground">Dental</Link><ChevronRight className="h-3 w-3" />
          <Link to={`/dental/category/${catSlug}`} className="hover:text-foreground">{paper.category || "Past papers"}</Link><ChevronRight className="h-3 w-3" />
          <Link to={`/dental/units/${paper.unitSlug}`} className="truncate text-foreground hover:underline">{paper.unitTitle}</Link>
        </nav>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-primary">{paper.university} · {paper.department || paper.school}</p>
        <h1 className="mt-1 font-serif text-3xl font-bold leading-tight sm:text-4xl">{paper.unitTitle}</h1>
        <p className="mt-1 text-lg font-semibold text-muted-foreground">{paper.sitting || "Exam"}{when ? ` · ${when}` : ""}</p>
        {(paper.programmes?.length ? paper.programmes : [paper.programme]).filter(Boolean).length > 0 && <p className="mt-2 text-[15px] text-muted-foreground">{(paper.programmes?.length ? paper.programmes : [paper.programme]).join(" · ")}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-border py-4 text-sm sm:grid-cols-4">
          {[["Unit code", paper.unitCode], ["Sitting", paper.sitting], ["Time", paper.duration], ["Questions", `${q}${marks ? ` · ${marks} marks` : ""}`]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>)}
        </dl>
        {paper.instructions && <p className="mt-5 text-[14px] font-semibold uppercase leading-snug text-muted-foreground">Instructions: {paper.instructions}</p>}
        {seo?.topics?.length ? <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm"><span className="font-bold text-muted-foreground">Topics:</span>{seo.topics.map((t) => <span key={t} className="font-semibold text-primary">{t}</span>)}</p> : null}
        {!paper.complete && <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">{paper.note || "Part of this paper was not readable in the scan, so some questions may be missing."}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="inline-flex overflow-hidden rounded-full border border-border" role="tablist" aria-label="How to study">
            {[["Read with answers", false], ["Test myself", true]].map(([label, v]) => <button key={String(label)} type="button" role="tab" aria-selected={test === v} onClick={() => setTest(v as boolean)} className={`px-4 py-1.5 font-bold ${test === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
          </div>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{ready} of {units.length} answers ready</span>
          {test && rated.length > 0 && <span className="text-muted-foreground">Self-check: {rated.filter((r) => r === "got").length} got it · {rated.filter((r) => r === "missed").length} missed</span>}
        </div>
        {nav.length > 3 && <p className="mt-4 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Jump to a question"><span className="mr-1 font-bold text-muted-foreground">Jump to</span>{nav.map((it, i) => <a key={i} href={`#q${it.n}`} className="rounded-full bg-muted px-2.5 py-0.5 font-bold text-muted-foreground hover:text-foreground">{it.n}</a>)}</p>}

        <ul className="mt-2">{items.map((it, i) => it.t === "h" ? <h2 key={i} className="mt-10 border-b border-border pb-1 text-[13px] font-bold uppercase tracking-[0.12em] text-primary">{it.text}{it.marks ? ` · ${it.marks} marks` : ""}</h2> : it.t === "p" ? <p key={i} className="mt-3 text-[15px] italic text-muted-foreground">{it.text}</p> : QuestionRow(it, i))}</ul>
        {ready < units.length && <p className="mt-10 text-sm text-muted-foreground">The remaining answers are being written and will appear here as they are ready.</p>}

        <section className="mt-12 border-t border-border pt-6">
          <h2 className="font-serif text-xl font-bold">More {paper.unitTitle}</h2>
          <Link to={`/dental/units/${paper.unitSlug}`} className="mt-1 inline-block font-bold text-primary hover:underline">Questions that keep coming back in this unit →</Link>
          {related.length > 0 && <ul className="mt-3 divide-y divide-border border-y border-border">{related.map((p) => <li key={p.slug}><Link to={paperPath(p.slug)} className="flex items-center justify-between gap-3 py-3 text-[15px] font-semibold hover:text-primary"><span>{p.sitting || "Exam"} · {p.date}</span><span className="text-xs font-normal text-muted-foreground">{p.questions} questions</span></Link></li>)}</ul>}
        </section>
        <p className="mt-8"><Link to="/dental/papers" className="font-bold text-primary hover:underline">← All dental past papers</Link></p>
      </main>

      <button type="button" onClick={() => setView(true)} aria-label="See this paper as it was printed" className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-2xl bg-primary px-2.5 py-3 text-primary-foreground shadow-lg">
        <Menu className="h-5 w-5" /><span className="text-[10px] font-bold uppercase tracking-wider [writing-mode:vertical-rl]">Paper view</span>
      </button>
      <Sheet open={view} onOpenChange={setView}>
        <SheetContent side="bottom" className="flex h-[94dvh] flex-col gap-0 rounded-t-3xl bg-neutral-200 p-0 dark:bg-neutral-800">
          <SheetTitle className="sr-only">{paper.title} as printed</SheetTitle>
          <SheetDescription className="sr-only">The paper laid out the way it was printed: letterhead, details, instructions and questions, page by page.</SheetDescription>
          <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-5 pr-14"><FileText className="h-4 w-4 text-primary" /><p className="truncate text-sm font-bold">{paper.unitTitle} · as printed</p></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-10 sm:px-6"><PaperSheet paper={paper} /></div>
        </SheetContent>
      </Sheet>
    </>
  );
}
