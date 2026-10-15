import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, Sparkles } from "lucide-react";
import { useAiStore } from "@/lib/ompathAiStore";
import { useAuth } from "@/hooks/useAuth";
import { Answer } from "@/components/ai/AnswerText";
import { readsThisWeek } from "@/lib/readLog";
import StudyTimeCard from "@/components/StudyTimeCard";
import { addWeak, clearWeak, dueNow, readWeak, review } from "@/lib/weakTopics";
import { openAI } from "@/lib/aiEvents";

interface Mcq { q: string; options: string[]; answer: number; why: string; part?: "asked" | "read" }
interface Saved { week: string; topics: string[]; reads: string[]; mcqs: Mcq[]; essays: string[] }

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
  const partAt = (idx: number) => (/PART\s*B/i.test(text.slice(0, idx)) ? "read" : "asked") as "asked" | "read";
  let offset = 0;
  const blocks = text.split(/\n(?=\s*(?:\*\*)?(?:Q|Question)\s*\d+|\s*\d+[.)]\s+)/i);
  for (const b of blocks) {
    const at = offset; offset += b.length + 1;
    const opts = [...b.matchAll(/^\s*\(?([A-E])[.)]\s+(.+)$/gm)].map((m) => m[2].replace(/\*\*/g, "").trim());
    const ans = b.match(/Answer\s*:?\s*\**\s*\(?([A-E])/i)?.[1];
    const why = b.match(/(?:Why|Explanation)\s*:?\s*\**\s*(.+)/i)?.[1]?.replace(/\*\*/g, "").trim() ?? "";
    const q = b.split("\n")[0].replace(/^\s*(?:\*\*)?(?:Q|Question)?\s*\d+[.):]?\s*(?:\*\*)?/i, "").replace(/\*\*/g, "").trim();
    if (opts.length >= 4 && ans && q.length > 8) mcqs.push({ q, options: opts.slice(0, 5), answer: "ABCDE".indexOf(ans.toUpperCase()), why, part: partAt(at) });
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
  const reads = useMemo(() => readsThisWeek(user?.id).map((r) => r.t), [user?.id]);
  const storeKey = `ompath_week_${user?.id ?? "guest"}`;
  const [saved, setSaved] = useState<Saved | null>(() => { try { const v = JSON.parse(localStorage.getItem(storeKey) ?? "null") as Saved | null; return v?.week === weekKey() ? v : null; } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [tick, setTick] = useState(0); // re-reads the revision list after it changes
  const due = useMemo(() => dueNow(user?.id), [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const weakAll = useMemo(() => readWeak(user?.id), [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const forget = () => { clearWeak(user?.id); try { localStorage.removeItem(storeKey); localStorage.removeItem(`ompath_read_${user?.id ?? "guest"}`); } catch { /* ignore */ } setSaved(null); setTick((n) => n + 1); };

  const make = async () => {
    setBusy(true); setErr("");
    const list = topics.slice(0, 10);
    const rd = reads.slice(0, 8);
    try {
      const nA = list.length ? Math.min(8, Math.max(3, list.length * 2)) : 0;
      const nB = rd.length ? Math.min(8, Math.max(3, rd.length * 2)) : 0;
      const prompt = `Write a weekly revision assessment for a medical student, in two parts.\n${nA ? `\nPART A - what the student asked about this week (${nA} multiple-choice questions):\n${list.map((t) => `- ${t}`).join("\n")}\n` : ""}${nB ? `\nPART B - notes the student read properly this week (${nB} multiple-choice questions, testing the main points of each note):\n${rd.map((t) => `- ${t}`).join("\n")}\n` : ""}\nThen 2 short-answer questions across both parts. Use this exact format and nothing else.\n${nA ? "PART A\n" : ""}Q1. question text\nA. option\nB. option\nC. option\nD. option\nE. option\nAnswer: B\nWhy: one sentence\n${nB ? "\nPART B\n(same format)\n" : ""}\nEssay 1. question\nEssay 2. question`;
      // the server already tries every key in turn; if a whole attempt still fails (or comes back unreadable) it is asked once more
      let parsed = { mcqs: [] as Mcq[], essays: [] as string[] };
      for (let attempt = 0; attempt < 2 && parsed.mcqs.length < 3; attempt++) {
        try { parsed = parseAssessment(await ask(prompt)); } catch { /* try again */ }
        if (parsed.mcqs.length < 3 && attempt === 0) await new Promise((r) => setTimeout(r, 1500));
      }
      const { mcqs, essays } = parsed;
      if (mcqs.length < 3) throw new Error("short");
      const s: Saved = { week: weekKey(), topics: list, reads: rd, mcqs, essays };
      setSaved(s); setPicked({});
      try { localStorage.setItem(storeKey, JSON.stringify(s)); } catch { /* storage blocked */ }
    } catch { setErr("The assessment could not be made just now. Try again in a few minutes."); }
    setBusy(false);
  };
  useEffect(() => { setPicked({}); }, [saved?.week]);

  const score = saved ? saved.mcqs.filter((m, i) => picked[i] === m.answer).length : 0;
  const breakdown = saved ? (["asked", "read"] as const).map((p) => { const idx = saved.mcqs.map((m, i) => ({ m, i })).filter((x) => (x.m.part ?? "asked") === p); return { label: p === "read" ? "Notes you read" : "What you asked", n: idx.length, ok: idx.filter((x) => picked[x.i] === x.m.answer).length }; }).filter((x) => x.n > 0) : [];
  const done = saved ? Object.keys(picked).length === saved.mcqs.length : false;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Helmet><title>My week — Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your week</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">What you studied, tested</h1>

      <StudyTimeCard />

      {due.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4" aria-label="Revise today">
          <h2 className="font-serif text-xl font-bold">Revise today</h2>
          <p className="text-sm text-muted-foreground">Questions you missed, coming back on a schedule (1, 3, 7 and 14 days) until you know them.</p>
          <ul className="mt-3 space-y-3">
            {due.slice(0, 5).map((w) => (
              <li key={w.q} className="rounded-lg bg-background p-3">
                <p className="font-semibold">{w.q}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <button type="button" onClick={() => openAI(`Explain simply: ${w.q}`)} className="rounded-full border border-primary/40 px-3 py-1 font-bold text-primary">Explain it to me</button>
                  <button type="button" onClick={() => { review(user?.id, w.q, true); setTick((n) => n + 1); }} className="rounded-full bg-emerald-600 px-3 py-1 font-bold text-white">I know it now</button>
                  <button type="button" onClick={() => { review(user?.id, w.q, false); setTick((n) => n + 1); }} className="rounded-full border border-border px-3 py-1 font-semibold">Still unsure</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {topics.length + reads.length < MIN_QUESTIONS && !saved ? (
        <div className="mt-6">
          <p className="text-[17px] text-muted-foreground">Ask Ompath AI a few questions, or read a few notes for a couple of minutes each, and an assessment on exactly those will appear here. So far this week: <b>{topics.length}</b> asked, <b>{reads.length}</b> read.</p>
          <Link to="/search" className="mt-4 inline-block font-bold text-primary hover:underline">Search a topic →</Link>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[17px] text-muted-foreground">Made from what you asked Ompath AI and the notes you read for more than a couple of minutes, in the last seven days. Only you see this.</p>
          <ul className="mt-3 flex flex-wrap gap-2">{(saved?.topics ?? topics).slice(0, 12).map((t) => <li key={t} className="rounded-full border border-border px-3 py-1 text-sm">{t}</li>)}</ul>
          {!saved && <button type="button" disabled={busy} onClick={() => void make()} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Make my assessment</button>}
          {err && <p className="mt-3 text-sm text-destructive" role="status">{err}</p>}
          {saved && (
            <div className="mt-8 space-y-6">
              {saved.mcqs.map((m, i) => (
                <section key={i} className="rounded-xl border border-border p-4" aria-label={`Question ${i + 1}`}>
                  {(i === 0 || (m.part ?? "asked") !== (saved.mcqs[i - 1].part ?? "asked")) && <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">{(m.part ?? "asked") === "read" ? "From notes you read" : "From what you asked"}</p>}
                  <p className="font-semibold">{i + 1}. {m.q}</p>
                  <div className="mt-2 space-y-1.5">
                    {m.options.map((o, k) => {
                      const has = picked[i] !== undefined; const right = k === m.answer; const mine = picked[i] === k;
                      return <button key={k} type="button" disabled={has} onClick={() => { setPicked((p) => ({ ...p, [i]: k })); if (k !== m.answer) { addWeak(user?.id, { q: m.q, why: m.why, part: m.part }); setTick((n) => n + 1); } }} className={`flex w-full gap-2 rounded-lg border px-3 py-2 text-left text-[15px] ${has && right ? "border-emerald-500 bg-emerald-500/10" : has && mine ? "border-destructive bg-destructive/10" : "border-border hover:border-primary/60"}`}><b>{"ABCDE"[k]}</b><span>{o}</span></button>;
                    })}
                  </div>
                  {picked[i] !== undefined && m.why && <p className="mt-2 text-sm text-muted-foreground">{m.why}</p>}
                </section>
              ))}
              {done && <p className="rounded-xl bg-primary/10 p-4 text-lg font-bold text-primary" role="status">You scored {score} out of {saved.mcqs.length}.{breakdown.length > 1 && <span className="mt-1 block text-sm font-semibold text-foreground/80">{breakdown.map((x) => `${x.label}: ${x.ok}/${x.n}`).join(" · ")}</span>}</p>}
              {saved.essays.length > 0 && <section aria-label="Short answer questions"><h2 className="font-serif text-2xl font-bold">Short answer</h2><div className="mt-2"><Answer text={saved.essays.map((e, i) => `${i + 1}. ${e}`).join("\n")} /></div><p className="mt-2 text-sm text-muted-foreground">Write your answer on paper, then ask Ompath AI to mark it.</p></section>}
              <p className="text-sm text-muted-foreground">A new assessment is made each week, from that week's questions.</p>
            </div>
          )}
        </>
      )}
      <section className="mt-12 border-t border-border pt-6" aria-label="What Ompath AI knows about you">
        <h2 className="font-serif text-xl font-bold">What Ompath AI remembers about you</h2>
        <p className="text-sm text-muted-foreground">This is all of it. It stays on this device and your account, and it is how answers are matched to you.</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div><dt className="font-bold">Asked this week</dt><dd className="text-muted-foreground">{topics.length ? topics.slice(0, 8).join(" · ") : "Nothing yet."}</dd></div>
          <div><dt className="font-bold">Read properly this week</dt><dd className="text-muted-foreground">{reads.length ? reads.slice(0, 8).join(" · ") : "Nothing yet."}</dd></div>
          <div><dt className="font-bold">Missed, being revised</dt><dd className="text-muted-foreground">{weakAll.length ? weakAll.slice(0, 6).map((w) => w.q).join(" · ") : "Nothing."}</dd></div>
        </dl>
        <button type="button" onClick={forget} className="mt-3 rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:text-destructive">Forget all of this</button>
      </section>
    </main>
  );
}
