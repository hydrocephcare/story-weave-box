import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Brain, Calculator, CalendarDays, ClipboardCheck, ClipboardList, Dices, Flame, Gauge, HelpCircle, Layers, MessageSquare, Search, Pill, Presentation, RotateCcw, ScanLine, ShieldAlert, Siren, Snowflake, Stethoscope, Target, TestTube2, Timer, Workflow, FileText, ListChecks, HelpingHand } from "lucide-react";
import { COLD } from "@/clinical/extras/cold";
import { BANK } from "@/clinical/bank";
import { STATIONS } from "@/clinical/stations";
import { ALL_CASES, BUILTIN_CASES, ROTATIONS, useGeneratedCases } from "@/clinical";
import { MODE_INFO } from "@/clinical/engine";
import { resetClinical, useClinicalProgress } from "@/clinical/progress";
import type { CaseDef, Rotation, Skill } from "@/clinical/types";
import { updateMetaTags } from "@/lib/seo";
import { matching, pickRound, roundHistory, startRound, topicsOf } from "@/clinical/wardRound";

const LEVEL = ["", "Foundation", "Core", "Challenging"];
const MODE_ICON: Record<string, typeof Stethoscope> = { full: Stethoscope, cold: Snowflake, long: FileText, ddx: Brain, history: MessageSquare, exam: Target, report: ClipboardCheck, ix: TestTube2, emergency: Siren, problems: ListChecks, present: Presentation, drug: Pill, why: HelpingHand };
const DEEP = ["full", "long"];

type Lab = { to: string; label: string; blurb: string; icon: typeof Stethoscope };
const LAB_GROUPS: { title: string; items: Lab[] }[] = [
  { title: "Test yourself", items: [
      { to: "/clinical/quiz", label: "Rapid-fire quiz", blurb: `${BANK.length}+ questions with reasoning`, icon: HelpCircle },
      { to: "/clinical/findings", label: "Normal or abnormal?", blurb: "Report findings like a doctor", icon: ClipboardCheck },
      { to: "/clinical/consultant", label: "Consultant interrogation", blurb: "Rapid-fire from every case", icon: Gauge },
      { to: "/clinical/cards", label: "Recall cards", blurb: "If you see THIS → think THESE", icon: Layers },
      { to: "/clinical/reason", label: "Reverse reasoning", blurb: "From a finding back to the disease", icon: Workflow },
  ] },
  { title: "Stations and procedures", items: [
      { to: "/clinical/osce", label: "OSCE circuit", blurb: "Six timed stations back to back", icon: Timer },
      { to: "/clinical/stations", label: "ECG & imaging", blurb: `${STATIONS.length} stations: describe → interpret → diagnose`, icon: ScanLine },
      { to: "/clinical/counsel", label: "Counselling", blurb: "Bad news, HIV, consent, suicide risk", icon: MessageSquare },
      { to: "/clinical/tools", label: "Ward tools", blurb: "Calculators, scores, normal values", icon: Calculator },
  ] },
  { title: "Reasoning and drugs", items: [
      { to: "/clinical/why", label: "Why ladders", blurb: "Keep asking why down to the physiology", icon: Layers },
      { to: "/clinical/traps", label: "Ward-round traps", blurb: "What lecturers catch you on", icon: ShieldAlert },
      { to: "/clinical/drugs", label: "Drug reasoning", blurb: "Why this drug, what can go wrong", icon: Pill },
      { to: "/pharmacology", label: "Pharmacology", blurb: "Cancer drugs, common-condition drugs, interactions", icon: Pill },
  ] },
  { title: "Track your learning", items: [
      { to: "/clinical/mistakes", label: "Mistakes notebook", blurb: "Everything you got wrong, until mastered", icon: ListChecks },
      { to: "/must-knows", label: "Unit must-knows", blurb: "What every Year 4 must know, tick by tick", icon: ClipboardCheck },
  ] },
];

const TABS = [{ id: "cases", label: "Cases" }, { id: "round", label: "Ward round" }, { id: "labs", label: "Skill labs" }, { id: "review", label: "Review" }] as const;

/** Which case best trains a weak skill: the one with most questions of that kind, least recently done. */
function pickForSkill(skill: Skill, last: Record<string, { at: number; score: number }>): CaseDef | undefined {
  const weight = (c: CaseDef) => [...c.interpret, ...c.consultant, c.mgmt, c.dx.q, ...(c.event ? [c.event.q] : [])].filter((q) => q.skill === skill).length;
  return [...ALL_CASES].sort((a, b) => (weight(b) - weight(a)) || ((last[a.id]?.at ?? 0) - (last[b.id]?.at ?? 0)))[0];
}

export default function ClinicalHub() {
  const navigate = useNavigate();
  useGeneratedCases();
  const prog = useClinicalProgress();
  const [params, setParams] = useSearchParams();
  const initialRot = ROTATIONS.find((r) => r.id === params.get("rot"))?.id;
  const [rot, setRot] = useState<Rotation | "all">(initialRot ?? "all");
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState("full");
  const [q, setQ] = useState("");
  const [wrRot, setWrRot] = useState<Rotation | "all">("all");
  const [wrQ, setWrQ] = useState("");
  const [wrN, setWrN] = useState(4);
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "cases") as (typeof TABS)[number]["id"];
  const setTab = (id: string) => setParams((p) => { const n = new URLSearchParams(p); if (id === "cases") n.delete("tab"); else n.set("tab", id); return n; }, { replace: true });

  useEffect(() => { updateMetaTags({ title: "Clinical reasoning simulator — Year 4 ward-round revision | Ompath Study", description: "Practise ward rounds on realistic patients: take a history, examine, build differentials, interpret investigations, handle emergencies and face the consultant." }); }, []);

  const list = useMemo(() => ALL_CASES.filter((c) => (rot === "all" || c.rotation === rot) && (!level || c.level === level) && (!q.trim() || `${c.title} ${c.vignette}`.toLowerCase().includes(q.trim().toLowerCase()))), [rot, level, q]);
  const open = (c: CaseDef, m = mode) => navigate(`/clinical/case/${c.id}?mode=${m}`);
  const random = (filter?: (c: CaseDef) => boolean, m = mode) => {
    const pool = ALL_CASES.filter(filter ?? (() => true));
    const unseen = pool.filter((c) => !prog.lastByCase[c.id]);
    const pick = (unseen.length ? unseen : pool)[Math.floor(Math.random() * (unseen.length ? unseen.length : pool.length))];
    if (pick) open(pick, m);
  };
  const due = ALL_CASES.filter((c) => { const a = prog.lastByCase[c.id]; return a && a.score < 75 && Date.now() - a.at > 2 * 86_400_000; });
  const weakCase = prog.weak[0] ? pickForSkill(prog.weak[0].skill, prog.lastByCase) : undefined;
  const weakQs = Object.values(prog.drills).filter(([r, s]) => s - r > 0).length;
  const byRot = (r: Rotation) => { const cs = ALL_CASES.filter((c) => c.rotation === r); return { n: cs.length, done: cs.filter((c) => prog.lastByCase[c.id]).length }; };

  const skillBars = prog.skillPct.map((s) => <li key={s.skill}><div className="flex justify-between text-[11px] font-bold"><span>{s.label}</span><span className={s.pct === null ? "text-muted-foreground" : s.pct >= 75 ? "text-emerald-700" : s.pct >= 50 ? "text-amber-700" : "text-rose-700"}>{s.pct === null ? "—" : `${s.pct}%`}</span></div><div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${s.pct === null ? "" : s.pct >= 75 ? "bg-emerald-500" : s.pct >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${s.pct ?? 0}%` }} /></div></li>);

  return (
    <div className="min-h-dvh bg-muted/20">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-12">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Stethoscope className="h-4 w-4" /> Year 4 clinical rotations</p>
          <h1 className="mt-2 font-serif text-2xl font-bold leading-tight text-foreground sm:text-4xl">Clinical reasoning simulator</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">Meet a patient you have never seen. Ask, examine, think in differentials, read the results, handle the emergency and answer the consultant — and learn <b>why</b> at every step. Not a question bank: a ward round.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => random()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"><Dices className="h-4 w-4" /> Random ward round</button>
            <button type="button" onClick={() => random(undefined, "cold")} className="inline-flex items-center gap-2 rounded-full border border-sky-500/50 bg-sky-500/10 px-5 py-2.5 text-sm font-bold text-sky-800"><Snowflake className="h-4 w-4" /> Cold patient</button>
            <button type="button" onClick={() => random((c) => Boolean(c.emergency || c.event), "emergency")} className="inline-flex items-center gap-2 rounded-full border border-rose-500/50 bg-rose-500/10 px-5 py-2.5 text-sm font-bold text-rose-700"><Siren className="h-4 w-4" /> Emergency mode</button>
            <button type="button" onClick={() => open(BUILTIN_CASES[Math.floor(Date.now() / 86_400_000) % BUILTIN_CASES.length], "full")} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:border-primary/50"><CalendarDays className="h-4 w-4 text-primary" /> Case of the day</button>
            <button type="button" onClick={() => random((c) => c.rotation === "psychiatry", "report")} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:border-primary/50"><Brain className="h-4 w-4 text-primary" /> Psychiatry / MSE</button>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <details className="rounded-2xl border border-border bg-card p-3 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-foreground">
              <span className="flex items-center gap-1.5"><Flame className="h-4 w-4 text-amber-500" /> {prog.streak}-day streak · {prog.totalCases}/{ALL_CASES.length} cases tried</span>
              <span className="text-xs font-semibold text-primary">{prog.weak[0] ? `Weakest: ${prog.weak[0].label}` : "My progress"}</span>
            </summary>
            <ul className="mt-3 space-y-2">{skillBars}</ul>
          </details>

          <div className="flex gap-1 rounded-full border border-border bg-card p-1" role="tablist" aria-label="Clinical practice sections">
            {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>)}
          </div>

          {tab === "cases" && (
            <section aria-label="Cases">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases, e.g. chest pain, malaria, seizure" aria-label="Search cases" className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-muted-foreground">Open as
                  <select value={mode} onChange={(e) => setMode(e.target.value)} className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-primary">
                    {Object.entries(MODE_INFO).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
                  </select>
                </label>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{MODE_INFO[mode]?.blurb}</p>

              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }} role="group" aria-label="Rotation">
                <button type="button" onClick={() => setRot("all")} aria-pressed={rot === "all"} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${rot === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>All rotations</button>
                {ROTATIONS.map((r) => { const s = byRot(r.id); return <button key={r.id} type="button" onClick={() => setRot(r.id)} aria-pressed={rot === r.id} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${rot === r.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{r.emoji} {r.short} <span className="opacity-70">{s.done}/{s.n}</span></button>; })}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Difficulty">
                  {[0, 1, 2, 3].map((l) => <button key={l} type="button" onClick={() => setLevel(l)} aria-pressed={level === l} className={`rounded-full border px-3 py-1 text-[11px] font-bold ${level === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{l ? LEVEL[l] : "Any level"}</button>)}
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{list.length} case{list.length === 1 ? "" : "s"}</span>
              </div>

              <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {list.map((c) => {
                  const a = prog.lastByCase[c.id]; const r = ROTATIONS.find((x) => x.id === c.rotation)!;
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => open(c)} className="group flex h-full w-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-elevated)]">
                        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>{r.emoji} {r.short}</span><span>·</span><span>{LEVEL[c.level]}</span>{c.emergency && mode !== "cold" && <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-rose-700">Emergency</span>}</span>
                        <span className="mt-1 font-serif text-base font-bold leading-snug text-foreground">{DEEP.includes(mode) ? c.title : "Case " + c.id.split("-").pop()?.toUpperCase()}</span>
                        <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{mode === "cold" ? COLD[c.id] ?? c.vignette : c.vignette}</span>
                        <span className="mt-2 flex items-center justify-between text-[11px] font-bold"><span className={a ? (a.score >= 75 ? "text-emerald-700" : "text-amber-700") : "text-muted-foreground"}>{a ? `Last: ${a.score}%` : "Not tried"}</span><ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {list.length === 0 && <p className="mt-4 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No cases match. Clear the search or pick another rotation.</p>}
            </section>
          )}

          {tab === "round" && (() => {
            const pool = matching(ALL_CASES, wrRot, wrQ);
            const topics = topicsOf(matching(ALL_CASES, wrRot, ""));
            const n = Math.min(wrN, pool.length);
            const history = roundHistory();
            const label = `${wrRot === "all" ? "Mixed" : ROTATIONS.find((r) => r.id === wrRot)?.short}${wrQ.trim() ? `: ${wrQ.trim()}` : ""}`;
            return (
              <section aria-label="Ward round" className="space-y-4">
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                  <h2 className="font-serif text-lg font-bold text-foreground">Do a ward round</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Several patients from one unit or topic, one after another, then a score for the whole round. New patients appear by themselves as new notes are published.</p>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }} role="group" aria-label="Unit">
                  <button type="button" onClick={() => setWrRot("all")} aria-pressed={wrRot === "all"} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${wrRot === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>All units</button>
                  {ROTATIONS.map((r) => <button key={r.id} type="button" onClick={() => setWrRot(r.id)} aria-pressed={wrRot === r.id} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${wrRot === r.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{r.emoji} {r.short} <span className="opacity-70">{ALL_CASES.filter((c) => c.rotation === r.id).length}</span></button>)}
                </div>
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><input value={wrQ} onChange={(e) => setWrQ(e.target.value)} placeholder="A topic, e.g. burns, hernia, pre-eclampsia (optional)" aria-label="Topic" className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" /></div>
                {topics.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="Topics covered">{topics.map((t) => <button key={t.label} type="button" onClick={() => setWrQ(t.label)} className={`rounded-full border px-3 py-1 text-[11px] font-bold ${wrQ === t.label ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}>{t.label}</button>)}</div>}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5" role="group" aria-label="Number of patients">{[3, 4, 6, 8].map((k) => <button key={k} type="button" onClick={() => setWrN(k)} aria-pressed={wrN === k} className={`rounded-full border px-3 py-1 text-xs font-bold ${wrN === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{k} patients</button>)}</div>
                  <span className="text-xs text-muted-foreground">{pool.length} matching case{pool.length === 1 ? "" : "s"}</span>
                </div>
                <button type="button" disabled={pool.length === 0} onClick={() => { const url = startRound(pickRound(pool, n, prog.lastByCase), label, mode); if (url) navigate(url); }} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"><Stethoscope className="h-4 w-4" aria-hidden /> Start the round ({n} patient{n === 1 ? "" : "s"})</button>
                {history.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-4"><h3 className="font-serif text-base font-bold">Your recent rounds</h3>
                    <ul className="mt-2 space-y-1.5 text-sm">{history.slice(0, 5).map((h) => <li key={h.at} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{h.title} <span className="text-xs text-muted-foreground">· {h.n} patients · {new Date(h.at).toLocaleDateString()}</span></span><b className={h.avg >= 75 ? "text-emerald-700" : h.avg >= 50 ? "text-amber-700" : "text-rose-700"}>{h.avg}%</b></li>)}</ul></div>
                )}
              </section>
            );
          })()}

          {tab === "labs" && (
            <section aria-label="Practice labs" className="space-y-5">
              <p className="text-sm text-muted-foreground">Skills on their own. Pick one to sharpen.</p>
              {LAB_GROUPS.map((g) => (
                <div key={g.title}>
                  <h2 className="font-serif text-lg font-bold text-foreground">{g.title}</h2>
                  <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.items.map((l) => (
                      <li key={l.to}><Link to={l.to} className="group flex h-full min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"><l.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-sm font-bold leading-snug text-foreground">{l.label}</span><span className="block text-xs leading-snug text-muted-foreground">{l.blurb}</span></span></Link></li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {tab === "review" && (
            <section aria-label="Review" className="space-y-3">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <h2 className="font-serif text-lg font-bold text-foreground">Revise what you struggle with</h2>
                {prog.weak.length === 0 && due.length === 0 && weakQs === 0 && <p className="mt-1 text-sm text-muted-foreground">Complete a few cases and your weak spots will appear here.</p>}
                {weakQs > 0 && <Link to="/clinical/quiz" className="mt-2 block rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold hover:border-primary/50">Spaced review: {weakQs} question{weakQs === 1 ? "" : "s"} you missed are due →</Link>}
                {prog.weak.map((w) => <p key={w.skill} className="mt-1 text-sm text-foreground">Weak: <b>{w.label}</b> ({w.pct}%)</p>)}
                {weakCase && <button type="button" onClick={() => open(weakCase, "full")} className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-bold hover:border-primary/50">Practise it: {weakCase.title} →</button>}
                {due.slice(0, 5).map((c) => <button key={c.id} type="button" onClick={() => open(c, "full")} className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-bold hover:border-primary/50">Revisit (scored {prog.lastByCase[c.id].score}%): {c.title}</button>)}
              </div>
              <Link to="/clinical/mistakes" className="block rounded-xl border border-border bg-card p-3 text-sm font-bold hover:border-primary/50">Mistakes notebook <span className="block text-xs font-normal text-muted-foreground">Everything you got wrong, until mastered</span></Link>
            </section>
          )}
        </div>

        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground"><ClipboardList className="h-4 w-4 text-primary" /> My progress</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Flame className="h-4 w-4 text-amber-500" /> {prog.streak}-day streak · {prog.totalCases}/{ALL_CASES.length} cases tried · {prog.practice} drills</p>
            <ul className="mt-3 space-y-2">
              {skillBars}
            </ul>
            {prog.attempts.length > 0 && <button type="button" onClick={() => { if (window.confirm("Clear all your simulator progress on this device?")) resetClinical(); }} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"><RotateCcw className="h-3 w-3" /> Reset progress</button>}
          </section>

          <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <h2 className="font-serif text-lg font-bold text-foreground">Revise what you struggle with</h2>
            {prog.weak.length === 0 && due.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Complete a few cases and I will point you to your weak spots here.</p>}
            {weakQs > 0 && <Link to="/clinical/quiz" className="mt-2 block rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-primary/50">Spaced review: {weakQs} question{weakQs === 1 ? "" : "s"} you missed are due →</Link>}
            {prog.weak.map((w) => <p key={w.skill} className="mt-1 text-xs text-foreground">Weak: <b>{w.label}</b> ({w.pct}%)</p>)}
            {weakCase && <button type="button" onClick={() => open(weakCase, "full")} className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-bold hover:border-primary/50">Practise it: {weakCase.title} →</button>}
            {due.slice(0, 3).map((c) => <button key={c.id} type="button" onClick={() => open(c, "full")} className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-bold hover:border-primary/50">Revisit (scored {prog.lastByCase[c.id].score}%): {c.title}</button>)}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <b className="text-foreground">Train the chain, not the list.</b> Risk factor → mechanism → organ → symptom → sign → differential → investigation → diagnosis → management. Every case ends with a connection map and “if you see THIS → think THESE”.
          </section>
        </aside>
      </div>
    </div>
  );
}
