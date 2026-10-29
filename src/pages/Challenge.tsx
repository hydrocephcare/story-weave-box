import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Clock, Copy, Lock, MessageCircle, Swords, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyYear } from "@/hooks/useMyYear";
import { visibleToYear } from "@/lib/noteRank";
import { groupByTopic, outlineForUnit } from "@/lib/noteTopics";
import { getCategoryDisplayName } from "@/lib/store";
import { SITE_URL } from "@/lib/seo";
import { Skeleton } from "@/components/ui/skeleton";
import QuizRunner, { toItems, type QItem } from "@/components/QuizRunner";

/** Same seed, same questions: the friend gets exactly the questions the challenger answered. */
const seeded = (seed: number) => () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pickN = (items: QItem[], seed: number, n: number) => { const r = seeded(seed), a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const yearOf = (c: string) => Number(/^year\s*(\d)/i.exec(c)?.[1]) || 0;

type Row = { id: string; title: string; category: string };
const QUESTION_CHOICES = [10, 15, 20];
const TIME_CHOICES = [0, 5, 10, 15, 20]; // minutes, 0 = no timer
const MAX_LEAVES = 3; // leaving the challenge screen this many times ends it

/** /challenge: pick a unit, then a topic (or the whole unit), a length and a timer, and send a friend the link. /challenge/:id: play the same questions and compare scores. */
export default function Challenge() {
  const { id } = useParams();
  return id ? <Play id={id} /> : <Picker />;
}

function Picker() {
  const nav = useNavigate();
  const { year } = useMyYear();
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState<string | null>(null);
  const [n, setN] = useState(10);
  const [mins, setMins] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let on = true;
    const query = (supabase as any).from("mcq_sets").select("id,title,category").eq("published", true).is("deleted_at", null)
      .not("title", "ilike", "%past paper%").not("title", "ilike", "%Q&A%").not("title", "ilike", "%exam -%").order("updated_at", { ascending: false }).limit(700);
    Promise.resolve(query).then(({ data }: { data: Row[] | null }) => { if (on) setRows(data ?? []); }, () => { if (on) setRows([]); });
    return () => { on = false; };
  }, []);

  // everything here follows the student's year: their own and the years below, never above
  const visible = useMemo(() => (rows ?? []).filter((r) => r.category && visibleToYear(r.category, year)), [rows, year]);
  const units = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of visible) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => yearOf(b[0]) - yearOf(a[0]) || b[1] - a[1]);
  }, [visible]);
  const inUnit = useMemo(() => visible.filter((r) => r.category === unit), [visible, unit]);
  const groups = useMemo(() => {
    if (!unit) return [];
    const o = outlineForUnit(unit);
    const g = o ? groupByTopic(inUnit, o) : [];
    return g.length >= 2 ? g : [{ id: "all", title: "Question sets", items: inUnit }];
  }, [unit, inUnit]);
  const found = useMemo(() => (q.trim().length > 1 ? visible.filter((r) => r.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30) : []), [visible, q]);

  const start = (ids: string[]) => {
    const seed = Math.floor(Math.random() * 1e9);
    const t = mins ? `&t=${mins}` : "";
    nav(ids.length === 1 ? `/challenge/${ids[0]}?s=${seed}&n=${n}${t}` : `/challenge/mix?ids=${ids.slice(0, 14).join(",")}&s=${seed}&n=${n}${t}`);
  };
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>Challenge a friend | Ompath Study</title><meta name="description" content="Pick a unit and a topic, set a timer, and send the link on WhatsApp. Your friend answers the same questions in full screen and you compare scores." /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl font-bold sm:text-4xl"><Swords className="h-7 w-7 text-primary" aria-hidden /> Challenge a friend</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pick a unit and a topic. You both answer the same questions, full screen and against the clock, then compare scores. {year ? `Year ${year} and the years below.` : ""}</p>

      <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2">
        <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Questions</p><div className="flex flex-wrap gap-1.5">{QUESTION_CHOICES.map((c) => <button key={c} type="button" aria-pressed={n === c} onClick={() => setN(c)} className={chip(n === c)}>{c}</button>)}</div></div>
        <div><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Timer</p><div className="flex flex-wrap gap-1.5">{TIME_CHOICES.map((c) => <button key={c} type="button" aria-pressed={mins === c} onClick={() => setMins(c)} className={chip(mins === c)}>{c ? `${c} min` : "None"}</button>)}</div></div>
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a topic, e.g. thyroid, malaria, ECG" aria-label="Search question sets" className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" />

      {rows === null && <div className="mt-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}

      {q.trim().length > 1 ? (
        <ul className="mt-4 space-y-2">
          {found.map((r) => <SetRow key={r.id} r={r} onStart={() => start([r.id])} />)}
          {found.length === 0 && rows && <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sets found. Try another word.</li>}
        </ul>
      ) : rows && (
        <>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">1. Choose a unit</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...new Set(units.map(([c]) => yearOf(c)))].map((y) => (
              <div key={y} className="w-full"><p className="mb-1 mt-2 text-[11px] font-semibold text-muted-foreground">{y ? `Year ${y}${y === year ? " (yours)" : ""}` : "Other"}</p><div className="flex flex-wrap gap-1.5">{units.filter(([c]) => yearOf(c) === y).map(([c, k]) => <button key={c} type="button" aria-pressed={unit === c} onClick={() => setUnit(unit === c ? null : c)} className={chip(unit === c)}>{getCategoryDisplayName(c)} <span className="opacity-70">{k}</span></button>)}</div></div>
            ))}
            {units.length === 0 && <p className="text-sm text-muted-foreground">No question sets for your year yet.</p>}
          </div>

          {unit && (
            <div className="mt-5">
              <button type="button" onClick={() => start(inUnit.map((r) => r.id))} className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-left hover:border-primary"><span className="min-w-0 flex-1"><span className="block text-sm font-bold">Mixed challenge: all of {getCategoryDisplayName(unit)}</span><span className="block text-xs text-muted-foreground">{n} questions drawn from every set in the unit</span></span><span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Start</span></button>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">2. Or one topic</p>
              <div className="mt-2 space-y-5">
                {groups.map((g) => (
                  <section key={g.id} aria-label={g.title}>
                    <div className="mb-1.5 flex items-center gap-3"><h2 className="font-serif text-base font-bold">{g.title}</h2><span className="text-xs text-muted-foreground">{g.items.length}</span><div className="h-px flex-1 bg-border" /></div>
                    <ul className="space-y-2">
                      {g.items.length > 1 && g.id !== "all" && g.id !== "other" && <li><button type="button" onClick={() => start(g.items.map((r) => r.id))} className="w-full rounded-lg border border-dashed border-primary/40 px-3 py-2 text-left text-xs font-bold text-primary hover:bg-primary/5">Mix everything in {g.title}</button></li>}
                      {g.items.map((r) => <SetRow key={r.id} r={r} onStart={() => start([r.id])} />)}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const SetRow = ({ r, onStart }: { r: Row; onStart: () => void }) => (
  <li>
    <button type="button" onClick={onStart} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50">
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.title}</span><span className="block truncate text-xs text-muted-foreground">{getCategoryDisplayName(r.category)} · Year {yearOf(r.category) || "?"}</span></span>
      <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Start</span>
    </button>
  </li>
);

function Play({ id }: { id: string }) {
  const { user } = useAuth();
  const { year: myYear } = useMyYear();
  const [sp] = useSearchParams();
  const seed = Number(sp.get("s")) || 1, n = Math.min(20, Math.max(3, Number(sp.get("n")) || 10));
  const mins = Math.min(60, Math.max(0, Number(sp.get("t")) || 0));
  const ids = id === "mix" ? (sp.get("ids") || "").split(",").filter((x) => /^[0-9a-f-]{30,40}$/i.test(x)).slice(0, 14) : [id];
  const theirs = sp.get("c") !== null ? Number(sp.get("c")) : null, theirTime = sp.get("d") !== null ? Number(sp.get("d")) : null, from = (sp.get("from") || "A friend").slice(0, 30);
  const [sets, setSets] = useState<{ id: string; title: string; category: string; questions: unknown }[] | null | undefined>(undefined);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [done, setDone] = useState<number | null>(null);
  const [left, setLeft] = useState(mins * 60);
  const [used, setUsed] = useState(0);
  const [leaves, setLeaves] = useState(0);
  const [warn, setWarn] = useState(false);
  const [copied, setCopied] = useState(false);
  const score = useRef(0);
  const started = useRef(0);

  useEffect(() => {
    let on = true;
    if (!ids.length) { setSets(null); return; }
    Promise.resolve((supabase as any).from("mcq_sets").select("id,title,category,questions").in("id", ids).eq("published", true).is("deleted_at", null)).then(({ data }: { data: { id: string; title: string; category: string; questions: unknown }[] | null }) => { if (on) setSets(data && data.length ? [...data].sort((a, b) => a.id.localeCompare(b.id)) : null); }, () => { if (on) setSets(null); });
    return () => { on = false; };
  }, [id, sp.get("ids")]); // eslint-disable-line react-hooks/exhaustive-deps

  // a challenge is for the years you can see: your own and the years below
  const allowed = !sets || sets.every((s) => visibleToYear(s.category, myYear));
  const items = useMemo(() => (sets && allowed ? pickN(sets.flatMap((s) => toItems(s.id, s.category, s.questions)), seed, n) : []), [sets, allowed, seed, n]);
  const title = sets ? (sets.length === 1 ? sets[0].title : `Mixed: ${[...new Set(sets.map((s) => getCategoryDisplayName(s.category)))].slice(0, 2).join(", ")}`) : "Challenge a friend";
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const myName = (meta?.full_name || meta?.name || "A friend").split(" ")[0];

  const finish = useCallback((final: number) => {
    setUsed(Math.round((Date.now() - started.current) / 1000));
    setDone(final); setPhase("done");
    try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* not in full screen */ }
  }, []);

  const begin = () => {
    score.current = 0; started.current = Date.now(); setLeft(mins * 60); setLeaves(0); setWarn(false); setPhase("running");
    try { void document.documentElement.requestFullscreen?.().catch(() => undefined); } catch { /* some phones cannot */ }
  };

  // the clock
  useEffect(() => {
    if (phase !== "running" || !mins) return;
    const t = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [phase, mins]);
  useEffect(() => { if (phase === "running" && mins && left <= 0) finish(score.current); }, [left, phase, mins, finish]);

  // leaving the screen is recorded; leaving too often ends the challenge
  useEffect(() => {
    if (phase !== "running") return;
    const out = () => setLeaves((c) => c + 1);
    const vis = () => { if (document.hidden) out(); };
    const fs = () => { if (!document.fullscreenElement) setWarn(true); };
    document.addEventListener("visibilitychange", vis); document.addEventListener("fullscreenchange", fs);
    return () => { document.removeEventListener("visibilitychange", vis); document.removeEventListener("fullscreenchange", fs); };
  }, [phase]);
  useEffect(() => { if (phase === "running" && leaves >= MAX_LEAVES) finish(score.current); }, [leaves, phase, finish]);
  useEffect(() => () => { try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* ignore */ } }, []);

  const total = items.length;
  const link = done === null ? "" : `${SITE_URL}/challenge/${id}?${id === "mix" ? `ids=${ids.join(",")}&` : ""}s=${seed}&n=${total}${mins ? `&t=${mins}` : ""}&c=${done}&d=${used}&from=${encodeURIComponent(myName)}`;
  const msg = done === null ? "" : `I scored ${done}/${total} on "${title}"${mins ? ` in ${clock(used)}` : ""}. Can you beat me? ${link}`;
  const noCopy = { onCopy: (e: React.ClipboardEvent) => e.preventDefault(), onCut: (e: React.ClipboardEvent) => e.preventDefault(), onContextMenu: (e: React.MouseEvent) => e.preventDefault(), onDragStart: (e: React.DragEvent) => e.preventDefault() };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>{sets ? `Challenge: ${title} | Ompath Study` : "Challenge | Ompath Study"}</title><meta name="robots" content="noindex" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study · Challenge</p>
      <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{title}</h1>
      {theirs !== null && phase !== "done" && <p className="mt-2 rounded-xl bg-primary/10 p-3 text-sm"><strong>{from}</strong> scored <strong>{theirs}/{n}</strong>{theirTime ? <> in <strong>{clock(theirTime)}</strong></> : null}. Answer the same questions and see if you can beat them.</p>}

      {sets === undefined && <div className="mt-8 space-y-3"><Skeleton className="h-6 w-full" /><Skeleton className="h-64 w-full" /></div>}
      {sets === null && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">This challenge is not available. <Link to="/challenge" className="font-bold text-primary hover:underline">Start your own</Link></p>}
      {sets && !allowed && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">This challenge is from a higher year than yours. <Link to="/challenge" className="font-bold text-primary hover:underline">Start one for your year</Link></p>}
      {sets && allowed && items.length < 3 && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">This topic has too few multiple-choice questions for a challenge. <Link to="/challenge" className="font-bold text-primary hover:underline">Pick another</Link></p>}

      {sets && allowed && items.length >= 3 && phase === "ready" && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold">{total} questions{mins ? `, ${mins} minutes` : ", no timer"}.</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{mins ? "The clock starts when you press Start and the challenge ends when it reaches zero." : "Your time is recorded and sent with your score."}</li>
            <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />It opens full screen. Copying and selecting text are switched off. Leaving the screen {MAX_LEAVES} times ends the challenge.</li>
          </ul>
          <button type="button" onClick={begin} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 sm:w-auto sm:px-8">Start</button>
        </div>
      )}

      {sets && allowed && items.length >= 3 && phase === "running" && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-background select-none" style={{ userSelect: "none", WebkitUserSelect: "none" }} {...noCopy}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2.5 text-sm font-bold backdrop-blur">
            <span className="truncate pr-3">{title}</span>
            <span className="flex shrink-0 items-center gap-3">
              {leaves > 0 && <span className="text-xs font-semibold text-amber-600">Left {leaves}/{MAX_LEAVES}</span>}
              {mins > 0 && <span className={`flex items-center gap-1 tabular-nums ${left <= 30 ? "text-rose-600" : "text-primary"}`}><Clock className="h-4 w-4" aria-hidden />{clock(Math.max(0, left))}</span>}
            </span>
          </div>
          {warn && <button type="button" onClick={() => { setWarn(false); try { void document.documentElement.requestFullscreen?.().catch(() => undefined); } catch { /* ignore */ } }} className="mx-auto mt-3 block w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-left text-sm font-semibold">You left full screen. Tap to go back to it.</button>}
          <div className="mx-auto max-w-2xl px-4 py-6"><QuizRunner items={items} onScore={(s) => { score.current = s; }} onDone={(s) => finish(s)} /></div>
        </div>
      )}

      {done !== null && phase === "done" && (
        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <Trophy className="mx-auto h-9 w-9 text-primary" aria-hidden />
          <p className="mt-2 font-serif text-3xl font-bold">{done} / {total}</p>
          <p className="mt-1 text-xs text-muted-foreground">Time {clock(used)}{leaves ? ` · left the screen ${leaves} time${leaves === 1 ? "" : "s"}` : ""}{mins && used >= mins * 60 ? " · time ran out" : ""}</p>
          {theirs !== null && <p className="mt-2 text-base font-semibold">{done > theirs ? `You beat ${from} (${theirs}/${n})!` : done === theirs ? `A tie with ${from} (${theirs}/${n})${theirTime && used < theirTime ? ", and you were faster." : "."}` : `${from} won with ${theirs}/${n}. Ask for a rematch.`}</p>}
          <p className="mt-3 text-sm text-muted-foreground">Now send your own challenge.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"><MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp</a>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }, () => {}); }} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary"><Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy link"}</button>
            <Link to="/challenge" className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-primary">New topic</Link>
          </div>
        </div>
      )}
    </main>
  );
}
