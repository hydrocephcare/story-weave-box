import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { recentProblems } from "@/lib/adminProblems";
import { agentContext, askAgent, describe, loadAgentWorld, runAction, type AgentAction, type AgentWorld, type PlanItem } from "@/lib/adminAgent";

type Turn = { role: "user" | "assistant"; content: string };
const IDEAS = ["What can I do on this page?", "Explain the last error and fix it", "Make a UoN vs MKU contest tomorrow at 8pm using a respiratory exam", "Which contests do I have?", "Delete the contest called test", "Open registration for the newest contest"];

/** Admin assistant: you say what you need, it shows exactly what it will do, and nothing runs until you press Yes. */
export default function AdminAgent({ compact = false }: { compact?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [world, setWorld] = useState<AgentWorld | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadAgentWorld().then(setWorld).catch((e) => setError(e?.message || "Could not load your contests and exams.")); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [turns, plan, results]);

  async function send(message: string) {
    if (!message.trim() || !world || busy) return;
    setBusy(true); setError(""); setPlan(null); setResults([]);
    const next: Turn[] = [...turns, { role: "user", content: message.trim() }];
    setTurns(next); setText("");
    try {
      const out = await askAgent(message.trim(), turns, { ...agentContext(world), page: pathname, problems: recentProblems() });
      setTurns([...next, { role: "assistant", content: out.reply || (out.actions.length ? "Here is what I will do:" : "Done thinking, nothing to do.") }]);
      // opening a page changes nothing, so it happens straight away; everything else waits for your Yes
      const nav = out.actions.find((a) => a.tool === "go_to" && /^\/admin(\/[a-z0-9-]+)*$/.test(String(a.args?.path)));
      if (nav) navigate(String(nav.args.path));
      const rest = out.actions.filter((a) => a.tool !== "go_to");
      if (rest.length) setPlan(describe(rest, world));
    } catch (e: any) { setError(e?.message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!plan || !world) return;
    setBusy(true); setError(""); const done: string[] = [];
    try {
      for (const item of plan) { if (!item.ok) continue; done.push(await runAction(item.action as AgentAction, world)); setResults([...done]); }
      setPlan(null); setWorld(await loadAgentWorld());
    } catch (e: any) { setError(`${e?.message || "A step failed."}${done.length ? ` (done so far: ${done.join(" ")})` : ""}`); setResults(done); }
    finally { setBusy(false); }
  }

  const danger = plan?.some((p) => p.danger);
  return (
    <section className={compact ? "flex h-full flex-col p-4" : "rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-4 sm:p-5"} aria-label="Admin assistant">
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="font-serif text-xl font-bold">Admin assistant</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Tell me what you need in plain words. I will show what I am about to do and wait for your Yes.</p>

      {!turns.length && <div className="mt-3 flex flex-wrap gap-2">{IDEAS.map((i) => <button key={i} type="button" onClick={() => void send(i)} disabled={!world || busy} className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">{i}</button>)}</div>}

      <div className={`mt-3 space-y-2 overflow-y-auto ${compact ? "min-h-0 flex-1" : "max-h-80"}`}>
        {turns.map((t, i) => <p key={i} className={`rounded-xl px-3 py-2 text-sm ${t.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-muted"}`}>{t.content}</p>)}
        {plan && (
          <div className={`rounded-xl border p-3 ${danger ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"}`}>
            <p className="flex items-center gap-2 text-sm font-bold">{danger ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Check className="h-4 w-4 text-primary" />} {danger ? "Are you sure? This cannot be undone." : "Shall I go ahead?"}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{plan.map((p, i) => <li key={i} className={p.ok ? "" : "text-muted-foreground line-through"}>{p.line}</li>)}</ol>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy || !plan.some((p) => p.ok)} onClick={() => void confirm()} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-40 ${danger ? "bg-destructive" : "bg-primary"}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, do it</button>
              <button type="button" disabled={busy} onClick={() => setPlan(null)} className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-semibold"><X className="h-4 w-4" /> No</button>
            </div>
          </div>
        )}
        {results.map((r, i) => <p key={i} className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm break-all"><Check className="mr-1 inline h-4 w-4 text-primary" />{r}</p>)}
        {busy && !plan && <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</p>}
        <div ref={end} />
      </div>
      {error && <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm">{error}</p>}
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={!world || busy} placeholder={world ? "e.g. make a contest between UoN and MKU for Friday 7pm" : "Loading your data…"} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm" />
        <button type="submit" disabled={!text.trim() || !world || busy} aria-label="Send" className="rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
    </section>
  );
}
