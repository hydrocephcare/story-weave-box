import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, Sparkles } from "lucide-react";
import { useAiStore } from "@/lib/ompathAiStore";
import { useAuth } from "@/hooks/useAuth";
import { Answer } from "@/components/ai/AnswerText";

interface Mcq { q: string; options: string[]; answer: number; why: string }
interface Saved { week: string; topics: string[]; mcqs: Mcq[]; essays: string[] }

const MIN_QUESTIONS = 3; // nothing is made for someone who has hardly asked anything
const weekKey = () => { const d = new Date(); const j = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-w${Math.ceil(((+d - +j) / 86_400_000 + j.getDay() + 1) / 7)}`; };
const skip = /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|nice|cool)\b/i;

/** The topics one student asked Ompath AI about in the last seven days (kept per account / device, never shared). */
const topicsOf = (turns: { q: string; at: number }[]) => {
  const since = Date.now() - 7 * 86_400_000;
  const seen = new Set<string>(); const out: string[] = [];
  for (const t of turns) {
    if (t.at < since) continue;
    const q = t.q.replace(/\s+/g, " ").trim();
    if (q.length < 6 || skip.test(q)) continue;
    const k = q.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(q.slice(0, 120));
  }
  return out;
};

export function parseAssessment(text: string): { mcqs: Mcq[]; essays: string[] } {
  const mcqs: Mcq[] = []; const essays: string[] = [];
  const blocks = text.split(/\n(?=\s*(?:\*\*)?(?:Q|Question)\s*\d+|\s*\d+[.)]\s+)/i);
  for (const b of blocks) {
    const opts = [...b.matchAll(/^\s*\(?([A-E])[.)]\s+(.+)$/gm)].map((m) => m[2].replace(/\*\*/g, "").trim());
    const ans = b.match(/Answer\s*:?\s*\**\s*\(?([A-E])/i)?.[1];
    const why = b.match(/(?:Why|Explanation)\s*:?\s*\**\s*(.+)/i)?.[1]?.replace(/\*\*/g, "").trim() ?? "";
    const q = b.split("\n")[0].replace(/^\s*(?:\*\*)?(?:Q|Question)?\s*\d+[.):]?\s*(?:\*\*)?/i, "").replace(/\*\*/g, "").trim();
    if (opts.length >= 4 && ans && q.length > 8) mcqs.push({ q, options: opts.slice(0, 5), answer: "ABCDE".indexOf(ans.toUpperCase()), why });
  }
  for (const m of text.matchAll(/^\s*(?:\*\*)?(?:Essay|SAQ|Short answer)\s*\d+[.):]?\s*(?:\*\*)?\s*(.{12,})$/gim)) essays.push(m[1].replace(/\*\*/g, "").trim());
  return { mcqs, essays };
}

async function ask(prompt: string): Promise<string> {
  const r = await fetch("/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: prompt, history: [], sources: [] }) });
  if (!r.ok || !r.body) throw new Error("off");
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) { const d = l.trim(); if (!d.startsWith("data:")) continue; const p = d.slice(5).trim(); if (!p || p === "[DONE]") continue; try { const x = JSON.parse(p)?.choices?.[0]?.delta?.content; if (x) out += x; } catch { /* partial */ } }
  }
  if (!out.trim()) throw new Error("empty");
  return out;
}

/** /my-week: a short assessment made from what this student asked Ompath AI this week. Made once a week, only when there is enough to test. */
export default function MyWeek() {
  const { user } = useAuth();
  const store = useAiStore();
  const topics = useMemo(() => topicsOf(store.sessions.flatMap((s) => s.turns)), [store.sessions]);
  const storeKey = `ompath_week_${user?.id ?? "guest"}`;
  const [saved, setSaved] = useState<Saved | null>(() => { try { const v = JSON.parse(localStorage.getItem(storeKey) ?? "null") as Saved | null; return v?.week === weekKey() ? v : null; } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<Record<number, number>>({});

  const make = async () => {
    setBusy(true); setErr("");
    const list = topics.slice(0, 12);
    try {
      const n = Math.min(10, Math.max(5, list.length * 2));
      const text = await ask(`A medical student asked about these topics this week:\n${list.map((t) => `- ${t}`).join("\n")}\n\nWrite a revision assessment on exactly those topics: ${n} multiple-choice questions, then 2 short-answer questions. Use this exact format and nothing else.\nQ1. question text\nA. option\nB. option\nC. option\nD. option\nE. option\nAnswer: B\nWhy: one sentence\n\nAfter the MCQs write:\nEssay 1. question\nEssay 2. question`);
      const { mcqs, essays } = parseAssessment(text);
      if (mcqs.length < 3) throw new Error("short");
      const s: Saved = { week: weekKey(), topics: list, mcqs, essays };
      setSaved(s); setPicked({});
      try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch { /* storage blocked */ }
    } catch { setErr("The assessment could not be made just now. Try again in a few minutes."); }
    setBusy(false);
  };
  useEffect(() => { setPicked({}); }, [saved?.week]);

  const score = saved ? saved.mcqs.filter((m, i) => picked[i] === m.answer).length : 0;
  const done = saved ? Object.keys(picked).length === saved.mcqs.length : false;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Helmet><title>My week — Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your week</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">What you studied, tested</h1>
      {topics.length < MIN_QUESTIONS && !saved ? (
        <div className="mt-6">
          <p className="text-[17px] text-muted-foreground">Ask Ompath AI a few questions this week and an assessment on exactly those topics will appear here. So far this week: <b>{topics.length}</b>.</p>
          <Link to="/search" className="mt-4 inline-block font-bold text-primary hover:underline">Search a topic →</Link>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[17px] text-muted-foreground">Made from the {saved?.topics.length ?? topics.length} things you asked Ompath AI in the last seven days. Only you see this.</p>
          <ul className="mt-3 flex flex-wrap gap-2">{(saved?.topics ?? topics).slice(0, 12).map((t) => <li key={t} className="rounded-full border border-border px-3 py-1 text-sm">{t}</li>)}</ul>
          {!saved && <button type="button" disabled={busy} onClick={() => void make()} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Make my assessment</button>}
          {err && <p className="mt-3 text-sm text-destructive" role="status">{err}</p>}
          {saved && (
            <div className="mt-8 space-y-6">
              {saved.mcqs.map((m, i) => (
                <section key={i} className="rounded-xl border border-border p-4" aria-label={`Question ${i + 1}`}>
                  <p className="font-semibold">{i + 1}. {m.q}</p>
                  <div className="mt-2 space-y-1.5">
                    {m.options.map((o, k) => {
                      const has = picked[i] !== undefined; const right = k === m.answer; const mine = picked[i] === k;
                      return <button key={k} type="button" disabled={has} onClick={() => setPicked((p) => ({ ...p, [i]: k }))} className={`flex w-full gap-2 rounded-lg border px-3 py-2 text-left text-[15px] ${has && right ? "border-emerald-500 bg-emerald-500/10" : has && mine ? "border-destructive bg-destructive/10" : "border-border hover:border-primary/60"}`}><b>{"ABCDE"[k]}</b><span>{o}</span></button>;
                    })}
                  </div>
                  {picked[i] !== undefined && m.why && <p className="mt-2 text-sm text-muted-foreground">{m.why}</p>}
                </section>
              ))}
              {done && <p className="rounded-xl bg-primary/10 p-4 text-lg font-bold text-primary" role="status">You scored {score} out of {saved.mcqs.length}.</p>}
              {saved.essays.length > 0 && <section aria-label="Short answer questions"><h2 className="font-serif text-2xl font-bold">Short answer</h2><div className="mt-2"><Answer text={saved.essays.map((e, i) => `${i + 1}. ${e}`).join("\n")} /></div><p className="mt-2 text-sm text-muted-foreground">Write your answer on paper, then ask Ompath AI to mark it.</p></section>}
              <p className="text-sm text-muted-foreground">A new assessment is made each week, from that week's questions.</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
