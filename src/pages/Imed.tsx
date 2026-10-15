import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, ChevronDown, Circle } from "lucide-react";
import { IMED, isPublished, linksFor } from "@/data/imed";
import { doneTopics, systemProgress, toggleTopic } from "@/lib/imedProgress";
import { useAuth } from "@/hooks/useAuth";
import DailyQuestion from "@/components/DailyQuestion";
import { completeReview, daysUntil, dueReviews, getExamDate, perDay, setExamDate, unfinished } from "@/lib/noteProgress";

/** /imed: Year 4 Internal Medicine, one folder per system. A tick means the topic is finished: ticked by you, or automatically after you read its note properly. */
export default function Imed() {
  const { user } = useAuth();
  const [open, setOpen] = useState<string | null>("respiratory");
  const [tick, setTick] = useState(0);
  const done = useMemo(() => doneTopics(user?.id), [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [exam, setExam] = useState(() => getExamDate(user?.id));
  const [q, setQ] = useState("");
  const [onlyLeft, setOnlyLeft] = useState(false);
  const place = useMemo(() => unfinished(user?.id), [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = useMemo(() => dueReviews(user?.id), [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = IMED.flatMap((sys) => sys.topics).filter((t) => isPublished(t) && !done.has(t.id));
  const rate = perDay(left.length, exam);
  const countdown = daysUntil(exam);
  const total = IMED.reduce((a, s) => a + s.topics.length, 0);
  const live = IMED.reduce((a, s) => a + s.topics.filter(isPublished).length, 0);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Helmet>
        <title>Year 4 Internal Medicine notes by system | Ompath Study</title>
        <meta name="description" content="Year 4 MBChB internal medicine, system by system: respiratory, cardiovascular, renal, infectious disease, gastroenterology, haematology, neurology, endocrine and rheumatology, with how every topic connects." />
        <link rel="canonical" href="https://www.ompathstudy.com/imed" />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Year 4 · Clinicals</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Internal medicine</h1>
      <p className="mt-2 text-[17px] text-muted-foreground">{live} of {total} topics are written so far; the rest are marked coming soon. Every note ends with the topics it connects to and why. A tick means you finished the topic: it appears by itself after you read a note for a couple of active minutes, or tap the circle.</p>

      <Link to="/notes/year-4-imed-revision-roadmap" className="mt-5 inline-block font-bold text-primary hover:underline">Exam revision roadmap for Year 4 internal medicine →</Link>

      <DailyQuestion className="mt-6" />

      <section className="mt-6 space-y-3" aria-label="Your study plan">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Exam planner</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold" htmlFor="imed-exam">My exam is on</label>
            <input id="imed-exam" type="date" value={exam} onChange={(e) => { setExam(e.target.value); setExamDate(user?.id, e.target.value); }} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          </div>
          {rate ? <p className="mt-2 text-[15px]"><b>{countdown} days</b> to go and <b>{left.length}</b> topics left: read <b>{rate} topic{rate === 1 ? "" : "s"} a day</b>. Today: {left.slice(0, rate).map((t, i) => <span key={t.id}>{i ? ", " : ""}{t.note ? <Link to={`/notes/${t.note}`} className="font-semibold text-primary hover:underline">{t.name}</Link> : t.name}</span>)}.</p> : <p className="mt-2 text-sm text-muted-foreground">Pick your exam date and the plan works out how many topics to read each day, and which ones come next.</p>}
        </div>
        {place.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Continue reading</p>
            <ul className="mt-2 space-y-1.5">{place.map((p) => <li key={p.slug}><Link to={`/notes/${p.slug}`} className="flex items-center justify-between gap-3 text-[15px] font-semibold hover:text-primary"><span className="min-w-0 truncate">{p.title}</span><span className="shrink-0 text-xs font-bold text-muted-foreground">{p.progress}%</span></Link></li>)}</ul>
          </div>
        )}
        {due.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Due for a second look</p>
            <p className="text-sm text-muted-foreground">Notes you finished, coming back after 3, 7 and 21 days so they stay.</p>
            <ul className="mt-2 space-y-2">{due.slice(0, 5).map((r) => <li key={r.slug} className="flex flex-wrap items-center justify-between gap-2"><Link to={`/notes/${r.slug}`} className="font-semibold hover:text-primary">{r.title}</Link><button type="button" onClick={() => { completeReview(user?.id, r.slug); setTick((x) => x + 1); }} className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary hover:text-primary">I have reviewed it</button></li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a topic, e.g. meningitis" aria-label="Find a topic" className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={onlyLeft} onChange={(e) => setOnlyLeft(e.target.checked)} /> Only topics I have not finished</label>
        </div>
      </section>

      <div className="mt-6 space-y-3">
        {IMED.map((s) => {
          const p = systemProgress(user?.id, s.topics);
          const filtering = Boolean(q.trim()) || onlyLeft;
          const shown = s.topics.filter((t) => (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())) && (!onlyLeft || !done.has(t.id)));
          if (filtering && shown.length === 0) return null;
          const isOpen = filtering || open === s.id;
          return (
            <section key={s.id} className="rounded-2xl border border-border bg-card">
              <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-xl font-bold">{s.name}</span>
                  <span className="block text-sm text-muted-foreground">{s.blurb}</span>
                </span>
                <span className="shrink-0 text-right text-sm font-bold text-primary">{p.done}/{p.total}<span className="block text-[11px] font-semibold text-muted-foreground">{s.topics.filter(isPublished).length} written</span></span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {isOpen && (
                <ul className="divide-y divide-border border-t border-border">
                  {(filtering ? shown : s.topics).map((t) => {
                    const ready = isPublished(t);
                    const finished = done.has(t.id);
                    const n = linksFor(t.id).length;
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <button type="button" onClick={() => { toggleTopic(user?.id, t.id); setTick((x) => x + 1); }} aria-pressed={finished} aria-label={finished ? `Untick ${t.name}` : `Tick ${t.name} as finished`} className="shrink-0">
                          {finished ? <Check className="h-6 w-6 rounded-full bg-emerald-600 p-1 text-white" aria-hidden /> : <Circle className="h-6 w-6 text-muted-foreground/60" aria-hidden />}
                        </button>
                        <span className="min-w-0 flex-1">
                          {ready && t.note ? <Link to={`/notes/${t.note}`} className="font-semibold hover:text-primary hover:underline">{t.name}</Link> : <span className="font-semibold text-foreground/70">{t.name}</span>}
                          {n > 0 && ready && <span className="block text-xs text-muted-foreground">Connects to {n} other topic{n === 1 ? "" : "s"}</span>}
                        </span>
                        {!ready && <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Coming soon</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
