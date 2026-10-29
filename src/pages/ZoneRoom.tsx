import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, Bot, Check, Copy, Crown, Gamepad2, Heart, Loader2, MessageCircle, Play as PlayIcon, RotateCcw, Share2, Skull, Timer, Trophy, Users, X, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  MODES, createRoom, finishMe, flagLeft, getQuestions, getResults, getState, joinRoom, newToken, normaliseCode, roomLink, saveNick, saveToken, savedNick, sendAnswer, startRoom, tokenFor,
  endRoom, type PlayQuestion, type ZonePlayer, type ZoneResults, type ZoneState,
} from "@/lib/zone";
import { GAMES } from "@/lib/zoneGames";

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const LETTERS = "ABCDEF";
const ord = (n: number) => `${n}${["st", "nd", "rd"][n - 1] ?? "th"}`;
const REVEAL_MS = 5000;

/** A short beep for the countdown. Browsers only allow sound after a tap, so any failure is ignored. */
function beep(freq: number, ms = 120) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.stop(); void ctx.close(); }, ms);
  } catch { /* no sound */ }
}

/** One poll of the room every second or so. The server clock is learnt from the quickest replies, so every screen counts down against the same instant. */
function useRoom(code: string, token: string) {
  const [state, setState] = useState<ZoneState | null>(null);
  const [error, setError] = useState("");
  const clockRef = useRef({ rtt: Infinity, offset: 0 });
  const busy = useRef(false);
  const tickN = useRef(0);
  const statusRef = useRef("");
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const t0 = Date.now();
    try {
      const s = await getState(code, token);
      const rtt = Date.now() - t0;
      const c = clockRef.current;
      if (rtt <= c.rtt) clockRef.current = { rtt, offset: s.now - (t0 + rtt / 2) }; else clockRef.current = { rtt: c.rtt + 4, offset: c.offset };
      statusRef.current = s.room.status; setState(s); setError("");
    } catch (e) { setError((e as Error).message); }
    busy.current = false;
  }, [code, token]);
  useEffect(() => {
    void load();
    // every second while people gather or count down; every other second once the game runs (the clock moves the game, the poll only refreshes the scoreboard)
    const t = window.setInterval(() => { tickN.current++; if (document.visibilityState === "visible" && (statusRef.current !== "running" || tickN.current % 2 === 0)) void load(); }, 1000);
    const v = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", v);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [load]);
  const serverNow = useCallback(() => Date.now() + clockRef.current.offset, []);
  return { state, error, load, serverNow };
}

function useTicker(ms: number, on = true) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const t = window.setInterval(() => set((x) => x + 1), ms); return () => window.clearInterval(t); }, [ms, on]);
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

function ShareBar({ code, title, host }: { code: string; title: string; host: string }) {
  const [copied, setCopied] = useState(false);
  const link = roomLink(code);
  const text = `${host} invites you to play “${title}” on Friend Zone. Join with code ${code}: ${link}`;
  const share = async () => { try { if (navigator.share) { await navigator.share({ title: `${host} invites you to a game`, text, url: link }); return; } } catch { return; } void copy(); };
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
  const kind = st.game && st.game !== "quiz" ? GAMES[st.game].label : MODES[s.room.mode].label;
  const rules = [kind, st.game && st.game !== "quiz" ? MODES[s.room.mode].label : "", `${s.room.n} questions`, s.room.mode === "marathon" ? `${st.minutes ?? 5} minutes` : `${st.perQuestionSec ?? 20} s each`, s.room.live ? "everyone answers together" : "", s.room.mode === "sudden" ? `${st.lives ?? 1} ${st.lives === 1 ? "life" : "lives"}` : "", s.room.hasAi ? "AI plays too" : "", st.assessment ? "Assessment mode" : ""].filter(Boolean);
  const humans = s.players.filter((p) => !p.ai).length;
  const start = async () => { setBusy(true); setErr(""); try { await startRoom(code, token); reload(); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  return (
    <div>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{host ? "Your room" : `${s.room.host}'s room`}</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.18em] sm:text-5xl" aria-label={`Room code ${code}`}>{code}</p>
        <p className="mt-2 text-sm text-muted-foreground">{s.room.title}: {rules.join(" · ")}</p>
        {host && <div className="mt-4 flex justify-center"><ShareBar code={code} title={s.room.title} host={s.room.host} /></div>}
      </div>
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Players">
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold"><Users className="h-5 w-5 text-primary" aria-hidden /> In the room <span className="text-sm font-normal text-muted-foreground">({s.players.length})</span></h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {s.players.map((p) => (
            <li key={p.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${p.me ? "border-primary/50 bg-primary/5 font-bold" : "border-border"}`}>
              {p.ai ? <Bot className="h-4 w-4 text-primary" aria-hidden /> : p.host ? <Crown className="h-4 w-4 text-amber-500" aria-label="Host" /> : <Check className="h-4 w-4 text-emerald-600" aria-hidden />}
              <span className="truncate">{p.nick}{p.me ? " (you)" : ""}</span>{p.host && <span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">host</span>}{p.ai && <span className="ml-auto text-[10px] font-bold uppercase text-muted-foreground">AI</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {humans < 2 && !s.room.hasAi ? "Waiting for a friend to join. This list updates by itself." : "Everyone here will start at the same moment."}</p>
      </section>
      {err && <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{err}</p>}
      {host
        ? <button type="button" onClick={start} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"><PlayIcon className="h-4 w-4" aria-hidden /> {busy ? "Starting…" : `Start for ${humans > 1 ? `all ${humans}` : "everyone"} (8 second countdown)`}</button>
        : <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Waiting for <b>{s.room.host}</b> to start. You will see a countdown, then the game begins on every screen together.</p>}
    </div>
  );
}

/** The 3-2-1 before a game. Every screen counts against the server clock, so they all reach GO together. */
function Countdown({ s, serverNow }: { s: ZoneState; serverNow: () => number }) {
  useTicker(80);
  const left = (s.room.startedAt ?? 0) - serverNow();
  const n = Math.max(0, Math.ceil(left / 1000));
  const last = useRef(-1);
  useEffect(() => { if (n !== last.current) { last.current = n; if (n > 0) { beep(520, 110); try { navigator.vibrate?.(40); } catch { /* no vibration */ } } } }, [n]);
  const st = s.room.settings;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">{st.game && st.game !== "quiz" ? GAMES[st.game].label : MODES[s.room.mode].label}</p>
      <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{s.room.title}</h1>
      <p key={n} className="mt-6 animate-in zoom-in-50 font-serif text-[120px] font-bold leading-none text-primary duration-300 sm:text-[160px]" aria-live="assertive">{n > 0 ? n : "GO"}</p>
      <p className="mt-6 text-sm text-muted-foreground">{s.players.map((p) => p.nick).slice(0, 6).join("  vs  ")}</p>
      <p className="mt-1 text-xs text-muted-foreground">Everyone starts at the same moment.</p>
    </div>
  );
}

const firstLine = (q: string) => q.split("\n")[0];
const restLines = (q: string) => q.split("\n").slice(1).join("\n");

/** One question dressed for its game: a picture, true or false buttons, letter tiles, a case. */
function QuestionCard({ q, picked, correct, locked, onPick, wasAi }: { q: PlayQuestion; picked: number | null; correct: number | null; locked: boolean; onPick: (i: number) => void; wasAi: boolean }) {
  const kind = q.kind ?? "mcq";
  const label: Record<string, string> = { image: "Image Spot", case: "Clinical case", drug: "Drug Duel", tf: "True or false?", card: "Flashcard", pairs: "Match the meaning", hangman: "Hangman", scramble: "Word Scramble", odd: "Odd One Out", seq: "Sequence Sort", nameit: "Who am I?" };
  const head = firstLine(q.q), rest = restLines(q.q);
  const tiles = kind === "hangman" ? head.replace(/^Complete the word:\s*/i, "").split(" ").filter(Boolean) : kind === "scramble" ? head.replace(/^Unscramble:\s*/i, "").replace(/\s+/g, "").split("") : null;
  const optClass = (i: number) => {
    const right = correct !== null && i === correct, bad = correct !== null && picked === i && i !== correct;
    return right ? "border-emerald-500/70 bg-emerald-500/10" : bad ? "border-rose-500/70 bg-rose-500/10" : picked === i ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/50";
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {label[kind] && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{label[kind]}</span>}
        {wasAi && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">AI-made</span>}
      </div>
      {q.image && <div className="mb-4 flex justify-center rounded-xl bg-muted/40 p-2"><img src={q.image} alt="The picture this question is about" loading="eager" className="max-h-64 w-auto max-w-full rounded-lg object-contain sm:max-h-80" /></div>}
      {tiles ? (
        <div>
          <div className="flex flex-wrap justify-center gap-1.5" aria-label={head}>{tiles.map((t, i) => <span key={i} className={`flex h-10 w-9 items-center justify-center rounded-lg border-2 font-mono text-lg font-bold sm:h-11 sm:w-10 ${t === "_" ? "border-dashed border-primary/50 text-transparent" : "border-primary/60 bg-primary/5"}`}>{t === "_" ? "·" : t}</span>)}</div>
          {rest && <p className="mt-3 text-center text-sm text-muted-foreground">{rest}</p>}
        </div>
      ) : kind === "tf" ? (
        <div>
          <p className="whitespace-pre-line text-[17px] font-semibold leading-snug sm:text-lg">{head}</p>
          {rest && <p className="mt-3 rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3 text-[15px] font-medium leading-snug">{rest}</p>}
        </div>
      ) : kind === "nameit" ? (
        <div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{head}</p><p className="mt-2 rounded-xl bg-muted/50 px-4 py-3 text-[16px] leading-snug">{rest}</p></div>
      ) : (
        <p className="whitespace-pre-line text-[17px] font-semibold leading-snug sm:text-lg">{q.q}</p>
      )}
      {kind === "tf" ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {q.options.map((o, i) => (
            <button key={i} type="button" disabled={locked} onClick={() => onPick(i)} className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-5 text-lg font-bold transition-colors ${correct === null && picked !== i ? (i === 0 ? "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" : "border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-400") : optClass(i)} disabled:cursor-default`}>
              {i === 0 ? <Check className="h-5 w-5" aria-hidden /> : <X className="h-5 w-5" aria-hidden />}{o}
            </button>
          ))}
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {q.options.map((o, i) => {
            const right = correct !== null && i === correct, bad = correct !== null && picked === i && i !== correct;
            return (
              <li key={i}>
                <button type="button" disabled={locked} onClick={() => onPick(i)} className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-snug transition-colors ${optClass(i)} disabled:cursor-default`}>
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${right ? "border-emerald-600 bg-emerald-600 text-white" : bad ? "border-rose-600 bg-rose-600 text-white" : picked === i ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{right ? <Check className="h-3.5 w-3.5" aria-label="Correct" /> : bad ? <X className="h-3.5 w-3.5" aria-label="Your answer" /> : LETTERS[i]}</span>
                  <span>{o}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LivePanels({ s }: { s: ZoneState }) {
  return (
    <>
      <details className="mt-4 rounded-2xl border border-border bg-card p-3 sm:hidden"><summary className="cursor-pointer text-sm font-bold">Live scoreboard</summary><div className="mt-2"><Scoreboard players={s.players} /></div></details>
      <section className="mt-4 hidden rounded-2xl border border-border bg-card p-3 sm:block" aria-label="Live scoreboard"><h2 className="mb-1 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Live scoreboard</h2><Scoreboard players={s.players} /></section>
    </>
  );
}

function useLeaveFlag(code: string, token: string) {
  useEffect(() => { const f = () => { if (document.hidden) void flagLeft(code, token); }; document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [code, token]);
}

const noCopyProps = (on: boolean) => on ? { onCopy: (e: React.ClipboardEvent) => e.preventDefault(), onCut: (e: React.ClipboardEvent) => e.preventDefault(), onContextMenu: (e: React.MouseEvent) => e.preventDefault(), onDragStart: (e: React.DragEvent) => e.preventDefault() } : {};

/** Live game: the clock moves everyone from question to question together, then shows the answer and the standings before the next one. */
function PlayLive({ s, qs, code, token, serverNow }: { s: ZoneState; qs: PlayQuestion[]; code: string; token: string; serverNow: () => number }) {
  useTicker(100);
  useLeaveFlag(code, token);
  const [mine, setMine] = useState<Record<number, { choice: number; ok?: boolean; points?: number; correct?: number; explanation?: string }>>({});
  const st = s.room.settings, mode = s.room.mode;
  const perQ = (st.perQuestionSec ?? 20) * 1000, slot = s.room.slotMs || perQ + REVEAL_MS, n = s.room.n;
  const assess = !!st.assessment;
  const el = serverNow() - (s.room.startedAt ?? 0);
  const over = n > 0 && el >= n * slot - 300;
  const qi = Math.max(0, Math.min(n - 1, Math.floor(el / slot)));
  const within = el - qi * slot;
  const asking = within < perQ;
  const q = qs[qi];
  const lastBeep = useRef(-1);
  const left = Math.ceil((perQ - within) / 1000);
  useEffect(() => { if (asking && left <= 3 && left > 0 && lastBeep.current !== qi * 100 + left) { lastBeep.current = qi * 100 + left; beep(380, 70); } }, [asking, left, qi]);

  const pick = (i: number) => {
    if (!asking || mine[qi] || !q) return;
    const at = Math.round(within);
    setMine((m) => ({ ...m, [qi]: { choice: i, ok: q.key !== undefined ? i === q.key : undefined } }));
    sendAnswer(code, token, qi, i, at).then((r) => setMine((m) => (m[qi] ? { ...m, [qi]: { ...m[qi], ok: r.ok ?? m[qi].ok, points: r.points, correct: r.correct, explanation: r.explanation } } : m))).catch(() => undefined);
  };

  if (!q) return <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Getting the questions…</p>;
  const me = s.players.find((p) => p.me);
  const my = mine[qi];
  const key = q.key ?? my?.correct ?? null;
  const showKey = !asking && key !== null && !assess;
  const pct = asking ? Math.max(0, (1 - within / perQ) * 100) : Math.max(0, (1 - (within - perQ) / REVEAL_MS) * 100);
  const urgent = asking && left <= 5;
  const lives = me?.lives ?? 0;
  const top = s.players.slice(0, 4);
  const gained = my?.points;
  return (
    <div style={assess ? { userSelect: "none", WebkitUserSelect: "none" } : undefined} {...noCopyProps(assess)}>
      <div className="flex items-center justify-between gap-3 text-sm font-bold">
        <span className="flex items-center gap-1.5">{mode === "sudden" ? <>{Array.from({ length: Math.max(lives, 0) }).map((_, i) => <Heart key={i} className="h-4 w-4 fill-rose-500 text-rose-500" aria-label="Life" />)}<span className="ml-1 font-normal text-muted-foreground">Q{qi + 1}/{n}</span></> : <span>Question {qi + 1} of {n}</span>}</span>
        <span className="flex items-center gap-3">
          {s.me?.host && <button type="button" onClick={() => { if (window.confirm("End the game for everyone now?")) void endRoom(code, token); }} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground hover:border-rose-500 hover:text-rose-600">End game</button>}
          <span className="tabular-nums text-primary">{me?.score ?? 0} pts</span>
          <span className={`flex items-center gap-1 tabular-nums ${urgent ? "text-rose-600" : ""}`}><Timer className="h-4 w-4" aria-hidden />{asking ? left : "–"}</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${urgent ? "bg-rose-500" : asking ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${pct}%`, transition: "width 120ms linear" }} /></div>

      <div className="mt-4">
        <QuestionCard q={q} picked={my ? my.choice : null} correct={showKey ? key : null} locked={!asking || !!my} onPick={pick} wasAi={q.ai} />
      </div>

      {asking && my && <p className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-primary/5 p-3 text-sm font-semibold text-primary"><Check className="h-4 w-4" aria-hidden /> Locked in. Waiting for the clock and the others…</p>}
      {asking && !my && <p className="mt-3 text-center text-xs text-muted-foreground">Answer quickly: faster correct answers score more.</p>}
      {!asking && (
        <div className="mt-3 rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-bold">{!my ? "Time is up: no answer from you." : assess ? "Answer recorded. Answers are shown at the end." : my.ok ? `Correct${gained ? `: +${gained} points` : ""}` : "Not this time."}</p>
          {!assess && (q.why || my?.explanation) && <p className="mt-1.5 leading-relaxed text-muted-foreground"><strong className="text-foreground">Why:</strong> {q.why || my?.explanation}</p>}
          <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">{top.map((p, i) => <li key={p.id} className={p.me ? "font-bold" : ""}>{i + 1}. {p.nick} <span className="tabular-nums text-muted-foreground">{p.score}</span></li>)}</ol>
          <p className="mt-2 text-xs text-muted-foreground">{qi + 1 >= n ? "That was the last question." : `Next question in ${Math.max(0, Math.ceil((slot - within) / 1000))}…`}</p>
        </div>
      )}
      {over && <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Adding up the scores…</p>}
      <LivePanels s={s} />
    </div>
  );
}

/** Own-pace game (marathon, or a speed duel without the live clock): answer, see the result at once, move on. The answer is saved in the background. */
function PlaySolo({ s, qs, code, token, serverNow, reload }: { s: ZoneState; qs: PlayQuestion[]; code: string; token: string; serverNow: () => number; reload: () => void }) {
  useTicker(200);
  useLeaveFlag(code, token);
  const [seq, setSeq] = useState(s.me?.answered ?? 0);
  const [picked, setPicked] = useState<number | null>(null);
  const [fb, setFb] = useState<{ correct: number; explanation: string; ok: boolean } | null>(null);
  const [score, setScore] = useState(s.me?.score ?? 0);
  const [lives, setLives] = useState(s.me?.lives ?? 1);
  const shownAt = useRef(Date.now());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const nextFn = useRef<(() => void) | null>(null);
  const st = s.room.settings, mode = s.room.mode;
  const perQ = (st.perQuestionSec ?? 20) * 1000;
  const assess = !!st.assessment;
  const total = s.room.n;

  useEffect(() => { shownAt.current = Date.now(); setPicked(null); setFb(null); nextFn.current = null; }, [seq]);
  const q = qs.length ? qs[seq % qs.length] : null;
  const timeLeftQ = mode === "marathon" ? Infinity : perQ - (Date.now() - shownAt.current);
  const timeLeftAll = s.room.endsAt ? s.room.endsAt - serverNow() : Infinity;

  const answer = useCallback((choice: number) => {
    if (picked !== null || !q) return;
    setPicked(choice);
    const mySeq = seq, ms = Date.now() - shownAt.current;
    const instant = q.key !== undefined;
    const lastOne = mode === "speed" && mySeq + 1 >= total;
    const goNext = (done: boolean) => { if (done) { void queue.current.then(reload); } else setSeq((x) => x + 1); };
    const send = () => { queue.current = queue.current.then(() => sendAnswer(code, token, mySeq, choice, ms)).then((r) => {
      setScore(r.score); if (r.lives != null) setLives(r.lives);
      if (r.stale && r.answered != null) setSeq(r.answered);
      if (!instant) {
        setFb({ correct: r.correct ?? -1, explanation: r.explanation ?? "", ok: !!r.ok });
        if (r.explanation && !assess) nextFn.current = () => goNext(!!r.finished); else window.setTimeout(() => goNext(!!r.finished), 1100);
      } else if (r.finished) reload();
    }).catch(() => undefined); };
    send();
    if (instant) {
      const ok = choice === q.key;
      const outNow = mode === "sudden" && !ok && lives - 1 <= 0;
      if (mode === "sudden" && !ok) setLives((l) => l - 1);
      setFb({ correct: q.key!, explanation: q.why ?? "", ok });
      if (q.why && !assess) nextFn.current = () => goNext(lastOne || outNow); else window.setTimeout(() => goNext(lastOne || outNow), ok ? 900 : 1300);
    }
  }, [picked, q, seq, mode, total, code, token, assess, lives, reload]);

  useEffect(() => { if (q && picked === null && timeLeftQ <= 0) answer(-1); }, [timeLeftQ, q, picked, answer]);
  useEffect(() => { if (timeLeftAll <= 0) { void finishMe(code, token).then(reload); } }, [timeLeftAll, code, token, reload]);

  if (!q) return <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Getting the questions…</p>;
  const pct = Number.isFinite(timeLeftQ) ? Math.max(0, Math.min(100, (timeLeftQ / perQ) * 100)) : Number.isFinite(timeLeftAll) ? Math.max(0, Math.min(100, (timeLeftAll / ((st.minutes ?? 5) * 60000)) * 100)) : 100;
  const urgent = pct < 25;
  return (
    <div style={assess ? { userSelect: "none", WebkitUserSelect: "none" } : undefined} {...noCopyProps(assess)}>
      <div className="flex items-center justify-between gap-3 text-sm font-bold">
        <span className="flex items-center gap-1.5">{mode === "sudden" ? Array.from({ length: Math.max(lives, 0) }).map((_, i) => <Heart key={i} className="h-4 w-4 fill-rose-500 text-rose-500" aria-label="Life" />) : <span>{mode === "marathon" ? `Question ${seq + 1}` : `Question ${seq + 1} of ${total}`}</span>}{mode === "sudden" && lives <= 0 && <Skull className="h-4 w-4" aria-label="Out" />}</span>
        <span className="flex items-center gap-3">{s.me?.host && <button type="button" onClick={() => { if (window.confirm("End the game for everyone now?")) void endRoom(code, token).then(reload); }} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground hover:border-rose-500 hover:text-rose-600">End game</button>}<span className="tabular-nums text-primary">{score} pts</span>{Number.isFinite(timeLeftAll) && <span className={`flex items-center gap-1 tabular-nums ${timeLeftAll < 30000 ? "text-rose-600" : ""}`}><Timer className="h-4 w-4" aria-hidden />{clock(timeLeftAll)}</span>}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${urgent ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${pct}%`, transition: "width 200ms linear" }} /></div>
      <div className="mt-4">
        <QuestionCard q={q} picked={picked} correct={fb ? fb.correct : null} locked={picked !== null} onPick={answer} wasAi={q.ai} />
        {fb && fb.explanation && !assess && <p className="mt-3 rounded-lg bg-primary/5 p-3 text-sm leading-relaxed"><strong>Why:</strong> {fb.explanation}</p>}
        {fb && fb.explanation && !assess && <button type="button" onClick={() => nextFn.current?.()} className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 sm:w-auto">Next question</button>}
        {picked === -1 && !fb && <p className="mt-3 text-xs text-muted-foreground">Time is up for this question.</p>}
      </div>
      <LivePanels s={s} />
    </div>
  );
}

function Results({ s, code, token }: { s: ZoneState; code: string; token: string }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [res, setRes] = useState<ZoneResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const me = s.players.find((p) => p.me);
  const rank = me ? s.players.indexOf(me) + 1 : 0;
  const live = s.room.status !== "done";
  const humans = s.players.filter((p) => !p.ai).length;
  useEffect(() => { void getResults(code, token).then(setRes).catch(() => undefined); }, [code, token, live]);
  const mine = useMemo(() => res?.mine ?? [], [res]);
  const avg = mine.length ? Math.round(mine.reduce((n, a) => n + a.ms, 0) / mine.length / 100) / 10 : 0;
  const missed = useMemo(() => {
    if (!res) return [];
    const right = new Set<number>(), seen = new Set<number>();
    for (const a of mine) { seen.add(a.idx); if (a.ok) right.add(a.idx); }
    return res.questions.filter((q) => !right.has(q.idx) && (seen.has(q.idx) || s.room.live));
  }, [res, mine, s.room.live]);
  const text = `I scored ${me?.score ?? 0} points (${ord(rank)} of ${s.players.length}) in “${s.room.title}” on Friend Zone. Can you beat me? ${roomLink(code)}`;
  const rematch = async () => {
    if (!res) return; setBusy(true); setErr("");
    try { const t = newToken(); const { code: c } = await createRoom({ title: s.room.title, topic: s.room.topic, mode: s.room.mode, settings: s.room.settings, ai: s.room.hasAi ? { name: "Ompath AI", acc: 0.7, delay: 8000 } : null, questions: res.questions.map((q) => ({ q: q.q, options: q.options, correct: q.correct, explanation: q.explanation, ai: q.ai, kind: q.kind, image: q.image })), nick: me?.nick || "Host", token: t }); saveToken(c, t); nav(`/zone/${c}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <Trophy className="mx-auto h-9 w-9 text-primary" aria-hidden />
        {live ? <p className="mt-2 text-sm font-semibold text-muted-foreground">You are finished. Others are still playing.</p> : <p className="mt-2 text-sm font-semibold text-muted-foreground">Final result</p>}
        <p className="mt-1 font-serif text-4xl font-bold">{me?.score ?? 0} <span className="text-lg font-normal text-muted-foreground">points</span></p>
        <p className="mt-1 text-sm">{rank === 1 && !live && s.players.length > 1 ? "You won! " : ""}{rank ? `${ord(rank)} of ${s.players.length}` : ""} · {me?.correct ?? 0} correct of {me?.answered ?? 0}{avg ? ` · ${avg}s per answer` : ""}</p>
        {!live && <p className="mt-2 text-xs text-muted-foreground">{user ? "Saved to your Friend Zone record." : <>Not saved. <Link to="/login" className="font-bold text-primary hover:underline">Sign in</Link> next time to keep your record.</>}{humans > 1 && user ? " Every signed-in player gets it in their own record." : ""}</p>}
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
            <li key={m.idx} className="rounded-xl border border-border p-3 text-sm">{m.image && <img src={m.image} alt="" loading="lazy" className="mb-2 max-h-48 w-auto max-w-full rounded-lg object-contain" />}<p className="whitespace-pre-line font-semibold">{m.q}</p><p className="mt-1.5 text-emerald-700 dark:text-emerald-400"><Check className="mr-1 inline h-3.5 w-3.5" aria-hidden />{LETTERS[m.correct]}. {m.options[m.correct]}</p>{m.explanation && <p className="mt-1 text-xs text-muted-foreground">{m.explanation}</p>}</li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}

function JoinGate({ code, s, onJoined }: { code: string; s: ZoneState; onJoined: () => void }) {
  const { user } = useAuth();
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const [nick, setNick] = useState(() => savedNick() || (meta?.full_name || meta?.name || "").split(" ")[0] || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const st = s.room.settings;
  const go = async () => {
    if (!nick.trim()) { setErr("Choose a name your friends will see."); return; }
    setBusy(true); setErr("");
    try { const t = newToken(); await joinRoom(code, nick.trim(), t); saveToken(code, t); saveNick(nick.trim()); onJoined(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
      <Gamepad2 className="mx-auto h-8 w-8 text-primary" aria-hidden />
      <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">{s.room.host} invites you</p>
      <h1 className="mt-1 font-serif text-2xl font-bold">{s.room.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{st.game && st.game !== "quiz" ? GAMES[st.game].label : MODES[s.room.mode].label} · {s.room.n} questions · {s.players.length} in the room</p>
      <p className="mt-2 font-mono text-lg tracking-widest">{code}</p>
      <input value={nick} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void go()} maxLength={24} placeholder="Your name" aria-label="Your name" className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-sm outline-none focus:border-primary" />
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
      <button type="button" onClick={go} disabled={busy} className="mt-4 w-full rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60">{busy ? "Joining…" : "Join the game"}</button>
      {!user && <p className="mt-3 text-xs text-muted-foreground">No account needed to join. <Link to="/login" className="font-bold text-primary hover:underline">Sign in</Link> first if you want the result saved to your record.</p>}
    </div>
  );
}

/** /zone/:code — the room: join, lobby, countdown, the game, and the results, all on one address so the share link just works. */
export default function ZoneRoom() {
  const { code: raw = "" } = useParams();
  const code = normaliseCode(raw) || raw.toUpperCase();
  const [token, setToken] = useState(() => tokenFor(code));
  const { state, error, load, serverNow } = useRoom(code, token);
  const [qs, setQs] = useState<PlayQuestion[] | null>(null);
  const running = state?.room.status === "running" && !!state.me;

  // the questions are fetched during the countdown, so the first one appears the instant the game starts
  useEffect(() => {
    if (!running || qs) return;
    let stop = false;
    const go = (tries: number) => getQuestions(code, token).then((r) => { if (!stop) setQs(r); }).catch(() => { if (!stop && tries < 6) setTimeout(() => go(tries + 1), 800); });
    void go(0);
    return () => { stop = true; };
  }, [running, qs, code, token]);

  const startsAt = state?.room.startedAt ?? 0;
  const counting = !!state && state.room.status === "running" && serverNow() < startsAt;
  useTicker(100, counting);

  const reload = useCallback(() => void load(), [load]);
  const body = (() => {
    if (error && !state) return <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border p-8 text-center"><p className="font-semibold">{error}</p><Link to="/friend-zone" className="mt-4 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Back to Friend Zone</Link></div>;
    if (!state) return <p className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Opening the room…</p>;
    if (!state.me) return <JoinGate code={code} s={state} onJoined={() => { setToken(tokenFor(code)); }} />;
    if (state.room.status === "lobby") return <Lobby s={state} code={code} token={token} reload={reload} />;
    if (state.room.status === "done" || state.me.finished) return <Results s={state} code={code} token={token} />;
    if (counting) return <Countdown s={state} serverNow={serverNow} />;
    if (!qs) return <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Getting the questions…</p>;
    return state.room.live ? <PlayLive s={state} qs={qs} code={code} token={token} serverNow={serverNow} /> : <PlaySolo s={state} qs={qs} code={code} token={token} serverNow={serverNow} reload={reload} />;
  })();

  const host = state?.room.host ?? "";
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Helmet><title>{state ? `${host} invites you to ${state.room.title} | Friend Zone` : "Friend Zone"}</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/friend-zone" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Gamepad2 className="h-4 w-4" aria-hidden /> Friend Zone</Link>
        {state && <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[11px] font-bold">{state.room.settings.game && state.room.settings.game !== "quiz" ? `${GAMES[state.room.settings.game].label} · ` : ""}{state.room.mode === "speed" ? <Zap className="h-3.5 w-3.5" aria-hidden /> : state.room.mode === "marathon" ? <Timer className="h-3.5 w-3.5" aria-hidden /> : <Skull className="h-3.5 w-3.5" aria-hidden />}{MODES[state.room.mode].label}{state.room.live ? " · live" : ""}</span>}
      </div>
      {body}
    </main>
  );
}
