import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, ChevronRight, FileText } from "lucide-react";
import { CATEGORY_LIST, PAPER_INDEX, categoryBlurb, paperPath } from "@/lib/dentalPapers";
import { repeatedQuestions, type Repeat } from "@/lib/dentalRepeats";
import { bridgeFor } from "@/lib/dentalBridge";
import DentalMock from "@/components/dental/DentalMock";

const SITE = "https://www.ompathstudy.com";

function PaperRows({ rows }: { rows: typeof PAPER_INDEX }) {
  return (
    <ul className="mt-1 divide-y divide-border border-y border-border">
      {rows.map((p) => (
        <li key={p.slug}>
          <Link to={paperPath(p.slug)} className="group flex items-center gap-3 py-3.5">
            <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold group-hover:text-primary">{p.sitting || "Exam"} · {p.date}</span><span className="block truncate text-xs text-muted-foreground">{p.unitCode} · {p.programme} · {p.questions} questions</span></span>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary/50 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** /dental/category/:cat: a subject area with its units. */
export function DentalCategory() {
  const { cat = "" } = useParams();
  const c = CATEGORY_LIST.find((x) => x.slug === cat);
  if (!c) return <div className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="font-serif text-3xl font-bold">Category not found</h1><Link to="/dental" className="mt-5 inline-block font-bold text-primary hover:underline">Dental home →</Link></div>;
  const url = `${SITE}/dental/category/${c.slug}`;
  const desc = `${c.name}: ${c.papers} Mount Kenya University past papers across ${c.units.length} unit${c.units.length === 1 ? "" : "s"} (${c.units.map((u) => u.title).join(", ")}), with model answers. ${categoryBlurb[c.slug] ?? ""}`.trim();
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: `${c.name} past papers`, description: desc, url, isPartOf: { "@type": "WebSite", name: "Ompath Study", url: SITE } },
    { "@type": "BreadcrumbList", itemListElement: [["Dental", `${SITE}/dental`], [c.name, url]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) },
  ] };
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:px-6 sm:pt-12">
      <Helmet><title>{`${c.name} past papers with answers | Ompath Study`}</title><meta name="description" content={desc.slice(0, 300)} /><link rel="canonical" href={url} /><meta property="og:title" content={`${c.name} past papers`} /><meta property="og:description" content={desc.slice(0, 200)} /><meta property="og:url" content={url} /><script type="application/ld+json">{JSON.stringify(ld)}</script></Helmet>
      <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb"><Link to="/dental" className="hover:text-foreground">Dental</Link><ChevronRight className="h-3 w-3" /><span className="text-foreground">{c.name}</span></nav>
      <h1 className="mt-4 font-serif text-3xl font-bold sm:text-4xl">{c.name}</h1>
      <p className="mt-2 max-w-xl text-[16px] text-muted-foreground">{categoryBlurb[c.slug]}</p>
      <div className="mt-8 space-y-10">
        {c.units.map((u) => (
          <section key={u.slug}>
            <div className="flex items-baseline justify-between gap-3"><h2 className="font-serif text-xl font-bold"><Link to={`/dental/units/${u.slug}`} className="hover:text-primary">{u.title}</Link></h2><Link to={`/dental/units/${u.slug}`} className="shrink-0 text-sm font-bold text-primary hover:underline">Unit page →</Link></div>
            <PaperRows rows={PAPER_INDEX.filter((p) => p.unitSlug === u.slug)} />
          </section>
        ))}
      </div>
    </main>
  );
}

/** /dental/units/:unit: every paper of one unit by date, and the questions that keep coming back across them. */
export function DentalUnit() {
  const { unit = "" } = useParams();
  const rows = PAPER_INDEX.filter((p) => p.unitSlug === unit);
  const [repeats, setRepeats] = useState<Repeat[] | null>(null);
  const [mock, setMock] = useState(false);
  useEffect(() => { let on = true; setRepeats(null); if (rows.length > 1) void repeatedQuestions(unit).then((r) => { if (on) setRepeats(r); }); return () => { on = false; }; }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return <div className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="font-serif text-3xl font-bold">Unit not found</h1><Link to="/dental/papers" className="mt-5 inline-block font-bold text-primary hover:underline">All dental past papers →</Link></div>;
  const first = rows[0]; const cat = CATEGORY_LIST.find((c) => c.slug === first.categorySlug);
  const url = `${SITE}/dental/units/${unit}`;
  const years = [...new Set(rows.map((r) => r.year).filter(Boolean))].sort();
  const programmes = [...new Set(rows.flatMap((r) => r.programmes))];
  const desc = `${first.unitTitle} (${first.unitCode}) past papers from ${first.university}: ${rows.length} papers${years.length ? ` from ${years[0]} to ${years[years.length - 1]}` : ""} for ${programmes.slice(0, 3).join(", ")}, with model answers and the questions that keep coming back.`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: `${first.unitTitle} past papers`, description: desc, url, isPartOf: { "@type": "WebSite", name: "Ompath Study", url: SITE } },
    { "@type": "BreadcrumbList", itemListElement: [["Dental", `${SITE}/dental`], [first.group, `${SITE}/dental/category/${first.categorySlug}`], [first.unitTitle, url]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) },
  ] };
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:px-6 sm:pt-12">
      <Helmet><title>{`${first.unitTitle} past papers with answers | Ompath Study`}</title><meta name="description" content={desc.slice(0, 300)} /><link rel="canonical" href={url} /><meta property="og:title" content={`${first.unitTitle} past papers`} /><meta property="og:description" content={desc.slice(0, 200)} /><meta property="og:url" content={url} /><script type="application/ld+json">{JSON.stringify(ld)}</script></Helmet>
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb"><Link to="/dental" className="hover:text-foreground">Dental</Link><ChevronRight className="h-3 w-3" /><Link to={`/dental/category/${first.categorySlug}`} className="hover:text-foreground">{cat?.name ?? first.group}</Link><ChevronRight className="h-3 w-3" /><span className="text-foreground">{first.unitTitle}</span></nav>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-primary">{first.university} · {first.unitCode}</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">{first.unitTitle}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{rows.length} past paper{rows.length === 1 ? "" : "s"}{years.length ? ` · ${years[0]}${years.length > 1 ? ` to ${years[years.length - 1]}` : ""}` : ""} · {programmes.join(" · ")}</p>

      <p className="mt-5"><button type="button" onClick={() => setMock(true)} className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground">Build a mock exam from this unit</button></p>
      <DentalMock open={mock} onOpenChange={setMock} unit={first.unitTitle} />

      {repeats && repeats.length > 0 && (
        <section className="mt-10" aria-label="Questions that keep coming back">
          <h2 className="font-serif text-xl font-bold">Questions that keep coming back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Worded alike in more than one paper. Learn these first.</p>
          <ol className="mt-2 divide-y divide-border border-y border-border">
            {repeats.map((r, i) => (
              <li key={i} className="py-3.5">
                <p className="text-[16px] leading-relaxed"><span className="mr-2 font-serif font-bold text-primary">{i + 1}.</span>{r.text}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs"><span className="font-bold text-emerald-600 dark:text-emerald-400">In {r.papers.length} papers:</span>{r.papers.map((p) => <Link key={p.slug} to={paperPath(p.slug)} className="font-semibold text-primary hover:underline">{p.date}</Link>)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-10" aria-label="Related MBChB notes">
        <h2 className="font-serif text-xl font-bold">Same ground in the MBChB library</h2>
        <p className="mt-1 text-sm text-muted-foreground">Medicine and dentistry share this science. These MBChB notes cover it too.</p>
        <ul className="mt-2 divide-y divide-border border-y border-border">{bridgeFor(first.unitTitle).map((b) => <li key={b.to}><Link to={b.to} className="flex items-center justify-between py-3 text-[16px] font-semibold hover:text-primary"><span>{b.label}</span><ArrowRight className="h-4 w-4 text-primary/50" aria-hidden /></Link></li>)}</ul>
      </section>

      <section className="mt-10" aria-label="Papers">
        <h2 className="font-serif text-xl font-bold">All papers</h2>
        <PaperRows rows={rows} />
      </section>
    </main>
  );
}
