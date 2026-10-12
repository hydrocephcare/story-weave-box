import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search, Shuffle, Sparkles, History } from "lucide-react";
import LoadMoreButton from "@/components/LoadMoreButton";
import { DOMAIN_STYLE, recentTopics, slugFromName, topicPath, useTopicIndex } from "@/lib/topics";
import { cn } from "@/lib/utils";

/** /topics: every subject the library covers, one page each. Search, filter by subject, or browse A to Z. */
export default function TopicsIndex() {
  const items = useTopicIndex();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const subject = params.get("subject") ?? "";
  const [shown, setShown] = useState(48);
  const navigate = useNavigate();
  const recent = useMemo(() => recentTopics(), []);
  // the same topic for everyone all day, picked from the ones with the most to read
  const daily = useMemo(() => {
    const pool = (items ?? []).filter((t) => t.d >= 4).sort((a, b) => a.s.localeCompare(b.s));
    if (!pool.length) return null;
    const day = Math.floor(Date.now() / 86_400_000);
    return pool[(day * 7919) % pool.length];
  }, [items]);
  const surprise = () => { const pool = items ?? []; if (pool.length) navigate(topicPath(pool[Math.floor(Math.random() * pool.length)].s)); };

  const subjects = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of items ?? []) m.set(t.c, (m.get(t.c) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? [])
      .filter((t) => (!subject || t.c === subject) && (!needle || t.n.toLowerCase().includes(needle) || t.a.some((a) => a.toLowerCase() === needle)))
      .sort((a, b) => (needle ? Number(b.n.toLowerCase().startsWith(needle)) - Number(a.n.toLowerCase().startsWith(needle)) : 0) || b.d - a.d);
  }, [items, q, subject]);

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); setShown(48); };
  const chip = (on: boolean) => cn("shrink-0 rounded-full border px-3 py-1 text-xs font-bold", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Helmet>
        <title>Medical topics A to Z: diseases, anatomy, physiology and more | Ompath Study</title>
        <meta name="description" content="One page for every subject in the library: notes, images and practice questions on diseases, anatomy, physiology, pathology, microbiology and pharmacology for medical students." />
        <link rel="canonical" href="https://www.ompathstudy.com/topics" />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 font-serif text-3xl font-bold sm:text-5xl">Every topic, one page</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">Pick a disease, a bone, a hormone or a process. Each page collects the notes, images and practice questions the library has on it, and grows as new notes are added.</p>

      <label className="relative mt-6 block max-w-xl">
        <span className="sr-only">Search topics</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => set("q", e.target.value)} placeholder="Try humerus, ODD, nephrotic syndrome…" className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
      </label>

      {!q && !subject && (daily || recent.length > 0) && (
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          {daily && (
            <Link to={topicPath(daily.s)} className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4 transition hover:border-primary/50">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Topic of the day</span>
              <span className="mt-1 block font-serif text-xl font-bold leading-snug group-hover:text-primary">{daily.n}</span>
              <span className="block text-xs text-muted-foreground">{daily.c}{daily.q ? ` · ${daily.q} practice questions` : ""}</span>
            </Link>
          )}
          <button type="button" onClick={surprise} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-sm font-bold hover:border-primary/50"><Shuffle className="h-4 w-4 text-primary" aria-hidden /> Surprise me</button>
          {recent.length > 0 && (
            <div className="md:col-span-2"><p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><History className="h-3.5 w-3.5" aria-hidden /> Pick up where you left off</p>
              <ul className="mt-2 flex flex-wrap gap-2">{recent.map((r) => <li key={r.s}><Link to={topicPath(r.s)} className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-bold hover:border-primary/50 hover:text-primary">{r.n}</Link></li>)}</ul></div>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Subject">
        <button type="button" className={chip(!subject)} aria-pressed={!subject} onClick={() => set("subject", "")}>All subjects</button>
        {subjects.map(([s, n]) => <button key={s} type="button" className={chip(subject === s)} aria-pressed={subject === s} onClick={() => set("subject", subject === s ? "" : s)}>{s} <span className="opacity-70">{n}</span></button>)}
      </div>

      {items === null && <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>}
      {items && list.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center">
          <p className="font-serif text-lg font-bold">No page on “{q}” yet</p>
          <p className="mt-1 text-sm text-muted-foreground">If it is a medical topic, we can write the page now. It takes under a minute, and everyone gets it after that.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {slugFromName(q).length >= 3 && <Link to={topicPath(slugFromName(q))} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Write the page on {q}</Link>}
            <Link to={`/search?q=${encodeURIComponent(q)}`} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">Search the whole site</Link>
          </div>
        </div>
      )}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.slice(0, shown).map((t) => {
          const st = DOMAIN_STYLE[t.c] ?? DOMAIN_STYLE.Medicine;
          return (
            <li key={t.s}><Link to={topicPath(t.s)} className="group relative block h-full overflow-hidden rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
              <span className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", st.hue)} aria-hidden />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.c}</span>
              <span className="mt-0.5 block font-serif text-lg font-bold leading-snug group-hover:text-primary">{t.n}</span>
              {t.a.length > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{t.a.join(" · ")}</span>}
              <span className="mt-2 block text-xs text-muted-foreground">{t.d} {t.d === 1 ? "page" : "pages"}{t.q ? ` · ${t.q} questions` : ""}{t.i ? ` · ${t.i} images` : ""}</span>
            </Link></li>
          );
        })}
      </ul>
      {list.length > shown && <LoadMoreButton onMore={() => setShown((n) => n + 48)} className="mx-auto mt-6 flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50">Show {Math.min(48, list.length - shown)} more topics</LoadMoreButton>}
    </main>
  );
}
