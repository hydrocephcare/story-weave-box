import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { findStaticNote, loadStaticNoteText } from "@/data/staticNotes";
import { mdToHtml } from "@/lib/miniMarkdown";
import { updateMetaTags } from "@/lib/seo";
import { logStudy } from "@/lib/studyLog";

/** A note that ships with the site: /notes/<slug>. */
export default function StaticNotePage() {
  const { slug = "" } = useParams();
  const note = findStaticNote(slug);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!note) return;
    updateMetaTags({ title: `${note.title} — Year ${note.year} ${note.unit} Notes | Ompath Study`, description: note.description });
    let on = true;
    setText(null); setError(false);
    loadStaticNoteText(note.slug).then((t) => { if (on) setText(t); }).catch(() => { if (on) setError(true); });
    window.scrollTo({ top: 0 });
    return () => { on = false; };
  }, [note]);

  // Reading a note counts toward today's study streak (once per visit, after the text has loaded).
  useEffect(() => { if (text) logStudy(5); }, [text]);

  const parsed = useMemo(() => (text ? mdToHtml(text, { skipTitle: true }) : null), [text]);
  if (!note) return <Navigate to="/blog" replace />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground print:hidden">
        <Link to="/" className="hover:text-primary">Home</Link> ›
        <Link to={`/year/${note.year}`} className="hover:text-primary">Year {note.year}</Link> ›
        <span className="text-foreground">{note.unit}</span>
      </nav>
      <header className="mt-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Year {note.year} · {note.unit}</p>
        <h1 className="mt-1 font-serif text-3xl font-bold leading-tight text-foreground sm:text-4xl">{note.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Updated {new Date(note.updated).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
        <button type="button" onClick={() => window.print()} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-primary print:hidden"><Printer className="h-3.5 w-3.5" /> Print or save as PDF</button>
      </header>

      {error && <p className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">This note could not load. Check your connection and refresh.</p>}
      {!parsed && !error && <p className="mt-6 text-sm text-muted-foreground">Loading the note…</p>}
      {parsed && (
        <>
          {parsed.headings.length > 2 && (
            <nav aria-label="In this note" className="mt-6 rounded-xl border border-border bg-card p-4 print:hidden">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">In this note</p>
              <ol className="no-scrollbar mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {parsed.headings.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-foreground hover:text-primary">{h.text}</a></li>)}
              </ol>
            </nav>
          )}
          <article className="note-body mt-6" dangerouslySetInnerHTML={{ __html: parsed.html }} />
        </>
      )}
    </div>
  );
}
