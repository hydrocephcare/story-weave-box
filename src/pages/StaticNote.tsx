import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { Pill, Printer } from "lucide-react";
import { STATIC_NOTES, findStaticNote, loadStaticNoteText } from "@/data/staticNotes";
import drugIndex from "@/data/drugIndex.json";
import { CONDITIONS } from "@/pharm/conditions";
import { mdToHtml } from "@/lib/miniMarkdown";
import { drugHref, linkDrugs } from "@/lib/noteLinks";
import { clearNoteReturn, getNoteReturn, setNoteReturn } from "@/lib/noteReturn";
import { updateMetaTags } from "@/lib/seo";
import { logStudy } from "@/lib/studyLog";

interface DrugEntry { id: string; name: string; terms: string[] }
const DRUGS = drugIndex as DrugEntry[];
const nameOf = (id: string) => (DRUGS.find((d) => d.id === id)?.name ?? id).replace(/\s*\(.*\)/, "").split(" / ")[0];

/** A note that ships with the site: /notes/<slug>. */
export default function StaticNotePage() {
  const { slug = "" } = useParams();
  const note = findStaticNote(slug);
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const returning = Boolean((navType === "POP" || (location.state as { restore?: boolean } | null)?.restore) && getNoteReturn()?.path === location.pathname);

  useEffect(() => {
    if (!note) return;
    updateMetaTags({ title: `${note.title} — Year ${note.year} ${note.unit} Notes | Ompath Study`, description: note.description });
    let on = true;
    setText(null); setError(false);
    loadStaticNoteText(note.slug).then((t) => { if (on) setText(t); }).catch(() => { if (on) setError(true); });
    if (!returning) window.scrollTo({ top: 0 });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  // Reading a note counts toward today's study streak (once per visit, after the text has loaded).
  useEffect(() => { if (text) logStudy(5); }, [text]);

  const parsed = useMemo(() => (text ? mdToHtml(text, { skipTitle: true }) : null), [text]);
  const linked = useMemo(() => (parsed ? linkDrugs(parsed.html, DRUGS) : null), [parsed]);

  // Coming back from a drug page: put the reader exactly where they were once the text is on screen.
  useEffect(() => {
    if (!linked) return;
    const ret = getNoteReturn();
    if (!ret) return;
    // A trail that started on another note is stale once you are reading a different one.
    if (ret.path !== location.pathname || !returning) { clearNoteReturn(); return; }
    const go = () => window.scrollTo({ top: ret.y, left: 0, behavior: "auto" });
    clearNoteReturn();
    const frame = requestAnimationFrame(go);
    const t1 = setTimeout(go, 120);
    const t2 = setTimeout(go, 450);
    return () => { cancelAnimationFrame(frame); clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  const siblings = useMemo(() => (note ? STATIC_NOTES.filter((n) => n.unit === note.unit && n.group === note.group && n.slug !== note.slug) : []), [note]);
  const condition = note?.condition ? CONDITIONS.find((c) => c.id === note.condition) : undefined;
  if (!note) return <Navigate to="/notes" replace />;

  /** Remember this exact spot, so the "Back to this note" button and the browser Back button both return here. */
  const leave = (to: string) => {
    setNoteReturn({ path: location.pathname, title: note.title, y: window.scrollY });
    navigate(to);
  };

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
      {parsed && linked && (
        <>
          {parsed.headings.length > 2 && (
            <nav aria-label="In this note" className="mt-6 rounded-xl border border-border bg-card p-4 print:hidden">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">In this note</p>
              <ol className="no-scrollbar mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {parsed.headings.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-foreground hover:text-primary">{h.text}</a></li>)}
              </ol>
            </nav>
          )}

          {(condition || linked.ids.length > 0) && (
            <aside aria-label="Pharmacology connections" className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 print:hidden">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary"><Pill className="h-3.5 w-3.5" /> Pharmacology connections</p>
              {condition && (
                <button type="button" onClick={() => leave(`/pharmacology?tab=conditions&c=${condition.id}`)} className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary">
                  <span>Drug guide for {condition.name}<span className="block text-xs font-medium text-muted-foreground">First-line, add-ons, what to avoid, what to monitor</span></span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
              {linked.ids.length > 0 && (
                <>
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">Drugs in this note. Tap one for its card, then use the Back button to return to this spot.</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {linked.ids.slice(0, 14).map((id) => <button key={id} type="button" onClick={() => leave(drugHref(id))} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary">{nameOf(id)}</button>)}
                  </div>
                </>
              )}
            </aside>
          )}

          <article
            className="note-body mt-6"
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest("a.note-link") as HTMLAnchorElement | null;
              const href = a?.getAttribute("href");
              if (!a || !href || !href.startsWith("/") || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              leave(href);
            }}
            dangerouslySetInnerHTML={{ __html: linked.html }}
          />

          {siblings.length > 0 && (
            <nav aria-label="More notes" className="mt-10 rounded-xl border border-border bg-card p-4 print:hidden">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">More in {note.group ?? note.unit}</p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{siblings.map((n) => <li key={n.slug}><Link to={`/notes/${n.slug}`} className="block rounded-lg px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-muted hover:text-primary">{n.title}</Link></li>)}</ul>
              <Link to="/notes" className="mt-2 inline-block text-xs font-bold text-primary hover:underline">All study notes →</Link>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
