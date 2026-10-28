import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Pill, Siren } from "lucide-react";
import { drugQuestions, gradePresentation, gradeReport, mark, modelPresentation, modelReport, PRESENT_FIELDS, stems, wordCount, type Criterion } from "@/clinical/grading";
import { CASE_DRUGS, drugById } from "@/clinical/extras/drugs";
import { PROBLEMS } from "@/clinical/extras/problems";
import { COLD } from "@/clinical/extras/cold";
import { mcq, o } from "@/clinical/templates";
import type { MCQ, Skill } from "@/clinical/types";
import type { CaseDef } from "@/clinical/types";
import McqCard from "@/components/clinical/McqCard";

export type OnScore = (skill: Skill, earned: number, total?: number) => void;
const Btn = ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">{children}</button>
);
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>{children}</div>;
// Fisher-Yates: sorting with a random comparator is not a fair shuffle (the first item, often the right answer, ends up first or last far too often)
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function CriteriaList({ criteria, title }: { criteria: Criterion[]; title?: string }) {
  return (
    <div>
      {title && <h3 className="font-serif text-lg font-bold text-foreground">{title}</h3>}
      <ul className="mt-2 space-y-3">
        {criteria.map((c) => {
          const p = Math.round(c.score * 100);
          return (
            <li key={c.id}>
              <div className="flex items-baseline justify-between gap-2 text-xs font-bold"><span>{mark(c.score)} {c.label}</span><span className={p >= 70 ? "text-emerald-700" : p >= 35 ? "text-amber-700" : "text-rose-700"}>{p}%</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${p >= 70 ? "bg-emerald-500" : p >= 35 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${p}%` }} /></div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{c.note}</p>
              {c.missing && c.missing.length > 0 && <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">△ Not covered: {c.missing.join(" · ")}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ cold patient opening
export function ColdStage({ c, onScore, onNext, onVitals }: { c: CaseDef; onScore: OnScore; onNext: () => void; onVitals: () => void }) {
  const [step, setStep] = useState(0);
  const first = useMemo(() => mcq(`${c.id}-cold1`, "emergency", "You have been called to this patient. What do you do FIRST?", shuffle([
    o("Go to the bedside: look at the patient, check airway, breathing, circulation and vital signs, and a bedside glucose", true, "A quick ‘sick or not sick’ look with vital signs decides how fast you must move. History and examination continue alongside resuscitation."),
    o("Sit down and take a full history from the beginning", false, "Without knowing whether the patient is stable you could be taking a history while they die."),
    o("Order a CT scan and a full set of blood tests", false, "Tests come after a bedside assessment — and only if they could change management."),
    o("Read the old notes for 20 minutes first", false, "Useful later; first look at the patient."),
  ]), ["What is the single most important thing to find out in the first 30 seconds?", "Is this patient stable or sick?", "ABCDE with a bedside glucose.", "Go to the bedside, ABCDE, vital signs, glucose."], "Always begin with: is this patient sick or not sick? Vital signs and a quick ABCDE give you the answer."), [c.id]);
  const stable = useMemo(() => mcq(`${c.id}-cold2`, "emergency", "Having looked at the patient and the vital signs, how would you describe the patient?", shuffle([
    o("Unstable — resuscitate and call for help while I continue to assess", Boolean(c.emergency), c.emergency ? "The vital signs show a life-threatening problem. You treat as you assess." : "The vital signs do not show immediate life threat here."),
    o("Currently stable but potentially serious — assess systematically and reassess often", !c.emergency, !c.emergency ? "Correct: no immediate threat, but things can change, so you plan reassessment." : "This patient is more unwell than that — be prepared to escalate."),
    o("Stable — this can wait until the next ward round", false, "A patient referred urgently by a nurse should not wait without an assessment."),
    o("I cannot decide until I have a complete history", false, "You decide stability from the vital signs and clinical picture, before the history is complete."),
  ]), ["Look at the vital signs: are they dangerous?", "Think of the ABCDE: is any component failing?", c.emergency ? "Several vital signs are significantly abnormal." : "No component is failing at present.", c.emergency ? "Unstable." : "Stable but needs close watching."], "Decide stability early. It dictates whether you resuscitate first or take a careful history."), [c.id, c.emergency]);
  return (
    <>
      <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 sm:p-5">
        <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary"><Siren className="h-4 w-4" /> Cold patient · {c.setting}</p>
        <p className="text-base font-semibold leading-relaxed text-foreground sm:text-lg">{COLD[c.id] ?? "You have been asked to review a patient. Proceed."}</p>
        <p className="mt-2 text-xs text-muted-foreground">No history, examination or results are given. Only what you ask for or would reasonably find will be revealed — and you will not be rescued if you forget something.</p>
      </div>
      <McqCard q={first} label="Step 1" onDone={(r, h) => { onScore("emergency", r.earned); setStep(1); onVitals(); void h; }} />
      {step >= 1 && (
        <>
          <Card className="border-primary/30"><p className="text-[11px] font-bold uppercase tracking-wider text-primary">Bedside observations</p><p className="mt-1 text-sm leading-relaxed text-foreground">{c.ex.vit ?? "Observations recorded."}</p></Card>
          <McqCard q={stable} label="Step 2" onDone={(r) => { onScore("emergency", r.earned); setStep(2); }} />
        </>
      )}
      {step >= 2 && <Btn onClick={onNext}>Take the history <ArrowRight className="h-4 w-4" /></Btn>}
    </>
  );
}

// ------------------------------------------------------------------ problem list
export function ProblemsStage({ c, onScore, onNext, nextLabel }: { c: CaseDef; onScore: OnScore; onNext: () => void; nextLabel: string }) {
  const p = PROBLEMS[c.id];
  const [done, setDone] = useState(0);
  const qs = useMemo<MCQ[]>(() => {
    if (!p) return [];
    const q1 = mcq(`${c.id}-pl1`, "problemlist", "Which are this patient’s ACTIVE problems? (select all that apply)", shuffle([...p.active.map(([n, w]) => o(n, true, w)), ...p.not.map(([n, w]) => o(n, false, w))]),
      ["A problem is something that needs action now — a diagnosis, a complication, a risk or a social issue.", "Real patients usually have several problems at once.", `There are ${p.active.length} active problems in this list.`, `One begins with “${p.active[0][0].slice(0, 22)}…”.`], "A problem list is not just ‘the diagnosis’. Include the immediate threat, the cause, the complications, and the background that affects treatment.");
    const wrong = shuffle(p.active.slice(1)).slice(0, 3);
    const q2 = mcq(`${c.id}-pl2`, "problemlist", "Which ONE do you deal with first?", shuffle([o(p.active[0][0], true, p.active[0][1]), ...wrong.map(([n, w]) => o(n, false, `Important, but it comes later: ${w}`))]),
      ["Which problem could kill the patient soonest?", "ABC before diagnosis.", "Treat the threat to life, then the cause.", `It starts “${p.active[0][0].slice(0, 20)}…”.`], "Prioritise by what threatens life soonest, then what is reversible, then what is chronic.");
    return [q1, q2];
  }, [c, p]);
  if (!p) return <Card><p className="text-sm text-muted-foreground">No problem list is available for this case yet.</p><div className="mt-3"><Btn onClick={onNext}>Continue <ArrowRight className="h-4 w-4" /></Btn></div></Card>;
  return (
    <>
      <Card><h2 className="font-serif text-lg font-bold text-foreground">Formulate the problem list</h2><p className="mt-0.5 text-xs text-muted-foreground">Real patients rarely have one diagnosis. Name every active problem, then decide what to do first.</p></Card>
      <McqCard q={qs[0]} label="Problem list" onDone={(r) => { onScore("problemlist", r.earned); setDone(1); }} />
      {done >= 1 && <McqCard q={qs[1]} label="Prioritise" onDone={(r) => { onScore("problemlist", r.earned); setDone(2); }} />}
      {done >= 2 && <Btn onClick={onNext}>{nextLabel} <ArrowRight className="h-4 w-4" /></Btn>}
    </>
  );
}

// ------------------------------------------------------------------ drug reasoning
export function DrugStage({ c, onScore, onNext, nextLabel }: { c: CaseDef; onScore: OnScore; onNext: () => void; nextLabel: string }) {
  const ids = CASE_DRUGS[c.id] ?? [];
  const drugs = ids.map(drugById).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const qs = useMemo(() => (drugs[0] ? drugQuestions(drugs[0]) : []), [c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [answered, setAnswered] = useState(false);
  if (!drugs.length) return <Card><p className="text-sm text-muted-foreground">No drug questions for this case yet.</p><div className="mt-3"><Btn onClick={onNext}>Continue <ArrowRight className="h-4 w-4" /></Btn></div></Card>;
  const main = drugs[0];
  return (
    <>
      <Card>
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground"><Pill className="h-5 w-5 text-primary" /> Drug reasoning: {main.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">“Give ceftriaxone” is not enough. The consultant wants to know why this drug, how it works, what can go wrong, and who needs a different plan.</p>
      </Card>
      {qs.slice(0, i + 1).map((q, k) => <McqCard key={q.id} q={q} label={`Question ${k + 1} of ${qs.length}`} onDone={(r) => { onScore("pharmacology", r.earned); if (k === i) setAnswered(true); }} />)}
      {answered && i < qs.length - 1 && <Btn onClick={() => { setI((x) => x + 1); setAnswered(false); }}>Next question <ArrowRight className="h-4 w-4" /></Btn>}
      {answered && i >= qs.length - 1 && (
        <>
          <Card className="border-primary/30">
            <h3 className="font-bold text-foreground">Drug card: {main.name}</h3>
            <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
              <div><dt className="inline font-bold text-primary">Class: </dt><dd className="inline">{main.cls}</dd></div>
              <div><dt className="inline font-bold text-primary">Why here: </dt><dd className="inline">{main.why}</dd></div>
              <div><dt className="inline font-bold text-primary">Dose (teaching): </dt><dd className="inline">{main.dose}</dd></div>
              <div><dt className="inline font-bold text-primary">Special groups: </dt><dd className="inline">{main.special}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">Doses vary by guideline and hospital — follow your local protocol.</p>
          </Card>
          {drugs.slice(1).map((d) => (
            <details key={d.id} className="rounded-xl border border-border bg-card p-3 text-xs"><summary className="cursor-pointer font-bold text-foreground">Also in this case: {d.name}</summary><p className="mt-1 leading-relaxed"><b>{d.cls}.</b> {d.why} <br /><b>Mechanism:</b> {d.mech} <br /><b>Adverse effects:</b> {d.ae.join("; ")}. <br /><b>Caution:</b> {d.caution}</p></details>
          ))}
          <Btn onClick={onNext}>{nextLabel} <ArrowRight className="h-4 w-4" /></Btn>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ why ladder (from the case's own chain)
export function WhyStage({ c, onScore, onNext, nextLabel }: { c: CaseDef; onScore: OnScore; onNext: () => void; nextLabel: string }) {
  const rungs: { q: string; model: string }[] = [
    { q: `Why does this patient have these symptoms (${c.chain.symptoms.split(/[,;.]/)[0]})? Explain the mechanism.`, model: c.chain.patho },
    { q: "Which signs at the bedside would prove that mechanism — and why?", model: c.chain.signs },
    { q: "Which test would confirm it, and what would it show?", model: c.chain.ix },
    { q: "Therefore, what must treatment target?", model: c.chain.mx },
  ];
  const [ans, setAns] = useState<string[]>(rungs.map(() => ""));
  const [shown, setShown] = useState(0);
  const [cov, setCov] = useState<number[]>([]);
  const check = (i: number) => {
    const need = stems(rungs[i].model); const have = stems(ans[i]);
    let n = 0; need.forEach((x) => { if (have.has(x)) n++; });
    const v = need.size ? Math.min(1, n / Math.min(need.size, 8)) : 0;
    setCov((a) => { const r = [...a]; r[i] = v; return r; }); onScore("pathophysiology", v); setShown(i + 1);
  };
  return (
    <>
      <Card><h2 className="font-serif text-lg font-bold text-foreground">The “why?” ladder</h2><p className="mt-0.5 text-xs text-muted-foreground">Answer in your own words, then compare. Keep asking why until you reach the physiology — that is what makes a diagnosis stick.</p></Card>
      {rungs.slice(0, shown + 1).map((r, i) => (
        <Card key={i} className={i < shown ? "border-primary/30" : ""}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Why? · step {i + 1} of {rungs.length}</p>
          <p className="mt-1 text-sm font-bold leading-relaxed text-foreground">{r.q}</p>
          <textarea value={ans[i]} disabled={i < shown} onChange={(e) => setAns((a) => a.map((x, k) => (k === i ? e.target.value : x)))} rows={3} placeholder="Type your reasoning…" className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70" />
          {i >= shown ? <div className="mt-2"><Btn onClick={() => check(i)} disabled={wordCount(ans[i]) < 3}>Compare with the model</Btn></div> : (
            <div className="mt-2 rounded-lg bg-primary/5 p-3 text-xs leading-relaxed"><p className="font-bold text-primary">{mark(cov[i] ?? 0)} {Math.round((cov[i] ?? 0) * 100)}% of the key ideas</p><p className="mt-1 text-foreground"><b>Model:</b> {r.model}</p></div>
          )}
        </Card>
      ))}
      {shown >= rungs.length && <Btn onClick={onNext}>{nextLabel} <ArrowRight className="h-4 w-4" /></Btn>}
    </>
  );
}

// ------------------------------------------------------------------ examination report
export function ReportStage({ c, onScore, onNext, nextLabel }: { c: CaseDef; onScore: OnScore; onNext: () => void; nextLabel: string }) {
  const [text, setText] = useState("");
  const [crit, setCrit] = useState<Criterion[] | null>(null);
  const psych = c.rotation === "psychiatry";
  const submit = () => { const g = gradeReport(c, text); setCrit(g); onScore("reporting", g.reduce((s, x) => s + x.score, 0) / g.length); };
  return (
    <>
      <Card>
        <h2 className="font-serif text-lg font-bold text-foreground">{psych ? "Report the mental state examination" : "Report your examination"}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Say it as you would to your consultant: abnormal findings <i>and</i> the relevant normals. “JVP raised at 6 cm, no pallor or jaundice, apex displaced…”</p>
        <textarea value={text} disabled={Boolean(crit)} onChange={(e) => setText(e.target.value)} rows={7} placeholder="On examination, the patient is…" className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70" />
        {!crit && <div className="mt-2"><Btn onClick={submit} disabled={wordCount(text) < 8}>Grade my report</Btn></div>}
      </Card>
      {crit && (
        <>
          <Card className="border-primary/30"><CriteriaList criteria={crit} title="How did you report?" /><div className="mt-3 rounded-lg bg-primary/5 p-3 text-xs leading-relaxed"><p className="font-bold text-primary">A model report</p><p className="mt-1 text-foreground">{modelReport(c)}</p></div><p className="mt-2 text-[10px] text-muted-foreground">Automatic keyword marking — compare your wording with the model rather than treating the percentage as exact.</p></Card>
          <Btn onClick={onNext}>{nextLabel} <ArrowRight className="h-4 w-4" /></Btn>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ present to the consultant
export function PresentStage({ c, onScore, onNext }: { c: CaseDef; onScore: OnScore; onNext: () => void }) {
  const [ans, setAns] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<ReturnType<typeof gradePresentation> | null>(null);
  const model = useMemo(() => modelPresentation(c), [c]);
  const filled = PRESENT_FIELDS.filter((f) => wordCount(ans[f.id] ?? "") >= 3).length;
  const submit = () => { const g = gradePresentation(c, ans); setGrade(g); onScore("presentation", g.total); };
  return (
    <>
      <Card>
        <h2 className="font-serif text-lg font-bold text-foreground">“Present this patient to your consultant.”</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Speak it out loud first, then type it section by section. Use your own notebook facts — the consultant will ask you to justify every claim.</p>
        <div className="mt-3 space-y-3">
          {PRESENT_FIELDS.map((f) => (
            <label key={f.id} className="block">
              <span className="text-xs font-bold text-foreground">{f.label}</span> <span className="text-[11px] text-muted-foreground">— {f.hint}</span>
              <textarea value={ans[f.id] ?? ""} disabled={Boolean(grade)} onChange={(e) => setAns((a) => ({ ...a, [f.id]: e.target.value }))} rows={f.rows} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70" />
            </label>
          ))}
        </div>
        {!grade && <div className="mt-3 flex flex-wrap items-center gap-3"><Btn onClick={submit} disabled={filled < 4}>Grade my presentation</Btn><span className="text-[11px] text-muted-foreground">{filled}/10 sections filled{filled < 4 ? " — fill at least 4" : ""}</span></div>}
      </Card>
      {grade && (
        <>
          <Card className="border-primary/30">
            <div className="flex items-center justify-between gap-3"><h3 className="font-serif text-lg font-bold text-foreground">Your presentation, graded</h3><span className="font-serif text-3xl font-bold text-primary">{Math.round(grade.total * 100)}%</span></div>
            <div className="mt-3"><CriteriaList criteria={grade.criteria} /></div>
            <p className="mt-3 text-[10px] text-muted-foreground">Marking compares your words with the facts of this case (keywords and structure). It cannot judge nuance — read the model answer below and compare honestly.</p>
          </Card>
          <Card>
            <h3 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> An excellent Year 4 presentation</h3>
            <dl className="mt-2 space-y-2 text-xs leading-relaxed sm:text-sm">
              {PRESENT_FIELDS.map((f) => model[f.id] ? <div key={f.id}><dt className="font-bold text-primary">{f.label}</dt><dd className="text-foreground">{model[f.id]}</dd></div> : null)}
            </dl>
          </Card>
          <Btn onClick={onNext}>Case summary <ArrowRight className="h-4 w-4" /></Btn>
        </>
      )}
    </>
  );
}
