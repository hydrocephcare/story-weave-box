import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, FlaskConical, GraduationCap, Pill, RotateCcw, Sparkles, Stethoscope, Table2, Target } from "lucide-react";
import { ALL_PDRUGS, pdrugById } from "@/pharm";
import { drugQuestions } from "@/clinical/grading";
import type { DrillKind } from "@/pharm/drills";
import { DRILLS } from "@/pharm/drills";
import { BrowseView, CancerView, CheatView, ConditionsView, DrugCard, PracticeView } from "@/components/pharm/PharmViews";
import McqSeries, { ResultCard, type SeriesResult } from "@/components/clinical/McqSeries";
import { saveDrill } from "@/components/clinical/labs/shared";
import { updateMetaTags } from "@/lib/seo";
import { PHARM_BASICS } from "@/pharm/basics";
import { YEAR4_PHARM_UNITS } from "@/pharm/year4";

const TABS = [
  { id: "start", label: "Start from zero", icon: GraduationCap },
  { id: "browse", label: "Drug library", icon: Pill },
  { id: "cancer", label: "Cancer drugs", icon: Target },
  { id: "conditions", label: "By condition", icon: Stethoscope },
  { id: "cheat", label: "Cheat sheets", icon: Table2 },
  { id: "practice", label: "Practice", icon: FlaskConical },
] as const;
type TabId = (typeof TABS)[number]["id"];

function DrugDrill() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const d = id ? pdrugById(id) : undefined;
  const [res, setRes] = useState<SeriesResult | null>(null);
  const [round, setRound] = useState(0);
  const qs = useMemo(() => (d ? drugQuestions(d) : []), [d, round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (d) updateMetaTags({ title: `${d.name} — pharmacology | Ompath Study`, description: d.why }); }, [d]);
  if (!d) return <Navigate to="/pharmacology" replace />;
  if (sp.get("card") === "1") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Link to="/pharmacology" className="hover:underline">Pharmacology</Link> › {d.group}</p>
        <h1 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">{d.name}</h1>
        <DrugCard d={d} defaultOpen lookupNotes />
        <div className="flex flex-wrap gap-2">
          <Link to={`/pharmacology/drug/${d.id}`} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Test me on {d.name.split(" ")[0]}</Link>
          <Link to={`/pharmacology?tab=browse`} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold">All drugs</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-5" key={`${d.id}-${round}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Link to="/pharmacology" className="hover:underline">Pharmacology</Link> › {d.group}</p>
      <h1 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">{d.name}</h1>
      {!res ? (
        <>
          <p className="rounded-xl bg-primary/5 p-3 text-xs text-foreground">Answer from memory first — the drug card opens when you finish.</p>
          <McqSeries qs={qs} onFinish={(r) => { setRes(r); saveDrill(`drug-${d.id}`, "drug", "pharmacology", r); }} finishLabel="Show the drug card" />
        </>
      ) : (
        <>
          <ResultCard title="Drug drill complete" pct={res.pct} />
          <DrugCard d={d} defaultOpen lookupNotes />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setRes(null); setRound((r) => r + 1); }} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50"><RotateCcw className="h-4 w-4" /> Again</button>
            <Link to={`/pharmacology/drug/${ALL_PDRUGS[Math.floor(Math.random() * ALL_PDRUGS.length)].id}`} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Random drug</Link>
            <Link to="/pharmacology" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold">All drugs</Link>
          </div>
        </>
      )}
    </div>
  );
}

function PharmStartView() {
  const [open, setOpen] = useState<string | null>("b01");
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Level 0 · begin here</p>
        <h2 className="mt-1 font-serif text-xl font-bold text-foreground">Know nothing yet? Start with these 20 questions.</h2>
        <p className="mt-1 text-sm text-muted-foreground">Read the question, answer aloud, then open it. Do not start by memorising hundreds of drug names.</p>
      </section>
      <div className="space-y-2">
        {PHARM_BASICS.map((x, i) => (
          <div key={x.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" onClick={() => setOpen(open === x.id ? null : x.id)} className="flex w-full items-start gap-3 p-3.5 text-left">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
              <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{x.topic}</span><span className="text-sm font-semibold text-foreground">{x.q}</span></span>
            </button>
            {open === x.id && <div className="border-t border-border bg-muted/20 px-4 py-3 text-sm"><p className="font-bold text-primary">{x.a}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{x.note}</p></div>}
          </div>
        ))}
      </div>
      <section className="space-y-3">
        <div><h2 className="font-serif text-xl font-bold">Then learn drugs by your Year 4 rotation</h2><p className="text-xs text-muted-foreground">These are your must-know pharmacology buckets. Internal Medicine is deliberately the largest.</p></div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {YEAR4_PHARM_UNITS.map((u) => (
            <details key={u.id} open={u.id === "medicine"} className="rounded-xl border border-border bg-card p-3">
              <summary className="cursor-pointer font-serif text-base font-bold text-foreground">{u.name} <span className="font-sans text-xs font-normal text-muted-foreground">· {u.topics.length} topics</span></summary>
              <ol className="mt-3 space-y-1.5 pl-5 text-xs leading-relaxed text-foreground">{u.topics.map((t) => <li key={t} className="list-decimal">{t}</li>)}</ol>
            </details>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <Link to="/pharmacology?tab=browse" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Next: learn the drug cards</Link>
        <Link to="/pharmacology?tab=practice" className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold">Practice questions</Link>
      </div>
    </div>
  );
}

export default function Pharmacology() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find((t) => t.id === sp.get("tab"))?.id ?? "start") as TabId;
  const drill = DRILLS.find((d) => d.id === sp.get("drill"))?.id as DrillKind | undefined;
  useEffect(() => { if (!id) updateMetaTags({ title: "Pharmacology — cancer drugs, common-condition drugs and drills | Ompath Study", description: "A pharmacology library built for Year 4: cancer chemotherapy, first-line drugs for common conditions, interactions, name endings, pregnancy and kidney cautions, and practice questions." }); }, [id]);
  if (id) return <div className="min-h-dvh bg-muted/20"><DrugDrill /></div>;
  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-4xl px-4 py-7 sm:px-5 sm:py-10">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><BookOpen className="h-4 w-4" /> Clinical pharmacology</p>
          <h1 className="mt-1 font-serif text-2xl font-bold leading-tight text-foreground sm:text-4xl">Pharmacology, made usable</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">Start from the patient, not the textbook: what to give for common conditions, how cancer drugs work and what they do to the body, which combinations are dangerous, and {ALL_PDRUGS.length} drug cards with questions after each.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/pharmacology?tab=practice&drill=mixed" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"><Sparkles className="h-4 w-4" /> 10-question mixed round</Link>
            <Link to="/pharmacology?tab=cancer" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:border-primary/50"><Target className="h-4 w-4 text-primary" /> Cancer drugs</Link>
            <Link to="/pharmacology?tab=conditions" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:border-primary/50"><Stethoscope className="h-4 w-4 text-primary" /> Common conditions</Link>
          </div>
        </div>
      </section>
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-4xl gap-1.5 overflow-x-auto px-4 py-2 sm:px-5" style={{ scrollbarWidth: "none" }} role="tablist">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setSp(t.id === "start" ? {} : { tab: t.id })} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold ${tab === t.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}><t.icon className="h-3.5 w-3.5" /> {t.label}</button>)}
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5" key={tab}>
        {tab === "start" && <PharmStartView />}
        {tab === "browse" && <BrowseView />}
        {tab === "cancer" && <CancerView />}
        {tab === "conditions" && <ConditionsView />}
        {tab === "cheat" && <CheatView />}
        {tab === "practice" && <PracticeView initial={drill} />}
      </div>
    </div>
  );
}
