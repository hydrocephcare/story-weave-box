import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useReadLog } from "@/lib/readLog";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import BooksForPage from "@/components/BooksForPage";
import SponsorLine from "@/components/SponsorLine";
import AdSlot from "@/components/AdSlot";
import StudyTools from "@/components/StudyTools";
import SideAds from "@/components/SideAds";
import OutlineLine from "@/components/OutlineLine";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Check, ClipboardCheck, Link2, Share2, Stethoscope, ChevronDown, ChevronRight, Info, Loader2, RefreshCw, Sparkles, X, Zap, Printer, ThumbsUp, ThumbsDown, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { aiPaused, looksLikeBot } from "@/lib/topicWriter";
import { useAccess } from "@/lib/access";
import { useFeatures } from "@/lib/features";
import { openSubscribePrompt } from "@/lib/subscribe-prompt";
import { DOMAIN_STYLE, imageCaption, writeDeepNotes, type AiPage, type DeepNotes, rememberTopic, slugFromName, topicPath, useTopicIndex, useTopicPage, type TopicIndexItem, type TopicQuestion } from "@/lib/topics";
import { useWebMedia } from "@/lib/webMedia";
import HeroAurora from "@/components/HeroAurora";
import { Answer } from "@/components/ai/AnswerText";
import { rebalanceMcqAnswerLetters } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { openAI } from "@/lib/aiEvents";

const SITE = "https://www.ompathstudy.com";
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** One section of the article: a large serif heading and text that flows. No boxes, no rules, no colour bars: space and type do the work. */
function Section({ id, title, children, first, deep }: { id: string; title: string; children: ReactNode; first?: boolean; deep?: boolean }) {
  return (
    <section id={id} data-deep={deep ? "1" : undefined} className={cn("scroll-mt-28", first ? "pt-1" : "mt-14 sm:mt-20")}>
      <h2 className="font-serif text-[1.85rem] font-bold leading-[1.15] tracking-tight text-foreground sm:text-[2.35rem]">{title}</h2>
      <div className="flow mt-5 max-w-[68ch] space-y-4 text-[17px] leading-[1.75] text-foreground/80 sm:space-y-5 sm:text-[19px] sm:leading-[1.8] [&_strong]:font-semibold [&_strong]:text-foreground">{children}</div>
    </section>
  );
}

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let termCache: { key: number; re: RegExp; map: Map<string, string> } | null = null;
function termMatcher(index: TopicIndexItem[], skip: string) {
  if (termCache && termCache.key === index.length) return termCache;
  const items = index.filter((t) => t.n.length >= 5 && (t.d >= 3 || t.ai)).sort((a, b) => b.n.length - a.n.length);
  const map = new Map(items.map((t) => [t.n.toLowerCase(), t.s] as const));
  const re = new RegExp("(?<![A-Za-z0-9-])(" + items.map((t) => escRe(t.n)).join("|") + ")(?![A-Za-z0-9-])", "gi");
  termCache = { key: index.length, re, map };
  void skip;
  return termCache;
}
/** Plain text in which every subject that has its own page is tappable (it opens the quick-read panel). */
function Linked({ text, self }: { text: string; self: string }) {
  const index = useTopicIndex();
  if (!index?.length || text.length < 12) return <>{text}</>;
  const { re, map } = termMatcher(index, self);
  const out: ReactNode[] = []; const used = new Set<string>();
  let last = 0; let n = 0;
  for (const m of text.matchAll(re)) {
    const slug = map.get(m[0].toLowerCase());
    if (!slug || slug === self || used.has(slug) || n >= 2) continue;
    used.add(slug); n++;
    out.push(text.slice(last, m.index), <a key={m.index} href={`/topic/${slug}`} className="note-link topic-link">{m[0]}</a>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

/** Splits long prose into short paragraphs (two sentences each) so nothing reads as a wall of text. */
const chunkText = (text: string): string[] => {
  const sents = text.replace(/\s+/g, " ").trim().match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
  if (sents.length <= 2) return [text.trim()];
  const out: string[] = []; let cur = "";
  for (const x of sents) { if (cur && (cur.split(/[.!?]\s/).length >= 2 || (cur + " " + x).length > 300)) { out.push(cur); cur = x; } else cur = cur ? cur + " " + x : x; }
  if (cur) out.push(cur);
  return out;
};
function Paras({ text, self = "" }: { text: string; self?: string }) {
  return <>{chunkText(text).map((p, i) => <p key={i}><Linked text={p} self={self} /></p>)}</>;
}

function Bullets({ items, self = "" }: { items: string[]; self?: string }) {
  return (
    <ul className="space-y-3">
      {items.map((b, i) => (
        <li key={i} className="flex gap-3.5"><span className="mt-[0.8rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span className="min-w-0 flex-1"><Linked text={b} self={self} /></span></li>
      ))}
    </ul>
  );
}

function TestTable({ rows }: { rows: { a: string; b: string }[] }) {
  return (
    <dl className="space-y-5">
      {rows.map((r, i) => (
        <div key={i}><dt className="font-semibold text-foreground">{r.a}</dt><dd className="mt-1 text-foreground/80">{r.b}</dd></div>
      ))}
    </dl>
  );
}

function Mcq({ q, n }: { q: TopicQuestion; n: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const done = pick !== null;
  return (
    <article className="py-1">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question {n}</p>
      <h3 className="mt-1.5 text-[17px] font-semibold leading-snug text-foreground">{q.q}</h3>
      <ul className="mt-4 grid gap-2">
        {q.o.map((o, i) => {
          const right = i === q.a, chosen = pick === i;
          return (
            <li key={i}>
              <button type="button" disabled={done} onClick={() => setPick(i)} aria-pressed={chosen}
                className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-[15px] leading-snug transition",
                  !done && "border-border hover:border-primary/60 hover:bg-primary/5",
                  done && right && "border-emerald-500/60 bg-emerald-500/10",
                  done && chosen && !right && "border-red-500/60 bg-red-500/10",
                  done && !chosen && !right && "border-border opacity-60")}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">{"ABCDE"[i]}</span>
                <span className="min-w-0 flex-1">{o}</span>
                {done && right && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct answer" />}
                {done && chosen && !right && <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Your answer" />}
              </button>
            </li>
          );
        })}
      </ul>
      {done && (
        <div className="mt-4 rounded-xl bg-muted/70 p-4 text-[15px] leading-relaxed" role="status">
          <p className="font-bold">{pick === q.a ? "Correct." : `Not quite. The answer is ${"ABCDE"[q.a]}.`}</p>
          {q.e && <p className="mt-1 text-muted-foreground">{q.e}</p>}
          {q.u && <Link to={q.u} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">From: {q.s} <ChevronRight className="h-3.5 w-3.5" /></Link>}
        </div>
      )}
    </article>
  );
}

/** A model answer that arrived as one run of text ("a) **Epidemiology** … b) **Classification** … * item * item") laid out as paragraphs and bullet lists. */
function prettyAnswer(m: string): string {
  return m.replace(/\r/g, "").replace(/\s+\*\s+(?=\S)/g, "\n- ").replace(/([.:;)])\s+(?=[a-eA-E]\)\s)/g, "$1\n\n").replace(/(\*\*)\s+(?=\*\*[A-Z])/g, "$1\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
/** A question cut off in the middle of a sentence ends with an ellipsis, not a dangling word. */
const tidyQuestion = (q: string) => { const t = q.replace(/\s+/g, " ").trim(); return /[?.:!)…]$/.test(t) ? t : `${t}…`; };

function Written({ q, m, k, u, s }: { q: string; m: string; k: number | null; u: string; s: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="py-1">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Written question{k ? ` · ${k} marks` : ""}</p>
      <h3 className="mt-1.5 text-[17px] font-semibold leading-snug">{tidyQuestion(q)}</h3>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-bold hover:border-primary/60">{open ? "Hide model answer" : "Show model answer"}</button>
      {open && <div className="mt-3 text-[16px] leading-relaxed text-foreground/85"><Answer text={prettyAnswer(m) + (m.length >= 699 ? "…" : "")} /><Link to={u} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Full answer: {s} <ChevronRight className="h-3.5 w-3.5" /></Link></div>}
    </article>
  );
}

function Disclaimer({ disease }: { disease: boolean }) {
  return (
    <p className="flex gap-2.5 text-[14.5px] leading-relaxed text-muted-foreground" role="note">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span><strong className="font-semibold text-foreground/80">For learning, not medical advice.</strong> {disease ? "If you think you or someone you know may have this condition, please see a doctor or health worker. In an emergency, go to the nearest hospital." : "Always check against your lecturers' notes and your textbooks."}</span>
    </p>
  );
}

/** A quiet placeholder while a page is being prepared: no words about how it is made. */
/** Drill mode: the viva questions one at a time. Tap to see the answer, then mark it "Got it" or "Again"; what you mark is remembered on this device. */
function DrillMode({ slug, items, onClose }: { slug: string; items: { q: string; a: string }[]; onClose: () => void }) {
  const key = `ompath_drill_${slug}`;
  const [marks, setMarks] = useState<Record<number, "got" | "again">>(() => { try { return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<number, "got" | "again">; } catch { return {}; } });
  const [pile, setPile] = useState<number[]>(() => items.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [show, setShow] = useState(false);
  const save = (next: Record<number, "got" | "again">) => { setMarks(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } };
  const mark = (v: "got" | "again") => { save({ ...marks, [pile[pos]]: v }); setShow(false); setPos((p) => p + 1); };
  const again = items.map((_, i) => i).filter((i) => marks[i] === "again");
  const done = pos >= pile.length;
  const item = items[pile[pos]];
  return (
    <section aria-label="Drill mode" className="no-print mb-8 rounded-3xl border border-primary/30 bg-primary/5 p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Drill · {Math.min(pos + 1, pile.length)} of {pile.length} · {again.length} to revise</p>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close drill"><X className="h-4 w-4" /></button>
      </div>
      {!done && item ? (
        <>
          <p className="mt-4 font-serif text-2xl font-bold leading-snug sm:text-[1.7rem]">{item.q}</p>
          {show
            ? <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-[17px] leading-[1.7]">{item.a}</p>
            : <button type="button" onClick={() => setShow(true)} className="mt-5 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Show answer</button>}
          {show && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => mark("got")} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-5 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" aria-hidden /> Got it</button>
              <button type="button" onClick={() => mark("again")} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-5 py-2 text-sm font-bold text-amber-700 dark:text-amber-300"><RefreshCw className="h-4 w-4" aria-hidden /> Again</button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4">
          <p className="font-serif text-2xl font-bold">{again.length ? `${again.length} to go over again` : "All of them, well done"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {again.length > 0 && <button type="button" onClick={() => { setPile(again); setPos(0); setShow(false); }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Drill the {again.length} I missed</button>}
            <button type="button" onClick={() => { save({}); setPile(items.map((_, i) => i)); setPos(0); setShow(false); }} className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-bold hover:bg-muted">Start again</button>
          </div>
        </div>
      )}
    </section>
  );
}

const DEEP_BAND = "rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-7";

/** The deep exam notes: shown when they exist; otherwise one button writes them once (builds on the revision page, and on past-paper questions) and saves them for everyone. */
function DeepView({ slug, name, category, page, deep, onDone, canRead, past }: { slug: string; name: string; category: string; page: AiPage; deep: DeepNotes | null; onDone: (d: DeepNotes) => void; canRead: boolean; past: string[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drill, setDrill] = useState(false);
  const write = async () => {
    setBusy(true); setErr("");
    const r = await writeDeepNotes(slug, name, category, page, past);
    setBusy(false);
    if ("deep" in r) onDone(r.deep); else setErr(r.error === "busy" ? "The writer is busy right now. Try again in a minute." : r.error === "bot" ? "Open this page in a normal browser to write the deep notes." : "The deep notes could not be written just now. Try again in a minute.");
  };
  const unlock = () => openSubscribePrompt("Deep exam notes are a Pro feature: bedside examination step by step, how to read every test, a management ladder, numbers and mnemonics to memorise, 15 or more viva questions with answers, MCQs and cases, with the questions most likely to be asked marked.");
  if (!deep && !canRead) {
    return (
      <section id="deep-start" data-deep="1" className={DEEP_BAND}>
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"><Lock className="h-3.5 w-3.5" aria-hidden /> Pro · Deep exam notes</p>
        <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Go deeper on {name}</h2>
        <p className="mt-2 max-w-[60ch] text-[17px] leading-relaxed text-foreground/80">The revision notes stay free. Pro adds the exam layer: the bedside examination step by step, how to read each test, a management ladder, numbers to memorise, 15+ viva questions with answers (the most likely ones marked), MCQs and two cases.</p>
        <button type="button" onClick={unlock} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95"><Sparkles className="h-4 w-4" aria-hidden /> See Pro</button>
      </section>
    );
  }
  if (!deep) {
    return (
      <section id="deep-start" data-deep="1" className={DEEP_BAND}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Deep exam notes</p>
        <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Go deeper on {name}</h2>
        <p className="mt-2 max-w-[60ch] text-[17px] leading-relaxed text-foreground/80">The writer reads the revision page and the past-paper questions on this topic, then adds what is missing: the bedside examination, how to read each test, a management ladder, numbers to memorise, 15+ viva questions with answers, MCQs and two cases.</p>
        <button type="button" onClick={() => void write()} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} {busy ? "Writing, about 15 seconds..." : "Write the deep exam notes"}</button>
        <p className="mt-3 text-sm text-muted-foreground">Written once, then saved for everyone. AI-written, cross-checked, and not reviewed by a doctor.</p>
        {err && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{err}</p>}
      </section>
    );
  }
  const vivas: { q: string; a: string; hot?: boolean; past?: boolean }[] = deep.vivas?.length ? deep.vivas : deep.exam.map((t) => { const i = t.search(/\?\s[—–]\s/); return i > 0 ? { q: t.slice(0, i + 1), a: t.slice(i + 1).replace(/^\s[—–]\s/, "") } : { q: t, a: "" }; });
  const counts: [number, string][] = [[vivas.length, "viva questions"], [deep.mcqs?.length ?? 0, "MCQs"], [deep.cases?.length ?? 0, "cases"], [deep.facts?.length ?? 0, "numbers to memorise"]];
  const shown = canRead ? deep.sections : deep.sections.slice(0, 1);
  return (
    <div>
      <div className="no-print mb-8 flex flex-wrap items-center gap-2">
        {counts.filter(([n]) => n > 0).map(([n, l]) => <span key={l} className="rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-sm font-semibold"><strong className="font-extrabold text-primary">{n}</strong> {l}</span>)}
        {canRead && vivas.some((v) => v.a) && !drill && <button type="button" onClick={() => setDrill(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-95"><Zap className="h-4 w-4" aria-hidden /> Drill me</button>}
      </div>
      {canRead && !deep.vivas?.length && (
        <div className="no-print mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
          <p className="min-w-0 flex-1 text-[16px] font-semibold">These are the first version of the deep notes. The full version adds numbers to memorise, 15+ viva questions with answers, MCQs and cases.</p>
          <button type="button" onClick={() => void write()} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} {busy ? "Writing, about 15 seconds..." : "Write the full version"}</button>
          {err && <p role="alert" className="w-full text-sm font-semibold text-red-600">{err}</p>}
        </div>
      )}
      {canRead && drill && <DrillMode slug={slug} items={vivas.filter((v) => v.a)} onClose={() => setDrill(false)} />}
      {canRead && ((deep.facts?.length ?? 0) > 0 || (deep.mnemonics?.length ?? 0) > 0) && (
        <section id="deep-memorise" data-deep="1" className={`${DEEP_BAND} mb-10 grid gap-6 sm:grid-cols-2`}>
          {(deep.facts?.length ?? 0) > 0 && (
            <div>
              <h2 className="font-serif text-xl font-bold">Numbers to memorise</h2>
              <ul className="mt-3 space-y-2 text-[16px] leading-snug">{deep.facts!.map((f) => <li key={f} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{f}</li>)}</ul>
            </div>
          )}
          {(deep.mnemonics?.length ?? 0) > 0 && (
            <div>
              <h2 className="font-serif text-xl font-bold">Memory aids</h2>
              <ul className="mt-3 space-y-3 text-[16px] leading-snug">{deep.mnemonics!.map((m) => <li key={m.n}><span className="font-extrabold text-primary">{m.n}</span><br />{m.t}</li>)}</ul>
            </div>
          )}
        </section>
      )}
      {shown.map((x, i) => (
        <Section key={`${x.h}-${i}`} id={`deep-${anchor(x.h)}`} title={x.h} first={i === 0} deep>
          {x.p && <Paras text={x.p} self={slug} />}
          {x.t && x.t.length > 0 && <TestTable rows={x.t} />}
          {x.b && x.b.length > 0 && <Bullets items={x.b} self={slug} />}
        </Section>
      ))}
      {canRead ? (
        <>
          {vivas.length > 0 && (
            <Section id="deep-exam" title="Viva questions with answers" deep>
              <ol className="space-y-6">{vivas.map((v, i) => <ExaminerQuestion key={v.q} n={i + 1} q={v.q} a={v.a} hot={v.hot} past={v.past} />)}</ol>
            </Section>
          )}
          {(deep.mcqs?.length ?? 0) > 0 && (
            <Section id="deep-mcqs" title="Test yourself: MCQs" deep>
              <div className="space-y-8">{deep.mcqs!.map((m, i) => <Mcq key={m.q} n={i + 1} q={{ q: m.q, o: m.o, a: m.a, e: m.e, u: "", s: "" }} />)}</div>
            </Section>
          )}
          {(deep.cases?.length ?? 0) > 0 && (
            <Section id="deep-cases" title="Clinical cases" deep>
              <div className="space-y-8">
                {deep.cases!.map((c, k) => (
                  <article key={k} className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Case {k + 1}</p>
                    <p className="mt-1.5 text-[17px] leading-relaxed text-foreground">{c.v}</p>
                    <ol className="mt-4 space-y-5">{c.qs.map((x, i) => <ExaminerQuestion key={x.q} n={i + 1} q={x.q} a={x.a} />)}</ol>
                  </article>
                ))}
              </div>
            </Section>
          )}
          {(deep.mistakes?.length ?? 0) > 0 && (
            <Section id="deep-mistakes" title="Common mistakes that cost marks" deep>
              <Bullets items={deep.mistakes!} self={slug} />
            </Section>
          )}
          <p className="mt-10 text-sm text-muted-foreground">AI-written{deep.checked ? ", cross-checked by a second AI on " + deep.checked : ""}, and not reviewed by a doctor. Check details against your lecture notes and the Kenya MoH guideline.</p>
        </>
      ) : (
        <section id="deep-locked" data-deep="1" className={`${DEEP_BAND} mt-10`}>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"><Lock className="h-3.5 w-3.5" aria-hidden /> Pro</p>
          <h2 className="mt-1 font-serif text-2xl font-bold">The rest of the deep notes</h2>
          <ul className="mt-3 space-y-1.5 text-[17px] text-foreground/80">
            {deep.sections.slice(1).map((x) => <li key={x.h} className="flex items-start gap-2"><Lock className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />{x.h}</li>)}
            {counts.filter(([n]) => n > 0).map(([n, l]) => <li key={l} className="flex items-start gap-2"><Lock className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />{n} {l}</li>)}
          </ul>
          <button type="button" onClick={unlock} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95"><Sparkles className="h-4 w-4" aria-hidden /> Unlock with Pro</button>
        </section>
      )}
    </div>
  );
}

/** "Was this page helpful?": one vote per visitor; pages students vote down are listed for the admin to rewrite. */
function HelpfulVote({ slug }: { slug: string }) {
  const key = `ompath_vote_${slug}`;
  const [voted, setVoted] = useState<number>(() => { try { return Number(localStorage.getItem(key) ?? 0); } catch { return 0; } });
  const send = (v: 1 | -1) => {
    setVoted(v);
    try {
      localStorage.setItem(key, String(v));
      let id = localStorage.getItem("ompath_vote_id");
      if (!id) { id = crypto.randomUUID(); localStorage.setItem("ompath_vote_id", id); }
      void (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<unknown> }).rpc("vote_topic", { p_slug: slug, p_visitor: id, p_vote: v });
    } catch { /* ignore */ }
  };
  const btn = (on: boolean) => cn("inline-flex h-10 w-10 items-center justify-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted");
  return (
    <div className="no-print mt-14 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/30 px-5 py-4">
      <p className="font-semibold">{voted ? "Thanks, that helps us improve this page." : "Was this page helpful?"}</p>
      <div className="flex gap-2">
        <button type="button" aria-label="Yes, helpful" aria-pressed={voted === 1} onClick={() => send(1)} className={btn(voted === 1)}><ThumbsUp className="h-4 w-4" /></button>
        <button type="button" aria-label="No, not helpful" aria-pressed={voted === -1} onClick={() => send(-1)} className={btn(voted === -1)}><ThumbsDown className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Writing({ name }: { name: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={`Loading ${name}`} className="space-y-8">
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden><div className="h-1 w-12 rounded-full bg-primary/40" /><div className="mt-4 h-8 w-2/5 animate-pulse rounded bg-foreground/10" /><div className="mt-5 space-y-3"><div className="h-4 w-full animate-pulse rounded bg-foreground/10" /><div className="h-4 w-11/12 animate-pulse rounded bg-foreground/10" /><div className="h-4 w-4/5 animate-pulse rounded bg-foreground/10" /></div></div>
      ))}
    </div>
  );
}

/** /topic/<slug>: a plain, readable article about one subject (definition first), with the library's notes and questions underneath. */
/** One examiner question: the question is shown, the answer waits behind a button so the student tries first. Old pages give "question? — answer" in one line; new deep notes give them separately. */
function ExaminerQuestion({ n, text, q, a, hot, past }: { n: number; text?: string; q?: string; a?: string; hot?: boolean; past?: boolean }) {
  const [open, setOpen] = useState(false);
  let question = q ?? "";
  let answer = a ?? "";
  if (q === undefined) {
    const t = text ?? "";
    // the answer starts after the dash that follows the question mark; with no question mark, after the last dash
    const afterQ = t.search(/\?\s[—–]\s/);
    const dashes = [...t.matchAll(/\s[—–]\s/g)];
    const cut = afterQ > 0 ? afterQ + 1 : dashes.length ? (dashes[dashes.length - 1].index ?? -1) : -1;
    question = cut > 0 ? t.slice(0, cut).trim() : t.trim();
    answer = cut > 0 ? t.slice(cut).replace(/^\s[—–]\s/, "").trim() : "";
  }
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{n}</span>
      <div className="min-w-0 flex-1">
        {(hot || past) && (
          <p className="mb-1 flex flex-wrap gap-1.5">
            {hot && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-300">Most likely</span>}
            {past && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Asked in a past paper</span>}
          </p>
        )}
        <p className="text-[19px] font-semibold leading-[1.6] text-foreground">{question}</p>
        {answer && (
          <>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300">{open ? "Hide answer" : "Show answer"}</button>
            {open && <p className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-[17px] leading-[1.7] text-foreground/90">{answer}</p>}
          </>
        )}
      </div>
    </li>
  );
}

/** The "On this page" rail: the section you are in is highlighted and a bar shows how far down you are. */
function TopicRail({ toc }: { toc: { id: string; t: string }[] }) {
  const spy = useScrollSpy(toc.map((t) => t.id));
  return (
    <aside className="hidden lg:block">
      <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-border text-[15px]">
        <p className="pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
        <ul className="mt-3 space-y-0.5">{toc.map((t) => <li key={t.id}><a href={`#${t.id}`} aria-current={spy.active === t.id ? "location" : undefined} className={`-ml-px block border-l-2 py-1.5 pl-4 font-medium transition-colors hover:border-primary hover:text-foreground ${spy.active === t.id ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground"}`}>{t.t}</a></li>)}</ul>
        <div className="mt-5 pl-4 pr-1">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground"><span>Reading</span><span>{spy.progress}%</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={spy.progress} aria-valuemin={0} aria-valuemax={100} aria-label="How far down this page you are"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${spy.progress}%` }} /></div>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="mt-3 block w-full text-left text-xs font-bold text-muted-foreground hover:text-primary">↑ Back to top</button>
        </div>
      </nav>
    </aside>
  );
}

export default function TopicPage() {
  const { slug = "" } = useParams();
  const [shared, setShared] = useState("");
  const navigate = useNavigate();
  const { topic, page, phase, fresh, redirectTo, retry, writing, name } = useTopicPage(slug);
  useReadLog(topic?.n ?? name);
  const [zoom, setZoom] = useState<number | null>(null);
  const [webZoom, setWebZoom] = useState<number | null>(null);
  const [heroZoom, setHeroZoom] = useState(false);
  const { isAdmin } = useAuth();
  const [adminMsg, setAdminMsg] = useState("");
  const [showFresh, setShowFresh] = useState(false);
  const [view, setView] = useState<"revision" | "deep">("revision");
  const [deepLocal, setDeepLocal] = useState<DeepNotes | null>(null);
  useEffect(() => { setView("revision"); setDeepLocal(null); }, [slug]);
  const deep = deepLocal ?? page?.deep ?? null;
  const past = [...(topic?.qs ?? []).map((x) => x.q), ...(topic?.es ?? []).map((x) => x.q)].slice(0, 12);
  const access = useAccess();
  const canRead = useFeatures(isAdmin || access.hasPass).can("deepNotes");
  useEffect(() => { if (!fresh) return; setShowFresh(true); const t = setTimeout(() => setShowFresh(false), 9000); return () => clearTimeout(t); }, [fresh]);
  useEffect(() => { document.body.classList.add("has-toc-bar"); return () => document.body.classList.remove("has-toc-bar"); }, []);
  useEffect(() => { if (topic || page) rememberTopic(slug, topic?.n ?? name); }, [slug, topic, page]); // eslint-disable-line react-hooks/exhaustive-deps
  // practice questions: stray "Answer: B" tails removed from options, and the correct letters spread so the key never repeats
  const qs = useMemo<TopicQuestion[]>(() => {
    const tail = /\s*[✅✔☑✓]?\s*(?:correct\s*)?answers?\s*[:\-]?\s*\(?[A-F]\)?\b.*$/i;
    const base = (topic?.qs ?? []).map((q) => ({ ...q, q: q.q.replace(/\s*[-–—]{2,}\s*$/, ""), question: q.q, options: q.o.map((o) => o.replace(tail, "").trim()), correct_answer: q.a, explanation: q.e }));
    return rebalanceMcqAnswerLetters(base).map((b) => ({ q: b.q, o: b.options as string[], a: b.correct_answer as number, e: b.e, u: b.u, s: b.s }));
  }, [topic]);
  const media = useWebMedia(name, [...(topic?.a ?? []), ...(page?.aka ?? [])], phase !== "loading");

  const subject = topic?.c ?? (page as { subject?: string } | null)?.subject ?? "";
  const style = DOMAIN_STYLE[subject] ?? DOMAIN_STYLE.Medicine;
  const isDisease = ["Pathology", "Medicine", "Psychiatry", "Paediatrics", "Obstetrics & gynaecology", "Surgery", "Pharmacology"].includes(topic?.c ?? "") || page?.kind === "disease";

  const summary = useMemo(() => {
    if (page?.summary) return page.summary;
    // a clean definition beats a line lifted from an exam question, so the web summary comes before the site's own snippet
    const own = topic?.sec?.[0]?.b?.[0];
    if (own && own.length >= 60) return own;
    return media?.extract ?? "";
  }, [page, topic, media]);

  const related = useMemo(() => {
    const seen = new Set<string>(); const out: { s: string; n: string }[] = [];
    for (const r of [...(topic?.rel ?? []), ...(page?.related ?? []).map((n) => ({ s: slugFromName(n), n }))]) { if (r.s && r.s !== slug && !seen.has(r.s)) { seen.add(r.s); out.push(r); } }
    return out.slice(0, 14);
  }, [topic, page, slug]);

  const jsonLd = useMemo(() => {
    if (!topic && !page) return null;
    const url = `${SITE}${topicPath(slug)}`;
    const faq = [...(page?.faq ?? []).map((f) => ({ q: f.q, a: f.a })), ...(topic?.qs ?? []).filter((q) => q.e).slice(0, 3).map((q) => ({ q: q.q, a: `${q.o[q.a]}. ${q.e}` }))].slice(0, 6);
    return [
      { "@context": "https://schema.org", "@type": "MedicalWebPage", name: `${name}: overview, causes, management and practice questions`, url, about: { "@type": "MedicalEntity", name }, description: summary || undefined, isPartOf: { "@type": "WebSite", name: "Ompath Study", url: SITE }, audience: { "@type": "Audience", audienceType: "Medical students" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE }, { "@type": "ListItem", position: 2, name: "Topics", item: `${SITE}/topics` }, { "@type": "ListItem", position: 3, name, item: url }] },
      ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    ];
  }, [topic, page, slug, name, summary]);

  if (redirectTo) return <Navigate to={topicPath(redirectTo)} replace />;

  if (phase === "loading") return <main className="mx-auto max-w-4xl px-5 py-16"><div className="h-10 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-4 h-5 w-1/2 animate-pulse rounded bg-muted" /><div className="mt-8 h-40 animate-pulse rounded-2xl bg-muted" /></main>;

  if (!topic && !page) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <Helmet><title>{name} | Ompath Study</title><meta name="robots" content="noindex" /></Helmet>
        {phase === "writing" && <Writing name={name} />}
        {phase === "rejected" && <div className="text-center"><h1 className="font-serif text-2xl font-bold">“{name}” is not on Ompath Study</h1><p className="mt-2 text-sm text-muted-foreground">We only cover medicine and health: diseases, anatomy, physiology, pathology, microbiology, pharmacology, and reproductive and public health.</p></div>}
        {(phase === "failed" || phase === "unavailable" || phase === "missing") && (
          <div className="text-center">
            <h1 className="font-serif text-2xl font-bold">We could not build the page on “{name}” just now</h1>
            <p className="mt-2 text-sm text-muted-foreground">{phase === "unavailable" ? "This page is not ready yet, please check back soon." : "This is usually temporary."} You can try again, or search the notes.</p>
            <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        )}
        <p className="mt-6 flex justify-center gap-2"><Link to={`/search?q=${encodeURIComponent(name)}`} className="rounded-lg border border-border px-4 py-2 text-sm font-bold">Search for “{name}”</Link><Link to="/topics" className="rounded-lg border border-border px-4 py-2 text-sm font-bold">All topics</Link></p>
      </main>
    );
  }

  const aiSections = page?.sections ?? [];
  // with no written article yet, the introduction found online is the overview, followed by its sections
  const intro = (!aiSections.length && media?.intro ? media.intro.split(/\n+/).filter(Boolean) : []).map((p, i) => (i === 0 && summary && p.startsWith(summary) ? p.slice(summary.length).trim() : p)).filter(Boolean);
  const wikiSections = !aiSections.length ? (media?.sections ?? []) : [];
  const manage = aiSections.find((s) => /manage|treat/i.test(s.h));
  const seekAfter = aiSections.length ? Math.max(0, manage ? aiSections.indexOf(manage) : aiSections.length - 1) : -1;
  const hasStudy = Boolean(topic && (topic.sec?.length || topic.src.length || topic.sets.length || topic.imgs.length || topic.qs.length || topic.es.length));
  const toc = view === "deep" && deep ? (canRead
    ? [...deep.sections.map((x) => ({ id: `deep-${anchor(x.h)}`, t: x.h })), ...(deep.facts?.length ? [{ id: "deep-memorise", t: "Numbers to memorise" }] : []), ...(deep.vivas?.length || deep.exam.length ? [{ id: "deep-exam", t: "Viva questions" }] : []), ...(deep.mcqs?.length ? [{ id: "deep-mcqs", t: "MCQs" }] : []), ...(deep.cases?.length ? [{ id: "deep-cases", t: "Cases" }] : [])]
    : [...deep.sections.slice(0, 1).map((x) => ({ id: `deep-${anchor(x.h)}`, t: x.h })), { id: "deep-locked", t: "Pro: the rest" }]
  ) : [
    ...(intro.length ? [{ id: "overview", t: "Overview" }] : []),
    ...aiSections.map((s) => ({ id: anchor(s.h), t: s.h })),
    ...wikiSections.map((w) => ({ id: anchor(w.h), t: w.h })),
    ...(page?.exam?.length ? [{ id: "examiner", t: "Examiner questions" }] : []),
    ...(page?.whenToSeekHelp?.length ? [{ id: "seek-help", t: "When to seek help" }] : []),
    ...(media?.more.length ? [{ id: "web-images", t: "Pictures" }] : []),
    ...(topic?.sec?.length ? [{ id: "notes-say", t: "In our notes" }] : []),
    ...(topic && (topic.qs.length || topic.es.length) ? [{ id: "practice", t: "Test yourself" }] : []),
    ...(page?.faq?.length ? [{ id: "faq", t: "Common questions" }] : []),
    ...(hasStudy ? [{ id: "material", t: "Study material" }] : []),
    ...(related.length ? [{ id: "related", t: "Related topics" }] : []),
  ];
  const title = `${name}: overview, causes, management and practice questions | Ompath Study`;
  const desc = (summary || `Everything on ${name} from Ompath Study: notes, images, practice questions and related topics.`).slice(0, 155);
  const aka = [...new Set([...(topic?.a ?? []), ...(page?.aka ?? [])])].slice(0, 6);
  const firstNote = topic?.src[0];

  return (
    <main className="pb-24 lg:pb-20">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <link rel="canonical" href={`${SITE}${topicPath(slug)}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        {(topic?.imgs[0] || media?.hero) && <meta property="og:image" content={topic?.imgs[0]?.u ?? media?.hero?.u} />}
        {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
      </Helmet>

      <header className="relative isolate overflow-hidden border-b border-border/60">
        <HeroAurora about={subject || name} />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-8 sm:pb-16 sm:pt-12 md:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground"><button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/topics"))} className="mr-2 inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-foreground/80 hover:border-primary/60"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back</button><Link to="/topics" className="hover:text-primary hover:underline">Topics</Link><ChevronRight className="h-3.5 w-3.5" /><span>{style.label}</span></nav>
            <h1 className={cn("mt-5 font-serif font-bold leading-[1.05] tracking-tight text-foreground [overflow-wrap:anywhere]", Math.max(...name.split(/\s+/).map((w) => w.length)) > 12 ? "text-[2.15rem] sm:text-6xl lg:text-7xl" : "text-5xl sm:text-6xl lg:text-7xl")}>{name}</h1>
            {aka.length > 0 && <p className="mt-3 text-lg text-muted-foreground">Also called {aka.join(", ")}</p>}
            {summary ? <p className="mt-6 max-w-2xl text-xl leading-[1.65] text-foreground/85 sm:text-[1.4rem] sm:leading-[1.65]">{summary}</p> : writing ? <div className="mt-6 max-w-2xl space-y-3" aria-hidden><div className="h-5 w-full animate-pulse rounded bg-foreground/10" /><div className="h-5 w-11/12 animate-pulse rounded bg-foreground/10" /><div className="h-5 w-2/3 animate-pulse rounded bg-foreground/10" /></div> : null}
            <OutlineLine title={name} className="mt-5 max-w-2xl" />
            {(summary || aiSections.length > 0) && <StudyTools className="mt-6 max-w-2xl" title={name} path={topicPath(slug)} pictures={subject === "Anatomy" || /anatom|embryo|histolog/i.test(subject)} text={[name, summary, ...aiSections.map((s) => [s.h, s.p, ...(s.b ?? [])].filter(Boolean).join("\n"))].filter(Boolean).join("\n")} />}
            <div className="mt-7 flex flex-wrap gap-2.5 sm:gap-3">
              {topic && topic.qs.length > 0 && <a href="#practice" className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-bold transition active:scale-[.97] bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:brightness-110"><ClipboardCheck className="h-4 w-4" aria-hidden /> Test yourself</a>}
              <button type="button" onClick={() => openAI(`Explain ${name} simply, then give me the five points an examiner expects.`)} className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-bold transition active:scale-[.97] border border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Ask Ompath AI</button>
              {manage && <a href={`#${anchor(manage.h)}`} className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-bold transition active:scale-[.97] border border-border/70 bg-background/85 hover:border-primary/60 hover:bg-background"><Stethoscope className="h-4 w-4" aria-hidden /> Management</a>}
              <button type="button" onClick={async () => {
                const url = `${SITE}${topicPath(slug)}`;
                try { if (navigator.share) { await navigator.share({ title: `${name} | Ompath Study`, url }); return; } } catch { return; }
                try { await navigator.clipboard.writeText(url); setShared("Link copied"); } catch { setShared(url); }
                setTimeout(() => setShared(""), 2500);
              }} className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-bold transition active:scale-[.97] border border-border/70 bg-background/85 hover:border-primary/60 hover:bg-background">{shared ? <Link2 className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}{shared || "Share"}</button>
            </div>
          </div>
          {media?.hero && (
            <figure className="-mt-2 md:mt-0 md:justify-self-end">
              <button type="button" onClick={() => setHeroZoom(true)} aria-label={`Enlarge the picture of ${name}`} className="block w-full overflow-hidden rounded-2xl bg-white p-2 shadow-md ring-1 ring-black/5 md:rounded-3xl md:p-3">
                <img src={media.hero.u} alt={name} loading="eager" decoding="async" className="mx-auto h-44 w-full rounded-xl bg-white object-contain sm:h-52 md:aspect-[4/3] md:h-auto" />
              </button>
              <Dialog open={heroZoom} onOpenChange={setHeroZoom}>
                <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                  <DialogTitle className="text-base">{name}</DialogTitle>
                  <DialogDescription className="sr-only">Enlarged picture with its author and licence</DialogDescription>
                  <img src={media.hero.full.includes("/thumb/") ? media.hero.u : media.hero.u} alt={name} className="mx-auto max-h-[68dvh] w-auto rounded-lg bg-white" />
                  <p className="text-xs text-muted-foreground">Picture credit: {[media.hero.credit, media.hero.licence].filter(Boolean).join(", ")}.</p>
                </DialogContent>
              </Dialog>
            </figure>
          )}
        </div>
      </header>

      <div data-ad-anchor className="mx-auto grid max-w-6xl gap-12 px-5 pt-10 lg:grid-cols-[13.5rem_minmax(0,52rem)]">
        <SideAds title={name} />
        <TopicRail toc={toc} />

        <div className="min-w-0">
          {isAdmin && page && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-xs font-semibold">
              <span className="text-primary">Admin</span>
              <button type="button" className="rounded-lg border border-border bg-background px-3 py-1.5 hover:border-primary/60" onClick={async () => { const r = await (supabase as unknown as { from: (t: string) => any }).from("topic_pages").update({ reviewed: !page.reviewed }).eq("slug", slug); setAdminMsg(r.error ? r.error.message : page.reviewed ? "Marked as not reviewed" : "Marked as reviewed"); }}>{page.reviewed ? "Mark not reviewed" : "Mark reviewed"}</button>
              <button type="button" className="rounded-lg border border-border bg-background px-3 py-1.5 hover:border-primary/60" onClick={async () => { if (!window.confirm("Remove this page? It will be written again the next time someone opens it.")) return; const r = await (supabase as unknown as { from: (t: string) => any }).from("topic_pages").delete().eq("slug", slug); setAdminMsg(r.error ? r.error.message : "Removed. It will be rewritten on the next visit."); }}>Remove and rewrite</button>
              {adminMsg && <span className="text-muted-foreground">{adminMsg}</span>}
            </div>
          )}

          <div className="mt-8 space-y-4">
            {writing && <Writing name={name} />}
            {!writing && !page && phase !== "rejected" && !aiPaused() && !looksLikeBot() && !intro.length && (
              <div className="py-6">
                <p className="font-serif text-2xl font-bold">This page is taking a moment</p>
                <p className="mt-1 text-[16px] text-muted-foreground">Tap below to load the full write-up on {name}.</p>
                <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"><RefreshCw className="h-4 w-4" aria-hidden /> Load it now</button>
              </div>
            )}
          </div>

          <div className={cn("mt-6", view === "deep" && "deep-view")}>
            {page && (
              <div className="no-print mb-8 flex flex-wrap items-end gap-x-7 gap-y-2 border-b border-border">
                <div role="tablist" aria-label="Which notes" className="flex gap-7">
                  {([["revision", "Revision notes"], ["deep", "Deep exam notes"]] as const).map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("-mb-px inline-flex items-center gap-1.5 border-b-[3px] pb-2.5 text-[16px] font-bold outline-none transition-colors focus-visible:text-primary", view === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{k === "deep" && <Zap className="h-4 w-4" aria-hidden />}{l}</button>
                  ))}
                </div>
                <button type="button" onClick={() => window.print()} className="mb-2.5 ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><Printer className="h-4 w-4" aria-hidden /> Print or save as PDF</button>
              </div>
            )}
            {view === "deep" && page && <DeepView slug={slug} name={name} category={topic?.c ?? ""} page={page} deep={deep} onDone={setDeepLocal} canRead={canRead} past={past} />}

            {intro.length > 0 && (
              <Section id="overview" title="Overview" first>
                {intro.map((p, i) => <Paras key={i} text={p} self={slug} />)}
              </Section>
            )}

            {aiSections.map((s, i) => (
              <div key={`${s.h}-${i}`}>
                <Section id={anchor(s.h)} title={s.h} first={i === 0}>
                  {s.p && <Paras text={s.p} self={slug} />}
                  {s.t && s.t.length > 0 && <TestTable rows={s.t} />}
                  {s.b && s.b.length > 0 && <Bullets items={s.b} self={slug} />}
                </Section>
                {i === Math.floor((aiSections.length - 1) / 2) && <div className="mt-12"><Disclaimer disease={isDisease} /></div>}
                {/* the warning signs come right after the treatment, where a worried reader needs them */}
                {i === seekAfter && page?.whenToSeekHelp && page.whenToSeekHelp.length > 0 && (
                  <section id="seek-help" className="mt-14 scroll-mt-28 sm:mt-20">
                    <h2 className="font-serif text-[1.85rem] font-bold leading-[1.15] tracking-tight text-amber-700 dark:text-amber-400 sm:text-[2.35rem]">When to seek help</h2>
                    <p className="mt-3 text-[17px] text-foreground/85">See a doctor or health worker, or go to the nearest hospital, if there is:</p>
                    <div className="mt-4 text-[17px] leading-relaxed"><Bullets items={page.whenToSeekHelp} /></div>
                  </section>
                )}
              </div>
            ))}

            {wikiSections.map((w) => (
              <Section key={w.h} id={anchor(w.h)} title={w.h}>
                {w.p.map((p, i) => <Paras key={i} text={p} self={slug} />)}
              </Section>
            ))}

            {page?.exam && page.exam.length > 0 && (
              <Section id="examiner" title="Questions an examiner may ask">
                <ol className="space-y-5">{page.exam.map((q, i) => <ExaminerQuestion key={q} n={i + 1} text={q} />)}</ol>
                <p className="text-sm text-muted-foreground">Try answering aloud before you scroll back up.</p>
              </Section>
            )}


            {media && media.more.length > 0 && (
              <Section id="web-images" title={`Pictures of ${name}`}>
                <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
                  {media.more.map((im, i) => (
                    <li key={im.full} className="w-[74%] shrink-0 snap-start sm:w-60"><button type="button" onClick={() => setWebZoom(i)} className="group block w-full overflow-hidden rounded-2xl border border-border bg-white text-left">
                      <img src={im.u} alt={im.title} loading="lazy" decoding="async" className="aspect-square w-full object-contain p-1 transition duration-300 group-hover:scale-105" />
                      <span className="line-clamp-2 block border-t border-border bg-background p-2.5 text-xs font-medium leading-snug text-muted-foreground">{im.title}</span>
                    </button></li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Tap a picture to enlarge it.</p>
                <Dialog open={webZoom !== null} onOpenChange={(o) => !o && setWebZoom(null)}>
                  <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogTitle className="text-base">{webZoom !== null ? media.more[webZoom].title : ""}</DialogTitle>
                    <DialogDescription className="sr-only">Enlarged picture with its author and licence</DialogDescription>
                    {webZoom !== null && <><img src={media.more[webZoom].u} alt={media.more[webZoom].title} className="mx-auto max-h-[65dvh] w-auto rounded-lg bg-white" /><p className="text-xs text-muted-foreground">Picture credit: {[media.more[webZoom].credit, media.more[webZoom].licence].filter(Boolean).join(", ")}.</p></>}
                  </DialogContent>
                </Dialog>
              </Section>
            )}

            {topic?.rx && !aiSections.length && (
              <Section id="treatment" title="Treatment at a glance">
                <Bullets items={topic.rx.first} />
                <Link to="/pharmacology?tab=conditions" className="inline-flex items-center gap-1 text-base font-bold text-primary hover:underline">Open the pharmacology guide <ChevronRight className="h-4 w-4" /></Link>
              </Section>
            )}

            {!aiSections.length && <div className="mb-2"><Disclaimer disease={isDisease} /></div>}

            {topic && !topic.sec.length && !aiSections.length && topic.snip.length > 0 && (
              <Section id="notes-say" title="From the Ompath Study notes">
                <ul className="space-y-3">
                  {topic.snip.slice(0, 6).map((x) => (
                    <li key={x.t} className="text-[16.5px] leading-relaxed">{x.t}<Link to={x.u} className="mt-2 block text-sm font-bold text-primary hover:underline">Read this in {x.s} →</Link></li>
                  ))}
                </ul>
              </Section>
            )}

            {topic?.sec && topic.sec.length > 0 && (
              <Section id="notes-say" title="In the Ompath Study notes">
                {topic.sec.map((x) => (
                  <div key={x.u}>
                    <h3 className="font-serif text-xl font-bold">{x.h}</h3>
                    <div className="mt-3 text-[16px] leading-relaxed"><Bullets items={x.b} /></div>
                    <Link to={x.u} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Read this in {x.s} <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                ))}
              </Section>
            )}

            {topic && (topic.qs.length > 0 || topic.es.length > 0) && (
              <Section id="practice" title={`Test yourself on ${name}`}>
                <p className="text-base text-muted-foreground">Questions from past papers and MCQ sets on this site. Pick an answer to see why.</p>
                <div className="space-y-10">{qs.map((q, i) => <Mcq key={q.q} q={q} n={i + 1} />)}{topic.es.map((e) => <Written key={e.q} {...e} />)}</div>
              </Section>
            )}

            {topic && topic.imgs.length > 0 && (
              <Section id="exam-images" title="Images from past papers">
                <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
                  {topic.imgs.map((im, i) => (
                    <li key={im.u} className="w-[74%] shrink-0 snap-start sm:w-60"><button type="button" onClick={() => setZoom(i)} className="group block w-full overflow-hidden rounded-2xl border border-border bg-background text-left">
                      <img src={im.u} alt={imageCaption(im.a)} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105" />
                      <span className="line-clamp-2 block p-2.5 text-xs font-medium leading-snug text-muted-foreground">{imageCaption(im.a)}</span>
                    </button></li>
                  ))}
                </ul>
                <Dialog open={zoom !== null} onOpenChange={(o) => !o && setZoom(null)}>
                  <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogTitle className="text-base">{zoom !== null ? imageCaption(topic.imgs[zoom].a) : ""}</DialogTitle>
                    <DialogDescription className="sr-only">Enlarged image</DialogDescription>
                    {zoom !== null && <><img src={topic.imgs[zoom].u} alt={imageCaption(topic.imgs[zoom].a)} className="mx-auto max-h-[70dvh] w-auto rounded-lg" /><Link to={topic.imgs[zoom].p} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Open in {topic.imgs[zoom].s} <ChevronRight className="h-4 w-4" /></Link></>}
                  </DialogContent>
                </Dialog>
              </Section>
            )}

            {page && <HelpfulVote slug={slug} />}

            {page?.faq && page.faq.length > 0 && (
              <Section id="faq" title="Common questions">
                <div className="space-y-5">
                  {page.faq.map((f) => (
                    <details key={f.q} className="group"><summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-[18px] font-semibold"><span>{f.q}</span><ChevronDown className="mt-1.5 h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden /></summary><p className="mt-3 text-[17px] text-foreground/85">{f.a}</p></details>
                  ))}
                </div>
              </Section>
            )}

            {topic && (topic.src.length > 0 || topic.sets.length > 0) && (
              <Section id="material" title={`Study material on ${name}`}>
                <ul className="space-y-4">
                  {topic.src.map((s) => <li key={s.u}><Link to={s.u} className="group flex items-center gap-3"><span className="min-w-0 flex-1"><span className="block text-base font-bold leading-snug group-hover:text-primary">{s.t}</span><span className="mt-0.5 block text-sm text-muted-foreground">{[s.y ? `Year ${s.y}` : "", s.n].filter(Boolean).join(" · ")}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" /></Link></li>)}
                  {topic.sets.map((s) => <li key={s.u}><Link to={s.u} className="group flex items-center gap-3"><span className="min-w-0 flex-1"><span className="block text-base font-bold leading-snug group-hover:text-primary">{s.t}</span><span className="mt-0.5 block text-sm text-muted-foreground">{s.k === "mcq" ? "MCQ set" : "Essay questions"}{s.y ? ` · Year ${s.y}` : ""}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" /></Link></li>)}
                </ul>
              </Section>
            )}

            <div className="mt-14 sm:mt-20">
              <p className="flex items-center gap-2 font-serif text-[1.6rem] font-bold sm:text-[2rem]"><Sparkles className="h-5 w-5 text-primary" aria-hidden /> Study {name} with Ompath AI</p>
              <p className="mt-1.5 text-[15px] text-muted-foreground">Ask anything, or start with one of these. Answers use the site's notes first.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ["Explain it simply", `Explain ${name} simply, as if I am a first-year student.`],
                  ["Quiz me", `Ask me 5 exam-style MCQs on ${name}, one at a time, and mark my answers.`],
                  ["Exam questions", `What are the most likely exam questions on ${name}, with model answers?`],
                  ["Ward round", `I am presenting a patient with ${name} on a ward round. How do I present and what will the consultant ask me?`],
                ].map(([label, q]) => <button key={label} type="button" onClick={() => openAI(q)} className="rounded-full border border-border bg-background px-4 py-2.5 text-sm font-bold transition hover:border-primary/60 hover:bg-primary/5 active:scale-[.97]">{label}</button>)}
              </div>
            </div>

            {related.length > 0 && (
              <Section id="related" title="Related topics">
                <ul className="flex flex-wrap gap-2.5">{related.map((r) => <li key={r.s}><Link to={topicPath(r.s)} className="inline-flex rounded-full border border-border bg-background px-4 py-2 text-base font-semibold hover:border-primary/60 hover:text-primary">{r.n}</Link></li>)}</ul>
              </Section>
            )}

            <BooksForPage text={`${name} ${summary}`} className="mt-14 sm:mt-20" />
            <AdSlot />
            <footer className="mt-14 pt-2 text-sm leading-relaxed text-muted-foreground">
              <SponsorLine className="mb-3" />
              <p className="font-bold text-foreground">Sources</p>
              <p className="mt-1.5">Ompath Study notes{topic ? ` (${topic.docs} ${topic.docs === 1 ? "page" : "pages"} mention ${name})` : ""} and standard medical references. Picture credits are shown when you enlarge a picture. Found a mistake? <a className="font-bold text-primary hover:underline" href={`mailto:ompathstudy@gmail.com?subject=${encodeURIComponent(`Correction: ${name}`)}`}>Tell us</a>. <Link to="/topics" className="font-bold text-primary hover:underline">Browse all topics</Link>.</p>
            </footer>
          </div>
        </div>
      </div>

      {toc.length > 1 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden print:hidden">
          <div className="flex gap-1 overflow-x-auto px-3 py-2 text-sm font-semibold" role="navigation" aria-label="On this page">
            {toc.map((t) => <a key={t.id} href={`#${t.id}`} className="shrink-0 rounded-full bg-muted px-3.5 py-1.5 text-muted-foreground hover:text-foreground">{t.t}</a>)}
          </div>
        </div>
      )}
    </main>
  );
}
