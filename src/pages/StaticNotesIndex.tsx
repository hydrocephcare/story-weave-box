import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { STATIC_NOTES, groupNotes } from "@/data/staticNotes";
import { updateMetaTags } from "@/lib/seo";

/** /notes: every note that ships with the site, by year, unit and topic. */
export default function StaticNotesIndex() {
  const [params] = useSearchParams();
  const yearFilter = Number(params.get("year")) || null;
  const [q, setQ] = useState("");
  useEffect(() => { updateMetaTags({ title: "Year 4 Study Notes: Psychiatry and Respiratory Medicine | Ompath Study", description: "Study notes by year and unit: psychiatry (classification, psychopathology, formulation, bipolar disorder) and respiratory medicine (pneumonia, asthma, COPD, lung cancer and more), each with practice questions." }); }, []);

  const needles = q.toLowerCase().split(/\s+/).filter(Boolean);
  const years = useMemo(() => {
    const list = STATIC_NOTES.filter((n) => (!yearFilter || n.year === yearFilter) && needles.every((w) => `${n.title} ${n.unit} ${n.group ?? ""} ${n.description}`.toLowerCase().includes(w)));
    return [...new Set(list.map((n) => n.year))].sort().map((year) => ({ year, units: groupNotes(list.filter((n) => n.year === year)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, yearFilter]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-xs font-semibold text-muted-foreground"><Link to="/" className="hover:text-primary">Home</Link> › <span className="text-foreground">Notes</span></nav>
      <h1 className="mt-3 font-serif text-3xl font-bold text-foreground sm:text-4xl">Study notes</h1>
      <p className="mt-2 text-sm text-muted-foreground">{STATIC_NOTES.length} notes, each with a contents list and practice questions.{yearFilter ? <> Showing Year {yearFilter}. <Link to="/notes" className="font-bold text-primary hover:underline">Show all years</Link></> : null}</p>
      <div className="relative mt-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, e.g. asthma, formulation" aria-label="Search notes" className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3 text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25" />
      </div>

      {years.length === 0 && <p className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No notes match. Try a shorter search.</p>}
      {years.map(({ year, units }) => (
        <section key={year} className="mt-8">
          <h2 className="font-serif text-2xl font-bold text-foreground">Year {year}</h2>
          {units.map((u) => (
            <div key={u.unit} className="mt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{u.unit}</h3>
              {u.groups.map((g) => (
                <div key={g.group} className="mt-2">
                  <p className="text-xs font-bold text-muted-foreground">{g.group}</p>
                  <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {g.notes.map((n) => <li key={n.slug}><Link to={`/notes/${n.slug}`} className="block rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary">{n.title}</Link></li>)}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
