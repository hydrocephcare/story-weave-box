import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ClipboardList, Clock, FolderOpen, MessageSquare, Plus, RotateCcw, Search, Siren, Stethoscope, Trash2, Zap } from "lucide-react";
import { getCase, ROTATIONS, BODY_SYSTEMS, useGeneratedCases } from "@/clinical";
import { EXAM_SETS, HISTORY_SETS } from "@/clinical/templates";
import { addScore, caseHasStage, matchDdx, MODE_INFO, pct, STAGES_BY_MODE, stagesHandOver, type SkillTally } from "@/clinical/engine";
import { COLD } from "@/clinical/extras/cold";
import { matchQuestion } from "@/clinical/roleplay";
import { TRAPS } from "@/clinical/traps";
import { osceNextUrl, recordOsceStation } from "@/clinical/osce";
import { ColdStage, DrugStage, PresentStage, ProblemsStage, ReportStage, WhyStage } from "@/components/clinical/CaseStages";
import { recordAttempt } from "@/clinical/progress";
import { SKILLS, type CaseDef, type Ddx, type ExItem, type HxItem } from "@/clinical/types";
import McqCard from "@/components/clinical/McqCard";
import { updateMetaTags } from "@/lib/seo";
import { logStudy } from "@/lib/studyLog";

const NEXT_LABEL: Record<string, string> = { history: "Take the history", exam: "Examine the patient", report: "Report your findings", problems: "Formulate the problem list", ddx: "Differential diagnosis", ix: "Choose investigations", event: "Continue", twist: "Continue", dx: "Name the diagnosis", mgmt: "Plan management", drug: "Drug reasoning", why: "The why ladder", consult: "The consultant has questions", present: "Present to the consultant", summary: "See summary" };
const STAGE_LABEL: Record<string, string> = { cold: "Cold call", report: "Report", problems: "Problems", drug: "Drugs", why: "Why?", present: "Present", intro: "Presentation", history: "History", exam: "Examination", ddx: "Differentials", ix: "Investigations", event: "Emergency", twist: "New information", dx: "Diagnosis", mgmt: "Management", consult: "Consultant", summary: "Summary" };
const TIER: Record<Ddx["tier"], { label: string; cls: string }> = { likely: { label: "Most likely", cls: "bg-emerald-500/15 text-emerald-700" }, possible: { label: "Possible", cls: "bg-sky-500/15 text-sky-700" }, dangerous: { label: "Can’t-miss", cls: "bg-rose-500/15 text-rose-700" } };

export default function ClinicalCase() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const ready = useGeneratedCases();
  const c = id ? getCase(id) : undefined;
  if (!c && id?.startsWith("ai-") && !ready) return <div className="min-h-dvh bg-muted/20 p-8 text-center text-sm text-muted-foreground">Loading the case…</div>;
  const mode = STAGES_BY_MODE[sp.get("mode") ?? ""] ? (sp.get("mode") as string) : "full";
  if (!c) return <Navigate to="/clinical" replace />;
  return <Runner key={`${c.id}-${mode}-${sp.get("r") ?? ""}`} c={c} mode={mode} limit={Number(sp.get("limit")) || 0} circuit={sp.get("circuit") === "1"} />;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</div>;
}

function Runner({ c, mode, limit, circuit }: { c: CaseDef; mode: string; limit: number; circuit: boolean }) {
  const stages = useMemo(() => STAGES_BY_MODE[mode].filter((s) => caseHasStage(c, s)), [c, mode]);
  const [si, setSi] = useState(0);
  const stage = stages[si];
  const [tally, setTally] = useState<SkillTally>({});
  const [hints, setHints] = useState(0);
  const [systems, setSystems] = useState<string[]>([]);
  const [sysDone, setSysDone] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);
  const [examined, setExamined] = useState<string[]>([]);
  const [hxReviewed, setHxReviewed] = useState(false);
  const [exReviewed, setExReviewed] = useState(false);
  const [dd, setDd] = useState<string[]>(["", "", ""]);
  const [most, setMost] = useState(-1);
  const [ddChecked, setDdChecked] = useState(false);
  const [ordered, setOrdered] = useState<string[]>([]);
  const [ixReviewed, setIxReviewed] = useState(false);
  const [answered, setAnswered] = useState<string[]>([]);
  const [consultIdx, setConsultIdx] = useState(0);
  const saved = useRef(false);
  const top = useRef<HTMLDivElement>(null);

  const hxItems: HxItem[] = useMemo(() => [...c.hsets.flatMap((s) => HISTORY_SETS[s] ?? []), ...(c.hxExtra ?? [])].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i), [c]);
  const exItems: ExItem[] = useMemo(() => [...c.esets.flatMap((s) => EXAM_SETS[s] ?? []), ...(c.exExtra ?? [])], [c]);
  const hxAnswer = (h: HxItem) => c.hx[h.id] ?? h.def;
  const exFinding = (e: ExItem) => c.ex[e.id] ?? e.def;

  // Teaching modes that skip the fact-finding hand over the key facts instead.
  const handedOver = stagesHandOver(stages);
  const nextLabel = NEXT_LABEL[stages[si + 1]] ?? "Continue";
  const deep = mode === "full" || mode === "long";
  const knownHx = handedOver ? c.hxKey : asked;
  const knownEx = handedOver ? c.exKey : examined;
  const ixOrdered = mode === "ix" ? Array.from(new Set([...ordered])) : ordered;

  useEffect(() => { updateMetaTags({ title: `${c.title} — clinical case | Ompath Study` }); window.scrollTo({ top: 0 }); }, [c.title]);
  useEffect(() => { top.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [si]);
  useEffect(() => { document.querySelector('[data-step="current"]')?.scrollIntoView({ inline: "center", block: "nearest" }); }, [si]);

  const add = (skill: Parameters<typeof addScore>[1], earned: number, total = 1) => setTally((t) => addScore(t, skill, earned, total));
  const next = () => setSi((i) => Math.min(i + 1, stages.length - 1));
  const mcqDone = (id: string, skill: Parameters<typeof addScore>[1]) => (r: { earned: number }, h: number) => { setAnswered((a) => [...a, id]); setHints((x) => x + h); add(skill, r.earned); };

  // ---- derived scores for fact-finding stages
  const hxKeyAsked = c.hxKey.filter((k) => asked.includes(k));
  const exKeyDone = c.exKey.filter((k) => examined.includes(k));
  const ixKey = c.ix.filter((x) => x.use === "key");
  const ixKeyOrdered = ixKey.filter((x) => ixOrdered.includes(x.id));
  const ixWasted = c.ix.filter((x) => x.use === "low" && ixOrdered.includes(x.id));

  // ---- differentials
  const ddEntered = dd.map((t) => t.trim()).filter(Boolean);
  const ddMatches = ddEntered.map((t) => matchDdx(t, c.ddx));
  const matchedSet = new Set(ddMatches.filter((m) => m >= 0));
  const dangerMissed = c.ddx.filter((d, i) => d.tier === "dangerous" && !matchedSet.has(i));
  const mostIdx = most >= 0 ? ddMatches[most] : -1;

  const finishHistory = () => { if (!hxReviewed) { add("history", hxKeyAsked.length, Math.max(c.hxKey.length, 1)); setHxReviewed(true); } };
  const finishExam = () => { if (!exReviewed) { add("examination", exKeyDone.length, Math.max(c.exKey.length, 1)); setExReviewed(true); } };
  const checkDdx = () => {
    if (ddChecked) return;
    const expected = Math.min(3, c.ddx.length);
    const hit = Math.min(matchedSet.size, expected) / expected;
    const bonus = mostIdx >= 0 && c.ddx[mostIdx].tier === "likely" ? 1 : 0;
    add("differentials", hit * 0.75 + bonus * 0.25);
    setDdChecked(true);
  };
  const finishIx = () => { if (!ixReviewed) { add("investigations", Math.max(0, (ixKeyOrdered.length - ixWasted.length * 0.5) / Math.max(ixKey.length, 1))); setIxReviewed(true); } };

  // ---- OSCE-style countdown: when time is up the current fact-finding stage closes by itself
  const [left, setLeft] = useState(limit);
  useEffect(() => { if (!limit || stage === "summary") return; const t = setInterval(() => setLeft((x) => x - 1), 1000); return () => clearInterval(t); }, [limit, stage]);
  const expired = limit > 0 && left <= 0;
  useEffect(() => { if (!expired) return; if (stage === "history") finishHistory(); else if (stage === "exam") finishExam(); else if (stage === "ix") finishIx(); }, [expired, stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const clock = `${Math.floor(Math.max(left, 0) / 60)}:${String(Math.max(left, 0) % 60).padStart(2, "0")}`;

  // ---- summary & saving
  const total = useMemo(() => { const v = Object.values(tally) as [number, number][]; const e = v.reduce((s, x) => s + x[0], 0); const t = v.reduce((s, x) => s + x[1], 0); return t ? e / t : 0; }, [tally]);
  useEffect(() => {
    if (stage !== "summary" || saved.current) return;
    saved.current = true;
    recordAttempt({ caseId: c.id, at: Date.now(), mode, tally, score: Math.round(total * 100), hints });
    logStudy(5);
  }, [stage, c.id, mode, tally, total, hints]);

  const rot = ROTATIONS.find((r) => r.id === c.rotation)!;

  return (
    <div className="min-h-dvh bg-muted/20" ref={top}>
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-5 sm:py-7">
          <Link to="/clinical" className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/50"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All cases</Link>
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Clinical simulator › {rot.emoji} {rot.label} <span className="rounded-full bg-primary/10 px-2 py-0.5">{MODE_INFO[mode].label}</span> {limit > 0 && stage !== "summary" && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${expired ? "bg-rose-500/15 text-rose-700" : left < 30 ? "bg-amber-500/20 text-amber-700" : "bg-muted text-foreground"}`}><Clock className="h-3 w-3" /> {expired ? "Time up" : clock}</span>} {c.emergency && mode !== "cold" && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-700"><Siren className="h-3 w-3" /> Emergency</span>}</p>
          <h1 className="mt-1 font-serif text-xl font-bold leading-tight text-foreground sm:text-3xl">{deep || stage === "summary" ? c.title : "Case " + c.id.split("-").pop()?.toUpperCase()}</h1>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-foreground">
            <span>Step {si + 1} of {stages.length}<span className="font-semibold text-muted-foreground"> · {mode === "cold" && si < stages.length - 1 ? "Keep going" : STAGE_LABEL[stages[si]]}</span></span>
            {si > 0 && stage !== "summary" && <button type="button" onClick={() => setSi((i) => Math.max(0, i - 1))} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold hover:border-primary/50"><ArrowLeft className="h-3 w-3" aria-hidden /> Previous step</button>}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={stages.length} aria-valuenow={si + 1}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(((si + 1) / stages.length) * 100)}%` }} /></div>
          <ol className="mt-2 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }} aria-label="Case progress">
            {stages.map((s, i) => <li key={s} data-step={i === si ? "current" : undefined} className="shrink-0">{i < si ? <button type="button" onClick={() => setSi(i)} className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary/25">{i + 1}. {STAGE_LABEL[s]}</button> : <span className={`block rounded-full px-3 py-1 text-[11px] font-bold ${i === si ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}. {mode === "cold" && i > si ? "•••" : STAGE_LABEL[s]}</span>}</li>)}
          </ol>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 py-6 sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {stage === "cold" && <ColdStage c={c} onScore={add} onNext={next} onVitals={() => setExamined((a) => (a.includes("vit") ? a : [...a, "vit"]))} />}

          {stage === "intro" && (
            <>
              <Card>
                <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Stethoscope className="h-4 w-4 text-primary" /> {c.setting}</p>
                <p className="text-sm leading-relaxed text-foreground sm:text-base">{c.vignette}</p>
                {handedOver && <p className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">In this mode the key history and examination findings are handed over for you (see the notebook).</p>}
              </Card>
              {deep && (
                <Card>
                  <h2 className="font-serif text-lg font-bold text-foreground">First thoughts: which systems could explain this?</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Before you ask a single question, commit to where you think the problem lies. Select every system that could contribute.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BODY_SYSTEMS.map((s) => <button key={s} type="button" disabled={sysDone} onClick={() => setSystems((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))} aria-pressed={systems.includes(s)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${sysDone ? (c.involved.includes(s) ? (systems.includes(s) ? "border-emerald-500 bg-emerald-500/15" : "border-amber-500 bg-amber-500/15") : systems.includes(s) ? "border-rose-500 bg-rose-500/10" : "border-border opacity-50") : systems.includes(s) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>{sysDone && c.involved.includes(s) && systems.includes(s) ? "✓ " : sysDone && c.involved.includes(s) ? "△ " : sysDone && systems.includes(s) ? "✗ " : ""}{s}</button>)}
                  </div>
                  {!sysDone ? (
                    <button type="button" disabled={!systems.length} onClick={() => { const right = systems.filter((s) => c.involved.includes(s)).length; const wrong = systems.length - right; add("pathophysiology", Math.max(0, (right - wrong * 0.5) / c.involved.length)); setSysDone(true); }} className="mt-3 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">Commit my thinking</button>
                  ) : (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground"><b className="text-foreground">✓ matched</b>, <b className="text-foreground">△ you missed</b>, <b className="text-foreground">✗ unlikely here</b>. The systems that genuinely contribute: {c.involved.join(", ")}. Real patients involve several systems at once — keep an open mind.</p>
                  )}
                </Card>
              )}
              <button type="button" onClick={next} disabled={deep && !sysDone} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">{deep ? "Go to the bedside" : "Start"} <ArrowRight className="h-4 w-4" /></button>
            </>
          )}

          {stage === "history" && (
            <>
              <Card>
                <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground"><MessageSquare className="h-5 w-5 text-primary" /> Take the history</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{mode === "cold" ? "Type your questions as you would say them." : "Type a question, or tap one from the list."} The patient only tells you what you ask. {asked.length} asked.</p>
                <HistoryList items={hxItems} asked={asked} answer={hxAnswer} onAsk={(id) => !hxReviewed && setAsked((a) => (a.includes(id) ? a : [...a, id]))} locked={hxReviewed} keys={c.hxKey} hideList={mode === "cold"} />
              </Card>
              {!hxReviewed ? (
                <button type="button" onClick={finishHistory} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">I have enough history <ArrowRight className="h-4 w-4" /></button>
              ) : (
                <>
                  <Card className="border-primary/30">
                    <h3 className="font-bold text-foreground">How did your history go? {hxKeyAsked.length}/{c.hxKey.length} key questions</h3>
                    {c.hxKey.filter((k) => !asked.includes(k)).length === 0 ? <p className="mt-1 text-sm text-emerald-700">✓ You asked every key question.</p> : (
                      <ul className="mt-2 space-y-2">
                        {c.hxKey.filter((k) => !asked.includes(k)).map((k) => { const h = hxItems.find((x) => x.id === k); return h ? <li key={k} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed"><b>△ You didn’t ask: {h.label}</b><br />The patient would have said: “{hxAnswer(h)}”<br /><span className="text-muted-foreground">{h.why}</span></li> : null; })}
                      </ul>
                    )}
                  </Card>
                  <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">{nextLabel} <ArrowRight className="h-4 w-4" /></button>
                </>
              )}
            </>
          )}

          {stage === "exam" && (
            <>
              <Card>
                <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground"><Stethoscope className="h-5 w-5 text-primary" /> Examine the patient</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Decide what to examine — and know <b>what you are looking for and why</b>. Vital signs first. {examined.length} done.</p>
                <ExamList items={exItems} done={examined} finding={exFinding} onDo={(id) => !exReviewed && setExamined((a) => (a.includes(id) ? a : [...a, id]))} locked={exReviewed} keys={c.exKey} />
              </Card>
              {!exReviewed ? (
                <button type="button" onClick={finishExam} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">I have examined enough <ArrowRight className="h-4 w-4" /></button>
              ) : (
                <>
                  <Card className="border-primary/30">
                    <h3 className="font-bold text-foreground">How did your examination go? {exKeyDone.length}/{c.exKey.length} key components</h3>
                    {c.exKey.filter((k) => !examined.includes(k)).length === 0 ? <p className="mt-1 text-sm text-emerald-700">✓ You covered every key component.</p> : (
                      <ul className="mt-2 space-y-2">{c.exKey.filter((k) => !examined.includes(k)).map((k) => { const e = exItems.find((x) => x.id === k); return e ? <li key={k} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed"><b>△ You didn’t examine: {e.label}</b><br />You would have found: {exFinding(e)}<br /><span className="text-muted-foreground">Why it matters: {e.looking}</span></li> : null; })}</ul>
                    )}
                  </Card>
                  <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">{nextLabel} <ArrowRight className="h-4 w-4" /></button>
                </>
              )}
            </>
          )}

          {stage === "ddx" && (
            <>
              <Card>
                <h2 className="font-serif text-lg font-bold text-foreground">What could this be? Write at least three differentials.</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Think systems and mechanisms, not just the first diagnosis that comes to mind. Then mark the one you think is most likely.</p>
                <div className="mt-3 space-y-2">
                  {dd.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button type="button" disabled={ddChecked || !t.trim()} onClick={() => setMost(i)} aria-pressed={most === i} aria-label="Mark as most likely" title="Most likely" className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${most === i ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>#1</button>
                      <input value={t} disabled={ddChecked} onChange={(e) => setDd((a) => a.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Differential ${i + 1}…`} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                      {!ddChecked && dd.length > 3 && <button type="button" onClick={() => setDd((a) => a.filter((_, k) => k !== i))} aria-label="Remove" className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                      {ddChecked && ddEntered[i] !== undefined && ddMatches[dd.map((x) => x.trim()).filter(Boolean).indexOf(t.trim())] >= 0 && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                    </div>
                  ))}
                </div>
                {!ddChecked && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dd.length < 6 && <button type="button" onClick={() => setDd((a) => [...a, ""])} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/50"><Plus className="h-3.5 w-3.5" /> Add another</button>}
                    <button type="button" disabled={ddEntered.length < 3 || most < 0} onClick={checkDdx} className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">Check my reasoning</button>
                    {(ddEntered.length < 3 || most < 0) && <span className="self-center text-[11px] text-muted-foreground">{ddEntered.length < 3 ? "At least three differentials needed." : "Mark your #1."}</span>}
                  </div>
                )}
              </Card>

              {ddChecked && (
                <>
                  <Card className="border-primary/30">
                    <h3 className="font-bold text-foreground">Your differentials against the consultant’s</h3>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">
                      {ddEntered.map((t, i) => <li key={i} className={`rounded-lg px-3 py-2 ${ddMatches[i] >= 0 ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>{ddMatches[i] >= 0 ? <><b>✓ {t}</b> — on the list as “{c.ddx[ddMatches[i]].name}” ({TIER[c.ddx[ddMatches[i]].tier].label}).</> : <><b>△ {t}</b> — not on this consultant’s list. It may still be reasonable: what finding in the vignette supports it, and what argues against?</>}</li>)}
                    </ul>
                    {dangerMissed.length > 0 && <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs"><b>✗ Can’t-miss diagnoses you didn’t consider:</b> {dangerMissed.map((d) => d.name).join("; ")}. Always ask: what would kill this patient first?</p>}
                    <p className="mt-2 text-xs">Your #1: <b>{mostIdx >= 0 ? c.ddx[mostIdx].name : ddEntered[most]}</b> {mostIdx >= 0 && c.ddx[mostIdx].tier === "likely" ? "— ✓ the most likely on the available evidence." : "— △ the evidence points elsewhere; read the reasoning below."}</p>
                  </Card>
                  <h3 className="px-1 font-serif text-lg font-bold text-foreground">Why each differential is possible — and how to separate them</h3>
                  {c.ddx.map((d) => (
                    <Card key={d.name}>
                      <div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-foreground">{d.name}</h4><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TIER[d.tier].cls}`}>{TIER[d.tier].label}</span></div>
                      <p className="mt-1 text-sm leading-relaxed text-foreground"><b>Why possible:</b> {d.why}</p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-emerald-500/10 p-3 text-xs"><b className="text-emerald-700">Supports</b><ul className="mt-1 list-disc space-y-0.5 pl-4">{d.for.map((x) => <li key={x}>{x}</li>)}</ul></div>
                        <div className="rounded-lg bg-rose-500/10 p-3 text-xs"><b className="text-rose-700">Argues against</b><ul className="mt-1 list-disc space-y-0.5 pl-4">{d.against.map((x) => <li key={x}>{x}</li>)}</ul></div>
                      </div>
                      <div className="mt-2 rounded-lg bg-primary/5 p-3 text-xs leading-relaxed"><b className="text-primary">How to separate it</b><br /><b>Ask:</b> {d.separate.ask}<br /><b>Examine:</b> {d.separate.exam}<br /><b>Investigate:</b> {d.separate.ix}</div>
                    </Card>
                  ))}
                  <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">{nextLabel} <ArrowRight className="h-4 w-4" /></button>
                </>
              )}
            </>
          )}

          {stage === "ix" && (
            <>
              <Card>
                <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground"><ClipboardList className="h-5 w-5 text-primary" /> Choose investigations</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Order only what could change your management. Ask of every test: <i>what would I do differently depending on the result?</i></p>
                <IxList c={c} ordered={ixOrdered} onOrder={(id) => !ixReviewed && setOrdered((a) => (a.includes(id) ? a : [...a, id]))} locked={ixReviewed} />
              </Card>
              {c.interpret.filter((q) => !q.after || ixOrdered.includes(q.after)).map((q) => (
                <McqCard key={q.id} q={q} label="Interpret the result" onDone={mcqDone(q.id, "interpretation")} />
              ))}
              {!ixReviewed ? (
                <button type="button" onClick={finishIx} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">I have ordered enough <ArrowRight className="h-4 w-4" /></button>
              ) : (
                <>
                  <Card className="border-primary/30">
                    <h3 className="font-bold text-foreground">Investigation choices: {ixKeyOrdered.length}/{ixKey.length} key tests · {ixWasted.length} unnecessary</h3>
                    <ul className="mt-2 space-y-2 text-xs leading-relaxed">
                      {ixKey.filter((x) => !ixOrdered.includes(x.id)).map((x) => <li key={x.id} className="rounded-lg bg-amber-500/10 px-3 py-2"><b>△ You didn’t order: {x.label}</b><br />It would have shown: {x.result}<br /><span className="text-muted-foreground">{x.meaning}</span></li>)}
                      {ixWasted.map((x) => <li key={x.id} className="rounded-lg bg-rose-500/10 px-3 py-2"><b>✗ {x.label}</b> — {x.note}</li>)}
                      {ixKey.every((x) => ixOrdered.includes(x.id)) && ixWasted.length === 0 && <li className="rounded-lg bg-emerald-500/10 px-3 py-2">✓ A focused, sensible set of investigations.</li>}
                    </ul>
                  </Card>
                  <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">{nextLabel} <ArrowRight className="h-4 w-4" /></button>
                </>
              )}
            </>
          )}

          {stage === "event" && c.event && (
            <>
              <div className="rounded-2xl border-2 border-rose-500/60 bg-rose-500/10 p-4 sm:p-5" role="alert">
                <p className="flex items-center gap-2 text-sm font-bold text-rose-700"><Siren className="h-5 w-5" /> {c.event.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{c.event.text}</p>
                <p className="mt-2 rounded-lg bg-card px-3 py-2 text-xs font-semibold text-foreground">{c.event.vitals}</p>
              </div>
              {mode === "cold" && (ixKeyOrdered.length < Math.ceil(ixKey.length / 2) || exKeyDone.length < Math.ceil(c.exKey.length / 2)) && (
                <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs leading-relaxed text-foreground"><b>This is what happens when the work-up is incomplete.</b> You did not request all the key tests or complete the key examination, so the diagnosis was still unclear and nobody noticed the trend in time. Nothing rescued you — the patient simply got worse. The full list of what you missed is in the summary.</div>
              )}
              <McqCard q={c.event.q} label="Act now" onDone={mcqDone(c.event.q.id, "emergency")} />
              {answered.includes(c.event.q.id) && <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">{stages[si + 1] === "summary" ? "See summary" : "Patient stabilised — continue"} <ArrowRight className="h-4 w-4" /></button>}
            </>
          )}

          {stage === "twist" && c.twist && (
            <>
              <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 p-4 sm:p-5"><p className="flex items-center gap-2 text-sm font-bold text-amber-700"><Zap className="h-5 w-5" /> New information arrives</p><p className="mt-1 text-sm leading-relaxed text-foreground">{c.twist.text}</p></div>
              <McqCard q={c.twist.q} label="Re-think" onDone={mcqDone(c.twist.q.id, "differentials")} />
              {answered.includes(c.twist.q.id) && <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Continue <ArrowRight className="h-4 w-4" /></button>}
            </>
          )}

          {stage === "dx" && (
            <>
              <McqCard q={c.dx.q} label="Diagnosis" onDone={mcqDone(c.dx.q.id, "pathophysiology")} />
              {answered.includes(c.dx.q.id) && <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Plan management <ArrowRight className="h-4 w-4" /></button>}
            </>
          )}

          {stage === "mgmt" && (
            <>
              <McqCard q={c.mgmt} label="Management" onDone={mcqDone(c.mgmt.id, "management")} />
              {answered.includes(c.mgmt.id) && <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">{nextLabel} <ArrowRight className="h-4 w-4" /></button>}
            </>
          )}

          {stage === "consult" && (
            <>
              <p className="px-1 text-xs font-semibold text-muted-foreground">Consultant’s questions — {Math.min(consultIdx + 1, c.consultant.length)} of {c.consultant.length}</p>
              {c.consultant.slice(0, consultIdx + 1).map((q, i) => (
                <McqCard key={q.id} q={q} label={i === consultIdx ? "Consultant asks" : "Answered"} onDone={mcqDone(q.id, q.skill)} />
              ))}
              {answered.includes(c.consultant[consultIdx].id) && (consultIdx < c.consultant.length - 1
                ? <button type="button" onClick={() => setConsultIdx((i) => i + 1)} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Next question <ArrowRight className="h-4 w-4" /></button>
                : <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">{nextLabel} <ArrowRight className="h-4 w-4" /></button>)}
            </>
          )}

          {stage === "report" && <ReportStage c={c} onScore={add} onNext={next} nextLabel={nextLabel} />}
          {stage === "problems" && <ProblemsStage c={c} onScore={add} onNext={next} nextLabel={nextLabel} />}
          {stage === "drug" && <DrugStage c={c} onScore={add} onNext={next} nextLabel={nextLabel} />}
          {stage === "why" && <WhyStage c={c} onScore={add} onNext={next} nextLabel={nextLabel} />}
          {stage === "present" && <PresentStage c={c} onScore={add} onNext={next} />}

          {stage === "summary" && <Summary c={c} tally={tally} total={total} hints={hints} mode={mode} circuit={circuit} />}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Notebook c={c} vignette={mode === "cold" ? COLD[c.id] ?? c.vignette : c.vignette} hx={knownHx} ex={knownEx} hxItems={hxItems} exItems={exItems} hxAnswer={hxAnswer} exFinding={exFinding} ddx={ddChecked ? ddEntered : []} ix={c.ix.filter((x) => ixOrdered.includes(x.id))} />
        </aside>
      </div>
    </div>
  );
}

function Group({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-border bg-background">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><span>{title}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
      <div className="space-y-1.5 px-2 pb-2">{children}</div>
    </details>
  );
}

function HistoryList({ items, asked, answer, onAsk, locked, keys, hideList }: { items: HxItem[]; asked: string[]; answer: (h: HxItem) => string; onAsk: (id: string) => void; locked: boolean; keys: string[]; hideList: boolean }) {
  const [q, setQ] = useState("");
  const [say, setSay] = useState("");
  const [reply, setReply] = useState("");
  const [showList, setShowList] = useState(!hideList);
  const listVisible = showList || locked;
  const ask = () => {
    if (!say.trim() || locked) return;
    const m = matchQuestion(say, items);
    if (!m) setReply("“Sorry doctor, I am not sure what you are asking. Could you put it another way?”");
    else if (asked.includes(m.id)) setReply("“You already asked me that, doctor.”");
    else { onAsk(m.id); setReply(""); }
    setSay("");
  };
  const groups = useMemo(() => { const m = new Map<string, HxItem[]>(); items.forEach((i) => { if (!q || i.label.toLowerCase().includes(q.toLowerCase())) m.set(i.group, [...(m.get(i.group) ?? []), i]); }); return [...m.entries()]; }, [items, q]);
  return (
    <div className="mt-3 space-y-2">
      {!locked && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
          <label className="block text-xs font-bold text-foreground" htmlFor="ask-own">Ask the patient in your own words</label>
          <div className="mt-1.5 flex gap-2"><input id="ask-own" value={say} onChange={(e) => setSay(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} placeholder="e.g. Do you sleep on extra pillows?" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /><button type="button" onClick={ask} disabled={!say.trim()} className="shrink-0 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40">Ask</button></div>
          {reply && <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs italic text-foreground">{reply}</p>}
          {hideList && <button type="button" onClick={() => setShowList((v) => !v)} className="mt-2 text-[11px] font-bold text-primary hover:underline">{showList ? "Hide the question list (harder)" : "Need prompts? Show the question list"}</button>}
        </div>
      )}
      {!listVisible && asked.length > 0 && (
        <ul className="space-y-1.5">
          {asked.map((id) => { const h = items.find((x) => x.id === id); return h ? <li key={id} className="text-xs leading-relaxed"><span className="font-bold text-muted-foreground">You asked about {h.label.split(/[:—(]/)[0].trim().toLowerCase().replace(/[?]$/, "")}.</span><br /><span className="inline-block rounded-lg bg-muted/60 px-3 py-2 text-foreground"><b className="text-primary">Patient:</b> {answer(h)}</span></li> : null; })}
        </ul>
      )}
      {listVisible && <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a question…" aria-label="Find a question" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div>}
      {listVisible && groups.map(([g, list], gi) => (
        <Group key={g} title={`${g} (${list.filter((x) => asked.includes(x.id)).length}/${list.length})`} defaultOpen={gi === 0 || Boolean(q)}>
          {list.map((h) => (
            <div key={h.id}>
              <button type="button" onClick={() => onAsk(h.id)} disabled={asked.includes(h.id) || locked} className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${asked.includes(h.id) ? "border-primary/30 bg-primary/5 text-foreground" : "border-border hover:border-primary/50"}`}>
                {h.label} {locked && keys.includes(h.id) && !asked.includes(h.id) && <span className="ml-1 text-amber-600">★ key</span>}
              </button>
              {asked.includes(h.id) && <p className="mt-1 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-foreground"><b className="text-primary">Patient:</b> {answer(h)}</p>}
            </div>
          ))}
        </Group>
      ))}
    </div>
  );
}

function ExamList({ items, done, finding, onDo, locked, keys }: { items: ExItem[]; done: string[]; finding: (e: ExItem) => string; onDo: (id: string) => void; locked: boolean; keys: string[] }) {
  const groups = useMemo(() => { const m = new Map<string, ExItem[]>(); items.forEach((i) => m.set(i.group, [...(m.get(i.group) ?? []), i])); return [...m.entries()]; }, [items]);
  return (
    <div className="mt-3 space-y-2">
      {groups.map(([g, list], gi) => (
        <Group key={g} title={`${g} (${list.filter((x) => done.includes(x.id)).length}/${list.length})`} defaultOpen={gi === 0}>
          {list.map((e) => (
            <div key={e.id}>
              <button type="button" onClick={() => onDo(e.id)} disabled={done.includes(e.id) || locked} className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${done.includes(e.id) ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/50"}`}>{e.label} {locked && keys.includes(e.id) && !done.includes(e.id) && <span className="ml-1 text-amber-600">★ key</span>}</button>
              {done.includes(e.id) && <div className="mt-1 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed"><p><b className="text-primary">Finding:</b> {finding(e)}</p>{e.img && <img src={e.img} alt={e.imgAlt || e.label} loading="lazy" className="mt-2 max-h-72 w-full rounded-lg border border-border bg-background object-contain" />}<p className="mt-1 text-muted-foreground"><b>Looking for:</b> {e.looking}</p></div>}
            </div>
          ))}
        </Group>
      ))}
    </div>
  );
}

function IxList({ c, ordered, onOrder, locked }: { c: CaseDef; ordered: string[]; onOrder: (id: string) => void; locked: boolean }) {
  const groups = useMemo(() => { const m = new Map<string, typeof c.ix>(); c.ix.forEach((i) => m.set(i.group, [...(m.get(i.group) ?? []), i])); return [...m.entries()]; }, [c]);
  return (
    <div className="mt-3 space-y-2">
      {groups.map(([g, list]) => (
        <Group key={g} title={g} defaultOpen>
          {list.map((x) => (
            <div key={x.id}>
              <button type="button" onClick={() => onOrder(x.id)} disabled={ordered.includes(x.id) || locked} className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${ordered.includes(x.id) ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/50"}`}>{x.label}</button>
              {ordered.includes(x.id) && (x.use === "low"
                ? <p className="mt-1 rounded-lg bg-rose-500/10 px-3 py-2 text-xs leading-relaxed"><b className="text-rose-700">Not helpful here:</b> {x.note}</p>
                : <div className="mt-1 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed"><p><b className="text-primary">Result:</b> {x.result}</p>{x.img && <img src={x.img} alt={x.imgAlt || x.label} loading="lazy" className="mt-2 max-h-80 w-full rounded-lg border border-border bg-background object-contain" />}<details className="mt-1"><summary className="cursor-pointer font-bold text-primary">What does it mean?</summary><p className="mt-1 text-muted-foreground">{x.meaning}</p></details></div>)}
            </div>
          ))}
        </Group>
      ))}
    </div>
  );
}

function Notebook({ c, vignette, hx, ex, hxItems, exItems, hxAnswer, exFinding, ddx, ix }: { c: CaseDef; vignette: string; hx: string[]; ex: string[]; hxItems: HxItem[]; exItems: ExItem[]; hxAnswer: (h: HxItem) => string; exFinding: (e: ExItem) => string; ddx: string[]; ix: CaseDef["ix"] }) {
  const facts = [...hx.map((id) => hxItems.find((x) => x.id === id)).filter(Boolean).map((h) => ({ k: `h-${h!.id}`, label: h!.label.split(/[:—(]/)[0].trim().replace(/[?]$/, ""), text: hxAnswer(h!) })), ...ex.map((id) => exItems.find((x) => x.id === id)).filter(Boolean).map((e) => ({ k: `e-${e!.id}`, label: e!.label.split(/[:—(]/)[0].trim(), text: exFinding(e!) }))];
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-foreground"><BookOpen className="h-4 w-4 text-primary" /> Case notebook <span className="ml-auto text-[11px] font-semibold text-muted-foreground">{facts.length + ix.length} findings</span></summary>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 pb-4 text-xs leading-relaxed">
        <p className="rounded-lg bg-primary/5 p-2.5 text-foreground">{vignette}</p>
        {facts.length === 0 && <p className="text-muted-foreground">Nothing yet — what you learn will be written here.</p>}
        {facts.map((f) => <p key={f.k}><b className="text-foreground">{f.label}:</b> <span className="text-muted-foreground">{f.text}</span></p>)}
        {ix.filter((x) => x.use !== "low").length > 0 && <div><p className="mb-1 font-bold text-foreground">Results</p>{ix.filter((x) => x.use !== "low").map((x) => <p key={x.id}><b className="text-foreground">{x.label}:</b> <span className="text-muted-foreground">{x.result}</span></p>)}</div>}
        {ddx.length > 0 && <div><p className="mb-1 font-bold text-foreground">Your differentials</p><ul className="list-disc pl-4 text-muted-foreground">{ddx.map((d) => <li key={d}>{d}</li>)}</ul></div>}
      </div>
    </details>
  );
}

function Summary({ c, tally, total, hints, mode, circuit }: { c: CaseDef; tally: SkillTally; total: number; hints: number; mode: string; circuit: boolean }) {
  const traps = TRAPS.filter((t) => t.rot === c.rotation || t.rot === "all").slice(0, 3);
  const navigate = useNavigate();
  const rows = SKILLS.filter((s) => tally[s.id]);
  return (
    <>
      <Card className="border-primary/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-primary">Case complete</p><h2 className="font-serif text-2xl font-bold text-foreground">{c.title}</h2><p className="text-xs text-muted-foreground">{hints} hint{hints === 1 ? "" : "s"} used</p></div>
          <div className="text-center"><p className="font-serif text-4xl font-bold text-primary">{Math.round(total * 100)}%</p><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">overall</p></div>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((s) => { const [e, t] = tally[s.id] as [number, number]; const p = pct(e, t); return <li key={s.id}><div className="flex justify-between text-xs font-bold"><span>{s.label}</span><span className={p >= 75 ? "text-emerald-700" : p >= 50 ? "text-amber-700" : "text-rose-700"}>{p}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${p >= 75 ? "bg-emerald-500" : p >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${p}%` }} /></div></li>; })}
        </ul>
      </Card>

      <Card>
        <h3 className="font-serif text-lg font-bold text-foreground">Clinical connection map</h3>
        <ol className="mt-3 space-y-0">
          {([["Risk factors", c.chain.risk], ["Pathophysiology", c.chain.patho], ["Symptoms", c.chain.symptoms], ["Signs", c.chain.signs], ["Investigations", c.chain.ix], ["Diagnosis", c.chain.dx], ["Management", c.chain.mx], ["Complications", c.chain.comp]] as [string, string][]).map(([k, v], i, a) => (
            <li key={k}><div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-primary">{k}</p><p className="mt-0.5 text-xs leading-relaxed text-foreground">{v}</p></div>{i < a.length - 1 && <p className="py-0.5 text-center text-primary" aria-hidden="true">↓</p>}</li>
          ))}
        </ol>
      </Card>

      <Card>
        <h3 className="font-serif text-lg font-bold text-foreground">Ward-round must-knows</h3>
        <ul className="mt-2 space-y-1.5 text-sm">{c.mustKnow.map((m, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{m}</span></li>)}</ul>
      </Card>

      <Card>
        <h3 className="font-serif text-lg font-bold text-foreground">If you see THIS → think about THESE</h3>
        <ul className="mt-2 space-y-2 text-sm">{c.thinkIf.map(([a, b]) => <li key={a} className="rounded-lg bg-primary/5 p-3"><b className="text-foreground">{a}</b><br /><span className="text-muted-foreground">→ {b}</span></li>)}</ul>
      </Card>

      {traps.length > 0 && (
        <Card>
          <h3 className="font-serif text-lg font-bold text-foreground">Ward-round traps to avoid</h3>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed">{traps.map((t) => <li key={t.id} className="rounded-lg bg-amber-500/10 p-3"><b className="text-foreground">{t.title}</b><br /><span className="text-muted-foreground">{t.scenario}</span><br /><span className="italic text-foreground">{t.lecturer}</span></li>)}</ul>
          <Link to="/clinical/traps" className="mt-2 inline-block text-xs font-bold text-primary hover:underline">Practise all ward-round traps →</Link>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {circuit && <button type="button" onClick={() => { recordOsceStation(Math.round(total * 100)); navigate(osceNextUrl()); }} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Next OSCE station <ArrowRight className="h-4 w-4" /></button>}
        <Link to={`/clinical/case/${c.id}?mode=${mode}&r=${Date.now()}`} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50"><RotateCcw className="h-4 w-4" /> Try this case again</Link>
        <Link to={`/search?q=${encodeURIComponent(c.revise)}`} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:border-primary/50"><FolderOpen className="h-4 w-4" /> Revise “{c.revise}” on the site</Link>
        <Link to="/clinical" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Next case <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <p className="flex items-start gap-2 text-[11px] text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Teaching cases for revision. Doses and protocols vary between hospitals — always follow your local guidelines and your consultant.</p>
    </>
  );
}
