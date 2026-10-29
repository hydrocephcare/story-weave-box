import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, BookOpen, FileText, GraduationCap, Layers, ListChecks, Loader2, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath, buildEssayPath, buildFlashcardPath, buildMcqPath, getCategoryDisplayName, searchPublishedArticles } from "@/lib/store";
import { noteKind, rankResults, scoreResult, visibleToYear } from "@/lib/noteRank";
import { useMyYear } from "@/hooks/useMyYear";
import { ALL_CASES, useGeneratedCases } from "@/clinical";
import { matching } from "@/clinical/wardRound";
import { loadTopicIndex, topicPath, type TopicIndexItem } from "@/lib/topics";
import AiTopicOverview from "@/components/AiTopicOverview";
import { COURSE_OUTLINES as outlines } from "@/data/courseOutlines";

type PracticeRow = { id: string; title: string; slug?: string | null; category?: string | null };
type Outline = { id: string; sections: { id: string; title: string; items: { id: string; title: string; noteSlug?: string }[] }[] };
type Pack = { ranked: ReturnType<typeof rankResults<any>>; mcqs: PracticeRow[]; cards: PracticeRow[]; essays: PracticeRow[] };

const OUTLINE_FOR: [RegExp, string][] = [[/surgery/i, "surgery"], [/internal medicine/i, "internal-medicine"], [/obstetric|gynae/i, "obstetrics-gynaecology"], [/paediatric/i, "paediatrics"], [/psychiatr/i, "psychiatry"]];
const words = (q: string) => q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);

const PackCtx = createContext<{ done: number[]; toggle: (n: number) => void }>({ done: [], toggle: () => undefined });

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  const { done, toggle } = useContext(PackCtx);
  const isDone = done.includes(n);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span>
        <div className="min-w-0 flex-1"><h2 className="font-serif text-xl font-bold text-foreground">{title}</h2>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
        <button type="button" onClick={() => toggle(n)} aria-pressed={isDone} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${isDone ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}>{isDone ? "Done" : "Mark done"}</button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
const Row = ({ to, title, sub, icon: Icon = BookOpen }: { to: string; title: string; sub?: string; icon?: typeof BookOpen }) => (
  <li><Link to={to} className="group flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted/50"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-snug text-foreground group-hover:text-primary">{title}</span>{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span></Link></li>
);

/** /revision-pack?q=perioperative care&unit=Year 4: Surgery. Everything the site has on one topic, in the order to study it, with the next topics of the course outline. */
export default function TopicRevise() {
  const [sp] = useSearchParams();
  const q = (sp.get("q") || "").trim();
  const unitParam = sp.get("unit");
  const { year: myYear } = useMyYear();
  useGeneratedCases();
  const [pack, setPack] = useState<Pack | null>(null);
  const [topics, setTopics] = useState<TopicIndexItem[]>([]);
  const doneKey = `ompath_pack_done_${q.toLowerCase()}`;
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(doneKey) ?? "[]")); } catch { setDone([]); } }, [doneKey]);
  const toggle = (n: number) => setDone((d) => { const next = d.includes(n) ? d.filter((x) => x !== n) : [...d, n]; try { localStorage.setItem(doneKey, JSON.stringify(next)); } catch { /* storage blocked */ } return next; });

  useEffect(() => { void loadTopicIndex().then(setTopics).catch(() => undefined); }, []);

  useEffect(() => {
    if (q.length < 2) { setPack(null); return; }
    let on = true;
    setPack(null);
    void (async () => {
      const found = await searchPublishedArticles(q).catch(() => []);
      const ok = found.filter((a) => a.category !== "Stories" && visibleToYear(a.category, myYear));
      const ranked = rankResults(ok as any[], q, unitParam);
      // practice written from these very notes (linked by source) plus anything whose title or unit names the topic
      const noteIds = ranked.groups.filter((g) => g.key !== "other").flatMap((g) => g.items).slice(0, 15).map((a: any) => a.id);
      const safe = q.replace(/[,%()]/g, " ").slice(0, 60);
      const db = supabase as any;
      const base = (t: string, extra: string) => db.from(t).select(`id,title,slug,category${extra}`).eq("published", true).is("deleted_at", null);
      const safeRun = async (p: Promise<{ data: PracticeRow[] | null }>) => { try { return ((await p).data ?? []) as PracticeRow[]; } catch { return [] as PracticeRow[]; } };
      const [m1, m2, f1, f2, e1, e2] = await Promise.all([
        safeRun(base("mcq_sets", "").or(`title.ilike.%${safe}%,category.ilike.%${safe}%`).limit(40)),
        noteIds.length ? safeRun(base("mcq_sets", ",source_reference").in("source_reference", noteIds).limit(60)) : [],
        safeRun(base("flashcard_sets", "").or(`title.ilike.%${safe}%,category.ilike.%${safe}%`).limit(40)),
        noteIds.length ? safeRun(base("flashcard_sets", ",source_reference").in("source_reference", noteIds).limit(60)) : [],
        safeRun(base("essays", "").or(`title.ilike.%${safe}%,category.ilike.%${safe}%`).limit(40)),
        noteIds.length ? safeRun(base("essays", ",article_id").in("article_id", noteIds).limit(60)) : [],
      ]);
      const tidy = (a: PracticeRow[], b: PracticeRow[]): PracticeRow[] => {
        const seen = new Set<string>();
        return [...b, ...a].filter((r) => visibleToYear(r.category, myYear) && !seen.has(r.id) && seen.add(r.id))
          .sort((x, y) => Number(y.category === ranked.primary) - Number(x.category === ranked.primary) || scoreResult(y as any, q) - scoreResult(x as any, q));
      };
      if (on) setPack({ ranked, mcqs: tidy(m1, m2), cards: tidy(f1, f2), essays: tidy(e1, e2) });
    })();
    return () => { on = false; };
  }, [q, unitParam, myYear]);

  const outline = useMemo<Outline | null>(() => {
    const unit = pack?.ranked.primary || unitParam;
    const id = OUTLINE_FOR.find(([re]) => re.test(unit || ""))?.[1];
    return ((outlines as unknown as Outline[]).find((o) => o.id === id) ?? null);
  }, [pack, unitParam]);

  const cases = useMemo(() => (myYear !== null && myYear < 4 ? [] : matching(ALL_CASES, "all", q).slice(0, 6)), [q, myYear, pack]); // eslint-disable-line react-hooks/exhaustive-deps
  const overview = useMemo(() => { const ws = words(q); return topics.filter((t) => ws.length && ws.every((w) => `${t.n} ${(t.a ?? []).join(" ")}`.toLowerCase().includes(w))).sort((a, b) => Number(b.ai) - Number(a.ai) || a.n.length - b.n.length).slice(0, 3); }, [topics, q]);
  // searching a whole section of the outline ("surgical oncology") lists its topics, each opening its own pack
  const section = useMemo(() => {
    const n = (v: string) => v.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
    const nq = n(q);
    return nq.length > 3 ? (outline?.sections ?? []).find((s) => n(s.title) === nq || n(s.title).includes(nq) || nq.includes(n(s.title.split("·").pop() || ""))) ?? null : null;
  }, [outline, q]);
  const outlineHits = useMemo(() => { const ws = words(q); return new Set((outline?.sections ?? []).flatMap((s) => s.items).filter((i) => ws.some((w) => i.title.toLowerCase().includes(w))).map((i) => i.id)); }, [outline, q]);

  if (q.length < 2) return <main className="mx-auto max-w-2xl px-5 py-16 text-center"><h1 className="font-serif text-3xl font-bold">Revise a topic</h1><p className="mt-2 text-sm text-muted-foreground">Search for a topic in the notes, then choose "Revise as a pack".</p><Link to="/blog" className="mt-5 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Search the notes</Link></main>;
  if (!pack) return <main className="mx-auto max-w-2xl px-5 py-16 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />Putting “{q}” together…</main>;

  const { ranked } = pack;
  const unitName = ranked.primary ? getCategoryDisplayName(ranked.primary) : "";
  const yearTag = ranked.primary?.match(/^Year\s*(\d)/i)?.[1];
  const count = (g: string) => ranked.groups.find((x) => x.key === g)?.items ?? [];
  const noteLinks = (items: any[]) => items.map((a) => <Row key={a.id} to={buildBlogPath(a)} title={a.title} sub={getCategoryDisplayName(a.category)} />);

  return (
    <PackCtx.Provider value={{ done, toggle }}>
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-5">
      <Helmet><title>{`Revise ${q}${unitName ? ` in ${unitName}` : ""} | Ompath Study`}</title><meta name="robots" content="noindex" /></Helmet>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Revision pack{unitName ? ` · ${unitName}${yearTag ? ` · Year ${yearTag}` : ""}` : ""}</p>
        <h1 className="mt-1 font-serif text-3xl font-bold capitalize leading-tight sm:text-4xl">{q}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{count("notes").length} notes · {count("slides").length} slides and PDFs · {pack.mcqs.length} MCQ sets · {pack.cards.length} flashcard decks · {pack.essays.length} short-answer sets{cases.length ? ` · ${cases.length} cases` : ""}. Study them in this order.</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={done.length} aria-label="Pack progress"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, done.length * 20)}%` }} /></div>
        <Link to={`/blog?q=${encodeURIComponent(q)}${ranked.primary ? `&unit=${encodeURIComponent(ranked.primary)}` : ""}`} className="mt-2 inline-block text-xs font-bold text-primary hover:underline">← Back to the search results</Link>
      </header>

      {section && section.title.length > 3 && (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Topics in {section.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{section.items.length} topics. Open one to get its own notes, questions and flashcards.</p>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {section.items.map((i, k) => (
              <li key={i.id}><Link to={i.noteSlug ? `/notes/${i.noteSlug}` : `/revision-pack?q=${encodeURIComponent(i.title)}&unit=${encodeURIComponent(ranked.primary || unitParam || "")}`} className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary/50"><span className="mt-0.5 text-xs font-bold text-primary">{k + 1}</span><span>{i.title}</span></Link></li>
            ))}
          </ol>
        </section>
      )}

      <Step n={1} title="Start with the overview" hint="Written by Ompath AI: a short, complete picture of the topic before the detail.">
        <AiTopicOverview topic={q} unit={unitName} noteTitles={count("notes").map((a: any) => a.title)} />
      </Step>

      <Step n={2} title="Read the notes" hint={ranked.primary ? `Notes in ${unitName} first, then lecturers' slides and PDFs.` : "Best matches first."}>
        <ul className="space-y-0.5">{noteLinks(count("notes"))}</ul>
        {count("slides").length > 0 && <><p className="mt-3 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lecture slides and PDFs</p><ul className="space-y-0.5">{noteLinks(count("slides"))}</ul></>}
        {count("notes").length + count("slides").length === 0 && <p className="px-2 text-sm text-muted-foreground">No notes in this unit mention this topic yet.</p>}
      </Step>

      <Step n={3} title="Test yourself" hint="Questions written from these notes, then the flashcards.">
        <ul className="space-y-0.5">
          {pack.mcqs.slice(0, 8).map((m) => <Row key={m.id} to={buildMcqPath(m as any)} title={m.title} sub="MCQs with explanations" icon={ListChecks} />)}
          {pack.essays.slice(0, 5).map((e) => <Row key={e.id} to={buildEssayPath(e as any)} title={e.title} sub="Short and long answer practice" icon={FileText} />)}
          {pack.cards.slice(0, 6).map((f) => <Row key={f.id} to={buildFlashcardPath(f as any)} title={f.title} sub="Flashcards" icon={GraduationCap} />)}
          {pack.mcqs.length + pack.essays.length + pack.cards.length === 0 && <li className="px-2 text-sm text-muted-foreground">Questions for this topic are written automatically as notes are published. Check again soon.</li>}
        </ul>
      </Step>

      {cases.length > 0 && (
        <Step n={4} title="Meet the patient" hint="Clinical cases on this topic, worked up like a ward round.">
          <ul className="space-y-0.5">{cases.map((c) => <Row key={c.id} to={`/clinical/case/${c.id}?mode=full`} title={c.title} sub={c.vignette.slice(0, 110) + "…"} icon={Stethoscope} />)}</ul>
        </Step>
      )}

      {outline && (
        <Step n={cases.length > 0 ? 5 : 4} title={`The ${unitName || "course"} outline`} hint="Move on to the next topic. Topics that match your search are marked.">
          <div className="space-y-4">
            {outline.sections.map((s) => (
              <div key={s.id}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{s.title}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.items.map((i) => <Link key={i.id} to={`/revision-pack?q=${encodeURIComponent(i.title)}&unit=${encodeURIComponent(ranked.primary || unitParam || "")}`} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${outlineHits.has(i.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>{i.title}</Link>)}
                </div>
              </div>
            ))}
          </div>
        </Step>
      )}

      {count("other").length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="font-serif text-xl font-bold text-foreground">Also on this topic, from other units{myYear ? ` (Year ${myYear} and below)` : ""}</h2>
          <p className="text-xs text-muted-foreground">Notes elsewhere on the site that cover the same words, for example the Year 3 pathology behind a Year 4 surgery topic.</p>
          <ul className="mt-2 space-y-0.5">{noteLinks(count("other").slice(0, 30))}</ul>
        </section>
      )}
      {count("papers").length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer list-none font-serif text-lg font-bold">Papers, CATs and question banks <ArrowRight className="ml-1 inline h-4 w-4 text-primary" aria-hidden /></summary>
          <ul className="mt-2 space-y-0.5">{noteLinks(count("papers").slice(0, 30))}</ul>
        </details>
      )}
    </main>
    </PackCtx.Provider>
  );
}
