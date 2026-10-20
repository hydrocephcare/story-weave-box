import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, CheckCheck, Eye, EyeOff, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DentalAnswer from "@/components/dental/DentalAnswer";
import DentalCards, { type DentalCard } from "@/components/dental/DentalCards";
import { PAPER_INDEX, paperPath } from "@/lib/dentalPapers";
import { DONE, SAVED, getList, setRatings, getRatings, studyStats, type Rating } from "@/lib/dentalStore";

const show = (q: string) => q.replace(/\n?ANSWER THIS PART ONLY:\s*/g, " ").replace(/^Question \d*:\s*/, "").replace(/\(see the part\)\s*/g, "").replace(/\s+/g, " ").trim();
const title = (slug: string) => { const p = PAPER_INDEX.find((x) => x.slug === slug); return p ? `${p.unitTitle} · ${p.date}` : slug; };

/** What a returning student sees on the dental home: today's question, their progress, saved papers, the questions they missed, and the topics across all papers. */
export default function DentalHomeExtras() {
  const [tick, setTick] = useState(0);
  const [daily, setDaily] = useState<{ question: string; answer: string } | null>(null);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [cards, setCards] = useState<DentalCard[]>([]);
  const [cardsOpen, setCardsOpen] = useState(false);
  useEffect(() => { const on = () => setTick((n) => n + 1); window.addEventListener("dental:store", on); return () => window.removeEventListener("dental:store", on); }, []);
  const stats = studyStats(), saved = getList(SAVED).filter((s) => PAPER_INDEX.some((p) => p.slug === s)), done = getList(DONE).filter((s) => PAPER_INDEX.some((p) => p.slug === s));
  const got = stats.reduce((n, s) => n + s.got, 0), missed = stats.reduce((n, s) => n + s.missed, 0);
  void tick;

  useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const { data } = await (supabase as any).from("paper_answers").select("question, answer").not("answer", "is", null).limit(300);
        const rows = ((data ?? []) as { question: string; answer: string }[]).filter((r) => r.question.length < 220);
        if (on && rows.length) setDaily(rows[Math.floor(Date.now() / 86400000) % rows.length]);
        const t = await (supabase as any).from("paper_seo").select("topics");
        const all = ((t.data ?? []) as { topics: string[] }[]).flatMap((r) => r.topics ?? []);
        const count = new Map<string, number>(); for (const x of all) count.set(x, (count.get(x) ?? 0) + 1);
        if (on) setTopics([...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([x]) => x));
      } catch { /* the page works without these */ }
    })();
    return () => { on = false; };
  }, []);

  const review = async () => {
    const out: DentalCard[] = [];
    for (const s of stats.filter((x) => x.missed > 0)) {
      try {
        const { data } = await (supabase as any).from("paper_answers").select("qkey, question, answer").eq("slug", s.slug).in("qkey", s.missedKeys);
        for (const r of (data ?? []) as { qkey: string; question: string; answer: string }[]) out.push({ key: `${s.slug}|${r.qkey}`, front: show(r.question), back: r.answer });
      } catch { /* skip this paper */ }
    }
    setCards(out); setCardsOpen(true);
  };
  const rateReview = (k: string, r: Rating) => { const [slug, qk] = k.split("|"); const cur = getRatings(slug); setRatings(slug, { ...cur, [qk]: cur[qk] === r ? undefined : r }); };

  return (
    <>
      {daily && (
        <section className="mt-10" aria-label="Question of the day">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Question of the day</p>
          <p className="mt-1 font-serif text-xl font-bold leading-snug">{show(daily.question)}</p>
          <button type="button" onClick={() => setDailyOpen((v) => !v)} aria-expanded={dailyOpen} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">{dailyOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{dailyOpen ? "Hide answer" : "Show answer"}</button>
          {dailyOpen && <DentalAnswer text={daily.answer} />}
        </section>
      )}

      {(got + missed > 0 || saved.length > 0 || done.length > 0) && (
        <section className="mt-10" aria-label="Your progress">
          <h2 className="font-serif text-xl font-bold">Your progress</h2>
          <p className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span><b className="text-foreground">{done.length}</b> of {PAPER_INDEX.length} papers done</span>
            {got + missed > 0 && <span><b className="text-emerald-600">{got}</b> got it · <b className="text-rose-600">{missed}</b> missed</span>}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((done.length / Math.max(1, PAPER_INDEX.length)) * 100)}%` }} /></div>
          {missed > 0 && <button type="button" onClick={review} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"><Layers className="h-4 w-4" />Review the {missed} question{missed === 1 ? "" : "s"} you missed</button>}
          {saved.length > 0 && <ul className="mt-4 divide-y divide-border border-y border-border">{saved.map((s) => <li key={s}><Link to={paperPath(s)} className="flex items-center gap-2 py-2.5 text-[15px] font-semibold hover:text-primary"><Bookmark className="h-4 w-4 shrink-0 fill-current text-primary" aria-hidden /><span className="min-w-0 flex-1 truncate">{title(s)}</span>{done.includes(s) && <CheckCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Done" />}</Link></li>)}</ul>}
        </section>
      )}

      {topics.length > 0 && (
        <section className="mt-10" aria-label="Topics">
          <h2 className="font-serif text-xl font-bold">Topics across the papers</h2>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[15px]">{topics.map((t) => <Link key={t} to={`/dental/papers?q=${encodeURIComponent(t)}`} className="font-semibold text-primary hover:underline">{t}</Link>)}</p>
        </section>
      )}
      <DentalCards open={cardsOpen} onOpenChange={setCardsOpen} cards={cards} ratings={{}} rate={rateReview} />
    </>
  );
}
