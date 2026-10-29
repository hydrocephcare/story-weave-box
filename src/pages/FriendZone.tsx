import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Bot, Clock, Gamepad2, Heart, Loader2, LogIn, Lock, Plus, Skull, Sparkles, Timer, Trophy, Users, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyYear } from "@/hooks/useMyYear";
import { useTopicIndex } from "@/lib/topics";
import { useDisplayName } from "@/hooks/useDisplayName";
import { aiTopicIdeas } from "@/lib/zoneSuggest";
import StudyGuide from "@/components/StudyGuide";
import { AI_LEVELS, MODES, addFriend, closeMyRoom, createRoom, myFriendCode, myFriends, myHistory, myOpenRooms, openGames, removeFriend, weakTopics, type Friend, type OpenGame, type OpenRoom, type WeakTopic, newToken, normaliseCode, saveNick, saveToken, savedNick, type ZoneGame, type ZoneHistoryRow, type ZoneMode, type ZoneQuestion } from "@/lib/zone";
import { AI_GAMES, GAMES, buildGame } from "@/lib/zoneGames";

const COUNTS = [5, 10, 15, 20, 30];
const MODE_ICON: Record<ZoneMode, typeof Zap> = { speed: Zap, marathon: Timer, sudden: Skull };
const TOPIC_IDEAS: { t: string; game?: ZoneGame }[] = [{ t: "Aponeurosis", game: "image" }, { t: "Thyroid" }, { t: "Beta-blockers" }, { t: "Malaria" }, { t: "Brachial plexus" }, { t: "Heart failure" }, { t: "Antibiotics" }, { t: "Cranial nerves" }];

interface DailyGame { id: string; title: string; game: ZoneGame; topic: string; blurb?: string; year?: number; questions: ZoneQuestion[] }
const ago = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

/** /friend-zone: make a room from a topic, join one with a code, play today's new games, and see your record. */
export default function FriendZone() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { year } = useMyYear();
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const [nick, setNick] = useState(() => savedNick() || (meta?.full_name || meta?.name || "").split(" ")[0] || "");
  const [params] = useSearchParams();
  const accountName = useDisplayName();
  const nickTouched = useRef(false);
  // the name set in the account is the one friends see, unless the player typed another in this box
  useEffect(() => { if (accountName && !nickTouched.current) setNick(accountName); }, [accountName]);
  const [code, setCode] = useState("");
  const [aiHints, setAiHints] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const skipAi = useRef("");
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [game, setGame] = useState<ZoneGame>("quiz");
  const [mode, setMode] = useState<ZoneMode>("speed");
  const [pace, setPace] = useState<"live" | "solo">("live");
  const [perQ, setPerQ] = useState(20);
  const [minutes, setMinutes] = useState(5);
  const [lives, setLives] = useState(1);
  const [ai, setAi] = useState<"" | keyof typeof AI_LEVELS>("");
  const [assessment, setAssessment] = useState(false);
  const [late, setLate] = useState(false);
  const [listed, setListed] = useState(false);
  const [openList, setOpenList] = useState<OpenGame[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [myCode, setMyCode] = useState("");
  const [friendInput, setFriendInput] = useState("");
  const [friendMsg, setFriendMsg] = useState("");
  const [weak, setWeak] = useState<WeakTopic[]>([]);
  const [guideFor, setGuideFor] = useState("");
  // open games anyone can join, refreshed by itself while the page is open
  useEffect(() => {
    let stop = false;
    const load = () => { if (document.visibilityState === "visible") openGames().then((r) => { if (!stop) setOpenList(r); }).catch(() => undefined); };
    load();
    const t = window.setInterval(load, 6000);
    return () => { stop = true; window.clearInterval(t); };
  }, []);
  const refreshFriends = () => { if (user) void myFriends().then(setFriends).catch(() => undefined); else setFriends([]); };
  useEffect(() => {
    refreshFriends();
    if (user) {
      void myFriendCode(accountName || nick).then((r) => setMyCode(r.code)).catch(() => undefined);
      void weakTopics().then(setWeak).catch(() => undefined);
    } else { setMyCode(""); setWeak([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accountName]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const topicIndex = useTopicIndex();
  // as the topic is typed, the site's own topics that match it are offered (the student's year and below), best first
  const hints = useMemo(() => {
    const q = topic.trim().toLowerCase();
    if (q.length < 2 || !topicIndex) return [];
    return topicIndex
      .filter((t) => t.n.toLowerCase().includes(q) && t.n.toLowerCase() !== q && (!year || !t.y?.length || Math.min(...t.y) <= year))
      .sort((a, b) => Number(b.n.toLowerCase().startsWith(q)) - Number(a.n.toLowerCase().startsWith(q)) || (b.q + b.d) - (a.q + a.d))
      .slice(0, 6);
  }, [topic, topicIndex, year]);
  const [daily, setDaily] = useState<DailyGame[]>([]);
  const [rec, setRec] = useState<{ played: number; wins: number; points: number; games: ZoneHistoryRow[] } | null>(null);

  useEffect(() => {
    let stop = false;
    fetch("/data/zone-daily.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j: { date?: string; games?: DailyGame[] } | null) => { if (!stop && j?.games) setDaily(j.games.filter((g) => g.questions?.length >= 3 && (!g.year || !year || g.year <= year))); }).catch(() => undefined);
    return () => { stop = true; };
  }, [year]);
  useEffect(() => { if (!user) { setRec(null); return; } let stop = false; myHistory(12).then((r) => { if (!stop) setRec(r); }).catch(() => undefined); return () => { stop = true; }; }, [user]);

  // as the topic is typed, Ompath AI predicts what the student may want to test themselves on
  useEffect(() => {
    const q = topic.trim();
    if (q.length < 3 || q === skipAi.current) { setAiHints([]); setAiBusy(false); return; }
    const ctl = new AbortController();
    const t = window.setTimeout(() => { setAiBusy(true); void aiTopicIdeas(q, year, ctl.signal).then((r) => { if (ctl.signal.aborted) return; setAiHints(r.filter((x) => x.toLowerCase() !== q.toLowerCase())); setAiBusy(false); }); }, 600);
    return () => { window.clearTimeout(t); ctl.abort(); };
  }, [topic, year]);
  const refreshOpen = () => { if (user) void myOpenRooms().then(setOpenRooms).catch(() => undefined); else setOpenRooms([]); };
  useEffect(refreshOpen, [user]);

  useEffect(() => {
    const t = params.get("topic"), g = params.get("game") as ZoneGame | null;
    if (!t) return;
    skipAi.current = t; setTopic(t); setOpen(true);
    if (g && g in GAMES) { setGame(g); if (g === "catch") setPace("solo"); }
    setTimeout(() => document.getElementById("zone-create")?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preset = (withAi: boolean) => { setOpen(true); setAi(withAi ? "medium" : ""); setTimeout(() => document.getElementById("zone-create")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const marathonish = mode === "marathon" || game === "lightning";
  const effectivePace: "live" | "solo" = marathonish ? "solo" : pace;

  const makeRoom = async (a: { title: string; topic: string; game: ZoneGame; questions: ZoneQuestion[]; mode: ZoneMode; settings: Record<string, number | string>; ai: { name: string; acc: number; delay: number } | null }) => {
    const token = newToken();
    saveNick(nick.trim());
    const { code: made } = await createRoom({ title: a.title, topic: a.topic, mode: a.mode, settings: { game: a.game, ...a.settings }, ai: a.ai, questions: a.questions, nick: nick.trim(), token });
    saveToken(made, token);
    nav(`/zone/${made}`);
  };

  const create = async () => {
    setErr("");
    if (topic.trim().length < 2) { setErr("Type a topic first, for example “thyroid”."); return; }
    if (!nick.trim()) { setErr("Choose the name your friends will see."); return; }
    try {
      setBusy(AI_GAMES.includes(game) ? "The AI is writing your questions. This takes a few seconds…" : "Looking through the site for questions on this topic…");
      const { questions, fromSite, fromAi, note } = await buildGame(game, topic.trim(), year, game === "lightning" ? Math.max(count, 30) : count, "");
      if (questions.length < 3) { setErr(note || "I could not find enough questions on that topic. Try a broader word, for example “endocrine” instead of a very narrow term."); setBusy(""); return; }
      setBusy(`Found ${fromSite} on the site${fromAi ? ` and wrote ${fromAi} with AI` : ""}. Opening your room…`);
      const level = ai ? AI_LEVELS[ai] : null;
      const m: ZoneMode = game === "lightning" ? "marathon" : mode;
      await makeRoom({
        title: `${topic.trim()[0].toUpperCase()}${topic.trim().slice(1)}`, topic: topic.trim(), game, questions, mode: m,
        settings: { perQuestionSec: perQ, minutes: game === "lightning" || m === "marathon" ? minutes : 0, lives: m === "sudden" ? lives : 0, pace: effectivePace, hints: assessment ? 0 : 1, assessment: assessment ? 1 : 0, maxLeaves: assessment ? 3 : 0, late: late ? 1 : 0, open: listed ? 1 : 0 },
        ai: level ? { name: "Ompath AI", acc: level.acc, delay: game === "lightning" ? Math.round(level.delay * 0.4) : level.delay } : null,
      });
    } catch (e) { setErr((e as Error).message || "Could not create the room."); setBusy(""); }
  };

  const playDaily = async (d: DailyGame) => {
    setErr("");
    if (!user) { setOpen(true); setErr("Sign in to host a game. Your friends can join with just the code."); return; }
    if (!nick.trim()) { setOpen(true); setErr("Choose the name your friends will see, then pick the game again."); return; }
    try { setBusy(`Opening “${d.title}”…`); await makeRoom({ title: d.title, topic: d.topic, game: d.game, questions: d.questions.slice(0, 20), mode: "speed", settings: { perQuestionSec: 20, minutes: 0, lives: 0, pace: "live", hints: 1, assessment: 0, maxLeaves: 0, late: 0 }, ai: null }); }
    catch (e) { setErr((e as Error).message || "Could not open the game."); setBusy(""); }
  };

  const join = () => { const c = normaliseCode(code); if (c.length < 9) { setErr("Type the 4-character code your friend sent, for example ZONE-48K2."); return; } nav(`/zone/${c}`); };

  const card = "rounded-2xl border border-border bg-card p-4 sm:p-5";
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`;
  const field = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary";
  const lbl = "text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Helmet>
        <title>Friend Zone: study games with friends | Ompath Study</title>
        <meta name="description" content="Challenge a friend on any topic: pick a game, share the code, and everyone starts together after a countdown. Quizzes, image spot, true or false, case showdowns and more from Ompath Study." />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl font-bold sm:text-4xl"><Gamepad2 className="h-8 w-8 text-primary" aria-hidden /> Friend Zone</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pick a topic, share a code, and race your friends on questions taken from this site. Everyone starts together after a countdown. {year ? `Year ${year} and the years below.` : ""}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => preset(false)} className={`${card} text-left transition-colors hover:border-primary/60`}><Users className="h-6 w-6 text-primary" aria-hidden /><p className="mt-2 font-serif text-lg font-bold">Create a room</p><p className="text-xs text-muted-foreground">Host a game and share the code.</p></button>
        <button type="button" onClick={() => document.getElementById("zone-join")?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`${card} text-left transition-colors hover:border-primary/60`}><LogIn className="h-6 w-6 text-primary" aria-hidden /><p className="mt-2 font-serif text-lg font-bold">Join with a code</p><p className="text-xs text-muted-foreground">A friend sent you a code.</p></button>
        <button type="button" onClick={() => preset(true)} className={`${card} text-left transition-colors hover:border-primary/60`}><Bot className="h-6 w-6 text-primary" aria-hidden /><p className="mt-2 font-serif text-lg font-bold">Play the AI</p><p className="text-xs text-muted-foreground">Only when you ask for it.</p></button>
      </div>

      {daily.length > 0 && (
        <section className="mt-5" aria-label="New games today">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><Sparkles className="h-5 w-5 text-primary" aria-hidden /> New today</h2>
          <p className="text-xs text-muted-foreground">Fresh games written by the AI every day. Tap one to open a room and invite a friend.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{daily.slice(0, 6).map((d) => (
            <button key={d.id} type="button" onClick={() => void playDaily(d)} disabled={!!busy} className={`${card} text-left transition-colors hover:border-primary/60 disabled:opacity-60`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{GAMES[d.game]?.label ?? "Quiz"} · {d.questions.length} questions</p>
              <p className="mt-1 font-serif text-base font-bold leading-snug">{d.title}</p>
              {d.blurb && <p className="mt-1 text-xs leading-snug text-muted-foreground">{d.blurb}</p>}
            </button>))}</div>
        </section>
      )}

      <section id="zone-join" className={`${card} mt-4`} aria-label="Join a room">
        <h2 className="font-serif text-lg font-bold">Join a room</h2>
        <div className="mt-3 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} placeholder="ZONE-48K2" aria-label="Room code" autoCapitalize="characters" className={`${field} font-mono tracking-widest`} />
          <button type="button" onClick={join} className="shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90">Join</button>
        </div>
      </section>

      <section id="zone-open" className={`${card} mt-4`} aria-label="Open games">
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><Users className="h-5 w-5 text-primary" aria-hidden /> Open games you can join</h2>
        {openList.length === 0
          ? <p className="mt-2 text-sm text-muted-foreground">No open games right now. When you create a room, tick “Let others join” and it appears here for everyone.</p>
          : <ul className="mt-2 divide-y divide-border">{openList.map((g) => (
              <li key={g.code} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{g.title}</span><span className="block truncate text-xs text-muted-foreground">{GAMES[g.game as ZoneGame]?.label ?? "Quiz"} · {g.n} questions · hosted by {g.host} · {g.players} in the room</span></span>
                <Link to={`/zone/${g.code}`} className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">Join</Link>
              </li>))}</ul>}
      </section>

      <section id="zone-create" className={`${card} mt-4`} aria-label="Create a room">
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
          <span className="font-serif text-lg font-bold">Create a room</span><span className="text-xs font-bold text-primary">{open ? "Hide" : "Set one up"}</span>
        </button>
        {open && (!user ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center">
            <Lock className="mx-auto h-6 w-6 text-primary" aria-hidden /><p className="mt-2 text-sm font-semibold">Sign in to host a room</p>
            <p className="mt-1 text-xs text-muted-foreground">Friends can join with just the code and a nickname. Only the host signs in. Signed-in players keep a record of every game.</p>
            <Link to="/login" className="mt-3 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Sign in</Link>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div>
              <label className={lbl} htmlFor="zone-topic">Topic</label>
              <input id="zone-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. thyroid, aponeurosis, beta-blockers" className={`${field} mt-1.5`} />
              {topic.trim().length >= 2
                ? <div className="mt-2" aria-live="polite">{hints.length > 0
                    ? <><p className="text-[11px] text-muted-foreground">Topics on the site that match. Tap one:</p><div className="mt-1 flex flex-wrap gap-1.5">{hints.map((h) => <button key={h.s} type="button" onClick={() => setTopic(h.n)} className={chip(false)}>{h.n}{h.c ? <span className="ml-1 font-normal opacity-70">{h.c}</span> : null}</button>)}</div></>
                    : null}
                  <div className="mt-2"><p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3 text-primary" aria-hidden /> Ompath AI thinks you may want to test yourself on:{aiBusy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}</p>
                    {aiHints.length > 0 ? <div className="mt-1 flex flex-wrap gap-1.5">{aiHints.map((h) => <button key={h} type="button" onClick={() => { skipAi.current = h; setTopic(h); setAiHints([]); }} className={chip(false)}>{h}</button>)}</div> : !aiBusy && <p className="mt-1 text-[11px] text-muted-foreground">Keep typing and suggestions appear here. A topic is not needed to be on the site: the AI can write questions for any medical topic.</p>}</div></div>
                : <div className="mt-2 flex flex-wrap gap-1.5">{TOPIC_IDEAS.map((x) => <button key={x.t} type="button" onClick={() => { setTopic(x.t); if (x.game) setGame(x.game); }} className={chip(topic === x.t)}>{x.t}</button>)}</div>}
            </div>

            <div>
              <p className={lbl}>What to play</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(GAMES) as ZoneGame[]).map((g) => (
                  <button key={g} type="button" onClick={() => { setGame(g); if (g === "catch") setPace("solo"); if (g === "lightning") { setMode("marathon"); setMinutes(2); } }} aria-pressed={game === g} className={`rounded-xl border p-2.5 text-left transition-colors ${game === g ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                    <p className="text-[13px] font-bold leading-tight">{GAMES[g].label}</p><p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{GAMES[g].blurb}</p>
                  </button>
                ))}
              </div>
            </div>

            {game !== "lightning" && <div>
              <p className={lbl}>How it is scored</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                {(Object.keys(MODES) as ZoneMode[]).map((m) => { const Icon = MODE_ICON[m]; return (
                  <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-xl border p-3 text-left transition-colors ${mode === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                    <Icon className="h-5 w-5 text-primary" aria-hidden /><p className="mt-1 text-sm font-bold">{MODES[m].label}</p><p className="text-[11px] leading-snug text-muted-foreground">{MODES[m].blurb}</p>
                  </button>); })}
              </div>
            </div>}

            {!marathonish && <div>
              <p className={lbl}>How you move through the questions</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setPace("live")} aria-pressed={pace === "live"} className={`rounded-xl border p-3 text-left transition-colors ${pace === "live" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}><p className="text-sm font-bold">Together (live)</p><p className="text-[11px] leading-snug text-muted-foreground">Everyone sees each question at the same moment, then the answer and the standings.</p></button>
                <button type="button" onClick={() => setPace("solo")} aria-pressed={pace === "solo"} className={`rounded-xl border p-3 text-left transition-colors ${pace === "solo" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}><p className="text-sm font-bold">Own pace</p><p className="text-[11px] leading-snug text-muted-foreground">Everyone starts together but moves on when they are ready.</p></button>
              </div>
            </div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className={lbl}>Questions</p><div className="mt-1.5 flex flex-wrap gap-1.5">{COUNTS.map((c) => <button key={c} type="button" onClick={() => setCount(c)} aria-pressed={count === c} className={chip(count === c)}>{c}</button>)}</div></div>
              {marathonish
                ? <div><p className={lbl}>{game === "lightning" ? "Round length" : "Marathon length"}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{(game === "lightning" ? [1, 2, 3, 5] : [3, 5, 10, 15]).map((c) => <button key={c} type="button" onClick={() => setMinutes(c)} aria-pressed={minutes === c} className={chip(minutes === c)}>{c} min</button>)}</div></div>
                : <div><p className={lbl}>Time for each question</p><div className="mt-1.5 flex flex-wrap gap-1.5">{[10, 20, 30, 45].map((c) => <button key={c} type="button" onClick={() => setPerQ(c)} aria-pressed={perQ === c} className={chip(perQ === c)}>{c} s</button>)}</div></div>}
              {mode === "sudden" && game !== "lightning" && <div><p className={lbl}>Lives</p><div className="mt-1.5 flex flex-wrap gap-1.5">{[1, 2, 3].map((c) => <button key={c} type="button" onClick={() => setLives(c)} aria-pressed={lives === c} className={`${chip(lives === c)} inline-flex items-center gap-1`}><Heart className="h-3 w-3" aria-hidden />{c}</button>)}</div></div>}
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={ai !== ""} onChange={(e) => setAi(e.target.checked ? "medium" : "")} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span><b>Add an AI player</b><span className="block text-xs text-muted-foreground">Off unless you tick it. The AI answers like a student, not instantly.</span>
              {ai !== "" && <span className="mt-2 flex flex-wrap gap-1.5">{(Object.keys(AI_LEVELS) as (keyof typeof AI_LEVELS)[]).map((k) => <button key={k} type="button" onClick={(e) => { e.preventDefault(); setAi(k); }} aria-pressed={ai === k} className={chip(ai === k)}>{AI_LEVELS[k].label}</button>)}</span>}</span></label>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={assessment} onChange={(e) => setAssessment(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span><b>Assessment mode</b><span className="block text-xs text-muted-foreground">No explanations while playing, copying switched off, and 3 screen leaves end an attempt.</span></span></label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span><b>Allow late joiners</b><span className="block text-xs text-muted-foreground">Friends can still join after you press Start.</span></span></label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-sm sm:col-span-2"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span><b>Let others join (open game)</b><span className="block text-xs text-muted-foreground">Your room is listed under “Open games” for everyone on the site until you start it or close it. You can close it any time.</span></span></label>
            </div>

            <div><label className={lbl} htmlFor="zone-nick">Your name in the room</label><input id="zone-nick" value={nick} onChange={(e) => { nickTouched.current = true; setNick(e.target.value); }} maxLength={24} className={`${field} mt-1.5`} /></div>

            {err && <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{err}</p>}
            {busy && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />{busy}</p>}
            <button type="button" onClick={create} disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden /> Create room and get the code</button>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" aria-hidden /> Questions come from this site first. Case Showdown, Drug Duel and Sequence Sort are written by the AI; a quiz with too few site questions is topped up with AI-made ones, labelled “AI-made”.</p>
          </div>
        ))}
      </section>
      {!open && err && <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{err}</p>}
      {!open && busy && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />{busy}</p>}

      {user && (
        <section id="zone-friends" className={`${card} mt-4`} aria-label="Your friends">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><Users className="h-5 w-5 text-primary" aria-hidden /> Your friends</h2>
          {myCode && <p className="mt-1 text-sm text-muted-foreground">Your friend code is <b className="select-all font-mono tracking-widest text-foreground">{myCode}</b>. Give it to a friend and they add you; you appear in each other&apos;s list.</p>}
          <div className="mt-3 flex gap-2">
            <input value={friendInput} onChange={(e) => setFriendInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("zone-add-friend")?.click(); }} placeholder="Friend's code, e.g. F4K9Q2" aria-label="Friend code" maxLength={8} className={`${field} font-mono tracking-widest`} />
            <button id="zone-add-friend" type="button" onClick={() => { setFriendMsg(""); void addFriend(friendInput.trim()).then((r) => { setFriendMsg(`${r.nick || "Friend"} added.`); setFriendInput(""); refreshFriends(); }).catch((e: Error) => setFriendMsg(e.message)); }} className="shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90">Add</button>
          </div>
          {friendMsg && <p className="mt-2 text-sm text-muted-foreground" role="status">{friendMsg}</p>}
          {friends.length > 0 && <ul className="mt-3 divide-y divide-border">{friends.map((f) => (
            <li key={f.code} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{(f.nick || "?").slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{f.nick || f.code}</span><span className="block truncate text-xs text-muted-foreground">{f.open ? "has a game open now" : f.played ? `played together ${f.played} ${f.played === 1 ? "time" : "times"}` : "no games together yet"}</span></span>
              {f.open ? <Link to={`/zone/${f.open}`} className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">Join</Link>
                : <a href={`https://wa.me/?text=${encodeURIComponent(`Come and play a study game on Ompath Study Friend Zone: https://www.ompathstudy.com/friend-zone`)}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary">Invite</a>}
              <button type="button" aria-label={`Remove ${f.nick}`} onClick={() => void removeFriend(f.code).then(refreshFriends)} className="shrink-0 text-xs text-muted-foreground hover:text-rose-600">Remove</button>
            </li>))}</ul>}
        </section>
      )}

      {user && openRooms.length > 0 && (
        <section className={`${card} mt-4`} aria-label="Your open games">
          <h2 className="font-serif text-lg font-bold">Your open games</h2>
          <p className="text-xs text-muted-foreground">Games you started that are not finished. Close the ones nobody is playing.</p>
          <ul className="mt-2 divide-y divide-border">{openRooms.map((r) => (
            <li key={r.code} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.title}</span><span className="block text-xs text-muted-foreground">{r.code} · {r.status === "lobby" ? "waiting to start" : "playing"} · {r.players} in the room</span></span>
              <Link to={`/zone/${r.code}`} className="rounded-full border border-border px-3 py-1 text-xs font-bold hover:border-primary">Open</Link>
              <button type="button" onClick={() => void closeMyRoom(r.code).then(refreshOpen).catch(() => refreshOpen())} className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground hover:border-rose-500 hover:text-rose-600">Close</button>
            </li>))}</ul>
        </section>
      )}

      {user && (
        <section id="zone-record" className={`${card} mt-4`} aria-label="Your record">
          <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><Trophy className="h-5 w-5 text-primary" aria-hidden /> Your record</h2>
          {!rec || rec.played === 0 ? <p className="mt-2 text-sm text-muted-foreground">{rec ? "No finished games yet. Every game you finish while signed in is saved here." : "Loading…"}</p> : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted/50 p-2.5"><p className="font-serif text-2xl font-bold">{rec.played}</p><p className="text-[11px] text-muted-foreground">played</p></div><div className="rounded-xl bg-muted/50 p-2.5"><p className="font-serif text-2xl font-bold">{rec.wins}</p><p className="text-[11px] text-muted-foreground">wins</p></div><div className="rounded-xl bg-muted/50 p-2.5"><p className="font-serif text-2xl font-bold">{rec.points}</p><p className="text-[11px] text-muted-foreground">points</p></div></div>
              <ul className="mt-3 divide-y divide-border">{rec.games.map((g) => (
                <li key={g.room_code} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${g.rank === 1 && g.players > 1 ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-muted"}`}>{g.rank}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{g.title}</span><span className="block truncate text-xs text-muted-foreground">{g.opponents.length ? `with ${g.opponents.slice(0, 3).join(", ")} · ` : ""}{g.correct_n}/{g.answered_n} correct · {ago(g.played_at)}</span></span>
                  <span className="shrink-0 tabular-nums font-bold">{g.score}</span>
                </li>))}</ul>
            </>
          )}
        </section>
      )}
      {user && weak.length > 0 && (
        <section id="zone-weak" className={`${card} mt-4`} aria-label="Needs more work">
          <h2 className="font-serif text-lg font-bold">Needs more work</h2>
          <p className="text-xs text-muted-foreground">Topics where your answers keep going wrong, from every game you finished.</p>
          <ul className="mt-2 divide-y divide-border">{weak.map((w) => (
            <li key={w.topic} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-xs font-bold text-rose-700 dark:text-rose-400">{w.pct}%</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold capitalize">{w.topic}</span><span className="block text-xs text-muted-foreground">{w.correct} right of {w.answered} in {w.games} {w.games === 1 ? "game" : "games"}</span></span>
              <button type="button" onClick={() => setGuideFor(guideFor === w.topic ? "" : w.topic)} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary">Study guide</button>
              <Link to={`/friend-zone?topic=${encodeURIComponent(w.topic)}&game=catch`} className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Play it</Link>
            </li>))}</ul>
          {guideFor && <StudyGuide key={guideFor} topic={guideFor} year={year} missed={[]} auto />}
        </section>
      )}
      <p className="mt-6 text-xs text-muted-foreground">Earlier Challenge links still work. <Link to="/smart-practice" className="font-bold text-primary hover:underline">Smart practice</Link> is still there for playing alone.</p>
    </main>
  );
}
