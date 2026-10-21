import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { setTrack } from "@/lib/courseTrack";
import { Helmet } from "react-helmet-async";
import { ArrowRight, FileText } from "lucide-react";
import DentalHomeExtras from "@/components/dental/DentalHomeExtras";
import { CATEGORY_LIST as ALL_CATS, PAPER_INDEX as ALL_INDEX, paperPath } from "@/lib/dentalPapers";
import { useSection } from "@/lib/sections";

/** /dental: the home of the dental section. It is its own part of the site, with its own menu, pages and sitemap. */
export default function DentalHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const sec = useSection();
  const PAPER_INDEX = ALL_INDEX.filter((p) => p.section === sec.slug);
  const CATEGORY_LIST = ALL_CATS.filter((c) => sec.categories.includes(c.slug));
  const recent = [...PAPER_INDEX].sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO))).slice(0, 6);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <Helmet>
        <title>{`${sec.title}: past papers with answers | Ompath Study`}</title>
        <meta name="description" content={sec.blurb} />
        <link rel="canonical" href={`https://www.ompathstudy.com/${sec.slug}`} />
        <meta property="og:title" content={sec.title} /><meta property="og:description" content={sec.blurb} /><meta property="og:url" content={`https://www.ompathstudy.com/${sec.slug}`} /><meta property="og:image" content={`https://www.ompathstudy.com/api/note-card?title=${encodeURIComponent(sec.title)}&unit=${encodeURIComponent(PAPER_INDEX.length + " past papers with answers")}&kind=Past%20papers`} />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study · {sec.name}</p>
      <h1 className="mt-2 font-serif text-4xl font-bold leading-tight sm:text-5xl">{sec.title}</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">{sec.blurb}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={`/${sec.slug}/papers`} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">Open past papers <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Subjects">{CATEGORY_LIST.filter((c) => c.slug !== "other-units").map((c) => <Link key={c.slug} to={`/${sec.slug}/category/${c.slug}`} className="rounded-full border border-border px-3.5 py-1.5 text-sm font-bold hover:border-primary/60 hover:text-primary">{c.name} <span className="font-normal text-muted-foreground">{c.papers}</span></Link>)}</nav>

      <DentalHomeExtras />

      <section className="mt-12" aria-label="Subjects">
        <h2 className="font-serif text-xl font-bold">Browse by subject</h2>
        <div className="mt-3 space-y-8">
          {CATEGORY_LIST.map((c) => (
            <div key={c.slug}>
              <div className="flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-bold"><Link to={`/${sec.slug}/category/${c.slug}`} className="hover:text-primary">{c.name}</Link></h3><span className="text-xs text-muted-foreground">{c.papers} papers</span></div>
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {c.units.map((u) => <li key={u.slug}><Link to={`/${sec.slug}/units/${u.slug}`} className="flex items-center justify-between py-3 text-[16px] font-semibold hover:text-primary"><span>{u.title}</span><span className="text-sm font-normal text-muted-foreground">{u.papers} paper{u.papers === 1 ? "" : "s"}</span></Link></li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-12" aria-label="Programmes">
        <h2 className="font-serif text-xl font-bold">Find your programme</h2>
        <p className="mt-1 flex flex-wrap gap-x-5 gap-y-2">{[...new Set(PAPER_INDEX.flatMap((p) => p.programmes))].sort().map((x) => <Link key={x} to={`/${sec.slug}/papers?programme=${encodeURIComponent(x)}`} className="text-[15px] font-semibold text-primary hover:underline">{x}</Link>)}</p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span className="font-bold text-muted-foreground">By year</span>{[...new Set(PAPER_INDEX.map((p) => p.year).filter(Boolean))].sort().reverse().map((y) => <Link key={y} to={`/${sec.slug}/papers?year=${y}`} className="font-semibold text-primary hover:underline">{y}</Link>)}</p>
      </section>
      {recent.length > 0 && (
        <section className="mt-12" aria-label="Latest papers">
          <h2 className="font-serif text-xl font-bold">Latest papers</h2>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {recent.map((p) => (
              <li key={p.slug}><Link to={paperPath(p.slug)} className="group flex items-center gap-3 py-3"><FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden /><span className="min-w-0 flex-1"><span className="block font-semibold group-hover:text-primary">{p.unitTitle}</span><span className="block truncate text-xs text-muted-foreground">{p.sitting} · {p.date} · {p.programme}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-primary/50" aria-hidden /></Link></li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-14 text-sm text-muted-foreground">
        {user ? <>Studying something else? <Link to="/account" className="font-bold text-primary hover:underline">Change your course</Link>.</> : <>Studying medicine? <button type="button" onClick={() => { setTrack("medicine"); navigate("/"); }} className="font-bold text-primary hover:underline">Go to the MBChB site</button>.</>}
      </p>
    </main>
  );
}
