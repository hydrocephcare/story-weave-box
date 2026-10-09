import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUp, Bookmark, BookOpen, Check, Copy, ExternalLink, History, FilePlus2, Loader2, MessageSquarePlus, Search, Square, Mic, LineChart, RefreshCw, Share2, Zap, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { HitIcon } from "@/components/HitIcon";
import DriveFileViewer, { type DriveFile, type DriveKind } from "@/components/DriveFileViewer";
import { SubscribeModal } from "@/components/SubscribeModal";
import NotePreview from "@/components/ai/NotePreview";
import OmpathMark from "@/components/ai/OmpathMark";
import { Answer } from "@/components/ai/AnswerText";
import QuestionDrill from "@/components/ai/QuestionDrill";
import UpgradeCard from "@/components/ai/UpgradeCard";
import LoginCard from "@/components/ai/LoginCard";
import ClarifyCard from "@/components/ai/ClarifyCard";
import McqQuiz from "@/components/ai/McqQuiz";
import ReminderCard from "@/components/ai/ReminderCard";
import PlanCard from "@/components/ai/PlanCard";
import ReviewPanel from "@/components/ai/ReviewPanel";
import { flowReply } from "@/lib/ompathAiFlows";
import { unitsThisWeek } from "@/lib/ompathAiSuggest";
import { activity, weakTopics, readBookmarks, toggleBookmark } from "@/lib/review";
import EssayPractice from "@/components/ai/EssayPractice";
import PaperCard from "@/components/ai/PaperCard";
import { essayIntent, paperIntent, quizIntent } from "@/lib/ompathAiTools";
import { pharmReply } from "@/lib/ompathAiPharm";
import { relatedFor } from "@/lib/ompathAiRelated";
import { reportAiFailure } from "@/lib/aiHealth";
import { saveAnswerAsDraft } from "@/lib/answerToNote";
import { toast } from "@/hooks/use-toast";
import { answerStyle } from "@/lib/ompathAiStyle";
import { useFeatures } from "@/lib/features";
import { UNIVERSITIES, benefitsFor, shortName, useUniversity } from "@/lib/university";
import { AI_SHARE_TEXT, AI_TITLE, AI_URL } from "@/lib/aiShare";
import { shareOut } from "@/lib/storyShare";
import { SUBJECT_LABEL, drillIntent } from "@/lib/questionBank";
import { supabase } from "@/integrations/supabase/client";
import { useStudentAccess } from "@/lib/student";
import { unitNameMap, useSiteConfig, useTimetable } from "@/lib/siteConfig";
import { OFFICIAL_2026_SCHEDULES } from "@/lib/timetable2026";
import { personalReply } from "@/lib/ompathAiPersonal";
import { useAiAccountSync } from "@/lib/ompathAiSync";
import { guideReply } from "@/lib/ompathAiGuide";
import { suggestionsFor } from "@/lib/ompathAiSuggest";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSearch } from "@/hooks/useSiteSearch";
import { useAccess } from "@/lib/access";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";
import { aiStore, useAiStore, type AiTurn } from "@/lib/ompathAiStore";
import { FREE_DAILY_QUESTIONS, countQuestion, extractiveAnswer, followUps, parseQuery, questionsUsedToday, retrieve, streamAnswer, type Retrieval } from "@/lib/ompathAi";
import { scoringTerms } from "@/lib/ompathAiQuery";
import { dropCached, getCached, getShared, getTrending, quickReply, reportShared, saveCached, saveShared } from "@/lib/ompathAiQuick";
import { logSearch } from "@/lib/search";
import type { SiteHit } from "@/lib/siteSearch";

import { CLOSE_OVERLAYS_EVENT } from "@/lib/subscribe-prompt";
import { AI_RESUME_KEY as RESUME_KEY, AI_STATE_EVENT, OPEN_AI_EVENT } from "@/lib/aiEvents";

const STARTERS = [
  "I need notes on psychiatry",
  "Paediatrics notes on dehydration",
  "Explain Light's criteria",
  "Give me anatomy questions",
  "First-line drugs for hypertension",
  "Quiz me on heart failure",
];

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString();
};

function SourceRow({ h, onOpen, canMark, onLocked }: { h: SiteHit; onOpen: (h: SiteHit) => void; canMark: boolean; onLocked: () => void }) {
  const [marked, setMarked] = useState(() => readBookmarks().some((b) => b.key === h.key));
  return (
    <div className="relative">
      <button type="button" onClick={() => onOpen(h)} className="flex w-full items-start gap-3 rounded-lg border border-border bg-card py-2.5 pl-3 pr-11 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <HitIcon hit={h} className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug text-foreground">{h.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>
          {h.snippet && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{h.snippet}</span>}
        </span>
      </button>
      <button type="button" onClick={() => { if (!canMark) { onLocked(); return; } setMarked(toggleBookmark({ key: h.key, title: h.title, subtitle: h.subtitle, href: h.href })); }} aria-label={marked ? "Remove bookmark" : "Bookmark this"} aria-pressed={marked} className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><Bookmark className={`h-4 w-4 ${marked ? "fill-current text-primary" : "text-muted-foreground"}`} /></button>
    </div>
  );
}

export default function OmpathAIHost() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();
  const access = useAccess();
  const { sessions, activeId } = useAiStore();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history" | "saved" | "review">("chat");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SiteHit | null>(null);
  const [files, setFiles] = useState<{ items: DriveFile[]; index: number | null }>({ items: [], index: null });
  const [copied, setCopied] = useState<string | null>(null);
  const [historyQ, setHistoryQ] = useState("");
  const [resume, setResume] = useState(() => { try { return sessionStorage.getItem(RESUME_KEY) === "1"; } catch { return false; } });
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const session = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId]);
  const turns = session?.turns ?? [];
  const unlimited = isAdmin || access.canReveal;
  const features = useFeatures(unlimited);
  const [uni, setUni] = useUniversity();
  const [changingUni, setChangingUni] = useState(false);

  // Who is asking: the year comes from their profile, or from what they told Ompath AI before.
  const student = useStudentAccess();
  const siteCfg = useSiteConfig();
  const [profileYear, setProfileYear] = useState<number | null>(null);
  const [toldYear, setToldYear] = useState<number | null>(() => { try { const n = Number(localStorage.getItem("ompath_my_year")); return n >= 1 && n <= 6 ? n : null; } catch { return null; } });
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    if (!user) { setProfileYear(null); return; }
    (supabase as unknown as { from: (t: string) => any }).from("profiles").select("study_year").eq("user_id", user.id).maybeSingle() // eslint-disable-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: { study_year?: number | string } | null }) => setProfileYear(data?.study_year ? Number(data.study_year) : null), () => undefined);
  }, [user]);
  useAiAccountSync(user?.id ?? null);
  // signing out closes the assistant and forgets the student: the next person on this device starts clean
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (user) { wasSignedIn.current = true; return; }
    if (!wasSignedIn.current) return;
    wasSignedIn.current = false;
    abort.current?.abort();
    setOpen(false); setView("chat"); setQ(""); setBusy(false); setPreview(null); setToldYear(null); setProfileYear(null); setResume(false);
  }, [user, authLoading]);
  const myYear = profileYear ?? toldYear;
  const myTimetable = useTimetable(myYear ?? 1);
  const used = questionsUsedToday();
  const limitHit = !features.can("unlimitedAi") && used >= FREE_DAILY_QUESTIONS;

  // Live suggestions while typing, so a student can jump straight to a note without waiting for an answer.
  const live = useSiteSearch(q.trim().length >= 3 && !quickReply(q) ? parseQuery(q).topic : "", {}, open && !busy);
  const liveHits = useMemo(() => live.hits.filter((h) => h.group !== "Pages").slice(0, 4), [live.hits]);

  const askRef = useRef<(q: string) => Promise<void>>(async () => undefined);
  const mount = useCallback((question?: string) => {
    setOpen(true); setView("chat");
    if (!aiStore.get().activeId || !aiStore.get().sessions.length) aiStore.newSession();
    if (question && question.trim().length >= 2) window.setTimeout(() => void askRef.current(question), 60);
    else window.setTimeout(() => inputRef.current?.focus(), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => mount(String((e as CustomEvent).detail ?? ""));
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => { if (!o) mount(); return !o; }); } };
    const w = window as unknown as { __ompathAiPending?: string };
    if (w.__ompathAiPending !== undefined) { const pending = w.__ompathAiPending; delete w.__ompathAiPending; mount(pending); }
    window.addEventListener(OPEN_AI_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_AI_EVENT, onOpen); window.removeEventListener("keydown", onKey); };
  }, [mount]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, open, view]);
  useEffect(() => { window.dispatchEvent(new CustomEvent(AI_STATE_EVENT, { detail: open })); }, [open]);
  const [trending, setTrending] = useState<string[]>([]);
  const quickLinks = useMemo<[string, string][]>(() => [
    ["Timetable", `/timetable/year-${myYear ?? 1}`], ["Recently added", "/recent"], ["Latest notes", "/new-notes"], ["Past papers", "/papers"],
    ...((myYear ?? 0) >= 3 ? ([["Clinical cases", "/clinical"], ["OSCE", "/clinical/osce"], ["Pharmacology", "/pharmacology"], ["Must-knows", "/must-knows"]] as [string, string][]) : []),
    ["Flashcards", "/flashcards"], ["MCQs", "/mcqs"], ["Library", "/books"], ["Stories", "/stories"],
  ], [myYear]);
  // "Today's 5": five questions on the topic you miss most, or on this week's unit, with your streak. Free, no AI credit.
  const daily = useMemo(() => {
    if (!user) return null;
    const weakest = features.can("review") ? weakTopics(1)[0]?.topic.replace(/^[^:]+:\s*/, "") : "";
    const unit = unitsThisWeek(myYear ? myTimetable : [], unitNameMap(siteCfg), new Date())[0];
    const topic = weakest || unit;
    return topic ? { topic, why: weakest ? "a topic you have been missing" : "from this week's timetable", streak: activity().streak } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, myYear, myTimetable, siteCfg, turns.length]);
  const suggestions = useMemo(() => suggestionsFor(myYear, myYear ? myTimetable : [], unitNameMap(siteCfg), new Date(), trending), [myYear, myTimetable, siteCfg, trending]);
  useEffect(() => { if (open && !trending.length) void getTrending().then(setTrending); }, [open, trending.length]);

  // Speak instead of typing (Chrome, Edge and Safari; the button is hidden where it is not supported).
  const [listening, setListening] = useState(false);
  const SpeechRec = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition) : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  const listen = () => {
    if (!SpeechRec || listening) return;
    const rec = new SpeechRec();
    rec.lang = "en-KE"; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e: any) => { setQ(Array.from(e.results as ArrayLike<any>).map((r) => r[0].transcript).join(" ")); }; // eslint-disable-line @typescript-eslint/no-explicit-any
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  // the subscription prompt needs the whole screen: step aside, and leave the "Back to Ompath AI" button so nothing is lost
  useEffect(() => {
    const away = () => {
      setPreview(null); setFiles({ items: [], index: null });
      setOpen((o) => { if (o) { try { sessionStorage.setItem(RESUME_KEY, "1"); } catch { /* ignore */ } setResume(true); } return false; });
    };
    window.addEventListener(CLOSE_OVERLAYS_EVENT, away);
    return () => window.removeEventListener(CLOSE_OVERLAYS_EVENT, away);
  }, []);

  useEffect(() => { if (open) { try { sessionStorage.removeItem(RESUME_KEY); } catch { /* ignore */ } setResume(false); } }, [open]);

  /** Adds the notes, files and pages that go with an answer that did not come from a search (quizzes, drugs, drills). Free. */
  function attachRelated(sessionId: string, turnId: string, topic: string, year?: number | null) {
    void relatedFor(topic, year).then((hits) => { if (hits.length) aiStore.patchTurn(sessionId, turnId, { hits }); });
  }
  const openSearch = (topic: string) => { setOpen(false); try { sessionStorage.setItem(RESUME_KEY, "1"); } catch { /* ignore */ } setResume(true); navigate(`/search?q=${encodeURIComponent(topic)}`); };

  async function ask(question: string, opts: { fresh?: boolean; context?: string } = {}) {
    const text = question.trim();
    if (text.length < 2 || busy || authLoading) return;
    let sid = aiStore.get().activeId;
    if (!sid || !aiStore.get().sessions.some((s) => s.id === sid)) sid = aiStore.newSession();
    const sessionId = sid;
    setQ(""); setView("chat");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const id = `t${Date.now()}`;
    // Ompath AI needs an account: the question is kept, and a log-in card brings the student straight back to it
    if (!user) {
      aiStore.addTurn(sessionId, { id, q: text, answer: "", hits: [], grounded: true, error: "Please log in to use Ompath AI.", login: true, at: Date.now() });
      aiStore.flush();
      return;
    }

    // Free and instant: small talk, and anything this device has already been answered.
    const quick = opts.fresh ? null : quickReply(text);
    if (quick) {
      aiStore.addTurn(sessionId, { id, q: text, answer: quick.answer, hits: [], grounded: true, followUps: quick.followUps, instant: "quick", at: Date.now() });
      aiStore.flush();
      return;
    }
    const weak = features.can("review") ? weakTopics(4).map((w) => w.topic) : [];
    const flow = opts.fresh ? null : flowReply(text, { year: myYear, units: unitsThisWeek(myYear ? myTimetable : [], unitNameMap(siteCfg), new Date()).slice(0, 6), weak, keyDates: siteCfg.keyDates, now: new Date(), canReminders: features.can("reminders") });
    if (flow) {
      if (flow.setYear) { try { localStorage.setItem("ompath_my_year", String(flow.setYear)); } catch { /* storage blocked */ } setToldYear(flow.setYear); }
      aiStore.addTurn(sessionId, { id, q: text, answer: flow.answer, hits: [], grounded: true, followUps: flow.followUps, clarify: flow.clarify, reminder: flow.reminder, plan: flow.plan, locked: flow.locked, instant: "quick", at: Date.now() });
      aiStore.flush();
      return;
    }
    const drill = opts.fresh ? null : drillIntent(text);
    if (drill) {
      const label = SUBJECT_LABEL[drill.subject].toLowerCase();
      aiStore.addTurn(sessionId, { id, q: text, answer: `Here are some **${label}** spot questions from the Ompath anatomy banks, picture first. Change the subject or section below, tap a picture to enlarge it, and reveal an answer when you are ready.`, hits: [], grounded: true, drill, followUps: ["Histology questions", "Embryology questions", "Upper limb anatomy questions"], instant: "quick", at: Date.now() });
      aiStore.flush();
      attachRelated(sessionId, id, drill.topic || `${label} anatomy`);
      return;
    }
    let tool = opts.fresh ? null : (essayIntent(text) ?? paperIntent(text) ?? quizIntent(text));
    // "quiz me on my weakest topic" uses the Review figures when there are some
    if (!tool && !opts.fresh && /\b(weak(est)?|struggl\w*|missed)\b/i.test(text) && /\b(quiz|mcqs?|test|practi[sc]e)\b/i.test(text) && weak[0]) tool = { kind: "quiz", topic: weak[0].replace(/^[^:]+:\s*/, ""), n: 10, year: null };
    if (tool) {
      const about = tool.topic ? ` on **${tool.topic}**` : "";
      const answer = tool.kind === "quiz" ? `Here is a quiz${about}, made from the MCQs on Ompath Study. Pick an answer for each question, then submit to see your score and the reasons.`
        : tool.kind === "essay" ? `Essay and short-answer questions${about}. Tap to reveal the model answer when you have tried it.`
        : `Here is the paper${about}. Tap it to read the whole thing.`;
      aiStore.addTurn(sessionId, { id, q: text, answer, hits: [], grounded: true, tool, followUps: tool.kind === "quiz" ? [`Essay questions on ${tool.topic}`, `Past paper on ${tool.topic}`, `Notes on ${tool.topic}`] : [`${tool.topic ? tool.topic + " " : ""}mcqs`.replace(/^ /, "") && `10 mcqs on ${tool.topic || "my unit"}`], instant: "quick", at: Date.now() });
      aiStore.flush();
      if (tool.topic && tool.kind !== "paper") attachRelated(sessionId, id, tool.topic, tool.year);
      return;
    }
    // Pharmacology from the site's own drug library: no AI, no credit. A drug that is not on the site falls through to the normal search and AI.
    const pharm = opts.fresh ? null : pharmReply(text);
    if (pharm) {
      aiStore.addTurn(sessionId, { id, q: text, answer: pharm.answer, hits: [], grounded: true, followUps: pharm.followUps, links: pharm.links, instant: "quick", at: Date.now() });
      aiStore.flush();
      attachRelated(sessionId, id, pharm.topic);
      return;
    }
    const mine = opts.fresh ? null : personalReply(text, {
      year: myYear, signedIn: Boolean(user), status: user ? (student.status ?? null) : "none",
      group: (() => { try { return localStorage.getItem(`ompath_group_y${myYear ?? 0}`) ?? ""; } catch { return ""; } })(),
      name: (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0], unitNames: unitNameMap(siteCfg), keyDates: siteCfg.keyDates, now: new Date(),
      tables: { ...OFFICIAL_2026_SCHEDULES, ...siteCfg.timetable, ...(myYear ? { [myYear]: myTimetable } : {}) },
    });
    if (mine) {
      try {
        if (mine.setYear) { localStorage.setItem("ompath_my_year", String(mine.setYear)); setToldYear(mine.setYear); }
        if (mine.setGroup && myYear) localStorage.setItem(`ompath_group_y${myYear}`, mine.setGroup);
      } catch { /* storage blocked */ }
      aiStore.addTurn(sessionId, { id, q: text, answer: mine.answer, hits: [], grounded: true, followUps: mine.followUps, links: mine.links, clarify: mine.clarify, instant: "quick", at: Date.now() });
      aiStore.flush();
      return;
    }
    const guide = opts.fresh || !text.length ? null : await guideReply(text, myYear);
    if (guide) {
      aiStore.addTurn(sessionId, { id, q: text, answer: guide.answer, hits: [], grounded: true, followUps: guide.followUps, links: guide.links, instant: "quick", at: Date.now() });
      aiStore.flush();
      return;
    }
    const saved = opts.fresh ? null : getCached(text);
    if (saved) {
      aiStore.addTurn(sessionId, { id, q: text, answer: saved.answer, hits: saved.hits, grounded: saved.grounded, followUps: saved.followUps, instant: "saved", at: Date.now() });
      aiStore.flush();
      return;
    }
    // Someone else already asked this: their answer is shown at once, and finding the matching notes costs nothing.
    if (!opts.fresh) {
      setBusy(true);
      const shared = await getShared(text);
      if (shared) {
        const r = await retrieve(text, myYear).catch(() => null);
        aiStore.addTurn(sessionId, { id, q: text, answer: shared.answer, hits: r?.hits ?? [], grounded: shared.grounded, followUps: r ? followUps(r.parsed) : undefined, instant: "saved", at: Date.now() });
        aiStore.flush();
        saveCached(text, { answer: shared.answer, grounded: shared.grounded, hits: r?.hits ?? [], followUps: r ? followUps(r.parsed) : undefined });
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (limitHit) {
      aiStore.addTurn(sessionId, { id, q: text, answer: "", hits: [], grounded: true, error: "You have reached today's free AI limit.", upgrade: "questions", at: Date.now() });
      aiStore.flush();
      return;
    }
    setBusy(true);
    const prior = (aiStore.get().sessions.find((s) => s.id === sessionId)?.turns ?? []).slice(-3).flatMap((t) => [{ role: "user" as const, content: t.q }, { role: "assistant" as const, content: t.answer }]).filter((m) => m.content);
    aiStore.addTurn(sessionId, { id, q: text, answer: "", hits: [], grounded: true, at: Date.now() });
    abort.current = new AbortController();
    let retrieval: Retrieval | null = null;
    try {
      retrieval = await retrieve(text, myYear);
      aiStore.patchTurn(sessionId, id, { hits: retrieval.hits, grounded: retrieval.grounded, followUps: followUps(retrieval.parsed) });
      void logSearch(retrieval.parsed.topic || text, retrieval.hits.length);
      // Pure look-ups ("psychiatry notes") are answered by the list itself; the model only writes when there is something to explain.
      const lookupOnly = retrieval.parsed.isLookup && !retrieval.parsed.isQuestion && retrieval.hits.length > 0 && (retrieval.parsed.wants === "papers" || retrieval.parsed.wants === "files" || retrieval.parsed.wants === "timetable");
      if (lookupOnly) {
        const n = retrieval.hits.length;
        aiStore.patchTurn(sessionId, id, { answer: `I found ${n} match${n === 1 ? "" : "es"} for **${retrieval.parsed.topic || text}**${retrieval.parsed.year ? ` in Year ${retrieval.parsed.year}` : ""}. Tap one to read it here.` });
        aiStore.flush();
        return;
      }
      const answer = await streamAnswer({ question: opts.context ? `${text}\n\nThe official answer key for this question, from the Ompath bank:\n${opts.context}` : answerStyle(text, myYear), history: prior, retrieval }, { onText: (full) => aiStore.patchTurn(sessionId, id, { answer: full }), signal: abort.current.signal });
      countQuestion();
      aiStore.patchTurn(sessionId, id, { answer });
      aiStore.flush();
      if (answer.trim().length > 40) { saveCached(text, { answer, grounded: retrieval.grounded, hits: retrieval.hits, followUps: followUps(retrieval.parsed) }); void saveShared(text, answer, retrieval.grounded); }
    } catch (e) {
      if ((e as Error).name === "AbortError") { aiStore.flush(); return; }
      // never a dead end: the matching notes if we have them, otherwise links that still work, and the admin is told
      const local = retrieval ? null : await guideReply(text, myYear).catch(() => null);
      const fallback = retrieval ? extractiveAnswer(retrieval) : local?.answer ?? "Ompath AI could not reach the notes just now, so here is where to look. Try again in a minute.";
      const searchLink = { label: "Search the site", href: `/search?q=${encodeURIComponent(parseQuery(text).topic || text)}` };
      void reportAiFailure(retrieval ? "answer" : "search", text, e, retrieval ? (retrieval.passages.length ? "Matching passages shown" : retrieval.hits.length ? "Matching notes shown" : "Search link shown") : local ? "Site guide shown" : "Quick links shown");
      aiStore.patchTurn(sessionId, id, { answer: fallback, links: local?.links ?? [searchLink, { label: "Latest notes", href: "/new-notes" }, { label: "Past papers", href: "/papers" }], followUps: local?.followUps });
      aiStore.flush();
    } finally { setBusy(false); abort.current = null; }
  }

  askRef.current = ask;

  const openHit = (hit: SiteHit, all: SiteHit[]) => {
    if (hit.group === "Library files") {
      const list = all.filter((h) => h.group === "Library files").map((h) => [h.key.replace(/^file-/, ""), h.title, ((h.kind as DriveKind) || "file")] as DriveFile);
      setFiles({ items: list, index: Math.max(0, list.findIndex((f) => f[0] === hit.key.replace(/^file-/, ""))) });
    } else if (hit.key.startsWith("article-") || hit.key.startsWith("static-")) setPreview(hit);
    else goFull(hit);
  };

  const goFull = (hit: SiteHit) => {
    try { sessionStorage.setItem(RESUME_KEY, "1"); } catch { /* ignore */ }
    setResume(true); setPreview(null); setOpen(false);
    navigate(hit.href);
  };

  /** Admin only: the answer becomes a draft note on the site (private until the admin publishes it). */
  const publishAsNote = async (t: AiTurn) => {
    try {
      const { draft } = await saveAnswerAsDraft(t.q, t.answer, t.hits);
      toast({ title: "Saved as a draft note", description: `“${draft.title}”${draft.category ? ` in ${draft.category}` : ""}. Open Admin → Articles to read it and publish.` });
    } catch (e) { toast({ title: "Could not save the draft", description: (e as Error).message, variant: "destructive" }); }
  };

  const copy = async (t: AiTurn) => {
    try { await navigator.clipboard.writeText(t.answer); setCopied(t.id); window.setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };

  const savedTurns = useMemo(() => sessions.flatMap((s) => s.turns.filter((t) => t.starred && t.answer).map((t) => ({ sid: s.id, t }))), [sessions]);

  const filteredSessions = useMemo(() => {
    const f = historyQ.trim().toLowerCase();
    return sessions.filter((s) => s.turns.length && (!f || s.title.toLowerCase().includes(f) || s.turns.some((t) => t.q.toLowerCase().includes(f))));
  }, [sessions, historyQ]);

  const previewTerms = useMemo(() => (preview && turns.length ? scoringTerms(parseQuery(turns[turns.length - 1].q)) : []), [preview, turns]);
  const modalMounted = /^\/(blog|notes)\//.test(pathname); // those pages already carry the subscribe prompt

  const Group = ({ title, rows, all }: { title: string; rows: SiteHit[]; all: SiteHit[] }) => rows.length ? (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title} ({rows.length})</p>
      <div className="grid gap-1.5">{rows.slice(0, 6).map((h) => <SourceRow key={h.key} h={h} onOpen={(x) => openHit(x, all)} canMark={features.can("review")} onLocked={() => openSubscribePrompt("Subscribe to bookmark notes and use your Review.")} />)}</div>
    </div>
  ) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">Ompath AI</SheetTitle>
          <SheetDescription className="sr-only">Ask a question and get answers and notes from Ompath Study.</SheetDescription>

          <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <OmpathMark className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-serif text-base font-bold leading-tight">Ompath AI</p>
              <p className="truncate text-[11px] text-muted-foreground">{view === "history" ? "Your past chats" : view === "review" ? "Your review, reminders and plans" : view === "saved" ? "Answers you saved" : "Answers from your notes, files and papers"}</p>
            </div>
            <button type="button" onClick={() => { aiStore.newSession(); setView("chat"); setQ(""); window.setTimeout(() => inputRef.current?.focus(), 50); }} aria-label="New chat" title="New chat" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><MessageSquarePlus className="h-5 w-5" /></button>
            <button type="button" onClick={() => setView(view === "review" ? "chat" : "review")} aria-label="My review" title="My review" aria-pressed={view === "review"} className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted ${view === "review" ? "bg-muted" : ""}`}><LineChart className="h-5 w-5" /></button>
            <button type="button" onClick={() => setView(view === "saved" ? "chat" : "saved")} aria-label="Saved answers" title="Saved answers" aria-pressed={view === "saved"} className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted ${view === "saved" ? "bg-muted" : ""}`}><Bookmark className="h-5 w-5" /></button>
            <button type="button" onClick={() => setView(view === "history" ? "chat" : "history")} aria-label="History" title="History" aria-pressed={view === "history"} className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted ${view === "history" ? "bg-muted" : ""}`}><History className="h-5 w-5" /></button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Ompath AI" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
          </header>

          {view === "review" ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              <ReviewPanel allowed={features.can("review")} onAsk={(x) => { setView("chat"); void ask(x); }} onOpen={(href) => goFull({ href } as SiteHit)} />
            </div>
          ) : view === "saved" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {savedTurns.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nothing saved yet. Tap the bookmark under an answer to keep it here.</p> : (
                <ul className="space-y-2">
                  {savedTurns.map(({ sid, t }) => (
                    <li key={t.id} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-sm font-semibold">{t.q}</p>
                      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{t.answer.replace(/[*#]/g, "")}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs font-bold">
                        <button type="button" onClick={() => { aiStore.open(sid); setView("chat"); }} className="text-primary hover:underline">Open chat</button>
                        <button type="button" onClick={() => aiStore.patchTurn(sid, t.id, { starred: false })} className="text-muted-foreground hover:text-destructive">Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : view === "history" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-border px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input value={historyQ} onChange={(e) => setHistoryQ(e.target.value)} placeholder="Search your chats" aria-label="Search your chats" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </div>
              {filteredSessions.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{sessions.some((s) => s.turns.length) ? "No chat matches that." : "No chats yet. Ask your first question."}</p> : (
                <ul className="space-y-1.5">
                  {filteredSessions.map((s) => (
                    <li key={s.id} className="flex items-center gap-1 rounded-lg border border-border bg-card">
                      <button type="button" onClick={() => { aiStore.open(s.id); setView("chat"); }} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                        <span className="block truncate text-sm font-semibold">{s.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{s.turns.length} question{s.turns.length === 1 ? "" : "s"} · {ago(s.updated)}</span>
                      </button>
                      <button type="button" onClick={() => aiStore.remove(s.id)} aria-label={`Delete ${s.title}`} className="mr-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              {sessions.some((s) => s.turns.length) && <button type="button" onClick={() => { if (window.confirm("Delete all your Ompath AI chats on this device?")) aiStore.clearAll(); }} className="mt-4 text-xs font-semibold text-destructive hover:underline">Clear all chats</button>}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
              {turns.length === 0 && !user && !authLoading && <div className="mb-3"><LoginCard onNavigate={() => setOpen(false)} /></div>}
              {turns.length === 0 && user && (!uni || changingUni) && (
                <div className="mb-3"><ClarifyCard question="Which university are you at? I tailor what I show you." options={["MKU", "UoN", "KU", "JKUAT", "Moi", "Maseno", "Egerton", "Kabarak"]} other="Not listed? Type yours and add it" onPick={(a) => { const full = UNIVERSITIES.find((u) => shortName(u).toLowerCase() === a.toLowerCase()); void setUni(full ?? a, !full); setChangingUni(false); }} /></div>
              )}
              {turns.length === 0 && user && uni && !changingUni && (
                <details className="mb-3 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm">
                  <summary className="cursor-pointer font-semibold">{benefitsFor(uni).title}</summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">{benefitsFor(uni).points.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{p}</li>)}</ul>
                  {benefitsFor(uni).note && <p className="mt-2 text-xs text-muted-foreground">{benefitsFor(uni).note}</p>}
                  <button type="button" onClick={() => setChangingUni(true)} className="mt-2 text-xs font-bold text-primary hover:underline">Change university</button>
                </details>
              )}
              {turns.length === 0 && (
                <section className="rounded-2xl border border-border bg-card p-4">
                  <p className="flex items-center gap-2 font-serif text-lg font-bold"><OmpathMark className="h-7 w-7" plain /> What do you need?</p>
                  <p className="mt-1 text-sm text-muted-foreground">Ask for notes, a past paper, a quiz, a study plan or a reminder, or just ask a question. I search every note, paper and file on Ompath Study first.</p>
                  <button type="button" onClick={() => void shareOut(AI_SHARE_TEXT, AI_URL, AI_TITLE)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><Share2 className="h-3.5 w-3.5" /> Share Ompath AI with your group</button>
                  <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Quick links">{quickLinks.map(([label, href]) => <button key={href} type="button" onClick={() => goFull({ href } as SiteHit)} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/15"><ExternalLink className="h-3 w-3" /> {label}</button>)}</div>
                  {daily && (
                    <button type="button" onClick={() => void ask(`5 mcqs on ${daily.topic}`)} className="mt-4 flex w-full items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-400/10 px-3.5 py-3 text-left hover:bg-amber-400/15">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-extrabold text-black">5</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Today's 5 questions: {daily.topic}</span><span className="block text-xs text-muted-foreground">{daily.why}{daily.streak > 0 ? ` · ${daily.streak}-day streak` : ""}</span></span>
                    </button>
                  )}
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-primary">{suggestions.caption}</p>
                  <div className="mt-2 flex flex-wrap gap-2">{suggestions.chips.map((s) => <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-border px-3 py-1.5 text-left text-sm hover:border-primary hover:text-primary">{s}</button>)}</div>
                </section>
              )}
              <div className="space-y-7">
                {turns.map((t, ti) => {
                  const notes = t.hits.filter((h) => h.group === "Notes" && h.kind !== "paper" && h.kind !== "mcq");
                  const papers = t.hits.filter((h) => h.kind === "paper");
                  const mcqs = t.hits.filter((h) => h.group === "MCQs & flashcards");
                  const filesH = t.hits.filter((h) => h.group === "Library files");
                  const more = t.hits.filter((h) => h.group === "Pages" || h.group === "Outline topics" || h.group === "Units").slice(0, 6);
                  const last = ti === turns.length - 1;
                  return (
                    <article key={t.id} className="space-y-3">
                      <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">{t.q}</div>
                      <div>
                        {t.answer ? <Answer text={t.answer} /> : t.error ? <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">{t.error}</p>
                          : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t.hits.length ? "Writing your answer…" : "Searching your notes…"}</p>}
                        {t.answer && !t.error && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {t.instant === "quick" ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary"><Zap className="h-3 w-3" /> Instant</span>
                              : <span className={`rounded-full px-2 py-0.5 font-semibold ${t.grounded ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>{t.grounded ? "From your Ompath notes" : "General guidance, not from the notes"}</span>}
                            {t.instant === "saved" && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary"><Zap className="h-3 w-3" /> Instant · saved</span>}
                            {t.instant !== "quick" && last && !busy && <button type="button" onClick={() => { dropCached(t.q); void ask(t.q, { fresh: true }); }} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted" aria-label="Answer again" title="Answer again"><RefreshCw className="h-3.5 w-3.5" /></button>}
                            {typeof navigator !== "undefined" && "share" in navigator && t.instant !== "quick" && <button type="button" onClick={() => { void navigator.share({ title: t.q, text: `${t.answer.slice(0, 600)}\n\nOmpath Study`, url: window.location.origin }).catch(() => undefined); }} className="rounded-md p-1 hover:bg-muted" aria-label="Share answer"><Share2 className="h-3.5 w-3.5" /></button>}
                            <button type="button" onClick={() => aiStore.patchTurn(session!.id, t.id, { starred: !t.starred })} aria-pressed={Boolean(t.starred)} aria-label={t.starred ? "Remove from saved" : "Save this answer"} className={`rounded-md p-1 hover:bg-muted ${t.starred ? "text-primary" : ""}`}><Bookmark className={`h-3.5 w-3.5 ${t.starred ? "fill-current" : ""}`} /></button>
                            {isAdmin && t.grounded && t.answer.length > 200 && <button type="button" onClick={() => void publishAsNote(t)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-primary hover:bg-primary/10" aria-label="Publish as a note on the site" title="Publish as a note on the site (saved as a draft)"><FilePlus2 className="h-3.5 w-3.5" /> Publish as a note</button>}
                            <button type="button" onClick={() => void copy(t)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted" aria-label="Copy answer">{copied === t.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                            <button type="button" onClick={() => aiStore.patchTurn(session!.id, t.id, { vote: t.vote === "up" ? undefined : "up" })} aria-pressed={t.vote === "up"} aria-label="Good answer" className={`rounded-md p-1 hover:bg-muted ${t.vote === "up" ? "text-primary" : ""}`}><ThumbsUp className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => { if (t.vote !== "down") { dropCached(t.q); if (t.instant === "saved") void reportShared(t.q); } aiStore.patchTurn(session!.id, t.id, { vote: t.vote === "down" ? undefined : "down" }); }} aria-pressed={t.vote === "down"} aria-label="Bad answer" className={`rounded-md p-1 hover:bg-muted ${t.vote === "down" ? "text-destructive" : ""}`}><ThumbsDown className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </div>
                      {t.tool?.kind === "quiz" && <McqQuiz key={t.id} topic={t.tool.topic} n={t.tool.n} year={t.tool.year} canLong={features.can("longQuiz")} onAgain={(tp) => void ask(`${(t.tool as { n: number }).n} mcqs on ${tp}`)} onRead={openSearch} />}
                      {t.tool?.kind === "essay" && <EssayPractice key={t.id} topic={t.tool.topic} year={t.tool.year} canReveal={unlimited} />}
                      {t.tool?.kind === "paper" && <PaperCard key={t.id} topic={t.tool.topic} year={t.tool.year} latest={t.tool.latest} onOpen={(h) => setPreview(h)} />}
                      {t.clarify && <ClarifyCard question={t.clarify.question} options={t.clarify.options} other={t.clarify.other} disabled={!last || busy} onPick={(a) => void ask(t.clarify?.send?.[a] ?? a)} />}
                      {t.reminder && <ReminderCard reminder={t.reminder} />}
                      {t.plan && <PlanCard plan={t.plan} canSave={features.can("studyPlanSave")} canRemind={features.can("reminders")} />}
                      {t.locked && <UpgradeCard kind="feature" title="Reminders are for Pro" why="Pro students can say “remind me to revise cardiology tomorrow at 6 pm” and get an alert on the site and an entry in their phone calendar." />}
                      {t.drill && <QuestionDrill key={t.id} subject={t.drill.subject} topic={t.drill.topic} canReveal={unlimited} noPictureLimit={features.can("unlimitedPictures")} onNeedSubscribe={() => openSubscribePrompt("Subscribe to reveal answers.")} onOpen={(href) => goFull({ href } as SiteHit)} />}
                      {t.login && <LoginCard question={t.q} onNavigate={() => setOpen(false)} />}
                      {t.upgrade && <UpgradeCard kind={t.upgrade} />}
                      {t.links && t.links.length > 0 && <div className="flex flex-wrap gap-2">{t.links.map((l) => <button key={l.href} type="button" onClick={() => goFull({ href: l.href } as SiteHit)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><ExternalLink className="h-4 w-4" /> {l.label}</button>)}</div>}
                      {t.hits.length > 0 && (
                        <div className="space-y-3">
                          <Group title="Notes" rows={notes} all={t.hits} />
                          <Group title="Past papers" rows={papers} all={t.hits} />
                          <Group title="MCQs & flashcards" rows={mcqs} all={t.hits} />
                          <Group title="Library files" rows={filesH} all={t.hits} />
                          {more.length > 0 && <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Also on the site</p><div className="flex flex-wrap gap-1.5">{more.map((h) => <button key={h.key} type="button" onClick={() => goFull(h)} className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary">{h.title.slice(0, 48)}</button>)}</div></div>}
                          <button type="button" onClick={() => { const topic = parseQuery(t.q).topic || t.q; setOpen(false); try { sessionStorage.setItem(RESUME_KEY, "1"); } catch { /* ignore */ } setResume(true); navigate(`/search?q=${encodeURIComponent(topic)}`); }} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"><BookOpen className="h-3.5 w-3.5" /> See every result <ExternalLink className="h-3 w-3" /></button>
                        </div>
                      )}
                      {last && !busy && t.answer && (t.followUps?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">{t.followUps!.map((f) => <button key={f} type="button" onClick={() => void ask(f)} className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10">{f}</button>)}</div>
                      )}
                    </article>
                  );
                })}
                <div ref={endRef} />
              </div>
            </div>
          )}

          {view === "chat" && (
            <div className="border-t border-border bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
              {limitHit && (
                <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  You have used today's {FREE_DAILY_QUESTIONS} free questions. Notes search still works. <button type="button" onClick={() => openSubscribePrompt("Subscribe for unlimited Ompath AI questions.")} className="font-bold underline">Subscribe for unlimited</button>
                </div>
              )}
              {liveHits.length > 0 && q.trim().length >= 3 && (
                <div className="mb-2 overflow-hidden rounded-xl border border-border bg-card">
                  {liveHits.map((h) => (
                    <button key={h.key} type="button" onClick={() => openHit(h, live.hits)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-primary/5">
                      <HitIcon hit={h} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{h.title}</span><span className="block truncate text-[11px] text-muted-foreground">{h.subtitle}</span></span>
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="flex items-end gap-1.5 rounded-2xl border border-border bg-card p-1.5 transition-shadow focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]">
                <textarea ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`; }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} rows={1} placeholder="Ask Ompath AI…" aria-label="Ask Ompath AI" enterKeyHint="send" autoComplete="off" autoCorrect="on" className="block max-h-36 min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-[10px] text-base leading-6 outline-none placeholder:text-muted-foreground" />
                {SpeechRec && !busy && <button type="button" onClick={listen} aria-label={listening ? "Listening" : "Speak your question"} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${listening ? "animate-pulse bg-destructive/15 text-destructive" : "text-muted-foreground hover:bg-muted"}`}><Mic className="h-5 w-5" /></button>}
                {busy ? <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"><Square className="h-4 w-4" /></button>
                  : <button type="submit" disabled={q.trim().length < 2} aria-label="Ask" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><ArrowUp className="h-5 w-5" /></button>}
              </form>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">For study only, not for treating patients. Check important facts in your notes{!unlimited ? ` · ${Math.max(0, FREE_DAILY_QUESTIONS - used)} free questions left today` : ""}.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NotePreview hit={preview} terms={previewTerms} onClose={() => setPreview(null)} onOpenFull={goFull} />
      <DriveFileViewer items={files.items} index={files.index} onIndexChange={(i) => setFiles((f) => ({ ...f, index: i }))} onDownload={() => undefined} where="Ompath AI" />
      {!modalMounted && <SubscribeModal settings={access.settings} loading={access.loading} onUnlocked={access.applyPass} />}

      {resume && !open && (
        <div className="fixed bottom-16 left-3 z-40 flex items-center overflow-hidden rounded-full border border-border bg-foreground text-background shadow-lg print:hidden">
          <button type="button" onClick={() => mount()} className="flex items-center gap-1.5 py-2.5 pl-3.5 pr-2 text-xs font-bold"><OmpathMark className="h-5 w-5" /> Back to Ompath AI</button>
          <button type="button" onClick={() => { try { sessionStorage.removeItem(RESUME_KEY); } catch { /* ignore */ } setResume(false); }} aria-label="Dismiss" className="py-2.5 pl-1 pr-3 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </>
  );
}
