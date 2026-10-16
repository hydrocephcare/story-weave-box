import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, Copy, ExternalLink, Loader2, MessageCircle, Rocket } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { parseContestQuestions } from "@/lib/contest-parse";
import {
  configureContestRound, createContest, createContestRound, importContestQuestions, importExamPaperToContestRound, loadAdminContests, loadAdminExamPapers,
  loadAllContestUniversities, setContestUniversityScope, updateContestStage, type AdminExamPaper, type ContestRecord, type ContestUniversity,
} from "@/lib/contest-store";
import ContestPoster from "@/components/ContestPoster";

const input = "mt-2 w-full rounded-lg border bg-background px-3 py-2.5 text-sm";
const pad = (n: number) => String(n).padStart(2, "0");
/** A datetime-local value for "tomorrow at 20:00", the usual evening slot. */
const tomorrowEvening = () => { const d = new Date(Date.now() + 86_400_000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T20:00`; };

/** One page that builds a whole contest: name, who, questions, when. Then one button publishes it. */
export default function ContestQuick() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [title, setTitle] = useState("");
  const [years, setYears] = useState<number[]>([1, 2, 3]);
  const [limited, setLimited] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [universities, setUniversities] = useState<(ContestUniversity & { active: boolean })[]>([]);
  const [source, setSource] = useState<"exam" | "paste">("exam");
  const [papers, setPapers] = useState<AdminExamPaper[]>([]);
  const [search, setSearch] = useState("");
  const [examId, setExamId] = useState("");
  const [paste, setPaste] = useState("");
  const [start, setStart] = useState(tomorrowEvening);
  const [minutes, setMinutes] = useState(30);
  const [autoVerify, setAutoVerify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<ContestRecord | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    void Promise.all([loadAllContestUniversities(), loadAdminExamPapers()]).then(([u, p]) => { setUniversities(u.filter((x) => x.active)); setPapers(p); }).catch((e) => setError(e?.message || "Could not load universities and exams."));
  }, [isAdmin]);

  const shown = useMemo(() => { const q = search.trim().toLowerCase(); return (q ? papers.filter((p) => `${p.kind || ""} ${p.title} ${p.category}`.toLowerCase().includes(q)) : papers).slice(0, 60); }, [papers, search]);
  const parsed = useMemo(() => (source === "paste" ? parseContestQuestions(paste) : null), [source, paste]);
  const questionsReady = source === "exam" ? Boolean(examId) : (parsed?.questions.length ?? 0) > 0;
  const problems = [
    title.trim().length < 4 && "Give the contest a name.",
    !years.length && "Pick at least one year.",
    limited && chosen.length < 2 && "Pick at least 2 universities, or choose All universities.",
    !questionsReady && (source === "exam" ? "Choose an exam for the questions." : "Paste the questions."),
    !start && "Pick the start date and time.",
  ].filter(Boolean) as string[];

  if (!authLoading && !isAdmin) return <Navigate to="/login" replace />;
  if (authLoading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  async function publish() {
    setBusy(true); setError("");
    let at = "start";
    const mark = (t: string) => { at = t; setStep(t); };
    try {
      const startsAt = new Date(start).toISOString();
      const endsAt = new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
      mark("Creating the contest…");
      const created = await createContest({ title: title.trim(), subtitle: "", subjects: [], years, format: "One round", registrationOpensAt: new Date().toISOString(), registrationClosesAt: startsAt, startsAt, shareImageUrl: null, published: true });
      mark("Setting who can enter…");
      await setContestUniversityScope(created.id, limited ? chosen : [], autoVerify);
      mark("Adding the round…");
      const round = await createContestRound(created.id, "Round 1", minutes * 60);
      mark("Adding the questions…");
      if (source === "exam") await importExamPaperToContestRound(round.id, examId);
      else await importContestQuestions(round.id, parsed!.questions);
      mark("Setting the time…");
      await configureContestRound({ roundId: round.id, status: "scheduled", startsAt, endsAt, durationSeconds: minutes * 60, tabSwitchLimit: 3, focusLossLimit: 3, autoEliminate: true });
      mark("Opening registration…");
      await updateContestStage(created.id, "registration");
      const all = await loadAdminContests();
      setDone(all.find((c) => c.id === created.id) ?? null);
    } catch (e: any) { setError(`${e?.message || "Something went wrong."} (stopped at: ${at.replace("…", "")}). Nothing is lost: open the contest list to finish or delete it.`); }
    finally { setBusy(false); setStep(""); }
  }

  if (done) {
    const url = `https://www.ompathstudy.com/contests/${done.slug}`;
    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
          <p className="flex items-center gap-2 text-sm font-bold text-primary"><Rocket className="h-4 w-4" /> Contest is live for registration</p>
          <h1 className="mt-3 font-serif text-3xl font-bold">{done.title}</h1>
          <p className="mt-2 break-all text-sm text-muted-foreground">{url}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={`https://wa.me/?text=${encodeURIComponent(`${done.title} on Ompath Study. Represent your university: ${url}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"><MessageCircle className="h-4 w-4" /> Share on WhatsApp</a>
            <button type="button" onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}</button>
            <Link to={`/contests/${done.slug}`} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold"><ExternalLink className="h-4 w-4" /> View page</Link>
          </div>
          <div className="mt-5 rounded-xl bg-[#071315] p-4"><ContestPoster contest={done} universities={universities} /></div>
          <p className="mt-5 text-sm text-muted-foreground">At the start time the round opens by itself and closes after {minutes} minutes. Students are admitted automatically. Anything else (more rounds, appeals, results) is in <Link to="/admin/contests/setup" className="font-semibold text-primary underline">Advanced setup</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="font-serif text-3xl font-bold">New contest</h1>
      <p className="mt-2 text-sm text-muted-foreground">Four short answers, then one button. You can still change anything later in <Link to="/admin/contests/setup" className="font-semibold text-primary underline">Advanced setup</Link>.</p>

      <section className="mt-6 rounded-2xl border bg-card p-5">
        <h2 className="font-bold">1. Name and years</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. UoN vs MKU Anatomy Showdown" className={input} />
        <div className="mt-3 flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6].map((y) => <button key={y} type="button" onClick={() => setYears((c) => (c.includes(y) ? c.filter((x) => x !== y) : [...c, y].sort()))} className={`rounded-lg border px-3 py-2 text-xs font-bold ${years.includes(y) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>Year {y}</button>)}</div>
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-bold">2. Who can join</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          <button type="button" onClick={() => setLimited(false)} className={`rounded-lg border px-3 py-2 ${!limited ? "border-primary bg-primary/10 text-primary" : ""}`}>All universities</button>
          <button type="button" onClick={() => setLimited(true)} className={`rounded-lg border px-3 py-2 ${limited ? "border-primary bg-primary/10 text-primary" : ""}`}>Only some (2, 3, …)</button>
        </div>
        {limited && <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">{universities.map((u) => <li key={u.id}><label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={chosen.includes(u.id)} onChange={() => setChosen((c) => (c.includes(u.id) ? c.filter((x) => x !== u.id) : [...c, u.id]))} className="accent-primary" /><span className="truncate">{u.name}</span></label></li>)}</ul>}
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-bold">3. Questions</h2>
        <div className="mt-3 flex gap-2 text-sm font-semibold">
          <button type="button" onClick={() => setSource("exam")} className={`rounded-lg border px-3 py-2 ${source === "exam" ? "border-primary bg-primary/10 text-primary" : ""}`}>Use an exam on the site</button>
          <button type="button" onClick={() => setSource("paste")} className={`rounded-lg border px-3 py-2 ${source === "paste" ? "border-primary bg-primary/10 text-primary" : ""}`}>Paste my own</button>
        </div>
        {source === "exam" ? (
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exams, e.g. anatomy" className={input} />
            <select size={6} value={examId} onChange={(e) => setExamId(e.target.value)} className={`${input} h-40`}>{shown.map((p) => <option key={p.id} value={p.id}>{p.kind ? `[${p.kind}] ` : ""}{p.title} · {p.question_count} Qs</option>)}</select>
            {!shown.length && <p className="mt-2 text-xs text-muted-foreground">No exam matches.</p>}
          </>
        ) : (
          <>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} placeholder={"1. Question text\nA. Option\nB. Option *   (put * after the right one)\nC. Option\nD. Option"} className={`${input} font-mono`} />
            <p className="mt-1 text-xs text-muted-foreground">{parsed?.questions.length ?? 0} questions recognised{parsed?.warnings.length ? ` · ${parsed.warnings[0]}` : ""}</p>
          </>
        )}
      </section>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-bold">4. When</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Starts (Nairobi time)<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={input} /></label>
          <label className="text-sm font-semibold">Length in minutes<input type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(Math.max(5, Math.min(240, Number(e.target.value) || 30)))} className={input} /></label>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={autoVerify} onChange={(e) => setAutoVerify(e.target.checked)} className="mt-1 accent-primary" /> <span><strong>Admit students automatically</strong> when they register, so you do not approve them one by one.</span></label>
      </section>

      {error && <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>}
      {problems.length > 0 && <ul className="mt-4 space-y-1 text-sm text-muted-foreground">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
      <button type="button" disabled={busy || problems.length > 0} onClick={() => void publish()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground disabled:opacity-40">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />} {busy ? step || "Working…" : "Publish contest"}
      </button>
    </div>
  );
}
