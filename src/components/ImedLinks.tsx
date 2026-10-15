import { Link } from "react-router-dom";
import { linksFor, topicForNote, TYPE_LABEL, type ImedLink } from "@/data/imed";

/** At the end of an IMED note: what to understand first, what looks like it, what it leads to, each with the reason. */
export default function ImedLinks({ slug }: { slug: string }) {
  const here = topicForNote(slug);
  if (!here) return null;
  const links = linksFor(here.topic.id);
  if (!links.length) return null;
  const groups = new Map<string, ImedLink[]>();
  for (const l of links) { const k = TYPE_LABEL[l.type]; groups.set(k, [...(groups.get(k) ?? []), l]); }
  return (
    <nav aria-label="Connected topics" className="mt-12 rounded-2xl border border-border bg-card p-5 sm:p-6 print:hidden">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Internal medicine · {here.system.name}</p>
      <h2 className="mt-1 font-serif text-2xl font-bold">How this connects</h2>
      <div className="mt-4 space-y-5">
        {[...groups.entries()].map(([label, items]) => (
          <section key={label}>
            <h3 className="text-sm font-bold">{label}</h3>
            <ul className="mt-1.5 space-y-1.5">
              {items.map((l) => (
                <li key={l.topic.id} className="text-[15px] leading-6">
                  {l.published && l.topic.note
                    ? <Link to={`/notes/${l.topic.note}`} className="font-bold text-primary hover:underline">{l.topic.name}</Link>
                    : <span className="font-bold text-foreground/80">{l.topic.name} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Coming soon</span></span>}
                  <span className="text-muted-foreground"> — {l.why}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Link to="/imed" className="mt-5 inline-block text-sm font-bold text-primary hover:underline">All of internal medicine →</Link>
    </nav>
  );
}
