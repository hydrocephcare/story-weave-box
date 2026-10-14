import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, BookOpen, Search, Sparkles } from "lucide-react";
import { slugFromName, topicPath, useTopicIndex } from "@/lib/topics";
import { openAI } from "@/lib/aiEvents";
import { logSearch } from "@/lib/search";
import { useSmartSearch } from "@/hooks/useSmartSearch";
import { groupSiteHits, type SiteHit } from "@/lib/siteSearch";
import { CONTENT_TYPES } from "@/lib/academic";
import { useAccess } from "@/lib/access";
import { askable, cachedAnswer, FREE_PER_DAY, streamQuickAnswer, usedToday } from "@/lib/quickAnswer";
import { Answer } from "@/components/ai/AnswerText";
import { Skeleton } from "@/components/ui/skeleton";
import Highlight from "@/components/Highlight";
import { HitIcon } from "@/components/HitIcon";
import HeroAurora from "@/components/HeroAurora";
import { cn } from "@/lib/utils";

const YEARS = [1, 2, 3, 4, 5, 6];
/** A short answer to what was searched, written from the site's own results first. Asked once per search, remembered for the session. */
function QuickAnswer({ q, hits, ready }: { q: string; hits: SiteHit[]; ready: boolean }) {
  const { hasPass } = useAccess();
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "limit" | "off">("idle");
  const done = useRef("");
  useEffect(() => {
    const query = q.trim();
    if (!ready || !askable(query) || done.current === query) return;
    const cached = cachedAnswer(query);
    done.current = query;
    if (cached) { setText(cached); setState("done"); return; }
    if (!hasPass && usedToday() >= FREE_PER_DAY) { setText(""); setState("limit"); return; }
    const ctl = new AbortController();
    setText(""); setState("busy");
    streamQuickAnswer(query, hits, ctl.signal, setText).then(() => setState("done")).catch((e) => { if ((e as Error).name !== "AbortError") setState("off"); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ready]);

  if (state === "idle" || state === "off") return null;
  return (
    <section aria-label="Quick answer" className="mt-8">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Sparkles className="h-4 w-4" aria-hidden /> Quick answer</p>
      {state === "limit" ? (
        <p className="mt-2 text-[15px] text-muted-foreground">You have used today's free quick answers. The results below are all still here, and Ompath AI in the chat can answer more.</p>
      ) : !text ? (
        <div className="mt-3 space-y-2.5" role="status" aria-label="Writing the answer"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-3/4" /></div>
      ) : (
        <div className="mt-3 max-w-[68ch] text-foreground/90"><Answer text={text} /></div>
      )}
      <button type="button" onClick={() => openAI(q.trim())} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">Continue in the chat <ArrowRight className="h-4 w-4" aria-hidden /></button>
    </section>
  );
}

/** /search: a quick answer first, then the topic page, then everything the site has, flowing down the page. */
export default function GlobalSearch() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [asked, setAsked] = useState(params.get("q") || "");
  const [year, setYear] = useState(params.get("year") || "");
  const [contentType, setContentType] = useState(params.get("type") || "");

  const opts = useMemo(() => ({ year: year || undefined, contentType: contentType || undefined }), [year, contentType]);
  const { hits, related, loading, deepLoading, searched, parsed } = useSmartSearch(q, opts);
  const groups = useMemo(() => groupSiteHits(hits), [hits]);
  const topicIndex = useTopicIndex();
  const topicHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 3 || !topicIndex) return [];
    return topicIndex.filter((t) => t.n.toLowerCase() === needle || t.a.some((a) => a.toLowerCase() === needle) || t.n.toLowerCase().startsWith(needle)).sort((a, b) => Number(b.ai) - Number(a.ai) || b.d - a.d).slice(0, 3);
  }, [q, topicIndex]);

  useEffect(() => {
    const trimmed = q.trim();
    const next: Record<string, string> = {};
    if (trimmed) next.q = trimmed;
    if (year) next.year = year;
    if (contentType) next.type = contentType;
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, year, contentType]);

  // the quick answer is asked when the search is submitted, or after a pause in typing: never on every key
  useEffect(() => { const t = setTimeout(() => setAsked(q.trim()), 1400); return () => clearTimeout(t); }, [q]);
  const onSubmit = (e?: FormEvent) => { e?.preventDefault(); setAsked(q.trim()); };
  const hasFilters = year || contentType;
  const chip = (on: boolean) => cn("h-9 shrink-0 rounded-full border px-4 text-sm font-semibold transition", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60");

  return (
    <main>
      <Helmet><title>Search Medical Study Resources | Ompath Study</title><meta name="robots" content="noindex,follow" /></Helmet>

      <header className="relative isolate overflow-hidden">
        <HeroAurora about={q} year={year ? Number(year) : null} />
        <div className="mx-auto max-w-3xl px-5 pb-9 pt-9 sm:pt-14">
          <h1 className="font-serif text-4xl font-bold leading-tight text-foreground sm:text-5xl">Search</h1>
          <p className="mt-2 text-[16px] text-foreground/70">Notes, the text inside them, library files, outline topics and topic pages.</p>
          <form onSubmit={onSubmit} className="mt-6">
            <div className="flex items-center gap-2 rounded-full border border-border bg-background/90 pl-5 pr-1.5 shadow-sm focus-within:border-primary">
              <label htmlFor="global-search-input" className="sr-only">Search the site</label>
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input id="global-search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent py-3.5 text-base outline-none" placeholder="Try TB, anaemia, MBMM3333" />
              <button type="submit" aria-label="Search" className="flex h-11 shrink-0 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground">{loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : "Search"}</button>
            </div>
            <div className="-mx-5 mt-4 flex items-center gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by year">
              <button type="button" className={chip(!year)} onClick={() => setYear("")}>All years</button>
              {YEARS.map((y) => <button key={y} type="button" className={chip(year === String(y))} onClick={() => setYear(year === String(y) ? "" : String(y))}>Year {y}</button>)}
            </div>
            <div className="-mx-5 mt-2 flex items-center gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by kind">
              <button type="button" className={chip(!contentType)} onClick={() => setContentType("")}>Everything</button>
              {CONTENT_TYPES.map((t) => <button key={t} type="button" className={chip(contentType === t)} onClick={() => setContentType(contentType === t ? "" : t)}>{t}</button>)}
            </div>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 pb-16">
        {parsed && searched && (parsed.topic && parsed.topic.toLowerCase() !== q.trim().toLowerCase() || parsed.year) && (
          <p className="mt-6 text-sm text-muted-foreground">Showing results for <strong className="text-foreground">{parsed.topic}</strong>{parsed.year && !year ? <> in <strong className="text-foreground">Year {parsed.year}</strong></> : null}</p>
        )}

        <QuickAnswer q={asked} hits={hits} ready={searched && !loading} />

        {topicHits.length > 0 ? (
          <section className="mt-8" aria-label="Topic pages">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Topic page</p>
            <ul className="mt-2 space-y-1">
              {topicHits.map((t) => (
                <li key={t.s}><Link to={topicPath(t.s)} className="group flex items-start gap-3 py-2"><BookOpen className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden /><span><span className="block font-serif text-xl font-bold group-hover:text-primary">{t.n}: everything in one page</span><span className="text-sm text-muted-foreground">{Math.max(1, t.d)} page{Math.max(1, t.d) === 1 ? "" : "s"}{t.q ? ` · ${t.q} questions` : ""}{t.i ? ` · ${t.i} images` : ""}</span></span></Link></li>
              ))}
            </ul>
          </section>
        ) : topicIndex && q.trim().length >= 4 && /^[A-Za-z][A-Za-z0-9 '’()\-,./&]{3,70}$/.test(q.trim()) ? (
          <Link to={topicPath(slugFromName(q.trim()))} className="group mt-8 flex items-start gap-3 py-2"><BookOpen className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden /><span><span className="block font-serif text-xl font-bold group-hover:text-primary">Read about “{q.trim().slice(0, 50)}”</span><span className="text-sm text-muted-foreground">Open a full page on this topic: overview, causes, tests, management and questions.</span></span></Link>
        ) : null}

        {related.length > 0 && (
          <p className="mt-6 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Related:</span>{related.map((x) => <button key={x} type="button" onClick={() => setQ(x)} className="rounded-full border border-border px-3 py-1 font-semibold hover:border-primary/60 hover:text-primary">{x}</button>)}</p>
        )}

        {loading && !hits.length ? (
          <div className="mt-10 space-y-8">{[1, 2].map((g) => <div key={g}><Skeleton className="mb-3 h-7 w-40" /><Skeleton className="mb-2 h-5 w-full" /><Skeleton className="mb-2 h-5 w-5/6" /></div>)}</div>
        ) : searched && hits.length === 0 && topicHits.length > 0 ? null : searched && hits.length === 0 ? (
          <div className="mt-12">
            <p className="font-serif text-2xl font-bold">Nothing found for “{q}”{hasFilters ? " with these filters" : ""}</p>
            <p className="mt-2 text-[16px] text-muted-foreground">Try a broader medical term or a course code{hasFilters ? <>, or <button type="button" onClick={() => { setYear(""); setContentType(""); }} className="font-semibold text-primary hover:underline">clear the filters</button></> : ", or check the spelling"}.</p>
          </div>
        ) : searched ? (
          <div className="mt-10 space-y-12">
            <p className="text-xs font-semibold text-muted-foreground">{hits.length} result{hits.length === 1 ? "" : "s"}{deepLoading ? " · still searching inside notes…" : ""}</p>
            {groups.map(({ group, rows }) => (
              <section key={group}>
                <h2 className="font-serif text-2xl font-bold text-foreground sm:text-[1.9rem]">{group} <span className="text-sm font-semibold text-muted-foreground">{rows.length}</span></h2>
                <ul className="mt-3 space-y-1">
                  {rows.slice(0, 40).map((h) => (
                    <li key={h.key}>
                      <Link to={h.href} onClick={() => void logSearch(q, hits.length, { type: h.kind, id: h.key })} className="group flex min-w-0 items-start gap-3 py-3">
                        <span className="mt-0.5 shrink-0 text-primary"><HitIcon hit={h} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary"><Highlight text={h.title} query={q} /></span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{h.subtitle}</span>
                          {h.snippet && <span className="mt-1.5 line-clamp-2 block text-[14px] leading-relaxed text-foreground/70"><Highlight text={h.snippet} query={q} /></span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-12 text-muted-foreground">Search every note, library file, outline topic and page at once. Press Ctrl K from any page.</p>
        )}
      </div>
    </main>
  );
}
