import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Check, ExternalLink, History, ListChecks, Loader2, MessageCircle, Pencil, Plus, Send, Sparkles, Trash2, Undo2, Wand2, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recentProblems } from "@/lib/adminProblems";
import { agentContext, askAgent, describe, loadAgentWorld, runAction, runReadOnly, type ActionResult, type AgentAction, type AgentWorld, type PlanItem } from "@/lib/adminAgent";
import { deleteChat, listChats, loadChat, saveChat, type ChatMeta } from "@/lib/adminChats";
import { draftArticle, draftCards, draftMcqs, draftNote, publishDraft, reviseNote, seoChecks, thumbFor, type Draft, type NoteDraft } from "@/lib/adminWriter";

type DraftState = "ready" | "published" | "saved" | "discarded";
type Item =
  | { kind: "text"; role: "user" | "assistant"; content: string }
  | { kind: "result"; result: ActionResult }
  | { kind: "ask"; question: string; options: string[]; answered?: string }
  | { kind: "draft"; draft: Draft; state: DraftState; fresh?: boolean };
const READ_ONLY = new Set(["seo_scan", "site_stats", "contest_report", "find_content", "notification_report"]);
const DRAFTERS = new Set(["publish_note", "make_mcqs", "create_flashcards", "write_article"]);
const ALWAYS_ASK = new Set(["send_notification", "delete_contest", "remove_item"]);
const IDEAS = [
  "What can I do on this page?", "Explain the last error and fix it", "Check my posts for SEO problems", "Clean my notification bell",
  "Make a UoN vs MKU contest tomorrow at 8pm", "Write a note on nephrotic syndrome", "How many visitors this week?", "I will paste notes: polish them and publish",
];
const plain = (md: string) => md.replace(/^#+\s*/gm, "").replace(/[*_`>|]/g, "").replace(/\n{2,}/g, "\n");
const when = (iso: string) => new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(iso));
const btn = "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40";

/** Admin assistant. Questions are answered at once; changes show a preview or confirm card first (or run by themselves when you switch Auto-run on). Every task is saved and remembered. */
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
  const [revising, setRevising] = useState<number | null>(null);
  const [revision, setRevision] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const refreshChats = useCallback(async () => { const r = await listChats(); setChats(r.chats); setWhere(r.where); return r; }, []);
  const reloadWorld = useCallback(async () => { try { const w = await loadAgentWorld(); setWorld(w); return w; } catch (e: any) { setError(e?.message || "Could not load your site data."); return null; } }, []);

  useEffect(() => {
    void reloadWorld();
    void (async () => {
      const r = await refreshChats(); const last = r.chats[0];
      if (last) { setChatId(last.id); setFeed((await loadChat(last.id)) as Item[]); }
      loaded.current = true;
    })();
  }, [refreshChats, reloadWorld]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [feed, plan]);

  useEffect(() => {
    if (!loaded.current || !feed.length) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const first = feed.find((i) => i.kind === "text" && i.role === "user") as Extract<Item, { kind: "text" }> | undefined;
      void saveChat(chatId, (first?.content || "New task").replace(/\s+/g, " ").slice(0, 60), feed).then((id) => { if (id !== chatId) setChatId(id); void refreshChats(); });
    }, 700);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [feed, chatId, refreshChats]);

  // what the assistant remembers of this task: what you said, what it answered, and what it did (so "undo that" or "now make MCQs from it" make sense)
  const history = () => feed.map((i): { role: "user" | "assistant"; content: string } | null =>
    i.kind === "text" ? { role: i.role, content: i.content }
      : i.kind === "result" ? { role: "assistant", content: `[Done] ${i.result.text}` }
        : i.kind === "draft" ? { role: "assistant", content: `[Preview ${i.state}] ${i.draft.type}: "${i.draft.title}"` } : null).filter(Boolean).slice(-14) as { role: "user" | "assistant"; content: string }[];
  const push = (...items: Item[]) => setFeed((f) => [...f, ...items]);
  const newTask = () => { setFeed([]); setChatId(null); setPlan(null); setError(""); setShowHistory(false); };
  const openChat = async (id: string) => { setChatId(id); setFeed((await loadChat(id)) as Item[]); setPlan(null); setShowHistory(false); };

  async function toggleAuto() {
    if (!world) return;
    const { error: e } = await (supabase as any).rpc("admin_agent_set_mode", { p_key: "assistant_autorun", p_mode: world.autorun ? "ask" : "auto" });
    if (e) setError(/schema cache|admin_agent_set_mode/.test(e.message) ? "Run RUN-THESE.sql first, then Auto-run can be switched on." : e.message);
    await reloadWorld();
  }

  /** Runs safe steps now; anything risky waits in a confirm card. */
  async function execute(items: PlanItem[], w: AgentWorld) {
    const safe = w.autorun ? items.filter((p) => p.ok && !p.danger && !ALWAYS_ASK.has(p.action.tool)) : [];
    const rest = items.filter((p) => !safe.includes(p));
    for (const p of safe) {
      try { push({ kind: "result", result: await runAction(p.action as AgentAction, w) }); }
      catch (e: any) { setError(e?.message || "A step failed."); break; }
    }
    if (safe.length) await reloadWorld();
    if (rest.length) setPlan(rest);
  }

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
      // writing jobs: draft first, you approve (or Auto-run publishes it, with an Undo)
      let lastNote: NoteDraft | null = null;
      const drafts: Draft[] = [];
      for (const a of out.actions.filter((x) => DRAFTERS.has(x.tool))) {
        try {
          const prior = [...feed].reverse().find((i) => i.kind === "draft" && i.draft.type === "note") as Extract<Item, { kind: "draft" }> | undefined;
          const fromNote = a.args?.from === "note";
          const base = fromNote ? (lastNote?.content || (prior?.draft as NoteDraft | undefined)?.content || raw) : raw;
          const noteTitle = lastNote?.title || (prior?.draft as NoteDraft | undefined)?.title || "";
          let d: Draft;
          if (a.tool === "publish_note") { d = await draftNote(raw, { title: a.args?.title, category: a.args?.category, year: a.args?.year ?? null }, world.categories); lastNote = d; }
          else if (a.tool === "write_article") { d = await draftArticle(String(a.args?.topic || raw), { category: a.args?.category, year: a.args?.year ?? null }, world.categories); lastNote = d as NoteDraft; }
          else if (a.tool === "make_mcqs") d = await draftMcqs(base, Number(a.args?.count) || 10, String(a.args?.title || (noteTitle ? `MCQs: ${noteTitle}` : "MCQ practice")), String(a.args?.category || lastNote?.category || ""));
          else d = await draftCards(base, Number(a.args?.count) || 15, String(a.args?.title || (noteTitle ? `Flashcards: ${noteTitle}` : "Flashcards")), String(a.args?.category || lastNote?.category || ""));
          drafts.push(d); add.push({ kind: "draft", draft: d, state: "ready", fresh: true });
        } catch (e: any) { add.push({ kind: "text", role: "assistant", content: `I could not write that: ${e?.message || "error"}` }); }
      }
      if (!add.length) add.push({ kind: "text", role: "assistant", content: out.actions.length ? "Here is what I will do:" : "Nothing to do there." });
      setFeed((f) => { const base = f.length; const next = [...f, ...add]; if (world.autorun) window.setTimeout(() => void autoPublish(base, add), 0); return next; });
      const rest = out.actions.filter((a) => !["go_to", ...DRAFTERS].includes(a.tool) && !READ_ONLY.has(a.tool));
      if (rest.length) await execute(describe(rest, world), world);
    } catch (e: any) { setError(e?.message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  // Auto-run: previews that came from your own text are published straight away; brand-new AI-written notes are saved as drafts for you to read first
  async function autoPublish(base: number, added: Item[]) {
    for (let k = 0; k < added.length; k++) {
      const it = added[k]; if (it.kind !== "draft") continue;
      const aiWritten = it.draft.type === "note" && !(it.draft as NoteDraft).raw;
      await decide(base + k, aiWritten ? false : true, it.draft);
    }
  }

  async function confirm() {
    if (!plan || !world) return;
    setBusy(true); setError("");
    const todo = plan.filter((p) => p.ok); setPlan(null);
    for (const item of todo) {
      try { push({ kind: "result", result: await runAction(item.action as AgentAction, world) }); }
      catch (e: any) { setError(`${e?.message || "A step failed."}`); break; }
    }
    await reloadWorld();
    setBusy(false);
  }

  async function decide(index: number, publish: boolean | null, given?: Draft) {
    const it = given ? ({ kind: "draft", draft: given, state: "ready" } as Item) : feed[index]; if (!it || it.kind !== "draft") return;
    const mark = (state: DraftState) => setFeed((f) => f.map((x, i) => (i === index && x.kind === "draft" ? { ...x, state } : x)));
    if (publish === null) { mark("discarded"); return; }
    setBusy(true); setError("");
    try {
      const p = await publishDraft(it.draft, publish);
      mark(publish ? "published" : "saved");
      push({ kind: "result", result: {
        thumb: p.thumb, text: publish ? `Published "${p.title}". It is live with a search title, description and a share picture.` : `Saved "${p.title}" as a draft. Students cannot see it yet; read it, then publish from the editor.`,
        links: [{ label: "Open the page", href: p.href }, { label: "Share on WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${p.title} on Ompath Study: ${p.url}`)}`, external: true }, { label: "Admin editor", href: "/admin/editor" }],
        undo: { tool: "remove_item", args: { table: p.table, id: p.id, title: p.title } },
      } });
    } catch (e: any) { setError(`Could not save: ${e?.message || "error"}`); }
    finally { setBusy(false); }
  }

  const patchDraft = (index: number, patch: Partial<NoteDraft> | { title: string }) => setFeed((f) => f.map((x, i) => (i === index && x.kind === "draft" ? { ...x, draft: { ...x.draft, ...patch } as Draft } : x)));
  async function applyRevision(index: number) {
    const it = feed[index]; if (!it || it.kind !== "draft" || it.draft.type !== "note" || !revision.trim()) return;
    setBusy(true); setError("");
    try { const next = await reviseNote(it.draft, revision.trim()); setFeed((f) => f.map((x, i) => (i === index && x.kind === "draft" ? { ...x, draft: next } : x))); setRevising(null); setRevision(""); }
    catch (e: any) { setError(e?.message || "Could not change it."); }
    finally { setBusy(false); }
  }

  const answer = (index: number, option: string) => { setFeed((f) => f.map((x, i) => (i === index && x.kind === "ask" ? { ...x, answered: option } : x))); void send(option); };
  const danger = plan?.some((p) => p.danger);
  const isNote = (d: Draft): d is NoteDraft => d.type === "note";

  return (
    <section className={compact ? "flex h-full min-h-0 flex-col p-3 sm:p-4" : "rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-4 sm:p-5"} aria-label="Admin assistant">
      <div className="flex items-center gap-2 pr-9">
        <Sparkles className="h-5 w-5 shrink-0 text-primary" /><h2 className="truncate font-serif text-lg font-bold sm:text-xl">Admin assistant</h2>
        <span className="ml-auto flex shrink-0 gap-1">
          <button type="button" onClick={() => void toggleAuto()} disabled={!world} title={world?.autorun ? "Auto-run is ON: safe steps run without asking. Tap to switch off." : "Auto-run is OFF: I ask before every change. Tap to let me run safe steps myself."} className={`${btn} border ${world?.autorun ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}><Zap className="h-4 w-4" /><span className="hidden sm:inline">Auto-run {world?.autorun ? "on" : "off"}</span></button>
          <button type="button" onClick={newTask} className={`${btn} border hover:bg-muted`} aria-label="New task"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New</span></button>
          <button type="button" onClick={() => { setShowHistory((v) => !v); void refreshChats(); }} className={`${btn} border hover:bg-muted`} aria-label="Earlier tasks"><History className="h-4 w-4" /><span className="hidden sm:inline">History</span></button>
        </span>
      </div>
      {showHistory && (
        <div className="mt-2 max-h-52 shrink-0 overflow-y-auto rounded-xl border bg-card text-sm">
          {!chats.length ? <p className="p-3 text-muted-foreground">No earlier tasks yet.</p> : chats.map((c) => (
            <div key={c.id} className={`flex items-center gap-2 border-b px-3 py-2 last:border-0 ${c.id === chatId ? "bg-primary/10" : ""}`}>
              <button type="button" onClick={() => void openChat(c.id)} className="min-h-10 min-w-0 flex-1 text-left"><span className="block truncate font-medium">{c.title}</span><span className="block text-xs text-muted-foreground">{when(c.updated_at)}</span></button>
              <button type="button" aria-label="Delete this task" onClick={() => void deleteChat(c.id).then(() => { if (c.id === chatId) newTask(); void refreshChats(); })} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {where === "browser" && <p className="border-t bg-amber-500/10 p-2 text-xs">History is saved in this browser only. Run <strong>RUN-THESE.sql</strong> to keep it on your account.</p>}
        </div>
      )}
      {world?.memory.length ? <p className="mt-1 text-[11px] text-muted-foreground">I remember {world.memory.length} thing{world.memory.length === 1 ? "" : "s"} you told me.</p> : null}
      {!feed.length && <p className="mt-1 text-sm text-muted-foreground">Ask in plain words, or paste notes. {world?.autorun ? "Auto-run is on: I do safe steps myself and show you the result with an Undo." : "Before I change or publish anything I show you a preview and wait for your Yes."}</p>}

      {!feed.length && <div className="mt-3 flex flex-wrap gap-2">{IDEAS.map((i) => <button key={i} type="button" onClick={() => (i.startsWith("I will paste") ? setText("Polish these notes and publish them, then make 10 MCQs and flashcards:\n\n") : void send(i))} disabled={!world || busy} className="min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">{i}</button>)}</div>}

      <div className={`mt-3 space-y-2 overflow-y-auto overscroll-contain ${compact ? "min-h-0 flex-1" : "max-h-[32rem]"}`}>
        {feed.map((it, i) => {
          if (it.kind === "text") return <p key={i} className={`whitespace-pre-line break-words rounded-xl px-3 py-2 text-sm ${it.role === "user" ? "ml-6 bg-primary/10" : "mr-4 bg-muted"}`}>{it.content}</p>;
          if (it.kind === "ask") return (
            <div key={i} className="mr-2 rounded-xl border border-primary/30 bg-card p-3">
              <p className="flex items-start gap-2 text-sm font-semibold"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {it.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">{it.options.map((o) => <button key={o} type="button" disabled={busy || Boolean(it.answered)} onClick={() => answer(i, o)} className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold ${it.answered === o ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted disabled:opacity-40"}`}>{o}</button>)}</div>
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
                        ? <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={`${btn} border bg-background hover:bg-muted`}>{l.label.includes("WhatsApp") ? <MessageCircle className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />} {l.label}</a>
                        : <Link key={l.label} to={l.href} className={`${btn} border bg-background hover:bg-muted`}>{l.label} →</Link>)}
                      {r.undo && world && <button type="button" disabled={busy} onClick={() => setPlan(describe([r.undo as AgentAction], world))} className={`${btn} border border-destructive/40 bg-background text-destructive hover:bg-destructive/10`}><Undo2 className="h-3.5 w-3.5" /> Undo / remove</button>}
                    </div>
                  )}
                </div>
              </div>
            );
          }
          const d = it.draft; const gone = it.state !== "ready";
          return (
            <div key={i} className={`overflow-hidden rounded-xl border bg-card ${gone ? "opacity-70" : "border-primary/40"}`}>
              {isNote(d) && <img src={thumbFor(d.title, "Notes", d.year, d.category.replace(/^Year\s*\d+:\s*/i, ""))} alt="" loading="lazy" className="aspect-[40/21] w-full object-cover" />}
              <div className="space-y-2 p-3 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">{isNote(d) ? (d.raw ? "Polished note" : "New note (AI-written: read before publishing)") : d.type === "mcq" ? `${d.questions.length} MCQs` : `${d.cards.length} flashcards`} · preview{it.state !== "ready" && ` · ${it.state}`}</p>
                {gone ? <p className="font-serif text-lg font-bold leading-tight">{d.title}</p> : (
                  <input value={d.title} onChange={(e) => patchDraft(i, { title: e.target.value })} aria-label="Title" className="w-full rounded-lg border bg-background px-2 py-2 font-serif text-base font-bold" />
                )}
                {isNote(d) ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">{seoChecks(d).map((c) => <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/20 text-amber-800 dark:text-amber-200"}`}>{c.ok ? "✓" : "!"} {c.label}</span>)}</div>
                    {!gone && world && (
                      <select value={d.category} onChange={(e) => patchDraft(i, { category: e.target.value })} aria-label="Category" className="w-full rounded-lg border bg-background px-2 py-2 text-sm"><option value="">No category</option>{world.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                    )}
                    {gone ? <p className="text-muted-foreground">{d.meta_description}</p> : <textarea value={d.meta_description} onChange={(e) => patchDraft(i, { meta_description: e.target.value.slice(0, 160) })} rows={2} aria-label="Search description" className="w-full resize-none rounded-lg border bg-background px-2 py-2 text-sm" />}
                    <details><summary className="min-h-9 cursor-pointer py-1 text-xs font-semibold text-primary">Read the text ({d.content.split(/\s+/).length} words)</summary><p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-line rounded-lg bg-muted p-2 text-xs">{plain(d.content)}</p></details>
                  </>
                ) : d.type === "mcq" ? (
                  <ol className="list-decimal space-y-2 pl-5">{d.questions.slice(0, 3).map((q, qi) => <li key={qi}><span className="font-medium">{q.question}</span><ul className="mt-0.5 text-xs">{q.options.map((o, oi) => <li key={oi} className={oi === q.correct_answer ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>{String.fromCharCode(65 + oi)}. {o}{oi === q.correct_answer ? " ✓" : ""}</li>)}</ul></li>)}{d.questions.length > 3 && <li className="list-none text-xs text-muted-foreground">…and {d.questions.length - 3} more</li>}</ol>
                ) : (
                  <ol className="list-decimal space-y-2 pl-5">{d.cards.slice(0, 4).map((c, ci) => <li key={ci}><span className="font-medium">{c.question}</span><span className="block text-xs text-muted-foreground">{c.answer}</span></li>)}{d.cards.length > 4 && <li className="list-none text-xs text-muted-foreground">…and {d.cards.length - 4} more</li>}</ol>
                )}
                {!gone && revising === i && isNote(d) && (
                  <div className="flex gap-2"><input autoFocus value={revision} onChange={(e) => setRevision(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void applyRevision(i); }} placeholder="e.g. make it shorter, add a table of causes" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-base sm:text-sm" /><button type="button" disabled={busy || !revision.trim()} onClick={() => void applyRevision(i)} className={`${btn} bg-primary text-primary-foreground`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}</button></div>
                )}
                {!gone && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" disabled={busy} onClick={() => void decide(i, true)} className={`${btn} bg-primary text-primary-foreground`}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Approve &amp; publish</button>
                    <button type="button" disabled={busy} onClick={() => void decide(i, false)} className={`${btn} border`}>Save as draft</button>
                    {isNote(d) && <button type="button" disabled={busy} onClick={() => setRevising(revising === i ? null : i)} className={`${btn} border`}><Wand2 className="h-3.5 w-3.5" /> Change it</button>}
                    {isNote(d) && <button type="button" disabled={busy} onClick={() => void send(`Make 10 MCQs and 15 flashcards from the note "${d.title}"`)} className={`${btn} border`}>+ MCQs &amp; cards</button>}
                    <button type="button" disabled={busy} onClick={() => void decide(i, null)} className={`${btn} border`}><X className="h-3.5 w-3.5" /> Discard</button>
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
              <button type="button" disabled={busy || !plan.some((p) => p.ok)} onClick={() => void confirm()} className={`${btn} px-4 text-sm font-bold text-white ${danger ? "bg-destructive" : "bg-primary"}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, do it</button>
              <button type="button" disabled={busy} onClick={() => setPlan(null)} className={`${btn} border px-4 text-sm`}><X className="h-4 w-4" /> No</button>
            </div>
          </div>
        )}
        {busy && !plan && <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Working… (a long note can take up to a minute)</p>}
        <div ref={end} />
      </div>
      {error && <p className="mt-2 shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm">{error}</p>}
      <form className="mt-2 flex shrink-0 items-end gap-2 pb-[env(safe-area-inset-bottom)]" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.length < 400 && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); void send(text); } }} rows={text.length > 120 ? 6 : 2} disabled={!world || busy} placeholder={world ? "Ask, or paste notes…" : "Loading your data…"} className="min-w-0 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm" />
        <button type="submit" disabled={!text.trim() || !world || busy} aria-label="Send" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
    </section>
  );
}
