// Spot-question banks ("Anatomy Marathon", the Aponeurosis Anatomy / Histology / Embryology banks): long notes where every question is
// "## Q12: …", often with a picture, followed by "**Answer:**" and bullet points, grouped under "# Section" headings.
// This turns one of those notes into questions a student can be drilled on, inside Ompath AI, with the picture and the answer.
import { supabase } from "@/integrations/supabase/client";
import { buildBlogPath } from "@/lib/store";

export type Subject = "gross" | "histology" | "embryology";
export const SUBJECT_LABEL: Record<Subject, string> = { gross: "Gross anatomy", histology: "Histology", embryology: "Embryology" };

export interface BankQuestion { id: string; bankId: string; section: string; n: number; question: string; image?: string; imageAlt?: string; answer: string }
export interface Bank { id: string; title: string; href: string; subject: Subject; questions: BankQuestion[] }
export interface BankMeta { id: string; title: string; category: string; slug?: string | null }

const IMG = /!\[([^\]]*)\]\((https?:[^)\s]+)\)/;

/** One note's text into its questions. Returns [] for a note that is not a question bank. */
export function parseBank(md: string, bankId: string): BankQuestion[] {
  const out: BankQuestion[] = [];
  let section = "";
  let cur: { n: number; q: string; body: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const body = cur.body.join("\n");
    const at = body.search(/\*\*Answer:?\*\*:?/i);
    if (at >= 0) {
      const before = body.slice(0, at);
      const after = body.slice(at).replace(/^\*\*Answer:?\*\*:?/i, "").replace(/\n-{3,}\s*$/m, "").trim();
      const img = before.match(IMG);
      if (after) out.push({ id: `${bankId}-${cur.n}-${out.length}`, bankId, section: section || "Questions", n: cur.n, question: cur.q, image: img?.[2], imageAlt: img?.[1], answer: after });
    }
    cur = null;
  };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const h1 = raw.match(/^#\s+(.+)/);
    const q = raw.match(/^##\s+Q(\d+)[:.)]?\s*(.*)$/i);
    if (h1) { flush(); section = h1[1].replace(/[*_`]/g, "").trim(); continue; }
    if (q) { flush(); cur = { n: Number(q[1]), q: q[2].replace(/[*_`]/g, "").trim(), body: [] }; continue; }
    if (/^---+\s*$/.test(raw)) { if (cur) cur.body.push(raw); continue; }
    if (cur) cur.body.push(raw);
  }
  flush();
  return out;
}

const subjectOf = (m: BankMeta): Subject => {
  const t = `${m.title} ${m.category}`.toLowerCase();
  const histo = /histolog/.test(t), embryo = /embryolog/.test(t), gross = /limb|spine|thorax|abdom|pelvi|head|neck|gross|anatomy question|anatomy marathon|dissection/.test(t);
  if (embryo && !histo && !gross) return "embryology";
  if (histo && !embryo && !gross) return "histology";
  if (/aponeurosis - embryology/.test(t)) return "embryology";
  if (/aponeurosis - histology/.test(t)) return "histology";
  return "gross";
};

let catalog: Promise<BankMeta[]> | null = null;
/** Every published note that could be a spot-question bank (Year 1 and 2 anatomy, the Aponeurosis collection, anything called a marathon). */
export function loadCatalog(): Promise<BankMeta[]> {
  if (!catalog) {
    catalog = Promise.resolve(supabase.from("articles").select("id,title,category,slug").eq("published", true).is("deleted_at", null)
      .or("category.ilike.Year 1: Anatomy,category.ilike.Year 2: Anatomy,category.ilike.%Aponeurosis%,category.ilike.Year 1: Gross Anatomy%,category.ilike.Year 1: Histology%,category.ilike.Year 1: Embryology%,title.ilike.%marathon%").limit(120))
      .then(({ data }) => ((data ?? []) as BankMeta[]).filter((m) => /question|marathon|spot|mock|revision|bank|PAT|CAT|review/i.test(m.title)));
    catalog.catch(() => { catalog = null; });
  }
  return catalog;
}

const loaded = new Map<string, Promise<Bank | null>>();
function loadBank(m: BankMeta): Promise<Bank | null> {
  let p = loaded.get(m.id);
  if (!p) {
    p = Promise.resolve(supabase.from("articles").select("content").eq("id", m.id).maybeSingle()).then(({ data }) => {
      const questions = parseBank(String(data?.content ?? ""), m.id);
      return questions.length ? { id: m.id, title: m.title, href: buildBlogPath({ id: m.id, title: m.title, slug: m.slug ?? undefined } as never), subject: subjectOf(m), questions } : null;
    }, () => null);
    loaded.set(m.id, p);
  }
  return p;
}

/** The banks for one subject, with their questions. Small banks first so the first questions appear quickly. */
export async function loadBanks(subject: Subject): Promise<Bank[]> {
  const metas = (await loadCatalog()).filter((m) => subjectOf(m) === subject);
  const banks = await Promise.all(metas.map(loadBank));
  return banks.filter((b): b is Bank => Boolean(b));
}

export const sectionsOf = (banks: Bank[]): { name: string; count: number }[] => {
  const m = new Map<string, number>();
  for (const b of banks) for (const q of b.questions) m.set(q.section, (m.get(q.section) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
};

/** Good questions first: ones with a picture, a clear answer, and nothing that depends on a figure that is missing. */
function quality(q: BankQuestion): number {
  let s = 0;
  if (q.image) s += 3;
  const len = q.answer.length;
  if (len >= 40 && len <= 900) s += 1.5; else if (len > 1400) s -= 1;
  if (q.question.length >= 12) s += 0.5;
  if (!q.image && /\b(shown|pointed|labelled|labeled|tagged|arrow|marked)\b/i.test(q.question)) s -= 4; // refers to a picture that is not there
  return s;
}

/** `count` questions, best first with a little shuffling so "5 more" is not the same five. `seen` ids are skipped until nothing else is left. */
export function pickQuestions(banks: Bank[], section: string, count: number, seen: Set<string>): BankQuestion[] {
  const pool = banks.flatMap((b) => b.questions).filter((q) => !section || q.section === section);
  const fresh = pool.filter((q) => !seen.has(q.id));
  const from = fresh.length >= count ? fresh : pool;
  return from.map((q) => ({ q, s: quality(q) + Math.random() * 2.2 })).sort((a, b) => b.s - a.s).slice(0, count).map((x) => x.q);
}

// ---- reading what the student asked for ----
const SUBJECT_WORDS: [Subject, RegExp][] = [["histology", /\b(histolog\w*|histo|slides?|microscop\w*)\b/], ["embryology", /\b(embryolog\w*|embryo|development|fetal|foetal)\b/], ["gross", /\b(anat\w*|gross|dissection|limb|thorax|abdomen|pelvis|head and neck|marathon|spine|hand|foot|thigh|skull)\b/]];
const ASKS_QUESTIONS = /\b(questions?|qns?|quiz|test me|practice|spots?|marathon|mcqs?|drill|revise|revision)\b/;
const NOT_THIS = /\b(past papers?|cats?\b|exam\b|notes? on|summary|explain|what is|define)\b/;

export interface DrillIntent { subject: Subject; topic: string }
export function drillIntent(input: string): DrillIntent | null {
  const s = input.toLowerCase().replace(/[^a-z0-9 &]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.length > 120) return null;
  const marathon = /\bmarathon\b/.test(s);
  if (!ASKS_QUESTIONS.test(s) || (NOT_THIS.test(s) && !marathon)) return null;
  const hit = SUBJECT_WORDS.find(([, re]) => re.test(s));
  if (!hit) return null;
  const topic = s.replace(/\b(give|show|me|some|please|pls|i|need|want|a|an|the|of|on|in|for|about|and|year|yr|[1-6]|questions?|qns?|quiz|test|practice|spots?|marathon|mcqs?|drill|revise|revision|anat\w*|histolog\w*|embryolog\w*|gross|histo|embryo)\b/g, " ").replace(/\s+/g, " ").trim();
  return { subject: hit[0], topic };
}

/** The section whose name best matches the topic words ("upper limb"), or "" for all sections. */
export function sectionFor(sections: { name: string }[], topic: string): string {
  const words = topic.split(" ").filter((w) => w.length >= 3);
  if (!words.length) return "";
  let best = "", bestScore = 0;
  for (const s of sections) {
    const n = s.name.toLowerCase();
    const score = words.reduce((a, w) => a + (n.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { best = s.name; bestScore = score; }
  }
  return best;
}
