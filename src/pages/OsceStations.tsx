import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import STATIONS from "@/data/osceStations.json";

type Station = { n: number; title: string; tag: string; case: string; fig: string; qs: { q: string; a: string[] }[]; note?: string };
const fmt = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("*") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : p);

/** Internal Medicine OSCE photograph and imaging stations: the case and picture first, then each question with its model answer behind a button. */
export default function OsceStations() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const flip = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div>
      <Helmet>
        <title>Internal Medicine OSCE Stations with Photos and Model Answers | Ompath Study</title>
        <meta name="description" content="Seven Internal Medicine OSCE photograph and imaging stations for MBChB finals: Winterbottom's sign, pleural effusion, caput medusae, clubbing, nephritic urine, pitting oedema and ring-enhancing lesion, each with model answers." />
        <link rel="canonical" href="https://www.ompathstudy.com/clinical/osce-stations" />
      </Helmet>
      <header className="topic-hero relative isolate overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 pb-10 pt-8 sm:px-6">
          <nav className="text-xs font-semibold text-muted-foreground"><Link to="/clinical/osce" className="hover:text-primary">OSCE</Link> / Internal Medicine stations</nav>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">MKU Year 4 MBChB · Finals revision</p>
          <h1 className="mt-2 font-serif text-4xl font-bold leading-[1.08] sm:text-6xl">Internal Medicine OSCE stations</h1>
          <p className="mt-3 text-lg leading-relaxed text-foreground/85">Seven past photograph and imaging stations, {(STATIONS as Station[]).reduce((n, s) => n + s.qs.length, 0)} questions in all. Read the case, study the picture, answer in your head, then reveal each model answer.</p>
          <ol className="mt-5 flex flex-wrap gap-2 text-sm">{(STATIONS as Station[]).map((s) => <li key={s.n}><a href={`#station-${s.n}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3.5 py-1.5 font-semibold hover:text-primary"><span className="font-bold text-primary">{s.n}</span>{s.title}</a></li>)}</ol>
          <p className="mt-4 text-sm font-bold"><button type="button" onClick={() => setOpen(new Set((STATIONS as Station[]).flatMap((s) => s.qs.map((_, i) => `${s.n}-${i}`))))} className="text-primary hover:underline">Show all answers</button><button type="button" onClick={() => setOpen(new Set())} className="ml-4 text-muted-foreground hover:underline">Hide all</button></p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-6">
      {(STATIONS as Station[]).map((s) => (
        <section key={s.n} id={`station-${s.n}`} className="mt-14 scroll-mt-20 border-t border-border pt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Station {s.n}</p>
          <h2 className="font-serif text-3xl font-bold">{s.title}</h2>
          <p className="text-sm font-semibold text-muted-foreground">{s.tag}</p>
          <p className="mt-4 rounded-r-lg border-l-4 border-amber-400 bg-amber-50 p-4 text-[16.5px] italic leading-relaxed text-neutral-800 dark:bg-amber-950/30 dark:text-amber-100">{s.case}</p>
          <figure className="mt-4 text-center"><img src={`/osce/station-${s.n}.jpg`} alt={s.fig} loading="lazy" className="mx-auto max-h-[28rem] w-auto max-w-full rounded-xl border border-border shadow-sm" /><figcaption className="mt-1 text-xs text-muted-foreground">Fig {s.n}. {s.fig}</figcaption></figure>
          {s.qs.map((q, i) => { const k = `${s.n}-${i}`; return (
            <div key={k} className="mt-5">
              <p className="flex gap-3 text-[17px] font-semibold leading-snug"><span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span><span>{q.q}</span></p>
              <button type="button" onClick={() => flip(k)} aria-expanded={open.has(k)} className="ml-10 mt-2 text-sm font-bold text-primary hover:underline">{open.has(k) ? "Hide model answer" : "Show model answer"}</button>
              {open.has(k) && <ul className="ml-10 mt-2 list-disc space-y-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 py-4 pl-8 pr-4 text-[15.5px] leading-relaxed dark:bg-emerald-950/20">{q.a.map((x, j) => <li key={j}>{fmt(x)}</li>)}</ul>}
            </div>); })}
          {s.note && <p className="mt-4 rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm dark:bg-red-950/20"><strong>Examiner note:</strong> {s.note}</p>}
        </section>
      ))}
      </main>
    </div>
  );
}
