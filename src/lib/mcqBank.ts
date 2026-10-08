// Builds practice quizzes from the MCQ sets that are already on the site: "30 MCQs on physiology" is answered with 30 real questions,
// from the sets that match, mixed together. Nothing here calls the AI, so it costs no credits.
import { supabase } from "@/integrations/supabase/client";
import { parseQuery } from "@/lib/ompathAiQuery";

export interface QuizQuestion { id: string; setId: string; setTitle: string; category: string; question: string; options: string[]; correct: number; explanation?: string }
export interface QuizBuild { questions: QuizQuestion[]; sets: { id: string; title: string }[]; topic: string; wanted: number; exactYear: boolean }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const content = (s: string) => norm(s).split(" ").filter((w) => w.length >= 4);

/** A question whose stored answer cannot be trusted is left out: no answer, an out-of-range answer, or an explanation that never mentions the marked option. */
function usable(q: unknown): q is { question: string; options: string[]; correct_answer: number; explanation?: string } {
  const x = q as { question?: unknown; options?: unknown; correct_answer?: unknown; explanation?: unknown };
  if (typeof x?.question !== "string" || x.question.trim().length < 8) return false;
  if (!Array.isArray(x.options) || x.options.length < 2 || x.options.some((o) => typeof o !== "string" || !o.trim())) return false;
  const c = Number(x.correct_answer);
  if (!Number.isInteger(c) || c < 0 || c >= x.options.length) return false;
  if (typeof x.explanation === "string" && x.explanation.length > 40) {
    const words = content(String(x.options[c]));
    const ex = norm(x.explanation);
    if (words.length >= 2 && !words.some((w) => ex.includes(w))) return false;
  }
  return true;
}

const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export async function buildQuiz(topicInput: string, year: number | null, n: number): Promise<QuizBuild> {
  const topic = parseQuery(topicInput).topic || topicInput;
  const words = [...new Set(topic.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3))].slice(0, 4);
  const empty: QuizBuild = { questions: [], sets: [], topic, wanted: n, exactYear: true };
  if (!words.length) return empty;
  const orFilter = words.flatMap((w) => [`title.ilike.%${w}%`, `category.ilike.%${w}%`]).join(",");

  async function fetchSets(withYear: boolean) {
    let q = supabase.from("mcq_sets").select("id,title,category,questions").eq("published", true).is("deleted_at", null).or(orFilter).limit(30);
    if (withYear && year) q = q.ilike("category", `%Year ${year}%`);
    const { data } = await q;
    return (data ?? []) as { id: string; title: string; category: string; questions: unknown }[];
  }
  let rows = await fetchSets(true);
  let exactYear = true;
  if (year && rows.length < 2) { rows = [...rows, ...(await fetchSets(false))]; exactYear = rows.length > 0 && rows.some((r) => new RegExp(`Year ${year}`).test(r.category)); }
  const seenSet = new Set<string>();
  rows = rows.filter((r) => (seenSet.has(r.id) ? false : (seenSet.add(r.id), true)));
  if (!rows.length) return { ...empty, exactYear: false };

  // the sets that match the most of the asked-for words come first
  const score = (r: { title: string; category: string }) => words.reduce((s, w) => s + (norm(`${r.title} ${r.category}`).includes(w) ? 1 : 0), 0) + (year && r.category.includes(`Year ${year}`) ? 1 : 0);
  rows.sort((a, b) => score(b) - score(a));

  const seenQ = new Set<string>();
  const pool: QuizQuestion[] = [];
  const used: { id: string; title: string }[] = [];
  for (const r of rows.slice(0, 8)) {
    const list = Array.isArray(r.questions) ? r.questions : [];
    const good = list.filter(usable).filter((q) => { const k = norm(q.question).slice(0, 90); return seenQ.has(k) ? false : (seenQ.add(k), true); });
    if (good.length) used.push({ id: r.id, title: r.title });
    good.forEach((q, i) => pool.push({ id: `${r.id}-${i}`, setId: r.id, setTitle: r.title, category: r.category, question: q.question.trim(), options: q.options.map((o) => o.trim()), correct: Number(q.correct_answer), explanation: typeof q.explanation === "string" ? q.explanation : undefined }));
  }
  // questions with an explanation teach more, so they are picked first; the rest fill the quiz
  const withExp = shuffle(pool.filter((q) => q.explanation));
  const without = shuffle(pool.filter((q) => !q.explanation));
  const picked = shuffle([...withExp, ...without].slice(0, n));
  return { questions: picked, sets: used, topic, wanted: n, exactYear };
}
