import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import OmpathMark from "@/components/ai/OmpathMark";
import { AlertTriangle, BarChart3, Bell, Check, Search, Trophy, ExternalLink, FileText, History, ListChecks, Loader2, MessageCircle, Mic, MicOff, Plus, Send, Sparkles, Trash2, Undo2, Wand2, X, Zap } from "lucide-react";
import { runSiteHealth } from "@/lib/adminHealth";
import { runBriefing } from "@/lib/adminBriefing";
import { downloadDataUrl, makeStatusPoster, type PosterSpec } from "@/lib/statusPoster";
import { supabase } from "@/integrations/supabase/client";
import { clearProblems, recentProblems, type Problem } from "@/lib/adminProblems";
import { agentContext, askAgent, describe, loadAgentWorld, runAction, runReadOnly, type ActionResult, type AgentAction, type AgentWorld, type PlanItem } from "@/lib/adminAgent";
import { deleteChat, listChats, loadChat, saveChat, type ChatMeta } from "@/lib/adminChats";
import { draftArticle, draftCards, draftMcqs, draftNote, importMcqs, publishDraft, reviseNote, seoChecks, thumbFor, type Draft, type NoteDraft } from "@/lib/adminWriter";

type DraftState = "ready" | "published" | "saved" | "discarded";
type Item =
  | { kind: "text"; role: "user" | "assistant"; content: string }
  | { kind: "result"; result: ActionResult }
  | { kind: "ask"; question: string; options: string[]; answered?: string }
  | { kind: "draft"; draft: Draft; state: DraftState; fresh?: boolean };
const READ_ONLY = new Set(["pending_summary", "seo_scan", "site_stats", "contest_report", "find_content", "notification_report", "site_health", "briefing"]);
const WHAT_TO_DO = ["Polish it and publish as a note", "Polish it, add more content, and publish", "These are MCQs: publish them", "Make 10 MCQs from it and publish", "Make flashcards from it and publish"];
const LONG_PASTE = 400; // a paste longer than this becomes an attachment, like in ChatGPT, so you can type your instruction beside it
const STATUS_STYLE = { good: "border-emerald-500/40 bg-emerald-500/10", warn: "border-amber-500/40 bg-amber-500/10", bad: "border-red-500/40 bg-red-500/10" } as const;
const STATUS_DOT = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" } as const;
const DRAFTERS = new Set(["publish_note", "make_mcqs", "create_flashcards", "write_article", "import_mcqs"]);
const ALWAYS_ASK = new Set(["send_notification", "delete_contest", "remove_item"]);
const CAPS: { icon: typeof Sparkles; title: string; hint: string; prompt: string; fill?: boolean }[] = [
  { icon: FileText, title: "Polish and publish notes", hint: "Paste text; I tidy it, add content, publish", prompt: "Polish these notes and publish them, then make 10 MCQs and flashcards:\n\n", fill: true },
  { icon: ListChecks, title: "MCQs and flashcards", hint: "From your notes, or import yours", prompt: "I will paste MCQs: publish them as an MCQ set:\n\n", fill: true },
  { icon: Trophy, title: "Run a contest", hint: "Any universities, any time", prompt: "Make a UoN vs MKU contest tomorrow at 8pm" },
  { icon: BarChart3, title: "Site health and growth", hint: "Visitors, SEO, what needs you", prompt: "How is my site doing? Is it growing?" },
  { icon: Sparkles, title: "Today's briefing", hint: "Good news and what to do next", prompt: "Today's briefing" },
  { icon: Search, title: "Fix SEO", hint: "Weak descriptions, rewritten", prompt: "Check my posts for SEO problems" },
  { icon: Wand2, title: "Write a new note", hint: "From a topic, saved for review", prompt: "Write a note on nephrotic syndrome", fill: true },
  { icon: Bell, title: "Clean notifications", hint: "Clear your bell in one go", prompt: "Clean my notification bell" },
];
const IDEAS = [
  "Today's briefing", "How is my site doing? Is it growing?", "Check everything and fix what you can", "Explain the last error and fix it", "Check my posts for SEO problems",
  "Make a UoN vs MKU contest tomorrow at 8pm", "Write a note on nephrotic syndrome", "Clean my notification bell", "I will paste notes: polish them and publish",
];
const posterFor = (d: Draft, url: string, live: boolean): PosterSpec | undefined => {
  if (!live) return undefined;
  if (d.type === "note") return { kicker: "Study notes", title: d.title, subtitle: d.meta_description, pills: [d.category.replace(/^Year\s*\d+:\s*/i, ""), d.year ? `Year ${d.year}` : ""].filter(Boolean), cta: { title: "Read it free", sub: "ompathstudy.com" }, url };
  if (d.type === "mcq") return { kicker: "MCQ practice", title: d.title, subtitle: `${d.questions.length} questions with answers and explanations`, pills: [d.category.replace(/^Year\s*\d+:\s*/i, "")].filter(Boolean), cta: { title: "Test yourself", sub: "Free on ompathstudy.com" }, url };
  return { kicker: "Flashcards", title: d.title, subtitle: `${d.cards.length} cards to revise`, pills: [d.category.replace(/^Year\s*\d+:\s*/i, "")].filter(Boolean), cta: { title: "Revise now", sub: "Free on ompathstudy.com" }, url };
};
const plain = (md: string) => md.replace(/^#+\s*/gm, "").replace(/[*_`>|]/g, "").replace(/\n{2,}/g, "\n");
const when = (iso: string) => new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(iso));
const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-40";

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
  const [attachments, setAttachments] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [examQuery, setExamQuery] = useState("");
  const [problems, setProblems] = useState<Problem[]>([]);
  useEffect(() => { const read = () => setProblems(recentProblems()); read(); const t = window.setInterval(read, 2000); return () => window.clearInterval(t); }, []);
  const [listening, setListening] = useState(false);
  const recognition = useRef<any>(null);
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
      if (last) { setChatId(last.id); const saved = (await loadChat(last.id)) as Item[]; setFeed((cur) => [...saved, ...cur.filter((i) => i.kind === "result" && i.result.briefing && !saved.some((s) => s.kind === "result" && s.result.briefing && s.result.text === i.result.text))]); }
      loaded.current = true;
      setFeed((cur) => { const lastItem = cur[cur.length - 1]; if (lastItem && lastItem.kind === "text" && lastItem.role === "user" && !lastItem.content.includes("📎")) { setText(lastItem.content); return [...cur, { kind: "text", role: "assistant", content: "That request was interrupted because the page was closed. I put it back in the box: press send to run it again." }]; } return cur; });
    })();
  }, [refreshChats, reloadWorld]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [feed, plan]);

  // the circle: climbs quickly to about 90% while the work runs, then the result replaces it
  useEffect(() => {
    if (!busy) { setProgress(0); return; }
    setProgress(6);
    const t = window.setInterval(() => setProgress((p) => p + (92 - p) * 0.05), 150);
    return () => window.clearInterval(t);
  }, [busy]);

  // once a day, the first time the assistant opens: a briefing on what happened on the site and what to do next
  useEffect(() => {
    if (!world) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
    try { if (localStorage.getItem("ompath_briefing_day") === today) return; localStorage.setItem("ompath_briefing_day", today); } catch { return; }
    void runBriefing().then((r) => push({ kind: "result", result: r })).catch(() => { /* the briefing is a bonus; ask for it again any time */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

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

  // voice: the browser turns speech into text in the box (Chrome, Edge, Safari; the phone keyboard's own microphone also works)
  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Voice typing is not available in this browser. Use the microphone on your keyboard instead."); return; }
    if (listening) { recognition.current?.stop(); return; }
    const r = new SR(); r.lang = "en-KE"; r.interimResults = true; r.continuous = true;
    const base = text ? `${text} ` : "";
    r.onresult = (e: any) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setText(base + t); };
    r.onerror = (e: any) => { setListening(false); if (e.error === "not-allowed") setError("Allow the microphone for this site, then try again."); };
    r.onend = () => setListening(false);
    recognition.current = r; setListening(true); r.start();
  }

  async function send(message: string) {
    const typed = message.trim(); const att = attachments.join("\n\n").trim();
    if ((!typed && !att) || !world || busy) return;
    recognition.current?.stop();
    // only pasted text and no instruction: ask what to do with it (instant, no waiting)
    if (att && !typed) {
      push({ kind: "text", role: "user", content: `📎 Pasted text · ${att.length.toLocaleString()} characters` }, { kind: "ask", question: "What should I do with this text?", options: WHAT_TO_DO });
      return;
    }
    const raw = typed;
    const source = att || raw; // the text the writing jobs work on
    const intent = att ? `${raw} [pasted text attached: ${att.length} characters, beginning "${att.slice(0, 160).replace(/\s+/g, " ")}"]` : raw;
    setBusy(true); setError(""); setPlan(null);
    const sent = history();
    push({ kind: "text", role: "user", content: `${raw.length > 900 ? `${raw.slice(0, 900)}…` : raw}${att ? `\n📎 Pasted text · ${att.length.toLocaleString()} characters` : ""}` }); setText(""); setAttachments([]);
    try {
      const out = await askAgent(intent.slice(0, 2000), sent, { ...agentContext(world), page: pathname, problems: recentProblems() });
      const add: Item[] = [];
      if (out.reply) add.push({ kind: "text", role: "assistant", content: out.reply });
      if (out.ask) add.push({ kind: "ask", question: out.ask.question, options: out.ask.options });
      const nav = out.actions.find((a) => a.tool === "go_to" && /^\/admin(\/[a-z0-9-]+)*$/.test(String(a.args?.path)));
      if (nav) navigate(String(nav.args.path));
      for (const a of out.actions.filter((x) => READ_ONLY.has(x.tool))) {
        try { const r = a.tool === "site_health" ? await runSiteHealth() : a.tool === "briefing" ? await runBriefing() : await runReadOnly(a as AgentAction, world); if (r) add.push({ kind: "result", result: r }); }
        catch (e: any) { add.push({ kind: "text", role: "assistant", content: `I could not read that: ${e?.message || "error"}` }); }
      }
      // writing jobs: draft first, you approve (or Auto-run publishes it, with an Undo)
      let lastNote: NoteDraft | null = null;
      const drafts: Draft[] = [];
      for (const a of out.actions.filter((x) => DRAFTERS.has(x.tool))) {
        try {
          const prior = [...feed].reverse().find((i) => i.kind === "draft" && i.draft.type === "note") as Extract<Item, { kind: "draft" }> | undefined;
          const fromNote = a.args?.from === "note";
          const base = fromNote ? (lastNote?.content || (prior?.draft as NoteDraft | undefined)?.content || source) : source;
          const noteTitle = lastNote?.title || (prior?.draft as NoteDraft | undefined)?.title || "";
          let d: Draft;
          if (a.tool === "publish_note") { d = await draftNote(source, { title: a.args?.title, category: a.args?.category, year: a.args?.year ?? null, enrich: Boolean(a.args?.enrich) }, world.categories); lastNote = d; }
          else if (a.tool === "import_mcqs") d = await importMcqs(source, String(a.args?.title || "MCQ practice"), String(a.args?.category || ""));
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
        thumb: p.thumb, poster: posterFor(it.draft, p.url, publish), text: publish ? `Published "${p.title}". It is live with a search title, description and a share picture.` : `Saved "${p.title}" as a draft. Students cannot see it yet; read it, then publish from the editor.`,
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
    <section className={compact ? "flex h-full min-h-0 flex-col bg-gradient-to-b from-primary/[0.12] via-background to-background px-3 pb-3 pt-3 sm:px-4" : "rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-4 sm:p-5"} aria-label="Admin assistant">
      <header className="shrink-0 pr-11">
        <div className="flex items-center gap-3">
          <OmpathMark className="h-11 w-11 shrink-0 shadow-lg shadow-primary/30" />
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-bold leading-tight">Ompath Admin AI</h2>
            <p className="truncate text-[13px] text-muted-foreground">Ask. Check the preview. Approve. Done.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void toggleAuto()} disabled={!world} title={world?.autorun ? "Auto-run is ON: safe steps run without asking. Tap to switch off." : "Auto-run is OFF: I ask before every change. Tap to let me run safe steps myself."} className={`${btn} border ${world?.autorun ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30" : "bg-card hover:bg-muted"}`}><Zap className="h-4 w-4" /> Auto-run {world?.autorun ? "on" : "off"}</button>
          <button type="button" onClick={newTask} className={`${btn} border bg-card hover:bg-muted`} aria-label="New task"><Plus className="h-4 w-4" /> New task</button>
          <button type="button" onClick={() => { setShowHistory((v) => !v); void refreshChats(); }} className={`${btn} border bg-card hover:bg-muted`} aria-label="Earlier tasks"><History className="h-4 w-4" /> History</button>
        </div>
      </header>
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
      {problems.length > 0 && (
        <div className="mt-3 shrink-0 rounded-2xl border border-red-500/40 bg-red-500/10 p-3" role="alert">
          <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-red-500" /> {problems.length} thing{problems.length === 1 ? "" : "s"} went wrong a moment ago</p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[13px] leading-snug text-muted-foreground">{[...new Map(problems.map((p) => [p.what, p])).values()].slice(-5).map((p) => <li key={p.what} className="break-words">• {p.what}</li>)}</ul>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || !world} onClick={() => void send("Explain the last error and fix it")} className={`${btn} flex-1 bg-primary text-primary-foreground`}><Wand2 className="h-4 w-4" /> Explain and fix</button>
            <button type="button" onClick={() => { clearProblems(); setProblems([]); }} className={`${btn} border`}>Dismiss</button>
          </div>
        </div>
      )}
      {world?.memory.length ? <p className="mt-2 shrink-0 text-[12px] text-muted-foreground">I remember {world.memory.length} thing{world.memory.length === 1 ? "" : "s"} you told me.</p> : null}
      {!feed.length && (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          <p className="text-[15px] leading-relaxed text-muted-foreground">Hi. Tell me what you need in plain words, speak, or paste notes. {world?.autorun ? "Auto-run is on, so I do safe steps myself and show the result with an Undo." : "I show a preview first and wait for your Yes."}</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {CAPS.map(({ icon: Icon, title, hint, prompt, fill }) => (
              <button key={title} type="button" disabled={!world || busy} onClick={() => (fill ? setText(prompt) : void send(prompt))} className="group flex min-h-[7.5rem] flex-col items-start gap-2 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md disabled:opacity-40">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="h-[18px] w-[18px]" /></span>
                <span className="text-[15px] font-bold leading-tight">{title}</span>
                <span className="text-[13px] leading-snug text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`mt-3 space-y-2 overflow-y-auto overscroll-contain ${compact ? "min-h-0 flex-1" : "max-h-[32rem]"}`}>
        {feed.map((it, i) => {
          if (it.kind === "text") return it.role === "user"
            ? <div key={i} className="flex justify-end"><p className="max-w-[88%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground shadow-sm">{it.content}</p></div>
            : <div key={i} className="flex items-start gap-2.5"><OmpathMark className="mt-0.5 h-8 w-8 shrink-0" /><p className="max-w-[88%] whitespace-pre-line break-words rounded-2xl rounded-tl-md border bg-card px-4 py-2.5 text-[15px] leading-relaxed shadow-sm">{it.content}</p></div>;
          if (it.kind === "ask") return (
            <div key={i} className="ml-10 rounded-2xl border border-primary/30 bg-card p-3.5 shadow-sm">
              <p className="flex items-start gap-2 text-[15px] font-semibold"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {it.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">{it.options.map((o) => <button key={o} type="button" disabled={busy || Boolean(it.answered)} onClick={() => answer(i, o)} className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold ${it.answered === o ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted disabled:opacity-40"}`}>{o}</button>)}</div>
            </div>
          );
          if (it.kind === "result") {
            const r = it.result;
            return (
              <div key={i} className={`overflow-hidden rounded-2xl border text-[15px] leading-relaxed shadow-sm ${r.partial ? "border-amber-500/50 bg-amber-500/10" : "border-primary/30 bg-primary/10"}`}>
                {r.thumb && <img src={r.thumb} alt="" loading="lazy" className="aspect-[40/21] w-full object-cover" />}
                <div className="px-4 py-3">
                  <p className="whitespace-pre-line break-words">{r.partial ? <AlertTriangle className="mr-1 inline h-4 w-4 text-amber-600" /> : <Check className="mr-1 inline h-4 w-4 text-primary" />}{r.text}</p>
                  {r.briefing && (
                    <div className="mt-2 space-y-2">
                      {r.briefing.good.length > 0 && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3"><p className="text-[12px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Good news</p><ul className="mt-1.5 space-y-1.5 text-[14px] leading-snug">{r.briefing.good.map((l, li) => <li key={li}>{l}</li>)}</ul></div>}
                      {r.briefing.watch.length > 0 && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"><p className="text-[12px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">Needs a look</p><ul className="mt-1.5 space-y-1.5 text-[14px] leading-snug">{r.briefing.watch.map((l, li) => <li key={li}>{l}</li>)}</ul></div>}
                      <div className="flex flex-wrap gap-2">{r.briefing.suggestions.map((s) => <button key={s.label} type="button" disabled={busy || !world} onClick={() => void send(s.prompt)} className={`${btn} border bg-background hover:bg-muted`}><Wand2 className="h-3.5 w-3.5" /> {s.label}</button>)}</div>
                    </div>
                  )}
                  {r.health && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-4 rounded-xl bg-muted/60 p-3">
                        <div className="relative h-20 w-20 shrink-0"><svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.4" className="stroke-muted" /><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.4" strokeLinecap="round" className={r.health.score >= 80 ? "stroke-emerald-500" : r.health.score >= 60 ? "stroke-amber-500" : "stroke-red-500"} strokeDasharray={97.4} strokeDashoffset={97.4 * (1 - r.health.score / 100)} /></svg><span className="absolute inset-0 flex items-center justify-center text-xl font-black">{r.health.score}</span></div>
                        <div><p className="font-serif text-lg font-bold leading-tight">Site health</p><p className="text-sm text-muted-foreground">{r.health.score >= 80 ? "In good shape." : r.health.score >= 60 ? "A few things to tidy." : "Needs attention."}</p></div>
                      </div>
                      {r.health.sections.map((sec) => (
                        <div key={sec.title} className={`rounded-xl border p-3 ${STATUS_STYLE[sec.status]}`}>
                          <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide"><span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[sec.status]}`} />{sec.title}</p>
                          <ul className="mt-1.5 space-y-1 text-[14px] leading-snug">{sec.lines.map((l, li) => <li key={li}>{l}</li>)}</ul>
                        </div>
                      ))}
                      {r.fixes?.length ? <button type="button" disabled={busy || !world} onClick={() => world && setPlan(describe(r.fixes as AgentAction[], world))} className={`${btn} w-full bg-primary text-primary-foreground`}><Wand2 className="h-4 w-4" /> Fix everything I can ({r.fixes.length})</button> : null}
                    </div>
                  )}
                  {(r.links?.length || r.undo) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.links?.map((l) => l.external
                        ? <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={`${btn} border bg-background hover:bg-muted`}>{l.label.includes("WhatsApp") ? <MessageCircle className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />} {l.label}</a>
                        : <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={`${btn} border bg-background hover:bg-muted`}><ExternalLink className="h-4 w-4" /> {l.label}</a>)}
                      {r.poster && <button type="button" onClick={() => void makeStatusPoster(r.poster as PosterSpec).then((u) => downloadDataUrl(u, "ompath-status.png"))} className={`${btn} border bg-background hover:bg-muted`}>📱 Status image</button>}
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
              <div className="space-y-3 p-4 text-[15px] leading-relaxed">
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
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed">{plan.map((p, i) => <li key={i} className={p.ok ? "" : "text-muted-foreground line-through"}>{p.line}</li>)}</ol>
            {world && plan.map((p, i) => p.action.tool === "create_contest" && !p.ok && /no matching exam/.test(p.line) ? (
              <div key={`fix${i}`} className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5">
                <p className="text-xs font-bold">Which exam should the questions come from?</p>
                <input value={examQuery} onChange={(e) => setExamQuery(e.target.value)} placeholder="Search exams, e.g. respiratory" className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-base sm:text-sm" />
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {world.papers.filter((x) => !examQuery.trim() || x.title.toLowerCase().includes(examQuery.trim().toLowerCase())).slice(0, 8).map((x) => (
                    <button key={x.id} type="button" onClick={() => { setPlan((prev) => prev ? prev.map((q, k) => k === i ? describe([{ ...q.action, args: { ...q.action.args, exam: x.title } } as AgentAction], world)[0] : q) : prev); setExamQuery(""); }} className="block min-h-10 w-full rounded-lg border bg-background px-3 py-2 text-left text-sm hover:bg-muted">{x.title}</button>
                  ))}
                </div>
                <button type="button" onClick={() => setPlan((prev) => prev ? prev.map((q, k) => k === i ? describe([{ ...q.action, args: { ...q.action.args, exam: "__none__" } } as AgentAction], world)[0] : q) : prev)} className="mt-2 text-xs font-semibold text-primary underline">Create it without questions for now</button>
              </div>
            ) : null)}
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy || !plan.some((p) => p.ok)} onClick={() => void confirm()} className={`${btn} px-4 text-sm font-bold text-white ${danger ? "bg-destructive" : "bg-primary"}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, do it</button>
              <button type="button" disabled={busy} onClick={() => setPlan(null)} className={`${btn} border px-4 text-sm`}><X className="h-4 w-4" /> No</button>
            </div>
          </div>
        )}
        {busy && !plan && (
          <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground" role="status" aria-live="polite">
            <svg viewBox="0 0 36 36" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-muted" />
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-150" strokeDasharray={97.4} strokeDashoffset={97.4 * (1 - progress / 100)} />
            </svg>
            <span><strong className="text-foreground">{Math.round(progress)}%</strong> · {progress < 30 ? "Reading" : progress < 75 ? "Writing" : "Checking and saving"}…</span>
          </div>
        )}
        <div ref={end} />
      </div>
      {error && <p className="mt-2 shrink-0 rounded-2xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[14px] leading-snug" role="alert">{error}</p>}
      <div className="mt-2 shrink-0 rounded-3xl border bg-card shadow-lg pb-[env(safe-area-inset-bottom)]">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a, i) => (
            <span key={i} className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-muted px-2.5 py-1.5 text-xs">
              <FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 truncate"><strong>Pasted text</strong> · {a.length.toLocaleString()} characters · {a.slice(0, 40).replace(/\s+/g, " ")}…</span>
              <button type="button" aria-label="Remove the pasted text" onClick={() => setAttachments((l) => l.filter((_, k) => k !== i))} className="rounded p-1 hover:bg-background"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <form className="flex items-end gap-2 p-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea value={text} onChange={(e) => {
          const v = e.target.value;
          // some phone keyboards insert a pasted block as typing (no paste event): a big sudden jump becomes an attachment too
          if (v.length - text.length > LONG_PASTE) {
            let p = 0; while (p < text.length && text[p] === v[p]) p++;
            let q = 0; while (q < text.length - p && text[text.length - 1 - q] === v[v.length - 1 - q]) q++;
            const chunk = v.slice(p, v.length - q).trim();
            if (chunk.length > LONG_PASTE) { setAttachments((l) => [...l, chunk]); setText(v.slice(0, p) + v.slice(v.length - q)); return; }
          }
          setText(v);
        }}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t.length > LONG_PASTE) { e.preventDefault(); setAttachments((l) => [...l, t.trim()]); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); void send(text); } }}
          rows={text.length > 120 ? 5 : 2} disabled={!world || busy}
          placeholder={world ? (attachments.length ? "Tell me what to do with the pasted text…" : listening ? "Listening… speak now" : "Ask, speak, or paste notes…") : "Loading your data…"}
          className="min-w-0 flex-1 resize-none rounded-2xl bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground/70 sm:text-[15px]" />
        <button type="button" onClick={toggleMic} disabled={!world || busy} aria-label={listening ? "Stop listening" : "Speak instead of typing"} className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border disabled:opacity-40 ${listening ? "animate-pulse border-red-500 bg-red-500 text-white" : "hover:bg-muted"}`}>{listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
        <button type="submit" disabled={(!text.trim() && !attachments.length) || !world || busy} aria-label="Send" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
      </div>
    </section>
  );
}
