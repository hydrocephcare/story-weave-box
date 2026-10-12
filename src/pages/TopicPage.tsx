import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { BookOpen, Check, ChevronRight, FileQuestion, Image as ImageIcon, Layers, Pill, Search, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DOMAIN_STYLE, imageCaption, loadTopic, resolveTopicSlug, topicPath, type Topic, type TopicQuestion } from "@/lib/topics";
import { cn } from "@/lib/utils";

const SITE = "https://www.ompathstudy.com";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "notes", label: "Notes" },
  { id: "images", label: "Images" },
  { id: "practice", label: "Practice" },
  { id: "related", label: "Related" },
] as const;

function Mcq({ q, n }: { q: TopicQuestion; n: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const done = pick !== null;
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Question {n}</p>
      <h3 className="mt-1 text-base font-semibold leading-snug text-foreground">{q.q}</h3>
      <ul className="mt-3 grid gap-2">
        {q.o.map((o, i) => {
          const right = i === q.a;
          const chosen = pick === i;
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

function Reveal({ q, m, k, u, s }: { q: string; m: string; k: number | null; u: string; s: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Written question{k ? ` · ${k} marks` : ""}</p>
      <h3 className="mt-1 text-base font-semibold leading-snug">{q}</h3>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
        {open ? "Hide model answer" : "Show model answer"}
      </button>
      {open && <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm leading-relaxed"><p className="whitespace-pre-line">{m}{m.length >= 699 ? "…" : ""}</p><Link to={u} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Full answer: {s} <ChevronRight className="h-3 w-3" /></Link></div>}
    </article>
  );
}

/** /topic/<slug>: everything the site has on one subject, on one page. */
export default function TopicPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [topic, setTopic] = useState<Topic | null | undefined>(undefined);
  const [zoom, setZoom] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let on = true;
    setTopic(undefined); setShowAll(false);
    void (async () => {
      const t = await loadTopic(slug);
      if (!on) return;
      if (t) { setTopic(t); return; }
      const target = await resolveTopicSlug(slug);
      if (!on) return;
      if (target && target !== slug) navigate(topicPath(target), { replace: true });
      else setTopic(null);
    })();
    return () => { on = false; };
  }, [slug, navigate]);

  const jsonLd = useMemo(() => {
    if (!topic) return null;
    const url = `${SITE}${topicPath(topic.s)}`;
    const faq = topic.qs.filter((q) => q.e).slice(0, 5).map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: `${q.o[q.a]}. ${q.e}` } }));
    return [
      { "@context": "https://schema.org", "@type": "WebPage", name: `${topic.n}: notes, images and practice questions`, url, about: { "@type": "MedicalEntity", name: topic.n }, isPartOf: { "@type": "WebSite", name: "Ompath Study", url: SITE }, audience: { "@type": "Audience", audienceType: "Medical students" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE }, { "@type": "ListItem", position: 2, name: "Topics", item: `${SITE}/topics` }, { "@type": "ListItem", position: 3, name: topic.n, item: url }] },
      ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq }] : []),
    ];
  }, [topic]);

  if (topic === undefined) return <main className="mx-auto max-w-4xl px-5 py-16"><div className="h-8 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-muted" /><div className="mt-8 h-40 animate-pulse rounded-2xl bg-muted" /></main>;

  if (topic === null) return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <Helmet><title>Topic not found | Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
      <h1 className="font-serif text-2xl font-bold">We have no page for “{decodeURIComponent(slug).replace(/-/g, " ")}” yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">Try the search, or browse every topic.</p>
      <div className="mt-5 flex justify-center gap-2"><Link to={`/search?q=${encodeURIComponent(slug.replace(/-/g, " "))}`} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Search the site</Link><Link to="/topics" className="rounded-lg border border-border px-4 py-2 text-sm font-bold">All topics</Link></div>
    </main>
  );

  const style = DOMAIN_STYLE[topic.c] ?? DOMAIN_STYLE.Medicine;
  const firstNote = topic.src[0];
  const title = `${topic.n}: notes, images and practice questions | Ompath Study`;
  const desc = (topic.ai?.overview || topic.lead?.t || `Everything on ${topic.n} from Ompath Study: notes, images, practice questions and related topics.`).slice(0, 155);
  const images = topic.imgs;
  const facts = topic.snip.filter((s) => s.t !== topic.lead?.t).slice(0, showAll ? 8 : 4);
  const stats = [
    { n: topic.src.length + topic.sets.length, l: "notes & papers", icon: BookOpen },
    { n: topic.qs.length + topic.es.length, l: "practice questions", icon: FileQuestion },
    { n: topic.imgs.length, l: "images", icon: ImageIcon },
  ].filter((s) => s.n > 0);

  return (
    <main className="pb-16">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <link rel="canonical" href={`${SITE}${topicPath(topic.s)}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        {topic.imgs[0] && <meta property="og:image" content={topic.imgs[0].u} />}
        {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
      </Helmet>

      <section className={cn("relative overflow-hidden bg-gradient-to-br text-white", style.hue)}>
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-black/15 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-5 pb-8 pt-8 sm:pb-12 sm:pt-12">
          <nav aria-label="Breadcrumb" className="text-xs font-semibold text-white/80"><Link to="/topics" className="hover:underline">Topics</Link> › <span>{style.label}</span></nav>
          <h1 className="mt-3 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">{topic.n}</h1>
          {topic.a.length > 0 && <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/85">Also written as {topic.a.map((a) => <span key={a} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{a}</span>)}</p>}
          {topic.lead && <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/95 sm:text-lg">{topic.lead.t}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {firstNote && <Link to={firstNote.u} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow hover:bg-white/90"><BookOpen className="h-4 w-4" /> Read the full note</Link>}
            {topic.qs.length > 0 && <a href="#practice" className="inline-flex items-center gap-1.5 rounded-xl bg-black/25 px-4 py-2.5 text-sm font-bold text-white hover:bg-black/35"><FileQuestion className="h-4 w-4" /> Test yourself</a>}
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
            {stats.map(({ n, l, icon: Icon }) => <li key={l} className="flex items-center gap-1.5"><Icon className="h-4 w-4" /> <strong className="text-white">{n}</strong> {l}</li>)}
          </ul>
        </div>
      </section>

      <div className="sticky top-14 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-3 py-2 text-sm font-bold" role="navigation" aria-label="On this page">
          {TABS.filter((t) => t.id === "overview" || (t.id === "notes" && topic.src.length + topic.sets.length) || (t.id === "images" && images.length) || (t.id === "practice" && topic.qs.length + topic.es.length) || (t.id === "related" && topic.rel.length)).map((t) => (
            <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full px-3.5 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{t.label}</a>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-12 px-5 pt-8">
        <section id="overview" className="scroll-mt-16 space-y-4">
          {topic.ai && (
            <article className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary"><Sparkles className="h-3.5 w-3.5" /> Overview</p>
              <p className="mt-2 text-[15px] leading-relaxed">{topic.ai.overview}</p>
              {topic.ai.key && topic.ai.key.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{topic.ai.key.map((k) => <li key={k}>{k}</li>)}</ul>}
              {topic.ai.pearls && topic.ai.pearls.length > 0 && <div className="mt-3 rounded-xl bg-background/70 p-3 text-sm"><p className="font-bold">Clinical pearls</p><ul className="mt-1 list-disc space-y-1 pl-5">{topic.ai.pearls.map((k) => <li key={k}>{k}</li>)}</ul></div>}
              {topic.ai.traps && topic.ai.traps.length > 0 && <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm"><p className="font-bold">Common exam traps</p><ul className="mt-1 list-disc space-y-1 pl-5">{topic.ai.traps.map((k) => <li key={k}>{k}</li>)}</ul></div>}
              <p className="mt-3 text-[11px] text-muted-foreground">{topic.ai.reviewed ? "Reviewed by the Ompath Study team." : "Written by AI from this site's notes and not yet reviewed by a doctor. Check it against your textbook."}</p>
            </article>
          )}
          {topic.rx && (
            <article className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"><Pill className="h-3.5 w-3.5" /> Treatment at a glance</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{topic.rx.first.map((f) => <li key={f}>{f}</li>)}</ul>
              <Link to="/pharmacology?tab=conditions" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Open the pharmacology guide <ChevronRight className="h-3 w-3" /></Link>
            </article>
          )}
          {topic.sec && topic.sec.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-xl font-bold">From the notes</h2>
              {topic.sec.map((x) => (
                <article key={x.u} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <h3 className="font-serif text-lg font-bold leading-snug">{x.h}</h3>
                  <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed">{x.b.map((l, i) => <li key={i} className={i === 0 ? "" : "flex gap-2"}>{i > 0 && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}<span>{l}</span></li>)}</ul>
                  <Link to={x.u} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Read this in {x.s} <ChevronRight className="h-3 w-3" /></Link>
                </article>
              ))}
            </div>
          )}
          {facts.length > 0 && (
            <div>
              <h2 className="font-serif text-xl font-bold">What our notes say</h2>
              <ul className="mt-3 space-y-3">
                {facts.map((f) => (
                  <li key={f.t} className="rounded-xl border border-border bg-card p-3.5 text-sm leading-relaxed">
                    <p>{f.t}</p>
                    <Link to={f.u} className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">{f.s} <ChevronRight className="h-3 w-3" /></Link>
                  </li>
                ))}
              </ul>
              {topic.snip.length > 5 && !showAll && <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm font-bold text-primary hover:underline">Show more</button>}
            </div>
          )}
          {!topic.ai && facts.length === 0 && !topic.lead && !(topic.sec && topic.sec.length) && <p className="text-sm text-muted-foreground">The notes below cover {topic.n}.</p>}
        </section>

        {(topic.src.length > 0 || topic.sets.length > 0) && (
          <section id="notes" className="scroll-mt-16">
            <h2 className="font-serif text-xl font-bold">Study material on {topic.n}</h2>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {topic.src.map((s) => (
                <li key={s.u}><Link to={s.u} className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition hover:border-primary/50 hover:shadow-sm">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><BookOpen className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-snug">{s.t}</span><span className="mt-0.5 block text-xs text-muted-foreground">{[s.y ? `Year ${s.y}` : "", s.n].filter(Boolean).join(" · ")}</span></span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link></li>
              ))}
              {topic.sets.map((s) => (
                <li key={s.u}><Link to={s.u} className="group flex h-full items-start gap-3 rounded-xl border border-dashed border-border bg-card/60 p-3.5 transition hover:border-primary/50">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><Layers className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-snug">{s.t}</span><span className="mt-0.5 block text-xs text-muted-foreground">{s.k === "mcq" ? "MCQ set" : "Essay questions"}{s.y ? ` · Year ${s.y}` : ""}</span></span>
                </Link></li>
              ))}
            </ul>
          </section>
        )}

        {images.length > 0 && (
          <section id="images" className="scroll-mt-16">
            <h2 className="font-serif text-xl font-bold">Images</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {images.map((im, i) => (
                <li key={im.u}><button type="button" onClick={() => setZoom(i)} className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left">
                  <img src={im.u} alt={imageCaption(im.a)} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                  <span className="block p-2 text-[11px] font-semibold leading-snug text-muted-foreground line-clamp-2">{imageCaption(im.a)}</span>
                </button></li>
              ))}
            </ul>
            <Dialog open={zoom !== null} onOpenChange={(o) => !o && setZoom(null)}>
              <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                <DialogTitle className="text-base">{zoom !== null ? imageCaption(images[zoom].a) : ""}</DialogTitle>
                <DialogDescription className="sr-only">Enlarged image</DialogDescription>
                {zoom !== null && <><img src={images[zoom].u} alt={imageCaption(images[zoom].a)} className="mx-auto max-h-[70dvh] w-auto rounded-lg" /><Link to={images[zoom].p} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Open in {images[zoom].s} <ChevronRight className="h-4 w-4" /></Link></>}
              </DialogContent>
            </Dialog>
          </section>
        )}

        {(topic.qs.length > 0 || topic.es.length > 0) && (
          <section id="practice" className="scroll-mt-16">
            <h2 className="font-serif text-xl font-bold">Test yourself on {topic.n}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Questions from past papers and MCQ sets on this site. Pick an answer to see why.</p>
            <div className="mt-4 space-y-4">
              {topic.qs.map((q, i) => <Mcq key={q.q} q={q} n={i + 1} />)}
              {topic.es.map((e) => <Reveal key={e.q} {...e} />)}
            </div>
          </section>
        )}

        {topic.rel.length > 0 && (
          <section id="related" className="scroll-mt-16">
            <h2 className="font-serif text-xl font-bold">Related topics</h2>
            <ul className="mt-3 flex flex-wrap gap-2">{topic.rel.map((r) => <li key={r.s}><Link to={topicPath(r.s)} className="inline-flex rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-semibold hover:border-primary/50 hover:text-primary">{r.n}</Link></li>)}</ul>
          </section>
        )}

        <footer className="rounded-2xl bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-1.5 font-bold text-foreground"><Search className="h-3.5 w-3.5" /> How this page is made</p>
          <p className="mt-1">It is put together automatically from {topic.docs} {topic.docs === 1 ? "page" : "pages"} on Ompath Study that mention {topic.n}, so it grows as the library grows. Found a mistake? <a className="font-bold text-primary hover:underline" href={`mailto:ompathstudy@gmail.com?subject=${encodeURIComponent(`Correction: ${topic.n}`)}`}>Tell us</a>. <Link to="/topics" className="font-bold text-primary hover:underline">Browse all topics</Link>.</p>
        </footer>
      </div>
    </main>
  );
}
