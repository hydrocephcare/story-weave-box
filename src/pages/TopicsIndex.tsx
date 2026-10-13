import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search, Shuffle, X } from "lucide-react";
import { recentTopics, slugFromName, topicPath, useTopicIndex, type TopicIndexItem } from "@/lib/topics";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const POPULAR = ["Hypertension", "Diabetes mellitus", "Pneumonia", "Heart failure", "Tuberculosis", "Malaria", "Asthma", "Anaemia"];
const letterOf = (n: string) => { const c = n.trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };

/** /topics: an A to Z directory of every subject, in plain columns like a textbook index. Search, pick a subject, or jump to a letter. */
export default function TopicsIndex() {
  const items = useTopicIndex();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const subject = params.get("subject") ?? "";
  const navigate = useNavigate();
  const recent = useMemo(() => recentTopics(), []);

  const subjects = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of items ?? []) m.set(t.c, (m.get(t.c) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    const base = (items ?? []).filter((t) => (!subject || t.c === subject) && (!needle || t.n.toLowerCase().includes(needle) || t.a.some((a) => a.toLowerCase() === needle)));
    return needle
      ? base.sort((a, b) => Number(b.n.toLowerCase().startsWith(needle)) - Number(a.n.toLowerCase().startsWith(needle)) || b.d - a.d)
      : base.sort((a, b) => a.n.localeCompare(b.n));
  }, [items, needle, subject]);

  const groups = useMemo(() => {
    const m = new Map<string, TopicIndexItem[]>();
    for (const t of list) { const l = letterOf(t.n); if (!m.has(l)) m.set(l, []); m.get(l)!.push(t); }
    return [...m.entries()].sort((a, b) => (a[0] === "#" ? 1 : b[0] === "#" ? -1 : a[0].localeCompare(b[0])));
  }, [list]);
  const have = new Set(groups.map(([l]) => l));

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const surprise = () => { const pool = items ?? []; if (pool.length) navigate(topicPath(pool[Math.floor(Math.random() * pool.length)].s)); };
  const popular = useMemo(() => POPULAR.map((n) => (items ?? []).find((t) => t.n.toLowerCase() === n.toLowerCase())).filter(Boolean) as TopicIndexItem[], [items]);

  return (
    <main className="pb-20">
      <Helmet>
        <title>Medical topics A to Z: diseases, anatomy, physiology and more | Ompath Study</title>
        <meta name="description" content="An A to Z of medical topics: diseases, anatomy, physiology, pathology, microbiology and pharmacology, each with notes, images and practice questions for medical students." />
        <link rel="canonical" href="https://www.ompathstudy.com/topics" />
      </Helmet>

      <header className="border-b border-border bg-gradient-to-br from-primary/[0.12] via-background to-background">
        <div className="mx-auto max-w-5xl px-5 pb-10 pt-10 sm:pt-14">
          <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight sm:text-6xl">Medical topics A to Z</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/75 sm:text-xl">Look up a disease, a bone, a hormone or a process. Every page explains it first, then shows the notes, pictures and practice questions we have on it.</p>

          <label className="relative mt-8 block max-w-2xl">
            <span className="sr-only">Search topics</span>
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => set("q", e.target.value)} placeholder="Search a topic, e.g. nephrotic syndrome" className="h-14 w-full rounded-full border border-border bg-background pl-13 pr-12 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40" style={{ paddingLeft: "3.25rem" }} />
            {q && <button type="button" onClick={() => set("q", "")} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
          </label>

          {!q && popular.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              <span className="font-semibold text-muted-foreground">Popular:</span>
              {popular.map((t) => <Link key={t.s} to={topicPath(t.s)} className="rounded-full border border-border bg-background px-3.5 py-1.5 font-semibold hover:border-primary/60 hover:text-primary">{t.n}</Link>)}
              <button type="button" onClick={surprise} className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-primary hover:bg-primary/10"><Shuffle className="h-3.5 w-3.5" aria-hidden /> Surprise me</button>
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5">
        {!q && recent.length > 0 && (
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm"><span className="font-semibold text-muted-foreground">You looked at:</span>{recent.slice(0, 6).map((r) => <Link key={r.s} to={topicPath(r.s)} className="font-semibold text-primary hover:underline">{r.n}</Link>)}</p>
        )}

        <div className="mt-8 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Subject">
          {[["", "All subjects"] as const, ...subjects.map(([s]) => [s, s] as const)].map(([val, label]) => (
            <button key={val || "all"} type="button" aria-pressed={subject === val} onClick={() => set("subject", subject === val ? "" : val)}
              className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition", subject === val ? "bg-foreground text-background" : "bg-muted text-foreground/75 hover:bg-muted/70 hover:text-foreground")}>{label}</button>
          ))}
        </div>

        {!needle && (
          <nav aria-label="Jump to letter" className="mt-6 flex flex-wrap gap-1 border-y border-border py-3">
            {LETTERS.map((l) => have.has(l)
              ? <a key={l} href={`#letter-${l}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-base font-bold text-primary hover:bg-primary/10">{l}</a>
              : <span key={l} className="flex h-9 w-9 items-center justify-center text-base font-semibold text-muted-foreground/40" aria-hidden>{l}</span>)}
          </nav>
        )}

        {items === null && <div className="mt-8 space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-6 w-2/3 animate-pulse rounded bg-muted" />)}</div>}

        {items && list.length === 0 && (
          <div className="mt-10 max-w-xl">
            <p className="font-serif text-2xl font-bold">No page on “{q}” yet</p>
            <p className="mt-2 text-base text-muted-foreground">If it is a medical topic, we can write the page now. It takes under a minute, and everyone gets it after that.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {slugFromName(q).length >= 3 && <Link to={topicPath(slugFromName(q))} className="rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground">Write the page on {q}</Link>}
              <Link to={`/search?q=${encodeURIComponent(q)}`} className="rounded-full border border-border px-6 py-3 text-base font-bold hover:border-primary/60">Search the whole site</Link>
            </div>
          </div>
        )}

        {needle && list.length > 0 && (
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {list.slice(0, 80).map((t) => (
              <li key={t.s}><Link to={topicPath(t.s)} className="group flex items-baseline justify-between gap-4 py-3.5">
                <span className="min-w-0"><span className="text-lg font-semibold text-foreground group-hover:text-primary">{t.n}</span>{t.a.length > 0 && <span className="ml-2 text-sm text-muted-foreground">{t.a.join(", ")}</span>}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{t.c}</span>
              </Link></li>
            ))}
          </ul>
        )}

        {!needle && groups.map(([letter, ts]) => (
          <section key={letter} id={`letter-${letter}`} className="mt-12 scroll-mt-24">
            <h2 className="flex items-center gap-4 font-serif text-4xl font-bold text-primary"><span>{letter}</span><span className="h-px flex-1 bg-border" aria-hidden /></h2>
            <ul className="mt-4 columns-1 gap-x-10 sm:columns-2 lg:columns-3">
              {ts.map((t) => (
                <li key={t.s} className="break-inside-avoid">
                  <Link to={topicPath(t.s)} className="group block py-1.5 text-[17px] leading-snug text-foreground/90 hover:text-primary">
                    <span className="font-medium underline-offset-4 group-hover:underline">{t.n}</span>
                    {!subject && <span className="ml-2 text-xs text-muted-foreground">{t.c}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
