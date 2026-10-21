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
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Helmet>
        <title>Internal Medicine OSCE Stations with Photos and Model Answers | Ompath Study</title>
        <meta name="description" content="Seven Internal Medicine OSCE photograph and imaging stations for MBChB finals: Winterbottom's sign, pleural effusion, caput medusae, clubbing, nephritic urine, pitting oedema and ring-enhancing lesion, each with model answers." />
        <link rel="canonical" href="https://www.ompathstudy.com/clinical/osce-stations" />
      </Helmet>
      <nav className="text-xs font-semibold text-muted-foreground"><Link to="/clinical/osce" className="hover:text-primary">OSCE</Link> / Internal Medicine stations</nav>
      <h1 className="mt-3 font-serif text-4xl font-bold">Internal Medicine OSCE stations</h1>
      <p className="mt-2 text-muted-foreground">Seven past photograph and imaging stations for MBChB finals. Read the case, look at the picture, answer in your head, then reveal each model answer.</p>
      <ol className="mt-4 flex flex-wrap gap-2 text-sm">{(STATIONS as Station[]).map((s) => <li key={s.n}><a href={`#station-${s.n}`} className="rounded-full border border-border px-3 py-1 font-semibold hover:text-primary">{s.n}. {s.title}</a></li>)}</ol>
      {(STATIONS as Station[]).map((s) => (
        <section key={s.n} id={`station-${s.n}`} className="mt-12 scroll-mt-20">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Station {s.n}</p>
          <h2 className="font-serif text-3xl font-bold">{s.title}</h2>
          <p className="text-sm font-semibold text-muted-foreground">{s.tag}</p>
          <p className="mt-4 border-l-4 border-amber-400 bg-amber-50 p-3 italic text-neutral-800 dark:bg-amber-950/30 dark:text-amber-100">{s.case}</p>
          <figure className="mt-4 text-center"><img src={`/osce/station-${s.n}.jpg`} alt={s.fig} loading="lazy" className="mx-auto max-h-96 w-auto max-w-full rounded-md border border-border" /><figcaption className="mt-1 text-xs text-muted-foreground">Fig {s.n}. {s.fig}</figcaption></figure>
          {s.qs.map((q, i) => { const k = `${s.n}-${i}`; return (
            <div key={k} className="mt-5">
              <p className="rounded-md bg-muted px-3 py-2 font-bold">Q{i + 1}. {q.q}</p>
              <button type="button" onClick={() => flip(k)} aria-expanded={open.has(k)} className="mt-2 text-sm font-bold text-primary">{open.has(k) ? "Hide model answer" : "Show model answer"}</button>
              {open.has(k) && <ul className="mt-2 list-disc space-y-1 rounded-md border border-emerald-600/40 bg-emerald-50 py-3 pl-8 pr-4 text-[15px] dark:bg-emerald-950/20">{q.a.map((x, j) => <li key={j}>{fmt(x)}</li>)}</ul>}
            </div>); })}
          {s.note && <p className="mt-4 rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm dark:bg-red-950/20"><strong>Examiner note:</strong> {s.note}</p>}
        </section>
      ))}
    </main>
  );
}
