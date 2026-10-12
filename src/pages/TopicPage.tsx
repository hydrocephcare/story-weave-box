import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, ChevronDown, ChevronRight, ExternalLink, Info, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DOMAIN_STYLE, imageCaption, rememberTopic, slugFromName, topicPath, useTopicPage, type TopicQuestion } from "@/lib/topics";
import { useWebMedia } from "@/lib/webMedia";
import { cn } from "@/lib/utils";

const SITE = "https://www.ompathstudy.com";
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** One section of the article: a big serif heading, a thin rule above it, and readable text. No boxes, no colours: the words are the design. */
function Section({ id, title, children, first }: { id: string; title: string; children: ReactNode; first?: boolean }) {
  return (
    <section id={id} className={cn("scroll-mt-28", first ? "pt-2" : "mt-14 border-t border-border pt-10")}>
      <h2 className="font-serif text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.15rem]">{title}</h2>
      <div className="mt-5 space-y-5 text-[18px] leading-[1.85] text-foreground/90 sm:text-[19px]">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((b, i) => (
        <li key={i} className="flex gap-3.5"><span className="mt-[0.8rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span className="min-w-0 flex-1">{b}</span></li>
      ))}
    </ul>
  );
}

function Mcq({ q, n }: { q: TopicQuestion; n: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const done = pick !== null;
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question {n}</p>
      <h3 className="mt-1.5 text-[17px] font-semibold leading-snug text-foreground">{q.q}</h3>
      <ul className="mt-4 grid gap-2">
        {q.o.map((o, i) => {
          const right = i === q.a, chosen = pick === i;
          return (
            <li key={i}>
              <button type="button" disabled={done} onClick={() => setPick(i)} aria-pressed={chosen}
                className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] leading-snug transition",
                  !done && "border-border hover:border-primary/60 hover:bg-primary/5",
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
        <div className="mt-4 rounded-xl bg-muted/70 p-4 text-[15px] leading-relaxed" role="status">
          <p className="font-bold">{pick === q.a ? "Correct." : `Not quite. The answer is ${"ABCDE"[q.a]}.`}</p>
          {q.e && <p className="mt-1 text-muted-foreground">{q.e}</p>}
          <Link to={q.u} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">From: {q.s} <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      )}
    </article>
  );
}

function Written({ q, m, k, u, s }: { q: string; m: string; k: number | null; u: string; s: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Written question{k ? ` · ${k} marks` : ""}</p>
      <h3 className="mt-1.5 text-[17px] font-semibold leading-snug">{q}</h3>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-bold hover:border-primary/60">{open ? "Hide model answer" : "Show model answer"}</button>
      {open && <div className="mt-3 rounded-xl bg-muted/70 p-4 text-[15px] leading-relaxed"><p className="whitespace-pre-line">{m}{m.length >= 699 ? "…" : ""}</p><Link to={u} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Full answer: {s} <ChevronRight className="h-3.5 w-3.5" /></Link></div>}
    </article>
  );
}

function Disclaimer({ disease }: { disease: boolean }) {
  return (
    <aside className="flex gap-3 border-l-4 border-primary/60 bg-muted/50 py-3 pl-4 pr-3 text-[15px] leading-relaxed text-foreground/85" role="note">
      <Info className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p><strong className="text-foreground">For learning, not medical advice.</strong> {disease ? "If you think you or someone you know may have this condition, please see a doctor or health worker. In an emergency, go to the nearest hospital." : "Always check against your lecturers' notes and your textbooks."}</p>
    </aside>
  );
}

const STEPS = ["Collecting what the library says", "Checking standard references", "Writing the page", "Publishing it for everyone"];
function Writing({ name }: { name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 6000); return () => clearInterval(t); }, []);
  return (
    <div className="rounded-2xl border border-border bg-card p-5" role="status" aria-live="polite">
      <p className="flex items-center gap-2 font-serif text-lg font-bold"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /> Writing the full page on {name}</p>
      <ol className="mt-3 space-y-1.5 text-sm">
        {STEPS.map((s, n) => <li key={s} className={cn("flex items-center gap-2", n > i && "opacity-40")}><span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold", n < i ? "bg-primary text-primary-foreground" : n === i ? "bg-primary/20 text-primary" : "bg-muted")}>{n < i ? "✓" : n + 1}</span>{s}</li>)}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">It usually takes under a minute. This page updates by itself, so you can keep reading.</p>
    </div>
  );
}

/** /topic/<slug>: a plain, readable article about one subject (definition first), with the library's notes and questions underneath. */
export default function TopicPage() {
  const { slug = "" } = useParams();
  const { topic, page, phase, fresh, redirectTo, retry, writing, name } = useTopicPage(slug);
  const [zoom, setZoom] = useState<number | null>(null);
  const [webZoom, setWebZoom] = useState<number | null>(null);
  const [showFresh, setShowFresh] = useState(false);
  useEffect(() => { if (!fresh) return; setShowFresh(true); const t = setTimeout(() => setShowFresh(false), 9000); return () => clearTimeout(t); }, [fresh]);
  useEffect(() => { if (topic || page) rememberTopic(slug, topic?.n ?? name); }, [slug, topic, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const media = useWebMedia(name, [...(topic?.a ?? []), ...(page?.aka ?? [])], phase !== "loading");

  const style = DOMAIN_STYLE[topic?.c ?? ""] ?? DOMAIN_STYLE.Medicine;
  const isDisease = ["Pathology", "Medicine", "Psychiatry", "Paediatrics", "Obstetrics & gynaecology", "Surgery", "Pharmacology"].includes(topic?.c ?? "") || page?.kind === "disease";

  const summary = useMemo(() => {
    if (page?.summary) return page.summary;
    // a clean definition beats a line lifted from an exam question, so the web summary comes before the site's own snippet
    return media?.extract || topic?.sec?.[0]?.b?.[0] || topic?.lead?.t || "";
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
      { "@context": "https://schema.org", "@type": "MedicalWebPage", name: `${name}: overview, causes, management and practice questions`, url, about: { "@type": "MedicalEntity", name }, description: summary || undefined, isPartOf: { "@type": "WebSite", name: "Ompath Study", url: SITE }, audience: { "@type": "Audience", audienceType: "Medical students" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE }, { "@type": "ListItem", position: 2, name: "Topics", item: `${SITE}/topics` }, { "@type": "ListItem", position: 3, name, item: url }] },
      ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    ];
  }, [topic, page, slug, name, summary]);

  if (redirectTo) return <Navigate to={topicPath(redirectTo)} replace />;

  if (phase === "loading") return <main className="mx-auto max-w-4xl px-5 py-16"><div className="h-10 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-4 h-5 w-1/2 animate-pulse rounded bg-muted" /><div className="mt-8 h-40 animate-pulse rounded-2xl bg-muted" /></main>;

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
  // with no written article yet, the web introduction is the overview
  const intro = (!aiSections.length && media?.intro ? media.intro.split(/\n+/).filter(Boolean) : []).map((p, i) => (i === 0 && summary && p.startsWith(summary) ? p.slice(summary.length).trim() : p)).filter(Boolean);
  const hasStudy = Boolean(topic && (topic.sec?.length || topic.src.length || topic.sets.length || topic.imgs.length || topic.qs.length || topic.es.length));
  const toc = [
    ...(intro.length ? [{ id: "overview", t: "Overview" }] : []),
    ...aiSections.map((s) => ({ id: anchor(s.h), t: s.h })),
    ...(page?.whenToSeekHelp?.length ? [{ id: "seek-help", t: "When to seek help" }] : []),
    ...(media?.more.length ? [{ id: "web-images", t: "Pictures" }] : []),
    ...(topic?.sec?.length ? [{ id: "notes-say", t: "In our notes" }] : []),
    ...(topic && (topic.qs.length || topic.es.length) ? [{ id: "practice", t: "Test yourself" }] : []),
    ...(page?.faq?.length ? [{ id: "faq", t: "Common questions" }] : []),
    ...(hasStudy ? [{ id: "material", t: "Study material" }] : []),
    ...(related.length ? [{ id: "related", t: "Related topics" }] : []),
  ];
  const title = `${name}: overview, causes, management and practice questions | Ompath Study`;
  const desc = (summary || `Everything on ${name} from Ompath Study: notes, images, practice questions and related topics.`).slice(0, 155);
  const aka = [...new Set([...(topic?.a ?? []), ...(page?.aka ?? [])])].slice(0, 6);
  const firstNote = topic?.src[0];

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

      <header className="border-b border-border bg-gradient-to-b from-muted/60 to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-8 sm:pb-16 sm:pt-12 md:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground"><Link to="/topics" className="hover:text-primary hover:underline">Topics</Link><ChevronRight className="h-3.5 w-3.5" /><span>{style.label}</span></nav>
            <h1 className="mt-5 font-serif text-5xl font-bold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl">{name}</h1>
            {aka.length > 0 && <p className="mt-3 text-lg text-muted-foreground">Also called {aka.join(", ")}</p>}
            {summary && <p className="mt-6 max-w-2xl text-xl leading-[1.65] text-foreground/85 sm:text-[1.4rem] sm:leading-[1.65]">{summary}</p>}
            {summary && !page?.summary && media?.extract === summary && <p className="mt-2 text-xs text-muted-foreground">Definition from <a className="underline" href={media.url} target="_blank" rel="noopener noreferrer">Wikipedia</a>.</p>}
            <div className="mt-7 flex flex-wrap gap-3">
              {topic && topic.qs.length > 0 && <a href="#practice" className="inline-flex items-center rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-90">Test yourself</a>}
              {firstNote && <Link to={firstNote.u} className="inline-flex items-center rounded-full border border-border bg-background px-6 py-3 text-base font-bold hover:border-primary/60">Read the full note</Link>}
              {manage && <a href={`#${anchor(manage.h)}`} className="inline-flex items-center rounded-full border border-border bg-background px-6 py-3 text-base font-bold hover:border-primary/60">Management</a>}
            </div>
            {page && !page.reviewed && <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Written with AI from standard references and not yet checked by a doctor.</p>}
          </div>
          {media?.hero && (
            <figure className="md:justify-self-end">
              <a href={media.hero.page} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-3xl border border-border bg-white p-3 shadow-sm">
                <img src={media.hero.u} alt={`${name}: ${media.description || media.hero.title}`} loading="eager" decoding="async" className="aspect-[4/3] w-full rounded-2xl bg-white object-contain" />
              </a>
              <figcaption className="mt-2 text-xs leading-snug text-muted-foreground">{media.description ? <span className="font-semibold text-foreground/80">{media.description}. </span> : null}Image: Wikimedia Commons, {media.hero.licence}</figcaption>
            </figure>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-5 pt-10 lg:grid-cols-[13.5rem_minmax(0,44rem)]">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-border text-[15px]">
            <p className="pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
            <ul className="mt-3 space-y-0.5">{toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 font-medium text-muted-foreground hover:border-primary hover:text-foreground">{t.t}</a></li>)}</ul>
          </nav>
        </aside>

        <div className="min-w-0">
          <Disclaimer disease={isDisease} />

          <div className="mt-8 space-y-4">
            {writing && <Writing name={name} />}
            {showFresh && <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-sm font-semibold" role="status"><Sparkles className="h-4 w-4 text-primary" /> The full write-up has just been added to this page.</div>}
            {!writing && !page && phase === "ready" && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/50 p-3.5 text-sm"><Info className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 text-muted-foreground">The full write-up is not available right now. This page shows an introduction and what the Ompath Study notes say about {name}.</span><button type="button" onClick={retry} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/60"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></div>}
          </div>

          <div className="mt-6">
            {intro.length > 0 && (
              <Section id="overview" title={`What is ${name}?`} first>
                {intro.map((p, i) => <p key={i}>{p}</p>)}
                {media && <p className="text-sm text-muted-foreground">Introduction from <a className="font-semibold text-primary hover:underline" href={media.url} target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA).</p>}
              </Section>
            )}

            {aiSections.map((s, i) => (
              <div key={`${s.h}-${i}`}>
                <Section id={anchor(s.h)} title={s.h} first={i === 0 && !intro.length}>
                  {s.p && <p>{s.p}</p>}
                  {s.b && s.b.length > 0 && <Bullets items={s.b} />}
                </Section>
                {/* the warning signs come right after the treatment, where a worried reader needs them */}
                {i === seekAfter && page?.whenToSeekHelp && page.whenToSeekHelp.length > 0 && (
                  <section id="seek-help" className="mt-14 scroll-mt-28 rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-6 sm:p-7">
                    <h2 className="font-serif text-2xl font-bold sm:text-[1.75rem]">When to seek help</h2>
                    <p className="mt-3 text-[17px] text-foreground/85">See a doctor or health worker, or go to the nearest hospital, if there is:</p>
                    <div className="mt-4 text-[17px] leading-relaxed"><Bullets items={page.whenToSeekHelp} /></div>
                  </section>
                )}
              </div>
            ))}

            {media && media.more.length > 0 && (
              <Section id="web-images" title={`Pictures of ${name}`}>
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {media.more.map((im, i) => (
                    <li key={im.full}><button type="button" onClick={() => setWebZoom(i)} className="group block w-full overflow-hidden rounded-2xl border border-border bg-white text-left">
                      <img src={im.u} alt={im.title} loading="lazy" decoding="async" className="aspect-square w-full object-contain p-1 transition duration-300 group-hover:scale-105" />
                      <span className="line-clamp-2 block border-t border-border bg-background p-2.5 text-xs font-medium leading-snug text-muted-foreground">{im.title}</span>
                    </button></li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Pictures from <a className="font-bold text-primary hover:underline" href={media.url} target="_blank" rel="noopener noreferrer">Wikipedia</a> and Wikimedia Commons. Tap one for its author and licence.</p>
                <Dialog open={webZoom !== null} onOpenChange={(o) => !o && setWebZoom(null)}>
                  <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogTitle className="text-base">{webZoom !== null ? media.more[webZoom].title : ""}</DialogTitle>
                    <DialogDescription className="sr-only">Enlarged picture with its author and licence</DialogDescription>
                    {webZoom !== null && <><img src={media.more[webZoom].u} alt={media.more[webZoom].title} className="mx-auto max-h-[65dvh] w-auto rounded-lg bg-white" /><p className="text-xs text-muted-foreground">By {media.more[webZoom].credit}. Licence: {media.more[webZoom].licence}. <a className="inline-flex items-center gap-1 font-bold text-primary hover:underline" href={media.more[webZoom].page} target="_blank" rel="noopener noreferrer">File page <ExternalLink className="h-3 w-3" /></a></p></>}
                  </DialogContent>
                </Dialog>
              </Section>
            )}

            {topic?.rx && !aiSections.length && (
              <Section id="treatment" title="Treatment at a glance">
                <Bullets items={topic.rx.first} />
                <Link to="/pharmacology?tab=conditions" className="inline-flex items-center gap-1 text-base font-bold text-primary hover:underline">Open the pharmacology guide <ChevronRight className="h-4 w-4" /></Link>
              </Section>
            )}

            {topic?.sec && topic.sec.length > 0 && (
              <Section id="notes-say" title="In the Ompath Study notes">
                {topic.sec.map((x) => (
                  <div key={x.u} className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-serif text-xl font-bold">{x.h}</h3>
                    <div className="mt-3 text-[16px] leading-relaxed"><Bullets items={x.b} /></div>
                    <Link to={x.u} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Read this in {x.s} <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                ))}
              </Section>
            )}

            {topic && (topic.qs.length > 0 || topic.es.length > 0) && (
              <Section id="practice" title={`Test yourself on ${name}`}>
                <p className="text-base text-muted-foreground">Questions from past papers and MCQ sets on this site. Pick an answer to see why.</p>
                <div className="space-y-4">{topic.qs.map((q, i) => <Mcq key={q.q} q={q} n={i + 1} />)}{topic.es.map((e) => <Written key={e.q} {...e} />)}</div>
              </Section>
            )}

            {topic && topic.imgs.length > 0 && (
              <Section id="exam-images" title="Images from past papers">
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {topic.imgs.map((im, i) => (
                    <li key={im.u}><button type="button" onClick={() => setZoom(i)} className="group block w-full overflow-hidden rounded-2xl border border-border bg-background text-left">
                      <img src={im.u} alt={imageCaption(im.a)} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105" />
                      <span className="line-clamp-2 block p-2.5 text-xs font-medium leading-snug text-muted-foreground">{imageCaption(im.a)}</span>
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
              </Section>
            )}

            {page?.faq && page.faq.length > 0 && (
              <Section id="faq" title="Common questions">
                <div className="divide-y divide-border rounded-2xl border border-border bg-card">
                  {page.faq.map((f) => (
                    <details key={f.q} className="group p-5"><summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-[18px] font-semibold"><span>{f.q}</span><ChevronDown className="mt-1.5 h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden /></summary><p className="mt-3 text-[17px] text-foreground/85">{f.a}</p></details>
                  ))}
                </div>
              </Section>
            )}

            {topic && (topic.src.length > 0 || topic.sets.length > 0) && (
              <Section id="material" title={`Study material on ${name}`}>
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                  {topic.src.map((s) => <li key={s.u}><Link to={s.u} className="group flex items-center gap-3 p-4 hover:bg-muted/50"><span className="min-w-0 flex-1"><span className="block text-base font-bold leading-snug group-hover:text-primary">{s.t}</span><span className="mt-0.5 block text-sm text-muted-foreground">{[s.y ? `Year ${s.y}` : "", s.n].filter(Boolean).join(" · ")}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" /></Link></li>)}
                  {topic.sets.map((s) => <li key={s.u}><Link to={s.u} className="group flex items-center gap-3 p-4 hover:bg-muted/50"><span className="min-w-0 flex-1"><span className="block text-base font-bold leading-snug group-hover:text-primary">{s.t}</span><span className="mt-0.5 block text-sm text-muted-foreground">{s.k === "mcq" ? "MCQ set" : "Essay questions"}{s.y ? ` · Year ${s.y}` : ""}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" /></Link></li>)}
                </ul>
              </Section>
            )}

            {related.length > 0 && (
              <Section id="related" title="Related topics">
                <ul className="flex flex-wrap gap-2.5">{related.map((r) => <li key={r.s}><Link to={topicPath(r.s)} className="inline-flex rounded-full border border-border bg-background px-4 py-2 text-base font-semibold hover:border-primary/60 hover:text-primary">{r.n}</Link></li>)}</ul>
              </Section>
            )}

            <footer className="mt-14 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
              <p className="font-bold text-foreground">How this page is made</p>
              <p className="mt-1.5">It combines an introduction and pictures from Wikipedia and Wikimedia Commons, what Ompath Study's own notes say{topic ? ` (${topic.docs} ${topic.docs === 1 ? "page" : "pages"} mention ${name})` : ""}, and a write-up produced by AI from standard medical knowledge. {page && !page.reviewed ? "The AI part has not yet been reviewed by a doctor, so check it against your textbook." : page ? "A reviewer has checked the write-up." : ""} Found a mistake? <a className="font-bold text-primary hover:underline" href={`mailto:ompathstudy@gmail.com?subject=${encodeURIComponent(`Correction: ${name}`)}`}>Tell us</a>. <Link to="/topics" className="font-bold text-primary hover:underline">Browse all topics</Link>.</p>
            </footer>
          </div>
        </div>
      </div>

      {toc.length > 1 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden print:hidden">
          <div className="flex gap-1 overflow-x-auto px-3 py-2 text-sm font-semibold" role="navigation" aria-label="On this page">
            {toc.map((t) => <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full bg-muted px-3.5 py-1.5 text-muted-foreground hover:text-foreground">{t.t}</a>)}
          </div>
        </div>
      )}
    </main>
  );
}
