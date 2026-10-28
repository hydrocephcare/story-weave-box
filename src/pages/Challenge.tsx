import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Copy, MessageCircle, Swords, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SITE_URL } from "@/lib/seo";
import { Skeleton } from "@/components/ui/skeleton";
import QuizRunner, { toItems, type QItem } from "@/components/QuizRunner";

/** Same seed, same questions: the friend gets exactly the questions the challenger answered. */
const seeded = (seed: number) => () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pickN = (items: QItem[], seed: number, n: number) => { const r = seeded(seed), a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

/** /challenge: pick a set and send a friend a link; /challenge/:id: play the same ten questions and compare scores. */
export default function Challenge() {
  const { id } = useParams();
  return id ? <Play id={id} /> : <Picker />;
}

function Picker() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: string; title: string; category: string }[] | null>(null);
  useEffect(() => {
    let on = true;
    const t = setTimeout(() => {
      let query = (supabase as any).from("mcq_sets").select("id,title,category").eq("published", true).is("deleted_at", null).not("title", "ilike", "%past paper%").not("title", "ilike", "%Q&A%").not("title", "ilike", "%exam -%").order("updated_at", { ascending: false }).limit(14);
      if (q.trim().length > 1) query = query.ilike("title", `%${q.trim().replace(/[%_]/g, "")}%`);
      Promise.resolve(query).then(({ data }: { data: { id: string; title: string; category: string }[] | null }) => { if (on) setRows(data ?? []); }, () => { if (on) setRows([]); });
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [q]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>Challenge a friend | Ompath Study</title><meta name="description" content="Pick an MCQ set, answer ten questions, and send the link on WhatsApp. Your friend answers the same ten and you compare scores." /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study</p>
      <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl font-bold sm:text-4xl"><Swords className="h-7 w-7 text-primary" aria-hidden /> Challenge a friend</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pick a topic and answer ten questions. Then send the link on WhatsApp: your friend gets the same ten and sees your score.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a topic, e.g. thyroid, malaria, ECG" aria-label="Search question sets" className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" />
      <ul className="mt-4 space-y-2">
        {rows === null && [0, 1, 2, 3].map((i) => <li key={i}><Skeleton className="h-14 w-full" /></li>)}
        {rows?.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => nav(`/challenge/${r.id}?s=${Math.floor(Math.random() * 1e9)}&n=10`)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.title}</span><span className="block truncate text-xs text-muted-foreground">{r.category}</span></span>
              <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Start</span>
            </button>
          </li>
        ))}
        {rows?.length === 0 && <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sets found. Try another word.</li>}
      </ul>
    </main>
  );
}

function Play({ id }: { id: string }) {
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const seed = Number(sp.get("s")) || 1, n = Math.min(20, Math.max(3, Number(sp.get("n")) || 10));
  const theirs = sp.get("c") !== null ? Number(sp.get("c")) : null, from = (sp.get("from") || "A friend").slice(0, 30);
  const [set, setSet] = useState<{ title: string; category: string; questions: unknown } | null | undefined>(undefined);
  const [done, setDone] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let on = true;
    Promise.resolve((supabase as any).from("mcq_sets").select("title,category,questions").eq("id", id).eq("published", true).is("deleted_at", null).maybeSingle()).then(({ data }: { data: { title: string; category: string; questions: unknown } | null }) => { if (on) setSet(data ?? null); }, () => { if (on) setSet(null); });
    return () => { on = false; };
  }, [id]);
  const items = useMemo(() => (set ? pickN(toItems(id, set.category, set.questions), seed, n) : []), [set, id, seed, n]);
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const myName = (meta?.full_name || meta?.name || "A friend").split(" ")[0];
  const link = done === null ? "" : `${SITE_URL}/challenge/${id}?s=${seed}&n=${items.length}&c=${done}&from=${encodeURIComponent(myName)}`;
  const msg = done === null ? "" : `I scored ${done}/${items.length} on "${set?.title}". Can you beat me? ${link}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Helmet><title>{set ? `Challenge: ${set.title} | Ompath Study` : "Challenge | Ompath Study"}</title><meta name="robots" content="noindex" /></Helmet>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ompath Study · Challenge</p>
      <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{set?.title ?? "Challenge a friend"}</h1>
      {theirs !== null && done === null && <p className="mt-2 rounded-xl bg-primary/10 p-3 text-sm"><strong>{from}</strong> scored <strong>{theirs}/{n}</strong>. Answer the same questions and see if you can beat them.</p>}

      {set === undefined && <div className="mt-8 space-y-3"><Skeleton className="h-6 w-full" /><Skeleton className="h-64 w-full" /></div>}
      {set === null && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">This challenge is not available. <Link to="/challenge" className="font-bold text-primary hover:underline">Start your own</Link></p>}
      {set && items.length < 3 && <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">This set has too few multiple-choice questions for a challenge. <Link to="/challenge" className="font-bold text-primary hover:underline">Pick another</Link></p>}

      {set && items.length >= 3 && done === null && <div className="mt-6"><QuizRunner items={items} onDone={(score) => setDone(score)} /></div>}

      {done !== null && (
        <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <Trophy className="mx-auto h-9 w-9 text-primary" aria-hidden />
          <p className="mt-2 font-serif text-3xl font-bold">{done} / {items.length}</p>
          {theirs !== null && <p className="mt-1 text-base font-semibold">{done > theirs ? `You beat ${from} (${theirs}/${n})!` : done === theirs ? `A tie with ${from} (${theirs}/${n}).` : `${from} won with ${theirs}/${n}. Ask for a rematch.`}</p>}
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
