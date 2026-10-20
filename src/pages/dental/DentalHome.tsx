import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, FileText } from "lucide-react";
import { PAPER_INDEX, paperPath } from "@/lib/dentalPapers";

/** /dental: the home of the dental section. It is its own part of the site, with its own menu, pages and sitemap. */
export default function DentalHome() {
  const units = new Map<string, number>();
  for (const p of PAPER_INDEX) units.set(p.unitTitle, (units.get(p.unitTitle) ?? 0) + 1);
  const recent = [...PAPER_INDEX].sort((a, b) => String(b.year).localeCompare(String(a.year))).slice(0, 6);
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <Helmet>
        <title>Dental students: past papers and notes | Ompath Study</title>
        <meta name="description" content="Ompath Study for dental students: Dental Sciences past papers typed out by unit and year, with notes, questions and answers on the way." />
        <link rel="canonical" href="https://www.ompathstudy.com/dental" />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study · Dental</p>
      <h1 className="mt-2 font-serif text-4xl font-bold leading-tight sm:text-5xl">Dental Sciences, in one place</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">Past papers typed out by unit and year, so you can read, search and practise them. Notes, MCQs and model answers are added unit by unit.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/dental/papers" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">Open past papers <ArrowRight className="h-4 w-4" /></Link>
      </div>
      {units.size > 0 && (
        <section className="mt-12" aria-label="Units">
          <h2 className="font-serif text-xl font-bold">Units</h2>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {[...units.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([u, n]) => (
              <li key={u}><Link to={`/dental/papers?q=${encodeURIComponent(u)}`} className="flex items-center justify-between py-3 text-[16px] font-semibold hover:text-primary"><span>{u}</span><span className="text-sm font-normal text-muted-foreground">{n} paper{n === 1 ? "" : "s"}</span></Link></li>
            ))}
          </ul>
        </section>
      )}
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
    </main>
  );
}
