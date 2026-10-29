import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Bot, Clock, Gamepad2, Heart, Loader2, LogIn, Lock, Plus, Skull, Timer, Users, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyYear } from "@/hooks/useMyYear";
import { AI_LEVELS, MODES, createRoom, newToken, normaliseCode, saveNick, saveToken, savedNick, type ZoneGame, type ZoneMode } from "@/lib/zone";
import { GAMES, buildGame } from "@/lib/zoneGames";

const COUNTS = [5, 10, 15, 20, 30];
const MODE_ICON: Record<ZoneMode, typeof Zap> = { speed: Zap, marathon: Timer, sudden: Skull };
const TOPIC_IDEAS = ["Thyroid", "Aponeurosis", "Beta-blockers", "Malaria", "Brachial plexus", "Heart failure", "Antibiotics", "Cranial nerves"];

/** /friend-zone: make a room from a topic, join one with a code, or play against the AI. */
export default function FriendZone() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { year } = useMyYear();
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const [nick, setNick] = useState(() => savedNick() || (meta?.full_name || meta?.name || "").split(" ")[0] || "");
  const [code, setCode] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [game, setGame] = useState<ZoneGame>("quiz");
  const [mode, setMode] = useState<ZoneMode>("speed");
  const [perQ, setPerQ] = useState(20);
  const [minutes, setMinutes] = useState(5);
  const [lives, setLives] = useState(1);
  const [ai, setAi] = useState<"" | keyof typeof AI_LEVELS>("");
  const [assessment, setAssessment] = useState(false);
  const [late, setLate] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  const preset = (withAi: boolean) => { setOpen(true); if (withAi) setAi("medium"); setTimeout(() => document.getElementById("zone-create")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const create = async () => {
    setErr("");
    if (topic.trim().length < 2) { setErr("Type a topic first, for example “thyroid”."); return; }
    if (!nick.trim()) { setErr("Choose the name your friends will see."); return; }
    try {
      setBusy("Looking through the site for questions on this topic…");
      const { questions, fromSite, fromAi, note } = await buildGame(game, topic.trim(), year, game === "lightning" ? Math.max(count, 30) : count, "");
      if (questions.length < 3) { setErr(note || "I could not find enough questions on that topic. Try a broader word, for example “endocrine” instead of a very narrow term."); setBusy(""); return; }
      setBusy(`Found ${fromSite} on the site${fromAi ? ` and wrote ${fromAi} more with AI` : ""}. Opening your room…`);
      const token = newToken();
      saveNick(nick.trim());
      const level = ai ? AI_LEVELS[ai] : null;
      const { code: made } = await createRoom({
        title: `${topic.trim()[0].toUpperCase()}${topic.trim().slice(1)}`, topic: topic.trim(), mode: game === "lightning" ? "marathon" : mode,
        settings: { game, perQuestionSec: perQ, minutes: game === "lightning" || mode === "marathon" ? minutes : 0, lives: mode === "sudden" ? lives : 0, hints: assessment ? 0 : 1, assessment: assessment ? 1 : 0, maxLeaves: assessment ? 3 : 0, late: late ? 1 : 0 },
        ai: level ? { name: "Ompath AI", acc: level.acc, delay: game === "lightning" ? Math.round(level.delay * 0.4) : level.delay } : null, questions, nick: nick.trim(), token,
      });
      saveToken(made, token);
      nav(`/zone/${made}`);
    } catch (e) { setErr((e as Error).message || "Could not create the room."); setBusy(""); }
  };

  const join = () => { const c = normaliseCode(code); if (c.length < 9) { setErr("Type the 4-character code your friend sent, for example ZONE-48K2."); return; } nav(`/zone/${c}`); };

  const card = "rounded-2xl border border-border bg-card p-4 sm:p-5";
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`;
  const field = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Helmet>
        <title>Friend Zone: study games with friends | Ompath Study</title>
        <meta name="description" content="Type a topic, get a room code, and compete with friends or the AI on questions from Ompath Study. Speed duels, marathons and sudden death, against the clock." />
      </Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl font-bold sm:text-4xl"><Gamepad2 className="h-8 w-8 text-primary" aria-hidden /> Friend Zone</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pick a topic, share a code, and race your friends (or the AI) on questions taken from this site. {year ? `Year ${year} and the years below.` : ""}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => preset(false)} className={`${card} text-left transition-colors hover:border-primary/60`}><Users className="h-6 w-6 text-primary" aria-hidden /><p className="mt-2 font-serif text-lg font-bold">Create a room</p><p className="text-xs text-muted-foreground">Host a game and share the code.</p></button>
        <button type="button" onClick={() => document.getElementById("zone-join")?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`${card} text-left transition-colors hover:border-primary/60`}><LogIn className="h-6 w-6 text-primary" aria-hidden /><p className="mt-2 font-serif text-lg font-bold">Join with a code</p><p className="text-xs text-muted-foreground">A friend sent you a code.</p></button>
        <button type="button" onClick={() => preset(true)} className={`${card} text-left transition-colors hover:border-primary/60`}><Bot className="h-6 w-6 text-primary" aria-hidden /><p className="mt-2 font-serif text-lg font-bold">Play the AI</p><p className="text-xs text-muted-foreground">Race Ompath AI on any topic.</p></button>
      </div>

      <section id="zone-join" className={`${card} mt-4`} aria-label="Join a room">
        <h2 className="font-serif text-lg font-bold">Join a room</h2>
        <div className="mt-3 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} placeholder="ZONE-48K2" aria-label="Room code" autoCapitalize="characters" className={`${field} font-mono tracking-widest`} />
          <button type="button" onClick={join} className="shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90">Join</button>
        </div>
      </section>

      <section id="zone-create" className={`${card} mt-4`} aria-label="Create a room">
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
          <span className="font-serif text-lg font-bold">Create a room</span><span className="text-xs font-bold text-primary">{open ? "Hide" : "Set one up"}</span>
        </button>
        {open && (!user ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center">
            <Lock className="mx-auto h-6 w-6 text-primary" aria-hidden /><p className="mt-2 text-sm font-semibold">Sign in to host a room</p>
            <p className="mt-1 text-xs text-muted-foreground">Friends can join with just the code and a nickname. Only the host signs in.</p>
            <Link to="/login" className="mt-3 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Sign in</Link>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="zone-topic">Topic</label>
              <input id="zone-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. thyroid, aponeurosis, beta-blockers" className={`${field} mt-1.5`} />
              <div className="mt-2 flex flex-wrap gap-1.5">{TOPIC_IDEAS.map((t) => <button key={t} type="button" onClick={() => setTopic(t)} className={chip(topic === t)}>{t}</button>)}</div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What to play</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(GAMES) as ZoneGame[]).map((g) => (
                  <button key={g} type="button" onClick={() => { setGame(g); if (g === "lightning") { setMode("marathon"); setMinutes(2); } }} aria-pressed={game === g} className={`rounded-xl border p-2.5 text-left transition-colors ${game === g ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                    <p className="text-[13px] font-bold leading-tight">{GAMES[g].label}</p><p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{GAMES[g].blurb}</p>
                  </button>
                ))}
              </div>
            </div>

            {game !== "lightning" && <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">How it is scored</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                {(Object.keys(MODES) as ZoneMode[]).map((m) => { const Icon = MODE_ICON[m]; return (
                  <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-xl border p-3 text-left transition-colors ${mode === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                    <Icon className="h-5 w-5 text-primary" aria-hidden /><p className="mt-1 text-sm font-bold">{MODES[m].label}</p><p className="text-[11px] leading-snug text-muted-foreground">{MODES[m].blurb}</p>
                  </button>); })}
              </div>
            </div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Questions</p><div className="mt-1.5 flex flex-wrap gap-1.5">{COUNTS.map((c) => <button key={c} type="button" onClick={() => setCount(c)} aria-pressed={count === c} className={chip(count === c)}>{c}</button>)}</div></div>
              {mode === "marathon" || game === "lightning"
                ? <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{game === "lightning" ? "Round length" : "Marathon length"}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{(game === "lightning" ? [1, 2, 3, 5] : [3, 5, 10, 15]).map((c) => <button key={c} type="button" onClick={() => setMinutes(c)} aria-pressed={minutes === c} className={chip(minutes === c)}>{c} min</button>)}</div></div>
                : <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Time for each question</p><div className="mt-1.5 flex flex-wrap gap-1.5">{[10, 20, 30, 45].map((c) => <button key={c} type="button" onClick={() => setPerQ(c)} aria-pressed={perQ === c} className={chip(perQ === c)}>{c} s</button>)}</div></div>}
              {mode === "sudden" && game !== "lightning" && <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lives</p><div className="mt-1.5 flex flex-wrap gap-1.5">{[1, 2, 3].map((c) => <button key={c} type="button" onClick={() => setLives(c)} aria-pressed={lives === c} className={`${chip(lives === c)} inline-flex items-center gap-1`}><Heart className="h-3 w-3" aria-hidden />{c}</button>)}</div></div>}
              <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Add the AI as a player</p><div className="mt-1.5 flex flex-wrap gap-1.5"><button type="button" onClick={() => setAi("")} aria-pressed={ai === ""} className={chip(ai === "")}>No</button>{(Object.keys(AI_LEVELS) as (keyof typeof AI_LEVELS)[]).map((k) => <button key={k} type="button" onClick={() => setAi(k)} aria-pressed={ai === k} className={chip(ai === k)}>{AI_LEVELS[k].label}</button>)}</div></div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={assessment} onChange={(e) => setAssessment(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span><b>Assessment mode</b><span className="block text-xs text-muted-foreground">No explanations while playing, copying switched off, and 3 screen leaves end an attempt.</span></span></label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span><b>Allow late joiners</b><span className="block text-xs text-muted-foreground">Friends can still join after you press Start.</span></span></label>
            </div>

            <div><label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="zone-nick">Your name in the room</label><input id="zone-nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={24} className={`${field} mt-1.5`} /></div>

            {err && <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{err}</p>}
            {busy && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />{busy}</p>}
            <button type="button" onClick={create} disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden /> Create room and get the code</button>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" aria-hidden /> Questions come from this site first. In the quiz, a shortfall is filled with AI-written questions labelled “AI-made”. Sequence Sort is always AI-made.</p>
          </div>
        ))}
      </section>
      {!open && err && <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{err}</p>}
      <p className="mt-6 text-xs text-muted-foreground">Earlier Challenge links still work. <Link to="/smart-practice" className="font-bold text-primary hover:underline">Smart practice</Link> is still there for playing alone.</p>
    </main>
  );
}
