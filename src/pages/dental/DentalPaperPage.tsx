import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronRight, Eye, EyeOff, FileText, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import PaperSheet from "@/components/dental/PaperSheet";
import { loadAnswers, questionKey } from "@/lib/dentalAnswers";
import { loadPaper, questionCount, totalMarks, type DentalPaper, type PaperItem } from "@/lib/dentalPapers";

const SITE = "https://www.ompathstudy.com";

/** A model answer: lines starting with "- " become bullets, **bold** is kept. */
function Answer({ text }: { text: string }) {
  const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") ? <strong key={i}>{x.slice(2, -2)}</strong> : x));
  const bullet = /^\s*[-•*]\s+/;
  return (
    <div className="mt-3 space-y-1.5 border-l-2 border-emerald-500/60 pl-4 text-[15.5px] leading-relaxed">
      {text.split("\n").filter((l) => l.trim()).map((l, i) => (bullet.test(l) ? <p key={i} className="flex gap-2"><span className="text-primary">•</span><span>{bold(l.replace(bullet, ""))}</span></p> : <p key={i} className="font-semibold">{bold(l)}</p>))}
    </div>
  );
}

function Question({ it, answer, open, onToggle }: { it: PaperItem; answer?: string; open: boolean; onToggle: () => void }) {
  if (it.t === "h") return <h3 className="mt-8 border-b border-border pb-1 text-[13px] font-bold uppercase tracking-[0.12em] text-primary">{it.text}{it.marks ? ` · ${it.marks} marks` : ""}</h3>;
  if (it.t === "p") return <p className="mt-3 text-[15px] italic text-muted-foreground">{it.text}</p>;
  return (
    <li className="mt-5 list-none">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 text-[17px] leading-relaxed"><span className="mr-2 font-serif font-bold text-primary">{it.n ? `${it.n}.` : ""}</span>{it.text}</p>
        {!it.parts?.length && it.marks ? <span className="shrink-0 text-sm font-semibold text-muted-foreground">{it.marks} marks</span> : null}
      </div>
      {it.parts && it.parts.length > 0 && (
        <ol className="mt-2 space-y-2 border-l-2 border-primary/25 pl-4">
          {it.parts.map((p, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-[16px] leading-relaxed"><p className="min-w-0 flex-1"><span className="mr-1.5 font-semibold text-primary">{p.l ? `${p.l})` : "•"}</span>{p.text}</p>{p.marks ? <span className="shrink-0 text-sm font-semibold text-muted-foreground">{p.marks} marks</span> : null}</li>
          ))}
        </ol>
      )}
      {answer && <button type="button" onClick={onToggle} aria-expanded={open} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">{open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{open ? "Hide answer" : "Show answer"}</button>}
      {answer && open && <Answer text={answer} />}
    </li>
  );
}

/** One dental past paper: the questions as clean, readable text, and a button on the right edge that shows the paper laid out the way it was printed. */
export default function DentalPaperPage() {
  const { slug = "" } = useParams();
  const [paper, setPaper] = useState<DentalPaper | null | undefined>(undefined);
  const [view, setView] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Set<string>>(new Set());
  useEffect(() => { let on = true; setAnswers({}); setShown(new Set()); void loadAnswers(slug).then((a) => { if (on) setAnswers(a); }); return () => { on = false; }; }, [slug]);
  useEffect(() => { let on = true; setPaper(undefined); void loadPaper(slug).then((p) => { if (on) setPaper(p); }).catch(() => { if (on) setPaper(null); }); return () => { on = false; }; }, [slug]);

  if (paper === undefined) return <div className="mx-auto max-w-3xl px-5 py-16" aria-busy="true"><div className="h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}</div></div>;
  if (paper === null) return <div className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="font-serif text-3xl font-bold">Paper not found</h1><Link to="/dental/papers" className="mt-5 inline-block font-bold text-primary hover:underline">All dental past papers →</Link></div>;

  const q = questionCount(paper), marks = totalMarks(paper);
  const keys = paper.pages.flatMap((pg) => pg.items).filter((it) => it.t === "q").map(questionKey);
  const ready = keys.filter((k) => answers[k]).length;
  const heading = `${paper.unitTitle}${paper.sitting ? `: ${paper.sitting}` : ""}${paper.date ? `, ${paper.date}` : ""}`;
  const desc = `${paper.university} ${paper.department || paper.school} past paper: ${paper.unitTitle} (${paper.unitCode}), ${paper.sitting || "exam"}${paper.date ? `, ${paper.date}` : ""}. ${q} questions${marks ? `, ${marks} marks` : ""}, typed out to read and practise.`.replace(/\s+/g, " ");
  const url = `${SITE}/dental/papers/${paper.slug}`;
  const ld = { "@context": "https://schema.org", "@type": "LearningResource", name: paper.title, description: desc, educationalLevel: paper.programme, inLanguage: "en", learningResourceType: "Exam paper", publisher: { "@type": "Organization", name: "Ompath Study" }, url };

  return (
    <>
      <Helmet>
        <title>{`${paper.title} | Dental past paper | Ompath Study`}</title>
        <meta name="description" content={desc.slice(0, 300)} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={paper.title} /><meta property="og:description" content={desc.slice(0, 200)} /><meta property="og:type" content="article" /><meta property="og:url" content={url} />
        <script type="application/ld+json">{JSON.stringify(ld)}</script>
      </Helmet>
      <main className="mx-auto max-w-3xl px-5 pb-28 pt-8 sm:px-6 sm:pt-12">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link to="/dental" className="hover:text-foreground">Dental</Link><ChevronRight className="h-3 w-3" /><Link to="/dental/papers" className="hover:text-foreground">Past papers</Link><ChevronRight className="h-3 w-3" /><span className="truncate text-foreground">{paper.unitTitle}</span>
        </nav>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-primary">{paper.university} · {paper.department || paper.school}</p>
        <h1 className="mt-1 font-serif text-3xl font-bold leading-tight sm:text-4xl">{heading}</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">{paper.programme}</p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-border py-4 text-sm sm:grid-cols-4">
          {[["Unit code", paper.unitCode], ["Sitting", paper.sitting], ["Time", paper.duration], ["Questions", `${q}${marks ? ` · ${marks} marks` : ""}`]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>)}
        </dl>
        {paper.instructions && <p className="mt-5 rounded-lg bg-muted/50 px-4 py-3 text-[14px] font-semibold uppercase leading-snug">Instructions: {paper.instructions}</p>}
        {!paper.complete && <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">{paper.note || "Part of this paper was not readable in the scan, so some questions may be missing."}</p>}

        {ready > 0 && <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span className="font-semibold text-emerald-600 dark:text-emerald-400">{ready} of {q} answers ready</span><button type="button" onClick={() => setShown(shown.size >= ready ? new Set() : new Set(keys.filter((k) => answers[k])))} className="font-bold text-primary hover:underline">{shown.size >= ready ? "Hide all answers" : "Show all answers"}</button></div>}
        <ul className="mt-2">{paper.pages.flatMap((pg) => pg.items).map((it, i) => { const k = it.t === "q" ? questionKey(it) : ""; return <Question key={i} it={it} answer={k ? answers[k] : undefined} open={shown.has(k)} onToggle={() => setShown((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />; })}</ul>

        <section className="mt-12 border-t border-border pt-6">
          <h2 className="font-serif text-xl font-bold">Model answers</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">{ready >= q ? "Every question above has a model answer: tap Show answer under it." : ready > 0 ? "Model answers are being added in batches. The ones ready have a Show answer button under the question." : "Answers to this paper, written in marks-sized points, are on the way."}</p>
        </section>
        <p className="mt-10"><Link to="/dental/papers" className="font-bold text-primary hover:underline">← All dental past papers</Link></p>
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
