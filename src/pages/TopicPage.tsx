import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, BookOpen, Check, ChevronDown, ChevronRight, FileQuestion, FlaskConical, HeartPulse, Image as ImageIcon, Info, Layers, Lightbulb, Loader2, Microscope, Pill, RefreshCw, Search, ShieldCheck, Sparkles, Stethoscope, Target, X, Activity, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DOMAIN_STYLE, imageCaption, rememberTopic, slugFromName, topicPath, useTopicPage, type TopicQuestion } from "@/lib/topics";
import { useWebMedia } from "@/lib/webMedia";
import { cn } from "@/lib/utils";

const SITE = "https://www.ompathstudy.com";

type Tone = "emerald" | "sky" | "violet" | "amber" | "rose" | "slate" | "teal";
const TONE: Record<Tone, { bar: string; icon: string }> = {
  emerald: { bar: "bg-emerald-500", icon: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  sky: { bar: "bg-sky-500", icon: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  violet: { bar: "bg-violet-500", icon: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  amber: { bar: "bg-amber-500", icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  rose: { bar: "bg-rose-500", icon: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  slate: { bar: "bg-slate-400", icon: "bg-slate-500/12 text-slate-600 dark:text-slate-300" },
  teal: { bar: "bg-teal-500", icon: "bg-teal-500/12 text-teal-600 dark:text-teal-400" },
};
const LOOK: [RegExp, LucideIcon, Tone][] = [
  [/manage|treat|therap/i, Pill, "emerald"],
  [/test|diagnos|investig|laborator/i, FlaskConical, "sky"],
  [/present|feature|symptom|sign|examination/i, Stethoscope, "violet"],
  [/cause|risk|aetiolog|etiolog|transmission|life cycle|organism/i, Microscope, "amber"],
  [/complic|outlook|prognos|what goes wrong/i, HeartPulse, "rose"],
  [/prevent|control|vaccin/i, ShieldCheck, "teal"],
  [/exam|pearl|mistake|trap/i, Lightbulb, "amber"],
  [/relevance|clinical|injur/i, Activity, "sky"],
];
const look = (h: string): { Icon: LucideIcon; tone: Tone } => { const m = LOOK.find(([re]) => re.test(h)); return m ? { Icon: m[1], tone: m[2] } : { Icon: BookOpen, tone: "slate" }; };
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function Block({ id, title, Icon, tone = "slate", children }: { id: string; title: string; Icon: LucideIcon; tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <section id={id} className="relative scroll-mt-32 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
      <h2 className="flex items-center gap-3 font-serif text-xl font-bold leading-tight sm:text-2xl">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.icon)}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
        {title}
      </h2>
      <div className="mt-3.5 space-y-3 text-[15.5px] leading-[1.7] text-foreground/90">{children}</div>
    </section>
  );
}

function Bullets({ items, tone = "slate" }: { items: string[]; tone?: Tone }) {
  return (
    <ul className="space-y-2">
      {items.map((b, i) => (
        <li key={i} className="flex gap-3"><span className={cn("mt-[0.55rem] h-2 w-2 shrink-0 rounded-full", TONE[tone].bar)} aria-hidden /><span className="min-w-0 flex-1">{b}</span></li>
      ))}
    </ul>
  );
}

function Mcq({ q, n }: { q: TopicQuestion; n: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const done = pick !== null;
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Question {n}</p>
      <h3 className="mt-1 text-[15px] font-semibold leading-snug text-foreground">{q.q}</h3>
      <ul className="mt-3 grid gap-2">
        {q.o.map((o, i) => {
          const right = i === q.a, chosen = pick === i;
          return (
            <li key={i}>
              <button type="button" disabled={done} onClick={() => setPick(i)} aria-pressed={chosen}
                className={cn("flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                  !done && "border-border hover:border-primary/50 hover:bg-primary/5",
                  done && right && "border-emerald-500/60 bg-emerald-500/10",
                  done && chosen && !right && "border-red-500/60 bg-red-500/10",
                  done && !chosen && !right && "border-border opacity-60")}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">{"ABCDE"[i]}</span>
                <span className="min-w-0 flex-1">{o}</span>
                {done && right && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct answer" />}
                {done && chosen && !right && <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Your answer" />}
              </button>
            </li>
          );
        })}
      </ul>
      {done && (
        <div className="mt-3 rounded-xl bg-muted/70 p-3 text-sm leading-relaxed" role="status">
          <p className="font-bold">{pick === q.a ? "Correct." : `Not quite. The answer is ${"ABCDE"[q.a]}.`}</p>
          {q.e && <p className="mt-1 text-muted-foreground">{q.e}</p>}
          <Link to={q.u} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">From: {q.s} <ChevronRight className="h-3 w-3" /></Link>
        </div>
      )}
    </article>
  );
}

function Written({ q, m, k, u, s }: { q: string; m: string; k: number | null; u: string; s: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Written question{k ? ` · ${k} marks` : ""}</p>
      <h3 className="mt-1 text-[15px] font-semibold leading-snug">{q}</h3>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">{open ? "Hide model answer" : "Show model answer"}</button>
      {open && <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm leading-relaxed"><p className="whitespace-pre-line">{m}{m.length >= 699 ? "…" : ""}</p><Link to={u} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Full answer: {s} <ChevronRight className="h-3 w-3" /></Link></div>}
    </article>
  );
}

function Disclaimer({ disease }: { disease: boolean }) {
  return (
    <aside className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-foreground/85" role="note">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <p><strong className="text-foreground">For learning, not medical advice.</strong> {disease ? "If you think you or someone you know may have this condition, please see a doctor or health worker. In an emergency, go to the nearest hospital." : "Always check against your lecturers' notes and your textbooks."}</p>
    </aside>
  );
}

const STEPS = ["Collecting what the library says", "Checking standard references", "Writing the page", "Publishing it for everyone"];
function Writing({ name }: { name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 6000); return () => clearInterval(t); }, []);
  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background p-5" role="status" aria-live="polite">
      <p className="flex items-center gap-2 font-serif text-lg font-bold"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /> Building the full page on {name}</p>
      <ol className="mt-3 space-y-1.5 text-sm">
        {STEPS.map((s, n) => <li key={s} className={cn("flex items-center gap-2", n > i && "opacity-40")}><span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold", n < i ? "bg-emerald-500 text-white" : n === i ? "bg-primary text-primary-foreground" : "bg-muted")}>{n < i ? "✓" : n + 1}</span>{s}</li>)}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">It usually takes under a minute. This page updates by itself, so you can keep reading.</p>
    </div>
  );
}

/** /topic/<slug>: the page about one subject. Everything the library has on it, plus a full AI-written write-up that is saved once for everyone. */
export default function TopicPage() {
  const { slug = "" } = useParams();
  const { topic, page, phase, fresh, redirectTo, retry, writing, name } = useTopicPage(slug);
  const [zoom, setZoom] = useState<number | null>(null);
  const [webZoom, setWebZoom] = useState<number | null>(null);
  useEffect(() => { if (topic || page) rememberTopic(slug, topic?.n ?? name); }, [slug, topic, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const media = useWebMedia(name, [...(topic?.a ?? []), ...(page?.aka ?? [])], phase !== "loading");
  const [showFresh, setShowFresh] = useState(false);
  useEffect(() => { if (!fresh) return; setShowFresh(true); const t = setTimeout(() => setShowFresh(false), 9000); return () => clearTimeout(t); }, [fresh]);

  const style = DOMAIN_STYLE[topic?.c ?? ""] ?? DOMAIN_STYLE.Medicine;
  const isDisease = ["Pathology", "Medicine", "Psychiatry", "Paediatrics", "Obstetrics & gynaecology", "Surgery", "Pharmacology"].includes(topic?.c ?? "") || page?.kind === "disease";

  const summary = useMemo(() => {
    if (page?.summary) return page.summary;
    const own = topic?.sec?.[0]?.b?.[0];
    if (own && own.length >= 60) return own;
    // a clean definition beats a line lifted from an exam question, so the web summary comes before the site's own snippet
    return media?.extract || topic?.lead?.t || "";
  }, [page, topic, media]);

  const related = useMemo(() => {
    const seen = new Set<string>(); const out: { s: string; n: string }[] = [];
    for (const r of [...(topic?.rel ?? []), ...(page?.related ?? []).map((n) => ({ s: slugFromName(n), n }))]) { if (r.s && r.s !== slug && !seen.has(r.s)) { seen.add(r.s); out.push(r); } }
    return out.slice(0, 14);
  }, [topic, page, slug]);

  const jsonLd = useMemo(() => {
    if (!topic && !page) return null;
    const url = `${SITE}${topicPath(slug)}`;
    const faq = [...(page?.faq ?? []).map((f) => ({ q: f.q, a: f.a })), ...(topic?.qs ?? []).filter((q) => q.e).slice(0, 3).map((q) => ({ q: q.q, a: `${q.o[q.a]}. ${q.e}` }))].slice(0, 6);
    return [
      { "@context": "https://schema.org", "@type": "MedicalWebPage", name: `${name}: notes, images and practice questions`, url, about: { "@type": "MedicalEntity", name }, description: summary || undefined, isPartOf: { "@type": "WebSite", name: "Ompath Study", url: SITE }, audience: { "@type": "Audience", audienceType: "Medical students" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE }, { "@type": "ListItem", position: 2, name: "Topics", item: `${SITE}/topics` }, { "@type": "ListItem", position: 3, name, item: url }] },
      ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    ];
  }, [topic, page, slug, name, summary]);

  if (redirectTo) return <Navigate to={topicPath(redirectTo)} replace />;

  if (phase === "loading") return <main className="mx-auto max-w-4xl px-5 py-16"><div className="h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-muted" /><div className="mt-8 h-40 animate-pulse rounded-2xl bg-muted" /></main>;

  if (!topic && !page) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <Helmet><title>{name} | Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
        {phase === "writing" && <Writing name={name} />}
        {phase === "rejected" && <div className="text-center"><h1 className="font-serif text-2xl font-bold">“{name}” does not look like a medical topic</h1><p className="mt-2 text-sm text-muted-foreground">We only build pages for medicine, anatomy, physiology, pathology, microbiology and pharmacology.</p></div>}
        {(phase === "failed" || phase === "unavailable" || phase === "missing") && (
          <div className="text-center">
            <h1 className="font-serif text-2xl font-bold">We could not build the page on “{name}” just now</h1>
            <p className="mt-2 text-sm text-muted-foreground">{phase === "unavailable" ? "Page writing is not switched on yet." : "This is usually temporary."} You can try again, or search the notes.</p>
            <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        )}
        <p className="mt-6 flex justify-center gap-2"><Link to={`/search?q=${encodeURIComponent(name)}`} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">Search for “{name}”</Link><Link to="/topics" className="rounded-lg border border-border px-4 py-2 text-sm font-bold">All topics</Link></p>
      </main>
    );
  }

  const aiSections = page?.sections ?? [];
  const manage = aiSections.find((s) => /manage|treat/i.test(s.h));
  const seekAfter = aiSections.length ? Math.max(0, manage ? aiSections.indexOf(manage) : aiSections.length - 1) : -1;
  const toc = [
    ...aiSections.map((s) => ({ id: anchor(s.h), t: s.h })),
    ...(page?.whenToSeekHelp?.length ? [{ id: "seek-help", t: "When to seek help" }] : []),
    ...(topic?.sec?.length ? [{ id: "notes-say", t: "In our notes" }] : []),
    ...(media?.more.length ? [{ id: "web-images", t: "Pictures" }] : []),
    ...(topic?.imgs.length ? [{ id: "images", t: "From past papers" }] : []),
    ...(topic && (topic.qs.length || topic.es.length) ? [{ id: "practice", t: "Test yourself" }] : []),
    ...(page?.faq?.length ? [{ id: "faq", t: "Questions" }] : []),
    ...(related.length ? [{ id: "related", t: "Related" }] : []),
  ];
  const title = `${name}: causes, features, management, images and practice questions | Ompath Study`;
  const desc = (summary || `Everything on ${name} from Ompath Study: notes, images, practice questions and related topics.`).slice(0, 155);
  const firstNote = topic?.src[0];
  const stats = [
    { n: (topic?.src.length ?? 0) + (topic?.sets.length ?? 0), l: "notes & papers", I: BookOpen },
    { n: (topic?.qs.length ?? 0) + (topic?.es.length ?? 0), l: "practice questions", I: FileQuestion },
    { n: topic?.imgs.length ?? 0, l: "images", I: ImageIcon },
  ].filter((x) => x.n > 0);
  const aka = [...new Set([...(topic?.a ?? []), ...(page?.aka ?? [])])].slice(0, 6);

  return (
    <main className="pb-24 lg:pb-20">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <link rel="canonical" href={`${SITE}${topicPath(slug)}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        {(topic?.imgs[0] || media?.hero) && <meta property="og:image" content={topic?.imgs[0]?.u ?? media?.hero?.u} />}
        {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
      </Helmet>

      <header className={cn("relative isolate overflow-hidden bg-gradient-to-br text-white", style.hue)}>
        <div className="absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:20px_20px]" aria-hidden />
        <div className="absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-white/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-10 -z-10 h-72 w-72 rounded-full bg-black/25 blur-3xl" aria-hidden />
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 pb-9 pt-7 sm:pb-14 sm:pt-10 md:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-semibold text-white/80"><Link to="/topics" className="hover:underline">Topics</Link><ChevronRight className="h-3 w-3" /><span>{style.label}</span></nav>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black/25 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">{style.label}</span>
            {topic && topic.y.length > 0 && <span className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold">Year {topic.y.join(", ")}</span>}
            {page && !page.reviewed && <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold"><Sparkles className="h-3 w-3" /> AI-assisted</span>}
          </div>
          <h1 className="mt-3 max-w-3xl font-serif text-[2.4rem] font-bold leading-[1.04] tracking-tight sm:text-6xl">{name}</h1>
          {aka.length > 0 && <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/90">Also called {aka.map((a) => <span key={a} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{a}</span>)}</p>}
          {summary && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-white/95 sm:text-xl sm:leading-relaxed">{summary}</p>}
            {summary && !page?.summary && media?.extract === summary && <p className="mt-1.5 text-[11px] text-white/75">Summary from <a className="underline" href={media.url} target="_blank" rel="noopener noreferrer">Wikipedia</a>.</p>}
          <div className="mt-6 flex flex-wrap gap-2.5">
            {manage && <a href={`#${anchor(manage.h)}`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-lg hover:bg-white/90"><Pill className="h-4 w-4" /> Jump to management</a>}
            {firstNote && <Link to={firstNote.u} className="inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-bold text-slate-900 shadow-lg hover:bg-white"><BookOpen className="h-4 w-4" /> Read the full note</Link>}
            {topic && topic.qs.length > 0 && <a href="#practice" className="inline-flex items-center gap-1.5 rounded-xl bg-black/30 px-4 py-2.5 text-sm font-bold text-white hover:bg-black/40"><Target className="h-4 w-4" /> Test yourself</a>}
          </div>
          {stats.length > 0 && <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">{stats.map(({ n, l, I }) => <li key={l} className="flex items-center gap-1.5"><I className="h-4 w-4" /> <strong className="text-white">{n}</strong> {l}</li>)}</ul>}
          </div>
          {media?.hero && (
            <figure className="md:justify-self-end">
              <a href={media.hero.page} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-3xl bg-white p-1.5 shadow-2xl ring-1 ring-white/40 md:rotate-1">
                <img src={media.hero.u} alt={`${name}: ${media.description || media.hero.title}`} loading="eager" decoding="async" className="aspect-[4/3] w-full rounded-[1.25rem] bg-white object-contain md:max-h-72" />
              </a>
              <figcaption className="mt-2 text-[11px] leading-snug text-white/80">{media.description ? <span className="font-semibold text-white">{media.description}. </span> : null}Image: Wikimedia Commons, {media.hero.licence}</figcaption>
            </figure>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-5 pt-7 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-5">
          <Disclaimer disease={isDisease} />

          {writing && <Writing name={name} />}
          {showFresh && <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300" role="status"><Sparkles className="h-4 w-4" /> The full write-up has just been added to this page.</div>}
          {!writing && !page && phase === "ready" && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/50 p-3.5 text-sm"><Info className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 text-muted-foreground">The full write-up is not available right now, so this page shows what the Ompath Study notes say about {name}.</span><button type="button" onClick={retry} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/50"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></div>}

          {aiSections.map((s, i) => {
            const { Icon, tone } = look(s.h);
            return (
              <div key={`${s.h}-${i}`} className="space-y-5">
                <Block id={anchor(s.h)} title={s.h} Icon={Icon} tone={tone}>
                  {s.p && <p>{s.p}</p>}
                  {s.b && s.b.length > 0 && <Bullets items={s.b} tone={tone} />}
                </Block>
                {/* the warning signs come right after the treatment, where a worried reader needs them */}
                {i === seekAfter && page?.whenToSeekHelp && page.whenToSeekHelp.length > 0 && (
                  <section id="seek-help" className="scroll-mt-32 rounded-2xl border border-rose-500/40 bg-rose-500/[0.07] p-5 sm:p-6">
                    <h2 className="flex items-center gap-3 font-serif text-xl font-bold text-rose-900 dark:text-rose-200 sm:text-2xl"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600"><AlertTriangle className="h-[18px] w-[18px]" aria-hidden /></span> When to seek help</h2>
                    <p className="mt-2 text-sm text-foreground/80">See a doctor or health worker, or go to the nearest hospital, if there is:</p>
                    <div className="mt-3 text-[15.5px]"><Bullets items={page.whenToSeekHelp} tone="rose" /></div>
                  </section>
                )}
              </div>
            );
          })}

          {topic?.sec && topic.sec.length > 0 && (
            <Block id="notes-say" title="In the Ompath Study notes" Icon={BookOpen} tone="teal">
              {topic.sec.map((x) => (
                <div key={x.u} className="rounded-xl bg-muted/50 p-4">
                  <h3 className="font-serif text-lg font-bold">{x.h}</h3>
                  <div className="mt-2 text-[15px]"><Bullets items={x.b} tone="teal" /></div>
                  <Link to={x.u} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Read this in {x.s} <ChevronRight className="h-3 w-3" /></Link>
                </div>
              ))}
            </Block>
          )}

          {topic && !aiSections.length && !topic.sec?.length && topic.snip.length > 0 && (
            <Block id="notes-say" title="What our notes say" Icon={BookOpen} tone="teal">
              {topic.snip.slice(0, 5).map((f) => <div key={f.t} className="rounded-xl bg-muted/50 p-3.5 text-[15px]"><p>{f.t}</p><Link to={f.u} className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">{f.s} <ChevronRight className="h-3 w-3" /></Link></div>)}
            </Block>
          )}

          {topic?.rx && (
            <Block id="treatment" title="Treatment at a glance" Icon={Pill} tone="emerald">
              <Bullets items={topic.rx.first} tone="emerald" />
              <Link to="/pharmacology?tab=conditions" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Open the pharmacology guide <ChevronRight className="h-4 w-4" /></Link>
            </Block>
          )}

          {media && media.more.length > 0 && (
            <Block id="web-images" title={`Pictures of ${name}`} Icon={ImageIcon} tone="violet">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.more.map((im, i) => (
                  <li key={im.full}><button type="button" onClick={() => setWebZoom(i)} className="group block w-full overflow-hidden rounded-xl border border-border bg-white text-left">
                    <img src={im.u} alt={im.title} loading="lazy" decoding="async" className="aspect-square w-full object-contain transition duration-300 group-hover:scale-105" />
                    <span className="line-clamp-2 block bg-background p-2 text-[11px] font-semibold leading-snug text-muted-foreground">{im.title}</span>
                  </button></li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">Pictures from <a className="font-bold text-primary hover:underline" href={media.url} target="_blank" rel="noopener noreferrer">Wikipedia</a> and Wikimedia Commons. Tap one for its author and licence.</p>
              <Dialog open={webZoom !== null} onOpenChange={(o) => !o && setWebZoom(null)}>
                <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                  <DialogTitle className="text-base">{webZoom !== null ? media.more[webZoom].title : ""}</DialogTitle>
                  <DialogDescription className="sr-only">Enlarged picture with its author and licence</DialogDescription>
                  {webZoom !== null && <><img src={media.more[webZoom].full.includes("/thumb/") ? media.more[webZoom].full : media.more[webZoom].u} alt={media.more[webZoom].title} className="mx-auto max-h-[65dvh] w-auto rounded-lg bg-white" /><p className="text-xs text-muted-foreground">By {media.more[webZoom].credit}. Licence: {media.more[webZoom].licence}. <a className="font-bold text-primary hover:underline" href={media.more[webZoom].page} target="_blank" rel="noopener noreferrer">File page</a></p></>}
                </DialogContent>
              </Dialog>
            </Block>
          )}

          {topic && topic.imgs.length > 0 && (
            <Block id="images" title="From past papers" Icon={ImageIcon} tone="violet">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {topic.imgs.map((im, i) => (
                  <li key={im.u}><button type="button" onClick={() => setZoom(i)} className="group block w-full overflow-hidden rounded-xl border border-border bg-background text-left">
                    <img src={im.u} alt={imageCaption(im.a)} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105" />
                    <span className="line-clamp-2 block p-2 text-[11px] font-semibold leading-snug text-muted-foreground">{imageCaption(im.a)}</span>
                  </button></li>
                ))}
              </ul>
              <Dialog open={zoom !== null} onOpenChange={(o) => !o && setZoom(null)}>
                <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                  <DialogTitle className="text-base">{zoom !== null ? imageCaption(topic.imgs[zoom].a) : ""}</DialogTitle>
                  <DialogDescription className="sr-only">Enlarged image</DialogDescription>
                  {zoom !== null && <><img src={topic.imgs[zoom].u} alt={imageCaption(topic.imgs[zoom].a)} className="mx-auto max-h-[70dvh] w-auto rounded-lg" /><Link to={topic.imgs[zoom].p} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Open in {topic.imgs[zoom].s} <ChevronRight className="h-4 w-4" /></Link></>}
                </DialogContent>
              </Dialog>
            </Block>
          )}

          {topic && (topic.qs.length > 0 || topic.es.length > 0) && (
            <Block id="practice" title={`Test yourself on ${name}`} Icon={Target} tone="amber">
              <p className="text-sm text-muted-foreground">Questions from past papers and MCQ sets on this site. Pick an answer to see why.</p>
              <div className="space-y-3">{topic.qs.map((q, i) => <Mcq key={q.q} q={q} n={i + 1} />)}{topic.es.map((e) => <Written key={e.q} {...e} />)}</div>
            </Block>
          )}

          {page?.faq && page.faq.length > 0 && (
            <Block id="faq" title="Quick questions" Icon={Search} tone="sky">
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {page.faq.map((f) => (
                  <details key={f.q} className="group p-4"><summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-semibold"><span>{f.q}</span><ChevronDown className="mt-1 h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden /></summary><p className="mt-2 text-[15px] text-foreground/85">{f.a}</p></details>
                ))}
              </div>
            </Block>
          )}

          {topic && (topic.src.length > 0 || topic.sets.length > 0) && (
            <Block id="material" title={`Study material on ${name}`} Icon={Layers} tone="slate">
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {topic.src.map((s) => <li key={s.u}><Link to={s.u} className="group flex h-full items-start gap-3 rounded-xl border border-border bg-background p-3.5 transition hover:border-primary/50"><BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-snug">{s.t}</span><span className="mt-0.5 block text-xs text-muted-foreground">{[s.y ? `Year ${s.y}` : "", s.n].filter(Boolean).join(" · ")}</span></span><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" /></Link></li>)}
                {topic.sets.map((s) => <li key={s.u}><Link to={s.u} className="group flex h-full items-start gap-3 rounded-xl border border-dashed border-border bg-background p-3.5 transition hover:border-primary/50"><Layers className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-snug">{s.t}</span><span className="mt-0.5 block text-xs text-muted-foreground">{s.k === "mcq" ? "MCQ set" : "Essay questions"}{s.y ? ` · Year ${s.y}` : ""}</span></span></Link></li>)}
              </ul>
            </Block>
          )}

          {related.length > 0 && (
            <Block id="related" title="Related topics" Icon={Sparkles} tone="violet">
              <ul className="flex flex-wrap gap-2">{related.map((r) => <li key={r.s}><Link to={topicPath(r.s)} className="inline-flex rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-semibold hover:border-primary/50 hover:text-primary">{r.n}</Link></li>)}</ul>
            </Block>
          )}

          <footer className="rounded-2xl bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-bold text-foreground">How this page is made</p>
            <p className="mt-1">It combines what Ompath Study's own notes say{topic ? ` (${topic.docs} ${topic.docs === 1 ? "page" : "pages"} mention ${name})` : ""} with a write-up produced by AI from standard medical knowledge. {page && !page.reviewed ? "The AI part has not yet been reviewed by a doctor, so check it against your textbook." : page ? "A reviewer has checked the write-up." : ""} Found a mistake? <a className="font-bold text-primary hover:underline" href={`mailto:ompathstudy@gmail.com?subject=${encodeURIComponent(`Correction: ${name}`)}`}>Tell us</a>. <Link to="/topics" className="font-bold text-primary hover:underline">Browse all topics</Link>.</p>
          </footer>
        </div>

        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
            <ul className="mt-2 space-y-0.5">{toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="block rounded-lg px-2.5 py-1.5 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">{t.t}</a></li>)}</ul>
          </nav>
        </aside>
      </div>

      {toc.length > 1 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden print:hidden">
          <div className="flex gap-1 overflow-x-auto px-3 py-2 text-xs font-bold" role="navigation" aria-label="On this page">
            {toc.map((t) => <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-muted-foreground hover:text-foreground">{t.t}</a>)}
          </div>
        </div>
      )}
    </main>
  );
}
