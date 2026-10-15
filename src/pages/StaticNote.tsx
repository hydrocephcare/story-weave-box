import { useEffect, useMemo, useState } from "react";
import { useReadLog } from "@/lib/readLog";
import ImedLinks from "@/components/ImedLinks";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { openAI } from "@/lib/aiEvents";
import { topicForNote } from "@/data/imed";
import { doneTopics, toggleTopic } from "@/lib/imedProgress";
import { useAuth } from "@/hooks/useAuth";
import StudyTools from "@/components/StudyTools";
import SideAds from "@/components/SideAds";
import PageSummary from "@/components/PageSummary";
import OutlineLine from "@/components/OutlineLine";
import HeroAurora from "@/components/HeroAurora";
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { Printer, ScanLine } from "lucide-react";
import DriveFileViewer, { type DriveFile } from "@/components/DriveFileViewer";
import { startDownload } from "@/lib/driveDownload";
import PaperBody from "@/components/PaperBody";
import NoteOutlineBox from "@/components/NoteOutlineBox";
import QuickSummaryDialog from "@/components/QuickSummaryDialog";
import NoteTopics from "@/components/NoteTopics";
import { QUICK_SUMMARIES } from "@/data/quickSummaries";
import ContentCredit from "@/components/ContentCredit";
import PharmacologyConnections from "@/components/PharmacologyConnections";
import { STATIC_NOTES, TRIMESTER_LABEL, driveViewUrl, findStaticNote, loadStaticNoteText } from "@/data/staticNotes";
import drugIndex from "@/data/drugIndex.json";
import { mdToHtml } from "@/lib/miniMarkdown";
import { linkDrugs, linkTopics } from "@/lib/noteLinks";
import { useTopicIndex } from "@/lib/topics";
import { clearNoteReturn, getNoteReturn, setNoteReturn } from "@/lib/noteReturn";
import { updateMetaTags } from "@/lib/seo";
import { logStudy } from "@/lib/studyLog";

interface DrugEntry { id: string; name: string; terms: string[] }
const DRUGS = drugIndex as DrugEntry[];

/** A note that ships with the site: /notes/<slug>. */
export default function StaticNotePage() {
  const { slug = "" } = useParams();
  const note = findStaticNote(slug);
  return <StaticNoteView key={slug} />;
}

function StaticNoteView() {
  const { slug = "" } = useParams();
  const note = findStaticNote(slug);
  useReadLog(note?.title);
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [scanOpen, setScanOpen] = useState<number | null>(null);
  const quick = slug ? QUICK_SUMMARIES[slug] : undefined;
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

  const parsed = useMemo(() => (text ? mdToHtml(text, { skipTitle: true, questions: !note?.paper }) : null), [text, note]);
  const topicIndex = useTopicIndex();
  const linked = useMemo(() => {
    if (!parsed) return null;
    const withDrugs = linkDrugs(parsed.html, DRUGS);
    if (!topicIndex?.length || !note) return withDrugs;
    // a note does not link to the subject it is itself about
    const own = (note.title + " " + (note.group ?? "")).toLowerCase();
    const topics = topicIndex.filter((t) => (t.d >= 3 || t.ai) && !own.includes(t.n.toLowerCase())).map((t) => ({ s: t.s, n: t.n }));
    return { ...withDrugs, html: linkTopics(withDrugs.html, topics) };
  }, [parsed, topicIndex, note]);

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

  const { user: railUser } = useAuth();
  const spy = useScrollSpy(parsed ? parsed.headings.map((h) => h.id) : []);
  const [doneTick, setDoneTick] = useState(0);
  const imedTopic = note ? topicForNote(note.slug) : null;
  const finishedKey = `ompath_note_done_${railUser?.id ?? "guest"}`;
  const finished = (() => { void doneTick; try { if (imedTopic && doneTopics(railUser?.id).has(imedTopic.topic.id)) return true; return (JSON.parse(localStorage.getItem(finishedKey) ?? "[]") as string[]).includes(note?.slug ?? ""); } catch { return false; } })();
  const toggleFinished = () => {
    if (!note) return;
    try {
      if (imedTopic) toggleTopic(railUser?.id, imedTopic.topic.id);
      const list = new Set(JSON.parse(localStorage.getItem(finishedKey) ?? "[]") as string[]);
      if (list.has(note.slug)) list.delete(note.slug); else list.add(note.slug);
      localStorage.setItem(finishedKey, JSON.stringify([...list]));
    } catch { /* storage blocked */ }
    setDoneTick((n) => n + 1);
  };
  const nextNote = (() => { if (!note) return null; const all = STATIC_NOTES.filter((n) => n.unit === note.unit && n.group === note.group && !n.paper); const i = all.findIndex((n) => n.slug === note.slug); return i >= 0 ? all[i + 1] ?? null : null; })();
  const railOn = !note?.paper && Boolean(parsed && parsed.headings.length > 2);
  const siblings = useMemo(() => (note ? STATIC_NOTES.filter((n) => n.unit === note.unit && n.group === note.group && n.slug !== note.slug) : []), [note]);
  if (!note) return <Navigate to="/notes" replace />;

  /** Remember this exact spot, so the "Back to this note" button and the browser Back button both return here. */
  const leave = (to: string) => {
    setNoteReturn({ path: location.pathname, title: note.title, y: window.scrollY });
    navigate(to);
  };

  /** Tapping an option in a practice MCQ marks it, shows the right one, and opens the reasoning. */
  const pickOption = (target: HTMLElement) => {
    const opt = target.closest(".qa-opt") as HTMLElement | null;
    const card = opt?.closest(".qa-mcq") as HTMLElement | null;
    if (!opt || !card || card.classList.contains("done")) return false;
    const right = card.dataset.correct;
    card.classList.add("done");
    opt.classList.add(right && opt.dataset.l === right ? "is-right" : right ? "is-wrong" : "is-picked");
    if (right) { card.querySelector(`.qa-opt[data-l="${right}"]`)?.classList.add("is-right"); card.querySelector("details")?.setAttribute("open", ""); }
    return true;
  };

  const onBodyClick = (e: React.MouseEvent) => {
    if (pickOption(e.target as HTMLElement)) return;
    const a = (e.target as HTMLElement).closest("a.note-link") as HTMLAnchorElement | null;
    if (e.defaultPrevented || a?.classList.contains("topic-link") || a?.dataset.drug) return; // topics and drugs open the quick-read panel instead
    const href = a?.getAttribute("href");
    if (!a || !href || !href.startsWith("/") || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    leave(href);
  };

  return (
    <div data-ad-anchor className={`w-full min-w-0 overflow-x-clip ${note.paper ? "mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10" : "pb-16"}`}>
      <SideAds title={note.title} />
      {note.paper ? (
        <>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground print:hidden">
        <Link to="/" className="hover:text-primary">Home</Link> ›
        <Link to={`/year/${note.year}`} className="hover:text-primary">Year {note.year}</Link> ›
        <span className="text-foreground">{note.unit}</span>
      </nav>
      <header className="relative isolate -mx-4 mt-3 overflow-hidden px-4 pb-5 pt-4 sm:mx-0 sm:rounded-3xl sm:px-6">
        <HeroAurora about={`${note.unit} ${note.title}`} year={note.year} />
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Year {note.year} · {note.unit}</p>
        {note.series && <div className="mt-2 flex flex-wrap items-center gap-2"><span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-primary">{note.series}</span>{note.week && <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-foreground">{note.week}</span>}{(note.slug === "paediatrics-history-taking-and-examination" || note.slug === "paediatrics-growth-and-development") && <Link to={note.slug === "paediatrics-history-taking-and-examination" ? "/course-outlines/paediatrics#pd-t1-01" : "/course-outlines/paediatrics#pd-t1-02"} className="text-xs font-bold text-primary hover:underline">View course outline ↗</Link>}</div>}
        <h1 className={`mt-1 font-serif font-bold leading-tight text-foreground ${note.paper ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl"}`}>{note.title}</h1>
        {!note.paper && <p className="mt-2 text-sm font-semibold text-muted-foreground">{note.group ?? note.unit}{text ? ` · ${Math.max(1, Math.round(text.split(/\s+/).length / 210))} min read` : ""}{parsed && parsed.headings.length ? ` · ${parsed.headings.length} sections` : ""}</p>}
        <p className="mt-2 text-sm text-muted-foreground">Updated {new Date(note.updated).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
        <button type="button" onClick={() => window.print()} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-primary print:hidden"><Printer className="h-3.5 w-3.5" /> Print or save as PDF</button>
      </header>
        </>
      ) : (
        <header className="topic-hero relative isolate overflow-hidden border-b border-border/60">
          <HeroAurora about={`${note.unit} ${note.title}`} year={note.year} />
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-8 sm:pb-14 sm:pt-12">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground print:hidden">
              <Link to="/" className="hover:text-primary">Home</Link> ›
              <Link to={`/year/${note.year}`} className="hover:text-primary">Year {note.year}</Link> ›
              <Link to={`/notes?year=${note.year}&unit=${encodeURIComponent(note.unit)}`} className="text-foreground hover:text-primary">{note.unit}</Link>
            </nav>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Year {note.year} · {note.unit}{note.group ? ` · ${note.group}` : ""}</p>
            <h1 className="mt-2 max-w-4xl font-serif text-4xl font-bold leading-[1.08] text-foreground sm:text-6xl">{note.title}</h1>
            <p className="mt-3 text-sm font-semibold text-muted-foreground">{text ? `${Math.max(1, Math.round(text.split(/\s+/).length / 210))} min read` : "Loading"}{parsed && parsed.headings.length ? ` · ${parsed.headings.length} sections` : ""} · Updated {new Date(note.updated).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="mt-5 max-w-3xl text-xl leading-[1.65] text-foreground/85 sm:text-[1.35rem]">{note.description}</p>
            {text && text.length > 400 && <StudyTools className="mt-6 max-w-3xl" title={note.title} path={`/notes/${note.slug}`} text={text} />}
            <button type="button" onClick={() => window.print()} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-primary print:hidden"><Printer className="h-3.5 w-3.5" aria-hidden /> Print or save as PDF</button>
          </div>
        </header>
      )}

      <div className={note.paper ? "" : "mx-auto max-w-6xl px-5 pt-10"}>

      <div className={railOn ? "lg:grid lg:grid-cols-[13.5rem_minmax(0,52rem)] lg:gap-12" : ""}>
        {railOn && parsed && (
          <aside className="hidden lg:block print:hidden" aria-label="On this page">
            <nav className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-border text-[15px]">
              <p className="pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
              <ol className="mt-2">
                {parsed.headings.map((h) => <li key={h.id}><a href={`#${h.id}`} aria-current={spy.active === h.id ? "location" : undefined} className={`-ml-px block border-l-2 py-1.5 pl-4 leading-snug transition-colors hover:border-primary hover:text-primary ${spy.active === h.id ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground"}`}>{h.text}</a></li>)}
              </ol>
              <div className="mt-5 pl-4 pr-1">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground"><span>Reading</span><span>{spy.progress}%</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={spy.progress} aria-valuemin={0} aria-valuemax={100} aria-label="How far down this note you are"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${spy.progress}%` }} /></div>
                <button type="button" onClick={toggleFinished} aria-pressed={finished} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${finished ? "border-emerald-600 bg-emerald-600 text-white" : "border-border hover:border-primary hover:text-primary"}`}>{finished ? "Finished ✓" : "Mark as finished"}</button>
                <button type="button" onClick={() => openAI(`Quiz me on ${note.title}`)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold hover:border-primary hover:text-primary">Ask Ompath AI</button>
                {nextNote && <Link to={`/notes/${nextNote.slug}`} className="mt-2 block rounded-lg bg-primary/10 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/15">Next: {nextNote.title} →</Link>}
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="mt-2 block w-full px-1 text-left text-xs font-bold text-muted-foreground hover:text-primary">↑ Back to top</button>
              </div>
            </nav>
          </aside>
        )}
        <div className="w-full min-w-0">
      {quick && <QuickSummaryDialog summary={quick} />}

      {!note.paper && <PageSummary id={`n:${note.slug}`} className="mt-5" />}
      {!note.paper && <OutlineLine title={note.title} year={note.year} unit={note.unit} className="mt-4" />}
      {!note.paper && <NoteOutlineBox note={note} />}

      {note.paper && (
        <aside aria-label="Past paper" className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm print:hidden">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Past paper · {note.paper.satLabel} · {note.paper.trimester ? TRIMESTER_LABEL[note.paper.trimester] : "Undated"}</p>
          {!note.paper.complete && note.paper.missing && <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">Not the whole paper: {note.paper.missing}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-bold">
            <Link to={`/papers${note.paper.trimester ? `?trim=${note.paper.trimester}` : ""}`} className="text-primary hover:underline">All past papers{note.paper.trimester ? ` for trimester ${note.paper.trimester}` : ""}</Link>
            <Link to={`/papers?view=coverage&unit=${note.paper.outline}`} className="text-primary hover:underline">Topics asked and not yet asked</Link>
            {note.paper.driveId && <button type="button" onClick={() => setScanOpen(0)} className="inline-flex items-center gap-1 text-primary hover:underline"><ScanLine className="h-3.5 w-3.5" /> View the original scan (PDF)</button>}
          </p>
        </aside>
      )}

      {note.paper?.driveId && (
        <DriveFileViewer
          items={[[note.paper.driveId, note.paper.source || "Original scan", "pdf"] as DriveFile]}
          index={scanOpen}
          onIndexChange={setScanOpen}
          onDownload={(f) => startDownload(f[0], f[1])}
          where="Past papers"
        />
      )}

      {error && <p className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">This note could not load. Check your connection and refresh.</p>}
      {!parsed && !error && <p className="mt-6 text-sm text-muted-foreground">Loading the note…</p>}
      {parsed && linked && (
        <>
          {parsed.headings.length > 2 && (
            <nav aria-label="In this note" className="mt-6 py-2 print:hidden lg:hidden">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">In this note</p>
              <ol className="no-scrollbar mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {parsed.headings.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-foreground hover:text-primary">{h.text}</a></li>)}
              </ol>
            </nav>
          )}

          {!note.paper && <PharmacologyConnections ids={linked.ids} conditionIds={note.condition ? [note.condition] : []} leave={leave} className="mt-4" />}

          {note.paper && text ? <PaperBody text={text} onClick={onBodyClick} /> : (
            <article className={`note-body mt-6 ${note.paper ? "" : "note-topic"}`} onClick={onBodyClick} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && pickOption(e.target as HTMLElement)) e.preventDefault(); }} dangerouslySetInnerHTML={{ __html: linked.html }} />
          )}
          {!note.paper && <ImedLinks slug={note.slug} />}

          <div className="print:hidden"><ContentCredit /></div>

          {text && <NoteTopics text={text} title={`${note.title} ${note.group ?? ""}`} className="mt-8" />}

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
      </div>
      </div>
    </div>
  );
}
