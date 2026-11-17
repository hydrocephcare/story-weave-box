import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, BookOpen, CheckCircle2, CirclePlus, GraduationCap, Loader2, MessageSquare, RefreshCw, Send, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Question = { id: string; question: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: number; explanation: string; is_active: boolean; created_at: string };
type Student = { id: string; phone_number: string; full_name: string; study_level: string; sms_opt_in: boolean; created_at: string };
type DashboardData = { students: Student[]; questions: Question[]; stats: { students: number; optedIn: number; questions: number; attempts: number; correct: number }; recent: { id: string; student_id: string; question_id: string; selected_option: number; is_correct: boolean; attempted_at: string }[] };
const emptyForm = { question: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "1", explanation: "", is_active: false };
const field = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

export default function OmpathLiteAdmin() {
  const { session } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"questions" | "students" | "activity">("questions");

  const api = useCallback(async (method = "GET", body?: unknown) => {
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
    const response = await fetch("/api/ompath-lite-admin", {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }, [session?.access_token]);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api()); } catch (e) { setError(e instanceof Error ? e.message : "Could not load Lite data."); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const saveQuestion = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await api("POST", { ...form, correct_option: Number(form.correct_option) });
      setForm(emptyForm); setNotice("Question saved."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save question."); }
    finally { setSaving(false); }
  };

  const toggleQuestion = async (q: Question) => {
    setError(""); setNotice("");
    try { await api("PATCH", { id: q.id, is_active: !q.is_active }); setNotice("Question status updated."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update question."); }
  };

  const accuracy = data?.stats.attempts ? Math.round((data.stats.correct / data.stats.attempts) * 100) : 0;
  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Main admin</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">OmpathStudy · Hackathon build</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-foreground sm:text-4xl">OmpathStudy Lite</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Manage the USSD question bank, enrolled learners and learning activity for students using basic phones.</p>
        </div>
        <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-foreground">{notice}</div>}

      {loading ? <div className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading Lite dashboard…</div> : data && <>
        <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Registered learners", value: data.stats.students, icon: Users, sub: `${data.stats.optedIn} opted into SMS` },
            { label: "Question bank", value: data.stats.questions, icon: BookOpen, sub: "Saved medical MCQs" },
            { label: "Answers submitted", value: data.stats.attempts, icon: Activity, sub: "Recorded attempts" },
            { label: "Answer accuracy", value: `${accuracy}%`, icon: CheckCircle2, sub: `${data.stats.correct} correct responses` },
          ].map((item) => <div key={item.label} className="rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs font-medium sm:text-sm">{item.label}</span><item.icon className="h-4 w-4" /></div><p className="mt-3 text-3xl font-bold tabular-nums text-foreground">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.sub}</p></div>)}
        </div>

        <div className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3">
          {(["questions", "students", "activity"] as const).map((key) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{key === "activity" ? "Learning activity" : key}</button>)}
        </div>

        {tab === "questions" && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <form onSubmit={saveQuestion} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2"><CirclePlus className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Add a medical MCQ</h2></div>
            <label className="mb-2 block text-sm font-medium">Question</label><textarea className={field + " mb-4 min-h-24"} value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="Enter the clinical or basic science question…" required />
            {(["option_a", "option_b", "option_c", "option_d"] as const).map((key, i) => <div key={key} className="mb-3"><label className="mb-1.5 block text-sm font-medium">Option {String.fromCharCode(65+i)}</label><input className={field} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} required /></div>)}
            <label className="mb-2 mt-2 block text-sm font-medium">Correct answer</label><select className={field + " mb-4"} value={form.correct_option} onChange={e => setForm({ ...form, correct_option: e.target.value })}>{[1,2,3,4].map(n => <option key={n} value={n}>Option {String.fromCharCode(64+n)}</option>)}</select>
            <label className="mb-2 block text-sm font-medium">Explanation</label><textarea className={field + " mb-4 min-h-24"} value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} placeholder="Explain why the answer is correct…" required />
            <label className="mb-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Make available on USSD immediately</label>
            <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Save question</button>
          </form>
          <section className="space-y-3"><h2 className="text-lg font-semibold">Question bank <span className="text-sm font-normal text-muted-foreground">({data.questions.length})</span></h2>
            {data.questions.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No questions yet. Add the first MCQ.</p>}
            {data.questions.map(q => <article key={q.id} className="rounded-xl border border-border bg-card p-4"><div className="mb-2 flex flex-wrap items-start justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${q.is_active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{q.is_active ? "Live on USSD" : "Draft / inactive"}</span><button onClick={() => void toggleQuestion(q)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">{q.is_active ? "Deactivate" : "Activate"}</button></div><h3 className="font-medium leading-relaxed">{q.question}</h3><ol className="mt-3 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">{[q.option_a,q.option_b,q.option_c,q.option_d].map((v,i) => <li key={i} className={i+1===q.correct_option ? "font-semibold text-emerald-700" : ""}>{String.fromCharCode(65+i)}. {v}{i+1===q.correct_option ? " ✓" : ""}</li>)}</ol><p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">{q.explanation}</p></article>)}
          </section>
        </div>}

        {tab === "students" && <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border p-4"><h2 className="font-semibold">Registered learners</h2><p className="mt-1 text-xs text-muted-foreground">Latest 200 records. Phone numbers are displayed only to administrators.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Learner</th><th className="p-3">Phone</th><th className="p-3">Study level</th><th className="p-3">SMS consent</th><th className="p-3">Registered</th></tr></thead><tbody>{data.students.map(s => <tr key={s.id} className="border-t border-border"><td className="p-3 font-medium">{s.full_name}</td><td className="p-3 tabular-nums">{s.phone_number}</td><td className="p-3">{s.study_level}</td><td className="p-3">{s.sms_opt_in ? "Subscribed" : "Not subscribed"}</td><td className="p-3 text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!data.students.length && <p className="p-6 text-sm text-muted-foreground">No learners have registered yet.</p>}</div></section>}

        {tab === "activity" && <section className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /><h2 className="font-semibold">Recent answer submissions</h2></div>{data.recent.length ? <div className="space-y-3">{data.recent.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0"><div><p className="text-sm font-medium">Question attempt</p><p className="mt-1 text-xs text-muted-foreground">Selected option {a.selected_option} · {new Date(a.attempted_at).toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${a.is_correct ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{a.is_correct ? "Correct" : "Incorrect"}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No answers submitted yet.</p>}</section>}
      </>}
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground"><MessageSquare className="h-4 w-4" /> SMS sending is a separate integration step; this dashboard currently manages consent and learner records.</div>
    </div>
  );
}
