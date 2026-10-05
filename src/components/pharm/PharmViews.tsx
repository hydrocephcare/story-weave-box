import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STATIC_NOTES, findStaticNote } from "@/data/staticNotes";
import noteDrugLinks from "@/data/noteDrugLinks.json";
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath } from "@/lib/store";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarDays, ChevronDown, FlaskConical, Search, ShieldAlert, Sparkles } from "lucide-react";
import { ALL_PDRUGS, DRUG_GROUPS, isCancer } from "@/pharm";
import { CONDITIONS, CONDITION_GROUPS } from "@/pharm/conditions";
import { AE_LINKS, CELL_CYCLE, ENZYME_MNEMONICS, INTERACTIONS, ONC_CLASSES, ONC_EMERGENCIES, PREGNANCY_AVOID, PREGNANCY_SAFE, REGIMENS, RENAL_CAUTION, SUFFIXES } from "@/pharm/reference";
import { buildPharmDrill, DRILLS, type DrillKind } from "@/pharm/drills";
import type { PDrug } from "@/pharm/types";
import McqSeries, { ResultCard, type SeriesResult } from "@/components/clinical/McqSeries";
import { saveDrill } from "@/components/clinical/labs/shared";
import { useMistakes } from "@/clinical/mistakes";

const field = "h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}>{children}</button>
);
const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={field} /></div>
);
const Section = ({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) => (
  <section className="space-y-2"><div><h2 className="font-serif text-lg font-bold text-foreground">{title}</h2>{blurb && <p className="text-xs text-muted-foreground">{blurb}</p>}</div>{children}</section>
);
const Disclaimer = () => <p className="flex items-start gap-2 text-[11px] text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Teaching summaries for revision. Doses and regimens differ between hospitals and change over time: always follow your national guideline, the hospital formulary and your consultant or pharmacist.</p>;

// ------------------------------------------------------------------ one drug
/** The notes that mention this drug, so you can go from the drug back to the disease. */
function NotesMentioning({ drugId, term }: { drugId: string; term?: string }) {
  const slugs = (noteDrugLinks.byDrug as Record<string, string[]>)[drugId] ?? [];
  const own = slugs.map((s) => findStaticNote(s)).filter((n): n is NonNullable<ReturnType<typeof findStaticNote>> => Boolean(n));
  // Notes from the database that mention the drug: looked up only when asked for, so a long list of cards stays quick.
  const [db, setDb] = useState<{ id: string; title: string; slug: string | null }[]>([]);
  useEffect(() => {
    if (!term) return;
    let on = true;
    Promise.resolve(supabase.from("articles").select("id,title,slug").eq("published", true).is("deleted_at", null).ilike("content", `%${term}%`).limit(6))
      .then((r) => { if (on) setDb((r.data ?? []) as { id: string; title: string; slug: string | null }[]); })
      .catch(() => { /* offline: the notes written for the site still show */ });
    return () => { on = false; };
  }, [term]);
  if (!own.length && !db.length) return null;
  const chip = "rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:border-primary/50 hover:text-primary";
  return (
    <div>
      <p className="font-bold text-foreground">In your notes</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {own.map((n) => <Link key={n.slug} to={`/notes/${n.slug}`} className={chip}>{n.title.replace(/ \(.*\)$/, "")}</Link>)}
        {db.map((a) => <Link key={a.id} to={buildBlogPath({ id: a.id, title: a.title, slug: a.slug ?? undefined })} className={chip}>{a.title.length > 60 ? `${a.title.slice(0, 58)}…` : a.title}</Link>)}
      </div>
    </div>
  );
}

export function DrugCard({ d, defaultOpen = false, lookupNotes = false }: { d: PDrug; defaultOpen?: boolean; lookupNotes?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3.5 sm:p-4">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-serif text-base font-bold text-foreground">{d.name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isCancer(d.group) ? "bg-rose-500/15 text-rose-700" : "bg-primary/10 text-primary"}`}>{d.cls}</span></span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{d.why}</span>
        </span>
        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border px-3.5 pb-4 pt-3 text-xs leading-relaxed sm:px-4 sm:text-sm">
        <div><p className="font-bold text-primary">How it works</p><p className="text-foreground">{d.mech}</p></div>
        <div><p className="font-bold text-rose-700">Adverse effects</p><ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-foreground">{d.ae.map((a) => <li key={a}>{a}</li>)}</ul></div>
        <div className="rounded-lg bg-amber-500/10 p-2.5"><p className="font-bold text-amber-800">Avoid or take care when</p><p className="text-foreground">{d.caution}</p></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/50 p-2.5"><p className="font-bold text-foreground">Dose (teaching)</p><p className="text-muted-foreground">{d.dose}</p></div>
          <div className="rounded-lg bg-muted/50 p-2.5"><p className="font-bold text-foreground">Kidney, liver, pregnancy, children</p><p className="text-muted-foreground">{d.special}</p></div>
        </div>
        <NotesMentioning drugId={d.id} term={lookupNotes ? d.name.split(/[\/( ]/)[0].toLowerCase() : undefined} />
        <Link to={`/pharmacology/drug/${d.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Test me on {d.name.split(" ")[0]} <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </details>
  );
}

// ------------------------------------------------------------------ browse
export function BrowseView() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const today = ALL_PDRUGS[Math.floor(Date.now() / 86_400_000) % ALL_PDRUGS.length];
  const list = useMemo(() => ALL_PDRUGS.filter((d) => (group === "all" || d.group === group) && (!q || `${d.name} ${d.cls} ${d.why} ${d.group}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name)), [q, group]);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5"><p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary"><CalendarDays className="h-4 w-4" /> Drug of the day</p><div className="mt-2"><DrugCard d={today} /></div></div>
      <SearchBox value={q} onChange={setQ} placeholder={`Search ${ALL_PDRUGS.length} drugs by name, class or use…`} />
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }} role="group" aria-label="Drug group">
        <Chip on={group === "all"} onClick={() => setGroup("all")}>All</Chip>
        {DRUG_GROUPS.map((g) => <Chip key={g} on={group === g} onClick={() => setGroup(g)}>{g.replace("Cancer: ", "🎗 ")}</Chip>)}
      </div>
      <p className="text-xs font-semibold text-muted-foreground">{list.length} drug{list.length === 1 ? "" : "s"}</p>
      <ul className="space-y-2">{list.map((d) => <li key={d.id}><DrugCard d={d} /></li>)}</ul>
      {list.length === 0 && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No drug matches that search.</p>}
      <Disclaimer />
    </div>
  );
}

// ------------------------------------------------------------------ cancer drugs
export function CancerView() {
  const cancer = ALL_PDRUGS.filter((d) => isCancer(d.group));
  const groups = ["Cancer: cytotoxic chemotherapy", "Cancer: hormonal and targeted", "Cancer: supportive care"];
  return (
    <div className="space-y-7">
      <Section title="How chemotherapy works" blurb="Cancer cells divide faster than most normal cells, so drugs that attack dividing cells hit the tumour — and the marrow, gut lining and hair follicles too. That one idea explains most side effects.">
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[4rem_12rem_minmax(0,1fr)]"><span>Phase</span><span className="hidden sm:block">What happens</span><span>Drugs that act here</span></div>
          {CELL_CYCLE.map((r) => <div key={r.phase} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 border-t border-border px-3 py-2 text-xs sm:grid-cols-[4rem_12rem_minmax(0,1fr)]"><span className="font-bold text-primary">{r.phase}</span><span className="hidden text-muted-foreground sm:block">{r.what}</span><span className="text-foreground"><span className="text-muted-foreground sm:hidden">{r.what}. </span>{r.drugs}</span></div>)}
        </div>
      </Section>

      <Section title="The classes at a glance" blurb="Know the class, and you can predict the toxicity.">
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ONC_CLASSES.map((c) => <li key={c.cls} className="min-w-0 rounded-xl border border-border bg-card p-3 text-xs leading-relaxed"><p className="font-serif text-sm font-bold text-foreground">{c.cls}</p><p className="text-primary">{c.drugs}</p><p className="mt-1 text-muted-foreground"><b className="text-foreground">Mechanism:</b> {c.mech}</p><p className="text-rose-700"><b>Signature toxicity:</b> {c.signature}</p></li>)}
        </ul>
      </Section>

      <Section title="Common regimens" blurb="Names you will hear on the oncology ward round.">
        <ul className="space-y-2">
          {REGIMENS.map((r) => (
            <li key={r.cancer}><details className="group rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm"><span><b className="text-foreground">{r.cancer}</b> <span className="text-xs font-bold text-primary">· {r.regimen}</span></span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
              <div className="space-y-1 border-t border-border px-3 pb-3 pt-2 text-xs leading-relaxed"><p><b>Drugs:</b> {r.drugs}</p><p className="text-rose-700"><b>Watch for:</b> {r.watch}</p><p className="text-muted-foreground">{r.note}</p></div></details></li>
          ))}
        </ul>
      </Section>

      <Section title="Oncology emergencies" blurb="Recognise them, and know the first move.">
        <ul className="space-y-2">
          {ONC_EMERGENCIES.map((e) => (
            <li key={e.name}><details className="group rounded-xl border border-rose-500/30 bg-rose-500/5"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-bold text-foreground"><span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-600" /> {e.name}</span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
              <div className="space-y-1 border-t border-rose-500/20 px-3 pb-3 pt-2 text-xs leading-relaxed"><p><b>Recognise:</b> {e.recognise}</p><p><b className="text-rose-700">Do:</b> {e.act}</p></div></details></li>
          ))}
        </ul>
      </Section>

      {groups.map((g) => (
        <Section key={g} title={g.replace("Cancer: ", "")} blurb={g.endsWith("chemotherapy") ? "Tap a drug for mechanism, toxicity, cautions and dose." : undefined}>
          <ul className="space-y-2">{cancer.filter((d) => d.group === g).map((d) => <li key={d.id}><DrugCard d={d} /></li>)}</ul>
        </Section>
      ))}

      <Link to="/pharmacology?tab=practice&drill=toxicity" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"><Sparkles className="h-4 w-4" /> Quiz me on cancer-drug toxicities</Link>
      <Disclaimer />
    </div>
  );
}

// ------------------------------------------------------------------ conditions
export function ConditionsView() {
  const [sp] = useSearchParams();
  const focus = sp.get("c");
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const li = document.getElementById(`cond-${focus}`);
      if (!li) return;
      li.querySelector("details")?.setAttribute("open", "");
      li.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 150);
    return () => clearTimeout(t);
  }, [focus]);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");
  const list = CONDITIONS.filter((c) => (group === "all" || c.group === group) && (!q || `${c.name} ${c.first.join(" ")} ${c.alt.join(" ")} ${c.pearl}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">For each common condition: <b>what to give first, what else, what to avoid, what to monitor</b> — and one pearl. {CONDITIONS.length} conditions, from hypertension to febrile neutropenia.</p>
      <SearchBox value={q} onChange={setQ} placeholder="Search conditions or drugs…" />
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }} role="group" aria-label="Condition group">
        <Chip on={group === "all"} onClick={() => setGroup("all")}>All</Chip>
        {CONDITION_GROUPS.map((g) => <Chip key={g} on={group === g} onClick={() => setGroup(g)}>{g}</Chip>)}
      </div>
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} id={`cond-${c.id}`} className="scroll-mt-24">
            <details className="group rounded-2xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3.5"><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.group}</span><span className="block font-serif text-base font-bold text-foreground">{c.name}</span><span className="mt-0.5 block text-xs text-primary">{c.first[0]}</span></span><ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
              <div className="space-y-2.5 border-t border-border px-3.5 pb-4 pt-3 text-xs leading-relaxed sm:text-sm">
                <div className="rounded-lg bg-emerald-500/10 p-2.5"><p className="font-bold text-emerald-800">First-line</p><ul className="list-disc space-y-0.5 pl-4 text-foreground">{c.first.map((x) => <li key={x}>{x}</li>)}</ul></div>
                {c.alt.length > 0 && <div className="rounded-lg bg-sky-500/10 p-2.5"><p className="font-bold text-sky-800">Alternatives and add-ons</p><ul className="list-disc space-y-0.5 pl-4 text-foreground">{c.alt.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                <div className="rounded-lg bg-rose-500/10 p-2.5"><p className="font-bold text-rose-800">Avoid</p><ul className="list-disc space-y-0.5 pl-4 text-foreground">{c.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>
                <p><b className="text-foreground">Monitor:</b> <span className="text-muted-foreground">{c.monitor}</span></p>
                <p className="rounded-lg bg-primary/5 p-2.5 text-foreground"><b className="text-primary">Pearl:</b> {c.pearl}</p>
                {STATIC_NOTES.filter((n) => n.condition === c.id).map((n) => <Link key={n.slug} to={`/notes/${n.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">Read the note: {n.title} →</Link>)}
              </div>
            </details>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Nothing matches that search.</p>}
      <Disclaimer />
    </div>
  );
}

// ------------------------------------------------------------------ cheat sheets
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border" style={{ ["--cols" as string]: head.length }}>
      <div className="hidden gap-x-3 bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:grid sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]">{head.map((h) => <span key={h}>{h}</span>)}</div>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-x-3 gap-y-0.5 border-t border-border px-3 py-2 text-xs leading-relaxed first:border-t-0 sm:first:border-t sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]">
          {r.map((c, k) => <span key={k} className={`min-w-0 ${k === 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}><span className="mr-1 text-[10px] font-bold uppercase text-primary sm:hidden">{k > 0 ? head[k] + ": " : ""}</span>{c}</span>)}
        </div>
      ))}
    </div>
  );
}

export function CheatView() {
  const [tab, setTab] = useState<"suffix" | "interact" | "ae" | "preg" | "renal" | "enzyme">("suffix");
  const [q, setQ] = useState("");
  const f = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const tabs = [["suffix", "Name endings"], ["interact", "Interactions"], ["ae", "Side effect → drug"], ["preg", "Pregnancy"], ["renal", "Kidney"], ["enzyme", "Enzymes"]] as const;
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }} role="tablist">{tabs.map(([id, l]) => <Chip key={id} on={tab === id} onClick={() => { setTab(id); setQ(""); }}>{l}</Chip>)}</div>
      {(tab === "suffix" || tab === "interact" || tab === "ae") && <SearchBox value={q} onChange={setQ} placeholder="Filter…" />}
      {tab === "suffix" && <Table head={["Ending", "Class", "Examples"]} rows={SUFFIXES.filter((s) => f(`${s.stem} ${s.meaning} ${s.example}`)).map((s) => [s.stem, s.meaning, s.example])} />}
      {tab === "interact" && <Table head={["Drug", "With", "What happens", "Why"]} rows={INTERACTIONS.filter((i) => f(`${i.a} ${i.b} ${i.effect} ${i.why}`)).map((i) => [i.a, i.b, i.effect, i.why])} />}
      {tab === "ae" && <Table head={["Side effect", "Drugs", "Note"]} rows={AE_LINKS.filter((a) => f(`${a.effect} ${a.drugs.join(" ")} ${a.note}`)).map((a) => [a.effect, a.drugs.join("; "), a.note])} />}
      {tab === "preg" && (
        <div className="space-y-3">
          <Table head={["Avoid in pregnancy", "Risk"]} rows={PREGNANCY_AVOID.map((p) => [p.drug, p.harm])} />
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3"><p className="text-xs font-bold text-emerald-800">Generally safe choices</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground">{PREGNANCY_SAFE.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
      )}
      {tab === "renal" && <Table head={["Drug", "In kidney impairment"]} rows={RENAL_CAUTION.map((r) => [r.drug, r.action])} />}
      {tab === "enzyme" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.values(ENZYME_MNEMONICS).map((m) => <div key={m.title} className="rounded-2xl border border-border bg-card p-4"><p className="font-serif text-base font-bold text-foreground">{m.title}</p><p className="mt-1 text-sm font-bold text-primary">{m.mnemonic}</p><p className="mt-2 text-xs leading-relaxed text-foreground">{m.words}</p></div>)}
        </div>
      )}
      <Disclaimer />
    </div>
  );
}

// ------------------------------------------------------------------ practice
export function PracticeView({ initial }: { initial?: DrillKind }) {
  const [kind, setKind] = useState<DrillKind | null>(initial ?? null);
  const [round, setRound] = useState(0);
  const [res, setRes] = useState<SeriesResult | null>(null);
  const mistakes = useMistakes();
  const qs = useMemo(() => (kind ? buildPharmDrill(kind, 10) : []), [kind, round]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kind) return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {DRILLS.map((d) => <li key={d.id}><button type="button" onClick={() => { setKind(d.id); setRes(null); }} className="group flex h-full w-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50"><span className="flex items-center gap-2 font-serif text-base font-bold text-foreground"><FlaskConical className="h-4 w-4 text-primary" /> {d.label}</span><span className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.blurb}</span></button></li>)}
      </ul>
      <Link to="/clinical/mistakes" className="flex items-center justify-between rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm font-bold text-foreground">Mistakes notebook <span className="text-xs text-amber-800">{mistakes.length} to review →</span></Link>
    </div>
  );
  const info = DRILLS.find((d) => d.id === kind)!;
  return (
    <div className="space-y-4" key={`${kind}-${round}`}>
      <div className="flex items-center justify-between gap-2"><p className="font-serif text-lg font-bold text-foreground">{info.label}</p><button type="button" onClick={() => { setKind(null); setRes(null); }} className="text-xs font-bold text-primary hover:underline">Change drill</button></div>
      {!res ? <McqSeries qs={qs} labels={qs.map((_, i) => `Question ${i + 1} of ${qs.length}`)} onFinish={(r) => { setRes(r); saveDrill(`pharm-${kind}`, "pharm", "pharmacology", r); }} finishLabel="See my score" /> : (
        <>
          <ResultCard title={`${info.label} · complete`} pct={res.pct}><p className="mt-1 text-xs text-muted-foreground">{res.hints} hint{res.hints === 1 ? "" : "s"} used. Questions you missed are saved in your mistakes notebook.</p></ResultCard>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setRes(null); setRound((r) => r + 1); }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Another round</button><Link to="/clinical/mistakes" className="rounded-full border border-border px-5 py-2.5 text-sm font-bold">Mistakes notebook ({mistakes.length})</Link></div>
        </>
      )}
    </div>
  );
}
