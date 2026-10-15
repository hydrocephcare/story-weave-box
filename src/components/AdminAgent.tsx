import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Check, ChevronDown, ExternalLink, History, ListChecks, Loader2, MessageCircle, Plus, Send, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { recentProblems } from "@/lib/adminProblems";
import { agentContext, askAgent, describe, loadAgentWorld, runAction, runReadOnly, type ActionResult, type AgentAction, type AgentWorld, type PlanItem } from "@/lib/adminAgent";
import { deleteChat, listChats, loadChat, saveChat, type ChatMeta } from "@/lib/adminChats";
import { draftMcqs, draftNote, publishDraft, seoChecks, thumbFor, type Draft, type McqDraft, type NoteDraft } from "@/lib/adminWriter";

type DraftState = "ready" | "published" | "saved" | "discarded";
type Item =
  | { kind: "text"; role: "user" | "assistant"; content: string }
  | { kind: "result"; result: ActionResult }
  | { kind: "ask"; question: string; options: string[]; answered?: string }
  | { kind: "draft"; draft: Draft; state: DraftState };
const READ_ONLY = new Set(["seo_scan", "site_stats", "contest_report"]);
const IDEAS = ["What can I do on this page?", "Explain the last error and fix it", "Check my posts for SEO problems", "Make a UoN vs MKU contest tomorrow at 8pm using a respiratory exam", "How many people registered for my newest contest?", "I will paste notes: polish them and publish"];
const plain = (md: string) => md.replace(/^#+\s*/gm, "").replace(/[*_`>|]/g, "").replace(/\n{2,}/g, "\n");
const when = (iso: string) => new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(iso));

/** Admin assistant. Questions are answered at once; anything that changes the site shows what it will do and waits for your Yes. Every task is saved, so a refresh loses nothing. */
export default function AdminAgent({ compact = false }: { compact?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [world, setWorld] = useState<AgentWorld | null>(null);
  const [feed, setFeed] = useState<Item[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [where, setWhere] = useState<"server" | "browser">("server");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const refreshChats = useCallback(async () => { const r = await listChats(); setChats(r.chats); setWhere(r.where); return r; }, []);

  // start where you left off: the latest saved task
  useEffect(() => {
    void loadAgentWorld().then(setWorld).catch((e) => setError(e?.message || "Could not load your contests and exams."));
    void (async () => {
      const r = await refreshChats();
      const last = r.chats[0];
      if (last) { setChatId(last.id); setFeed((await loadChat(last.id)) as Item[]); }
      loaded.current = true;
    })();
  }, [refreshChats]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [feed, plan]);

  // save a moment after every change
  useEffect(() => {
    if (!loaded.current || !feed.length) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const first = feed.find((i) => i.kind === "text" && i.role === "user") as Extract<Item, { kind: "text" }> | undefined;
      void saveChat(chatId, (first?.content || "New task").replace(/\s+/g, " ").slice(0, 60), feed).then((id) => { if (id !== chatId) setChatId(id); void refreshChats(); });
    }, 700);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [feed, chatId, refreshChats]);

  const history = () => feed.filter((i): i is Extract<Item, { kind: "text" }> => i.kind === "text").map((i) => ({ role: i.role, content: i.content })).slice(-8);
  const push = (...items: Item[]) => setFeed((f) => [...f, ...items]);
  const newTask = () => { setFeed([]); setChatId(null); setPlan(null); setError(""); setShowHistory(false); };
  const openChat = async (id: string) => { setChatId(id); setFeed((await loadChat(id)) as Item[]); setPlan(null); setShowHistory(false); };

  async function send(message: string) {
    if (!message.trim() || !world || busy) return;
    const raw = message.trim();
    setBusy(true); setError(""); setPlan(null);
    const sent = history();
    push({ kind: "text", role: "user", content: raw.length > 900 ? `${raw.slice(0, 900)}…\n(${raw.length.toLocaleString()} characters pasted)` : raw }); setText("");
    try {
      const out = await askAgent(raw.slice(0, 2000), sent, { ...agentContext(world), page: pathname, problems: recentProblems() });
      const add: Item[] = [];
      if (out.reply) add.push({ kind: "text", role: "assistant", content: out.reply });
      if (out.ask) add.push({ kind: "ask", question: out.ask.question, options: out.ask.options });
      const nav = out.actions.find((a) => a.tool === "go_to" && /^\/admin(\/[a-z0-9-]+)*$/.test(String(a.args?.path)));
      if (nav) navigate(String(nav.args.path));
      for (const a of out.actions.filter((x) => READ_ONLY.has(x.tool))) {
        try { const r = await runReadOnly(a as AgentAction, world); if (r) add.push({ kind: "result", result: r }); }
        catch (e: any) { add.push({ kind: "text", role: "assistant", content: `I could not read that: ${e?.message || "error"}` }); }
      }
      // pasted notes: polish, then show a preview you approve (nothing is published yet)
      let lastNote: NoteDraft | null = null;
      for (const a of out.actions.filter((x) => x.tool === "publish_note" || x.tool === "make_mcqs")) {
        try {
          if (a.tool === "publish_note") {
            const d = await draftNote(raw, { title: a.args?.title, category: a.args?.category, year: a.args?.year ?? null }, world.categories);
            lastNote = d; add.push({ kind: "draft", draft: d, state: "ready" });
          } else {
            const fromNote = a.args?.from === "note" || !raw.length;
            const prior = [...feed].reverse().find((i) => i.kind === "draft" && i.draft.type === "note") as Extract<Item, { kind: "draft" }> | undefined;
            const base = fromNote ? (lastNote?.content || (prior?.draft as NoteDraft | undefined)?.content || raw) : raw;
            const title = String(a.args?.title || (lastNote ? `MCQs: ${lastNote.title}` : "MCQ practice"));
            add.push({ kind: "draft", draft: await draftMcqs(base, Number(a.args?.count) || 10, title, String(a.args?.category || lastNote?.category || "")), state: "ready" });
          }
        } catch (e: any) { add.push({ kind: "text", role: "assistant", content: `I could not write that: ${e?.message || "error"}` }); }
      }
      if (!add.length) add.push({ kind: "text", role: "assistant", content: out.actions.length ? "Here is what I will do:" : "Nothing to do there." });
      push(...add);
      const rest = out.actions.filter((a) => !["go_to", "publish_note", "make_mcqs"].includes(a.tool) && !READ_ONLY.has(a.tool));
      if (rest.length) setPlan(describe(rest, world));
    } catch (e: any) { setError(e?.message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!plan || !world) return;
    setBusy(true); setError("");
    const todo = plan.filter((p) => p.ok); setPlan(null);
    for (const item of todo) {
      try { push({ kind: "result", result: await runAction(item.action as AgentAction, world) }); }
      catch (e: any) { setError(`${e?.message || "A step failed."}`); break; }
    }
    try { setWorld(await loadAgentWorld()); } catch { /* keep the old picture */ }
    setBusy(false);
  }

  async function decide(index: number, publish: boolean | null) {
    const it = feed[index]; if (!it || it.kind !== "draft") return;
    const mark = (state: DraftState) => setFeed((f) => f.map((x, i) => (i === index && x.kind === "draft" ? { ...x, state } : x)));
    if (publish === null) { mark("discarded"); return; }
    setBusy(true); setError("");
    try {
      const p = await publishDraft(it.draft, publish);
      mark(publish ? "published" : "saved");
      push({ kind: "result", result: {
        thumb: p.thumb, text: publish ? `Published "${p.title}". It is live now with a search title, description, tags and a share picture.` : `Saved "${p.title}" as a draft. Students cannot see it yet.`,
        links: [{ label: "Open the page", href: p.href }, { label: "Share on WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${p.title} on Ompath Study: ${p.url}`)}`, external: true }, { label: "Admin editor", href: "/admin/editor" }],
        undo: { tool: "remove_item", args: { table: p.table, id: p.id, title: p.title } },
      } });
    } catch (e: any) { setError(`Could not save: ${e?.message || "error"}`); }
    finally { setBusy(false); }
  }

  const answer = (index: number, option: string) => { setFeed((f) => f.map((x, i) => (i === index && x.kind === "ask" ? { ...x, answered: option } : x))); void send(option); };
  const danger = plan?.some((p) => p.danger);
  const noteDraft = (d: Draft): d is NoteDraft => d.type === "note";

  return (
    <section className={compact ? "flex h-full flex-col p-4" : "rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-4 sm:p-5"} aria-label="Admin assistant">
      <div className="flex items-center gap-2 pr-8">
        <Sparkles className="h-5 w-5 text-primary" /><h2 className="font-serif text-xl font-bold">Admin assistant</h2>
        <span className="ml-auto flex gap-1">
          <button type="button" onClick={newTask} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-muted" title="Start a new task"><Plus className="h-3.5 w-3.5" /> New</button>
          <button type="button" onClick={() => { setShowHistory((v) => !v); void refreshChats(); }} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-muted" title="Earlier tasks"><History className="h-3.5 w-3.5" /> History <ChevronDown className="h-3 w-3" /></button>
        </span>
      </div>
      {showHistory && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border bg-card text-sm">
          {!chats.length ? <p className="p-3 text-muted-foreground">No earlier tasks yet.</p> : chats.map((c) => (
            <div key={c.id} className={`flex items-center gap-2 border-b px-3 py-2 last:border-0 ${c.id === chatId ? "bg-primary/10" : ""}`}>
              <button type="button" onClick={() => void openChat(c.id)} className="min-w-0 flex-1 text-left"><span className="block truncate font-medium">{c.title}</span><span className="block text-xs text-muted-foreground">{when(c.updated_at)}</span></button>
              <button type="button" aria-label="Delete this task" onClick={() => void deleteChat(c.id).then(() => { if (c.id === chatId) newTask(); void refreshChats(); })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {where === "browser" && <p className="border-t bg-amber-500/10 p-2 text-xs">History is saved in this browser only. Run <strong>admin-chats.sql</strong> to keep it on your account.</p>}
        </div>
      )}
      <p className="mt-1 text-sm text-muted-foreground">Ask in plain words, or paste notes. Questions are answered at once. Before I change or publish anything I show you a preview and wait for your Yes.</p>

      {!feed.length && <div className="mt-3 flex flex-wrap gap-2">{IDEAS.map((i) => <button key={i} type="button" onClick={() => (i.startsWith("I will paste") ? setText("Polish these notes and publish them, then make 10 MCQs:\n\n") : void send(i))} disabled={!world || busy} className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">{i}</button>)}</div>}

      <div className={`mt-3 space-y-2 overflow-y-auto ${compact ? "min-h-0 flex-1" : "max-h-[32rem]"}`}>
        {feed.map((it, i) => {
          if (it.kind === "text") return <p key={i} className={`whitespace-pre-line rounded-xl px-3 py-2 text-sm ${it.role === "user" ? "ml-8 bg-primary/10" : "mr-8 bg-muted"}`}>{it.content}</p>;
          if (it.kind === "ask") return (
            <div key={i} className="mr-4 rounded-xl border border-primary/30 bg-card p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-primary" /> {it.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">{it.options.map((o) => <button key={o} type="button" disabled={busy || Boolean(it.answered)} onClick={() => answer(i, o)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${it.answered === o ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted disabled:opacity-40"}`}>{o}</button>)}</div>
            </div>
          );
          if (it.kind === "result") {
            const r = it.result;
            return (
              <div key={i} className={`overflow-hidden rounded-xl border text-sm ${r.partial ? "border-amber-500/50 bg-amber-500/10" : "border-primary/30 bg-primary/10"}`}>
                {r.thumb && <img src={r.thumb} alt="" loading="lazy" className="aspect-[40/21] w-full object-cover" />}
                <div className="px-3 py-2">
                  <p className="whitespace-pre-line break-words">{r.partial ? <AlertTriangle className="mr-1 inline h-4 w-4 text-amber-600" /> : <Check className="mr-1 inline h-4 w-4 text-primary" />}{r.text}</p>
                  {(r.links?.length || r.undo) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.links?.map((l) => l.external
                        ? <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">{l.label.includes("WhatsApp") ? <MessageCircle className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />} {l.label}</a>
                        : <Link key={l.label} to={l.href} className="inline-flex items-center rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">{l.label} →</Link>)}
                      {r.undo && world && <button type="button" disabled={busy} onClick={() => setPlan(describe([r.undo as AgentAction], world))} className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-background px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"><Undo2 className="h-3 w-3" /> Undo / remove</button>}
                    </div>
                  )}
                </div>
              </div>
            );
          }
          const d = it.draft; const gone = it.state !== "ready";
          return (
            <div key={i} className={`overflow-hidden rounded-xl border bg-card ${gone ? "opacity-70" : "border-primary/40"}`}>
              {noteDraft(d) && <img src={thumbFor(d.title, "Notes", d.year, d.category.replace(/^Year\s*\d+:\s*/i, ""))} alt="" loading="lazy" className="aspect-[40/21] w-full object-cover" />}
              <div className="space-y-2 p-3 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">{noteDraft(d) ? "Polished note — preview" : `${d.questions.length} MCQs — preview`}{it.state !== "ready" && ` · ${it.state}`}</p>
                <p className="font-serif text-lg font-bold leading-tight">{d.title}</p>
                {noteDraft(d) ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">{seoChecks(d).map((c) => <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/20 text-amber-800 dark:text-amber-200"}`}>{c.ok ? "✓" : "!"} {c.label}</span>)}</div>
                    <p className="text-muted-foreground">{d.meta_description}</p>
                    <details><summary className="cursor-pointer text-xs font-semibold text-primary">Read the polished text ({d.content.split(/\s+/).length} words)</summary><p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-line rounded-lg bg-muted p-2 text-xs">{plain(d.content)}</p></details>
                  </>
                ) : (
                  <ol className="list-decimal space-y-2 pl-5">{d.questions.slice(0, 3).map((q, qi) => <li key={qi}><span className="font-medium">{q.question}</span><ul className="mt-0.5 text-xs">{q.options.map((o, oi) => <li key={oi} className={oi === q.correct_answer ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>{String.fromCharCode(65 + oi)}. {o}{oi === q.correct_answer ? " ✓" : ""}</li>)}</ul></li>)}{d.questions.length > 3 && <li className="list-none text-xs text-muted-foreground">…and {d.questions.length - 3} more</li>}</ol>
                )}
                {!gone && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" disabled={busy} onClick={() => void decide(i, true)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">{busy && <Loader2 className="h-3 w-3 animate-spin" />} Approve &amp; publish</button>
                    <button type="button" disabled={busy} onClick={() => void decide(i, false)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">Save as draft</button>
                    {noteDraft(d) && <button type="button" disabled={busy} onClick={() => void send(`Make 10 MCQs from the note "${d.title}"`)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">+ Make MCQs</button>}
                    <button type="button" disabled={busy} onClick={() => void decide(i, null)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"><X className="h-3 w-3" /> Discard</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {plan && (
          <div className={`rounded-xl border p-3 ${danger ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"}`}>
            <p className="flex items-center gap-2 text-sm font-bold">{danger ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Check className="h-4 w-4 text-primary" />} {danger ? "Are you sure?" : "Shall I go ahead?"}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{plan.map((p, i) => <li key={i} className={p.ok ? "" : "text-muted-foreground line-through"}>{p.line}</li>)}</ol>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy || !plan.some((p) => p.ok)} onClick={() => void confirm()} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-40 ${danger ? "bg-destructive" : "bg-primary"}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, do it</button>
              <button type="button" disabled={busy} onClick={() => setPlan(null)} className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-semibold"><X className="h-4 w-4" /> No</button>
            </div>
          </div>
        )}
        {busy && !plan && <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Working… (polishing a long note can take up to a minute)</p>}
        <div ref={end} />
      </div>
      {error && <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm">{error}</p>}
      <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.length < 400) { e.preventDefault(); void send(text); } }} rows={text.length > 120 ? 6 : 2} disabled={!world || busy} placeholder={world ? "Ask, or paste notes here… (Shift+Enter for a new line)" : "Loading your data…"} className="min-w-0 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm" />
        <button type="submit" disabled={!text.trim() || !world || busy} aria-label="Send" className="rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
    </section>
  );
}
