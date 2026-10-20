import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { setTrack } from "@/lib/courseTrack";
import { Helmet } from "react-helmet-async";
import { ArrowRight, FileText } from "lucide-react";
import DentalHomeExtras from "@/components/dental/DentalHomeExtras";
import { CATEGORY_LIST, PAPER_INDEX, paperPath } from "@/lib/dentalPapers";

/** /dental: the home of the dental section. It is its own part of the site, with its own menu, pages and sitemap. */
export default function DentalHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const recent = [...PAPER_INDEX].sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO))).slice(0, 6);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <Helmet>
        <title>Dental students: past papers and notes | Ompath Study</title>
        <meta name="description" content="Ompath Study for dental students: Dental, oral health and community health past papers by subject, unit and year, set out question by question with model answers." />
        <link rel="canonical" href="https://www.ompathstudy.com/dental" />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study · Dental</p>
      <h1 className="mt-2 font-serif text-4xl font-bold leading-tight sm:text-5xl">Dental Sciences, in one place</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">Past papers typed out by unit and year, so you can read, search and practise them. Notes, MCQs and model answers are added unit by unit.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/dental/papers" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">Open past papers <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <DentalHomeExtras />

      <section className="mt-12" aria-label="Subjects">
        <h2 className="font-serif text-xl font-bold">Browse by subject</h2>
        <div className="mt-3 space-y-8">
          {CATEGORY_LIST.map((c) => (
            <div key={c.slug}>
              <div className="flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-bold"><Link to={`/dental/category/${c.slug}`} className="hover:text-primary">{c.name}</Link></h3><span className="text-xs text-muted-foreground">{c.papers} papers</span></div>
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {c.units.map((u) => <li key={u.slug}><Link to={`/dental/units/${u.slug}`} className="flex items-center justify-between py-3 text-[16px] font-semibold hover:text-primary"><span>{u.title}</span><span className="text-sm font-normal text-muted-foreground">{u.papers} paper{u.papers === 1 ? "" : "s"}</span></Link></li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-12" aria-label="Programmes">
        <h2 className="font-serif text-xl font-bold">Find your programme</h2>
        <p className="mt-1 flex flex-wrap gap-x-5 gap-y-2">{[...new Set(PAPER_INDEX.flatMap((p) => p.programmes))].sort().map((x) => <Link key={x} to={`/dental/papers?programme=${encodeURIComponent(x)}`} className="text-[15px] font-semibold text-primary hover:underline">{x}</Link>)}</p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span className="font-bold text-muted-foreground">By year</span>{[...new Set(PAPER_INDEX.map((p) => p.year).filter(Boolean))].sort().reverse().map((y) => <Link key={y} to={`/dental/papers?year=${y}`} className="font-semibold text-primary hover:underline">{y}</Link>)}</p>
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
        {user ? <>Not a dental student? <Link to="/account" className="font-bold text-primary hover:underline">Change your course</Link>.</> : <>Studying medicine? <button type="button" onClick={() => { setTrack("medicine"); navigate("/"); }} className="font-bold text-primary hover:underline">Go to the MBChB site</button>.</>}
      </p>
    </main>
  );
}
