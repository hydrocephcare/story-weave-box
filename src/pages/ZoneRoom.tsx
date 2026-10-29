import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, Bot, Check, Copy, Crown, Gamepad2, Heart, Loader2, MessageCircle, Play as PlayIcon, RotateCcw, Share2, Skull, Timer, Trophy, Users, X, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  MODES, createRoom, finishMe, flagLeft, getQuestions, getResults, getState, joinRoom, newToken, normaliseCode, roomLink, saveNick, saveToken, savedNick, sendAnswer, startRoom, tokenFor,
  endRoom, type ZonePlayer, type ZoneResults, type ZoneState,
} from "@/lib/zone";
import { GAMES } from "@/lib/zoneGames";

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const LETTERS = "ABCDEF";

/** One poll of the room every couple of seconds: who is here, the scoreboard, and whether the game has started or ended. */
function useRoom(code: string, token: string) {
  const [state, setState] = useState<ZoneState | null>(null);
  const [error, setError] = useState("");
  const offset = useRef(0);
  const load = useCallback(async () => {
    try { const s = await getState(code, token); offset.current = s.now - Date.now(); setState(s); setError(""); } catch (e) { setError((e as Error).message); }
  }, [code, token]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 1500);
    return () => window.clearInterval(t);
  }, [load]);
  return { state, error, load, serverNow: () => Date.now() + offset.current };
}

function Scoreboard({ players, rows = 8 }: { players: ZonePlayer[]; rows?: number }) {
  const top = players.slice(0, rows);
  const mineOut = players.findIndex((p) => p.me) >= rows ? players.find((p) => p.me) : null;
  const row = (p: ZonePlayer, i: number) => (
    <li key={p.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${p.me ? "bg-primary/10 font-bold" : ""}`}>
      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i === 0 && p.score > 0 ? <Crown className="mx-auto h-4 w-4 text-amber-500" aria-label="Leading" /> : i + 1}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{p.ai && <Bot className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="AI" />}<span className="truncate">{p.nick}{p.me ? " (you)" : ""}</span>{p.left > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label={`Left the screen ${p.left} times`} />}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{p.finished ? "done" : `${p.answered} answered`}</span>
      <span className="w-12 shrink-0 text-right tabular-nums">{p.score}</span>
    </li>
  );
  return <ol className="space-y-0.5">{top.map(row)}{mineOut && <>{<li className="px-2.5 text-center text-xs text-muted-foreground">…</li>}{row(mineOut, players.indexOf(mineOut))}</>}</ol>;
}

function ShareBar({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const link = roomLink(code);
  const text = `Join my Friend Zone room on “${title}”. Code ${code}: ${link}`;
  const share = async () => { try { if (navigator.share) { await navigator.share({ title: "Friend Zone", text, url: link }); return; } } catch { return; } void copy(); };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</a>
      <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary"><Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy link"}</button>
      <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary"><Share2 className="h-4 w-4" aria-hidden /> Share</button>
    </div>
  );
}

function Lobby({ s, code, token, reload }: { s: ZoneState; code: string; token: string; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const host = !!s.me?.host;
  const st = s.room.settings;
  const rules = [st.game && st.game !== "quiz" ? GAMES[st.game].label : MODES[s.room.mode].label, st.game && st.game !== "quiz" ? MODES[s.room.mode].label : "", `${s.room.n} questions`, s.room.mode === "marathon" ? `${st.minutes ?? 5} minutes` : `${st.perQuestionSec ?? 20} s each`, s.room.mode === "sudden" ? `${st.lives ?? 1} ${st.lives === 1 ? "life" : "lives"}` : "", s.room.hasAi ? "AI plays too" : "", st.assessment ? "Assessment mode" : ""].filter(Boolean);
  const start = async () => { setBusy(true); setErr(""); try { await startRoom(code, token); reload(); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  return (
    <div>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Room code</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.18em] sm:text-5xl" aria-label={`Room code ${code}`}>{code}</p>
        <p className="mt-2 text-sm text-muted-foreground">{s.room.title}: {rules.join(" · ")}</p>
        <div className="mt-4 flex justify-center"><ShareBar code={code} title={s.room.title} /></div>
      </div>
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Players">
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><Users className="h-5 w-5 text-primary" aria-hidden /> In the room <span className="text-sm font-normal text-muted-foreground">({s.players.length})</span></h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {s.players.map((p) => (
            <li key={p.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${p.me ? "border-primary/50 bg-primary/5 font-bold" : "border-border"}`}>
              {p.ai ? <Bot className="h-4 w-4 text-primary" aria-hidden /> : p.host ? <Crown className="h-4 w-4 text-amber-500" aria-label="Host" /> : <Check className="h-4 w-4 text-emerald-600" aria-hidden />}
              <span className="truncate">{p.nick}{p.me ? " (you)" : ""}</span>{p.host && <span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">host</span>}{p.ai && <span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">ready</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Waiting for friends. This list updates by itself.</p>
      </section>
      {err && <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{err}</p>}
      {host
        ? <button type="button" onClick={start} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"><PlayIcon className="h-4 w-4" aria-hidden /> Start the game{s.players.filter((p) => !p.ai).length > 1 ? ` for ${s.players.length}` : ""}</button>
        : <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Waiting for <b>{s.room.host}</b> to start the game.</p>}
    </div>
  );
}

type Q = { idx: number; q: string; options: string[]; ai: boolean; kind?: string };
function Play({ s, code, token, serverNow, reload }: { s: ZoneState; code: string; token: string; serverNow: () => number; reload: () => void }) {
  const [qs, setQs] = useState<Q[] | null>(null);
  const [seq, setSeq] = useState(s.me?.answered ?? 0);
  const [picked, setPicked] = useState<number | null>(null);
  const [fb, setFb] = useState<{ correct: number; explanation: string; ok: boolean } | null>(null);
  const [score, setScore] = useState(s.me?.score ?? 0);
  const [lives, setLives] = useState(s.me?.lives ?? 1);
  const [tick, setTick] = useState(0);
  const shownAt = useRef(Date.now());
  const sending = useRef(false);
  const nextFn = useRef<(() => void) | null>(null);
  const st = s.room.settings, mode = s.room.mode;
  const perQ = (st.perQuestionSec ?? 20) * 1000;
  const assess = !!st.assessment;

  useEffect(() => { void getQuestions(code, token).then(setQs).catch(() => undefined); }, [code, token]);
  useEffect(() => { const t = window.setInterval(() => setTick((x) => x + 1), 200); return () => window.clearInterval(t); }, []);
  useEffect(() => { shownAt.current = Date.now(); setPicked(null); setFb(null); }, [seq]);
  // leaving the screen is counted and shown to the host
  useEffect(() => { const f = () => { if (document.hidden) void flagLeft(code, token); }; document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [code, token]);

  const q = qs && qs.length ? qs[seq % qs.length] : null;
  const timeLeftQ = mode === "marathon" ? Infinity : perQ - (Date.now() - shownAt.current);
  const timeLeftAll = s.room.endsAt ? s.room.endsAt - serverNow() : Infinity;
  void tick;

  const answer = useCallback(async (choice: number) => {
    if (sending.current || picked !== null || !q) return;
    sending.current = true; setPicked(choice);
    try {
      const r = await sendAnswer(code, token, seq, choice, Date.now() - shownAt.current);
      if (r.stale) { setSeq(r.answered ?? seq); sending.current = false; return; }
      setScore(r.score); if (r.lives != null) setLives(r.lives);
      if (r.finished && r.correct == null) { reload(); return; }
      setFb({ correct: r.correct ?? -1, explanation: r.explanation ?? "", ok: !!r.ok });
      const next = () => { sending.current = false; if (r.finished) { reload(); } else setSeq((x) => x + 1); };
      if (r.explanation && !assess) nextFn.current = next; else window.setTimeout(next, 1100);
    } catch { sending.current = false; setPicked(null); }
  }, [code, token, seq, picked, q, assess, reload]);

  useEffect(() => { if (q && picked === null && timeLeftQ <= 0) void answer(-1); }, [timeLeftQ, q, picked, answer]);
  useEffect(() => { if (timeLeftAll <= 0) { void finishMe(code, token).then(reload); } }, [timeLeftAll, code, token, reload]);

  if (!q) return <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Getting your questions…</p>;
  const pct = Number.isFinite(timeLeftQ) ? Math.max(0, Math.min(100, (timeLeftQ / perQ) * 100)) : Number.isFinite(timeLeftAll) ? Math.max(0, Math.min(100, (timeLeftAll / ((st.minutes ?? 5) * 60000)) * 100)) : 100;
  const urgent = pct < 25;
  const noCopy = assess ? { onCopy: (e: React.ClipboardEvent) => e.preventDefault(), onCut: (e: React.ClipboardEvent) => e.preventDefault(), onContextMenu: (e: React.MouseEvent) => e.preventDefault(), onDragStart: (e: React.DragEvent) => e.preventDefault() } : {};
  const total = s.room.n;

  return (
    <div {...noCopy} style={assess ? { userSelect: "none", WebkitUserSelect: "none" } : undefined}>
      <div className="flex items-center justify-between gap-3 text-sm font-bold">
        <span className="flex items-center gap-1.5">{mode === "sudden" ? Array.from({ length: Math.max(lives, 0) }).map((_, i) => <Heart key={i} className="h-4 w-4 fill-rose-500 text-rose-500" aria-label="Life" />) : <span>{mode === "marathon" ? `Question ${seq + 1}` : `Question ${seq + 1} of ${total}`}</span>}{mode === "sudden" && lives <= 0 && <Skull className="h-4 w-4" aria-label="Out" />}</span>
        <span className="flex items-center gap-3">{s.me?.host && <button type="button" onClick={() => { if (window.confirm("End the game for everyone now?")) void endRoom(code, token).then(reload); }} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground hover:border-rose-500 hover:text-rose-600">End game</button>}<span className="tabular-nums text-primary">{score} pts</span>{Number.isFinite(timeLeftAll) && <span className={`flex items-center gap-1 tabular-nums ${timeLeftAll < 30000 ? "text-rose-600" : ""}`}><Timer className="h-4 w-4" aria-hidden />{clock(timeLeftAll)}</span>}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full transition-[width] duration-200 ${urgent ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
        {q.ai && <p className="mb-2 inline-block rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">AI-made question</p>}
        <p className={`whitespace-pre-line text-[17px] font-semibold leading-snug sm:text-lg ${q.kind === "hangman" || q.kind === "scramble" ? "[&:first-line]:font-mono [&:first-line]:text-xl [&:first-line]:tracking-[0.2em]" : ""}`}>{q.q}</p>
        <ul className="mt-4 space-y-2">
          {q.options.map((o, i) => {
            const right = fb && i === fb.correct, bad = fb && picked === i && i !== fb.correct;
            return (
              <li key={i}>
                <button type="button" disabled={picked !== null} onClick={() => void answer(i)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-snug transition-colors ${right ? "border-emerald-500/60 bg-emerald-500/10" : bad ? "border-rose-500/60 bg-rose-500/10" : picked === i ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"} disabled:cursor-default`}>
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${right ? "border-emerald-600 bg-emerald-600 text-white" : bad ? "border-rose-600 bg-rose-600 text-white" : "border-border"}`}>{right ? <Check className="h-3.5 w-3.5" aria-label="Correct" /> : bad ? <X className="h-3.5 w-3.5" aria-label="Your answer" /> : LETTERS[i]}</span>
                  <span>{o}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {fb && fb.explanation && !assess && <p className="mt-4 rounded-lg bg-primary/5 p-3 text-sm leading-relaxed"><strong>Why:</strong> {fb.explanation}</p>}
        {fb && fb.explanation && !assess && <button type="button" onClick={() => nextFn.current?.()} className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 sm:w-auto">Next question</button>}
        {picked === -1 && !fb && <p className="mt-3 text-xs text-muted-foreground">Time is up for this question.</p>}
      </div>
      <details className="mt-4 rounded-2xl border border-border bg-card p-3 sm:hidden"><summary className="cursor-pointer text-sm font-bold">Live scoreboard</summary><div className="mt-2"><Scoreboard players={s.players} /></div></details>
      <section className="mt-4 hidden rounded-2xl border border-border bg-card p-3 sm:block" aria-label="Live scoreboard"><h2 className="mb-1 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Live scoreboard</h2><Scoreboard players={s.players} /></section>
    </div>
  );
}

function Results({ s, code, token }: { s: ZoneState; code: string; token: string }) {
  const nav = useNavigate();
  const [res, setRes] = useState<ZoneResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const me = s.players.find((p) => p.me);
  const rank = me ? s.players.indexOf(me) + 1 : 0;
  const live = s.room.status !== "done";
  useEffect(() => { void getResults(code, token).then(setRes).catch(() => undefined); }, [code, token, live]);
  const mine = res?.mine ?? [];
  const avg = mine.length ? Math.round(mine.reduce((n, a) => n + a.ms, 0) / mine.length / 100) / 10 : 0;
  const missed = useMemo(() => { if (!res) return []; const wrong = new Map<number, boolean>(); for (const a of mine) if (!a.ok) wrong.set(a.idx, true); return res.questions.filter((q) => wrong.has(q.idx)); }, [res, mine]);
  const text = `I scored ${me?.score ?? 0} points (${rank}${["st", "nd", "rd"][rank - 1] ?? "th"} of ${s.players.length}) in “${s.room.title}” on Friend Zone. Can you beat me? ${roomLink(code)}`;
  const rematch = async () => {
    if (!res) return; setBusy(true); setErr("");
    try { const t = newToken(); const { code: c } = await createRoom({ title: s.room.title, topic: s.room.topic, mode: s.room.mode, settings: s.room.settings, ai: s.room.hasAi ? { name: "Ompath AI", acc: 0.7, delay: 8000 } : null, questions: res.questions.map((q) => ({ q: q.q, options: q.options, correct: q.correct, explanation: q.explanation, ai: q.ai })), nick: me?.nick || "Host", token: t }); saveToken(c, t); nav(`/zone/${c}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <Trophy className="mx-auto h-9 w-9 text-primary" aria-hidden />
        {live ? <p className="mt-2 text-sm font-semibold text-muted-foreground">You are finished. Others are still playing.</p> : <p className="mt-2 text-sm font-semibold text-muted-foreground">Final result</p>}
        <p className="mt-1 font-serif text-4xl font-bold">{me?.score ?? 0} <span className="text-lg font-normal text-muted-foreground">points</span></p>
        <p className="mt-1 text-sm">{rank === 1 && !live ? "You won! " : ""}{rank ? `${rank}${["st", "nd", "rd"][rank - 1] ?? "th"} of ${s.players.length}` : ""} · {me?.correct ?? 0} correct of {me?.answered ?? 0}{avg ? ` · ${avg}s per answer` : ""}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"><MessageCircle className="h-4 w-4" aria-hidden /> Share my score</a>
          {s.me?.host && !live && <button type="button" onClick={rematch} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary disabled:opacity-60"><RotateCcw className="h-4 w-4" aria-hidden /> Rematch with the same questions</button>}
          <Link to="/friend-zone" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary"><Gamepad2 className="h-4 w-4" aria-hidden /> New game</Link>
        </div>
        {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
      </div>
      <section className="mt-4 rounded-2xl border border-border bg-card p-3 sm:p-4" aria-label="Final scoreboard"><h2 className="mb-1 px-2 font-serif text-lg font-bold">Scoreboard</h2><Scoreboard players={s.players} rows={20} /></section>
      {missed.length > 0 && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Questions to revise">
          <h2 className="font-serif text-lg font-bold">Revise these {missed.length}</h2>
          <p className="text-xs text-muted-foreground">The ones you got wrong or ran out of time on.</p>
          <ul className="mt-3 space-y-3">{missed.map((m) => (
            <li key={m.idx} className="rounded-xl border border-border p-3 text-sm"><p className="whitespace-pre-line font-semibold">{m.q}</p><p className="mt-1.5 text-emerald-700 dark:text-emerald-400"><Check className="mr-1 inline h-3.5 w-3.5" aria-hidden />{LETTERS[m.correct]}. {m.options[m.correct]}</p>{m.explanation && <p className="mt-1 text-xs text-muted-foreground">{m.explanation}</p>}</li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}

function JoinGate({ code, onJoined }: { code: string; onJoined: () => void }) {
  const { user } = useAuth();
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const [nick, setNick] = useState(() => savedNick() || (meta?.full_name || meta?.name || "").split(" ")[0] || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    if (!nick.trim()) { setErr("Choose a name your friends will see."); return; }
    setBusy(true); setErr("");
    try { const t = newToken(); await joinRoom(code, nick.trim(), t); saveToken(code, t); saveNick(nick.trim()); onJoined(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
      <Gamepad2 className="mx-auto h-8 w-8 text-primary" aria-hidden />
      <h1 className="mt-2 font-serif text-2xl font-bold">Join the room</h1>
      <p className="mt-1 font-mono text-xl tracking-widest">{code}</p>
      <input value={nick} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void go()} maxLength={24} placeholder="Your name" aria-label="Your name" className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-sm outline-none focus:border-primary" />
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
      <button type="button" onClick={go} disabled={busy} className="mt-4 w-full rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60">{busy ? "Joining…" : "Join"}</button>
      {!user && <p className="mt-3 text-xs text-muted-foreground">No account needed to join. Only the host signs in.</p>}
    </div>
  );
}

/** /zone/:code — the room: join, lobby, the game, and the results, all on one address so the share link just works. */
export default function ZoneRoom() {
  const { code: raw = "" } = useParams();
  const code = normaliseCode(raw) || raw.toUpperCase();
  const [token, setToken] = useState(() => tokenFor(code));
  const { state, error, load, serverNow } = useRoom(code, token);

  const body = (() => {
    if (error && !state) return <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border p-8 text-center"><p className="font-semibold">{error}</p><Link to="/friend-zone" className="mt-4 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Back to Friend Zone</Link></div>;
    if (!state) return <p className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Opening the room…</p>;
    if (!state.me) return <JoinGate code={code} onJoined={() => { setToken(tokenFor(code)); }} />;
    if (state.room.status === "lobby") return <Lobby s={state} code={code} token={token} reload={() => void load()} />;
    if (state.room.status === "done" || state.me.finished) return <Results s={state} code={code} token={token} />;
    return <Play s={state} code={code} token={token} serverNow={serverNow} reload={() => void load()} />;
  })();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Helmet><title>{state ? `${state.room.title} | Friend Zone` : "Friend Zone"}</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/friend-zone" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Gamepad2 className="h-4 w-4" aria-hidden /> Friend Zone</Link>
        {state && <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-bold">{state.room.settings.game && state.room.settings.game !== "quiz" ? `${GAMES[state.room.settings.game].label} · ` : ""}{state.room.mode === "speed" ? <Zap className="h-3.5 w-3.5" aria-hidden /> : state.room.mode === "marathon" ? <Timer className="h-3.5 w-3.5" aria-hidden /> : <Skull className="h-3.5 w-3.5" aria-hidden />}{MODES[state.room.mode].label}</span>}
      </div>
      {body}
    </main>
  );
}
