import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import DATA from "@/data/osce2019.json";

type Q = { q: string; m?: number; a: string[] };
type Station = { g: string; id: string; title: string; tag: string; case: string; figs: string[][]; qs: Q[]; note?: string };
const ALL = DATA as Station[];
const GROUPS = Array.from(new Set(ALL.map((s) => s.g)));
const fmt = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("*") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : p);

/** Internal Medicine OSCEs 2019: picture stations and emergency vivas, grouped by system, each question with its model answer behind a button. */
export default function OsceBank2019() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<string>("all");
  const shown = useMemo(() => ALL.filter((s) => group === "all" || s.g === group), [group]);
  const total = ALL.reduce((n, s) => n + s.qs.length, 0);
  const flip = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pill = "rounded-full border px-3.5 py-1.5 text-sm font-semibold";
  return (
    <div>
      <Helmet>
        <title>Internal Medicine OSCE Past Questions 2019 with Images and Answers | Ompath Study</title>
        <meta name="description" content={`${ALL.length} Internal Medicine OSCE stations and emergency vivas (gastroenterology, pulmonology, rheumatology, cardiology, ECGs) with the clinical pictures, X-rays and model answers.`} />
        <link rel="canonical" href="https://www.ompathstudy.com/clinical/osce-2019" />
      </Helmet>
      <header className="topic-hero relative isolate overflow-hidden border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 pb-10 pt-8 sm:px-6">
          <nav className="text-xs font-semibold text-muted-foreground"><Link to="/clinical/osce" className="hover:text-primary">OSCE</Link> / Internal Medicine 2019</nav>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">MKU MBChB · Internal Medicine</p>
          <h1 className="mt-2 font-serif text-4xl font-bold leading-[1.08] sm:text-6xl">Internal Medicine OSCEs 2019</h1>
          <p className="mt-3 text-lg leading-relaxed text-foreground/85">{ALL.length} stations and {total} questions with the clinical pictures, X-rays and ECGs. Look, answer in your head, then reveal the model answer.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["all", ...GROUPS].map((g) => <button key={g} type="button" onClick={() => setGroup(g)} aria-pressed={group === g} className={`${pill} ${group === g ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/80 hover:text-primary"}`}>{g === "all" ? "All" : g}</button>)}
          </div>
          <p className="mt-4 text-sm font-bold"><button type="button" onClick={() => setOpen(new Set(shown.flatMap((s) => s.qs.map((_, i) => `${s.id}-${i}`))))} className="text-primary hover:underline">Show all answers</button><button type="button" onClick={() => setOpen(new Set())} className="ml-4 text-muted-foreground hover:underline">Hide all</button><Link to="/clinical/osce-stations" className="ml-4 text-muted-foreground hover:underline">Photo stations pack</Link></p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-6">
        {shown.map((s, n) => (
          <section key={s.id} id={s.id} className="mt-14 scroll-mt-20 border-t border-border pt-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{s.g} · Station {ALL.indexOf(s) + 1}</p>
            <h2 className="font-serif text-3xl font-bold">{s.title}</h2>
            <p className="text-sm font-semibold text-muted-foreground">{s.tag}</p>
            <p className="mt-4 rounded-r-lg border-l-4 border-amber-400 bg-amber-50 p-4 text-[16.5px] italic leading-relaxed text-neutral-800 dark:bg-amber-950/30 dark:text-amber-100">{s.case}</p>
            {s.figs.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {s.figs.map(([f, cap]) => <figure key={f} className="text-center"><img src={`/osce/y19/${f}.jpg`} alt={cap} loading={n < 2 ? "eager" : "lazy"} className="mx-auto max-h-80 w-auto max-w-full rounded-xl border border-border bg-white shadow-sm" /><figcaption className="mt-1 text-xs text-muted-foreground">{cap}</figcaption></figure>)}
              </div>
            )}
            {s.qs.map((q, i) => { const k = `${s.id}-${i}`; return (
              <div key={k} className="mt-5">
                <p className="flex gap-3 text-[17px] font-semibold leading-snug"><span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span><span>{q.q}{q.m ? <span className="ml-2 whitespace-nowrap text-sm font-bold text-muted-foreground">({q.m} marks)</span> : null}</span></p>
                <button type="button" onClick={() => flip(k)} aria-expanded={open.has(k)} className="ml-10 mt-2 text-sm font-bold text-primary hover:underline">{open.has(k) ? "Hide model answer" : "Show model answer"}</button>
                {open.has(k) && <ul className="ml-10 mt-2 list-disc space-y-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 py-4 pl-8 pr-4 text-[15.5px] leading-relaxed dark:bg-emerald-950/20">{q.a.map((x, j) => <li key={j}>{fmt(x)}</li>)}</ul>}
              </div>); })}
            {s.note && <p className="mt-4 rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm dark:bg-red-950/20"><strong>Note:</strong> {s.note}</p>}
          </section>
        ))}
      </main>
    </div>
  );
}
