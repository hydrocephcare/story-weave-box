// Ompath AI: finds what is on the site that matches a question, pulls the most relevant passages out of those notes,
// and asks the model to answer from them. If the model is down, the passages themselves are shown, so the student
// always gets something useful. If nothing on the site matches, the model answers from general knowledge and says so.
//
//   question ─► parseQuery (topic, year, what they want, spelling/abbreviation variants)
//            ─► retrieve   (database notes + library files + outline topics + shipped notes/papers + pages, several variants)
//            ─► rerank     (title/unit/year/intent boosts, duplicates dropped)
//            ─► passages   (best paragraphs of the top notes, scored by how many topic words they hold)
//            ─► answer     (model, streamed, grounded on those passages)  /  fallback (passages shown as the answer)
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { siteSearch, type SiteHit } from "@/lib/siteSearch";
import { PAPER_NOTES, STATIC_NOTES, loadStaticNoteText, type StaticNote } from "@/data/staticNotes";
import { parseQuery, scoringTerms, type ParsedQuery } from "@/lib/ompathAiQuery";

export type { ParsedQuery } from "@/lib/ompathAiQuery";
export { parseQuery, followUps } from "@/lib/ompathAiQuery";

export interface Passage { hitKey: string; title: string; text: string }
export interface Retrieval { parsed: ParsedQuery; hits: SiteHit[]; passages: Passage[]; grounded: boolean }

const strip = (s: string) => s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/^#{1,6}\s*/gm, "").replace(/[*_`>|]/g, " ").replace(/\s+/g, " ").trim();

// ---------- shipped notes and papers (not in the database, so the normal search never sees them) ----------
function staticHits(p: ParsedQuery): SiteHit[] {
  const split = (x: string) => x.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const topicTerms = [...new Set(split(p.topic))];
  const bonusTerms = [...new Set(p.expansions.flatMap(split))].filter((w) => !topicTerms.includes(w));
  if (!topicTerms.length) return [];
  const wantPapers = p.wants === "papers";
  const pool: StaticNote[] = wantPapers ? PAPER_NOTES : STATIC_NOTES.filter((n) => !n.paper);
  const docs = pool.map((n) => ({ n, title: n.title.toLowerCase(), meta: `${n.unit} ${n.group ?? ""} ${n.description}`.toLowerCase() }));
  // a word found in most notes (like "health" or "year") says little; a rare word says a lot
  const weight = (t: string) => Math.log(1 + docs.length / (1 + docs.filter((d) => d.title.includes(t) || d.meta.includes(t)).length));
  const w = new Map([...topicTerms, ...bonusTerms].map((t) => [t, weight(t)] as const));
  const need = topicTerms.reduce((s, t) => s + (w.get(t) ?? 0), 0);
  const out: SiteHit[] = [];
  for (const d of docs) {
    if (p.year && d.n.year !== p.year) continue;
    let got = 0;
    let score = 0;
    for (const t of topicTerms) {
      const inTitle = d.title.includes(t);
      if (inTitle || d.meta.includes(t)) { got += w.get(t) ?? 0; score += (inTitle ? 12 : 5) * (w.get(t) ?? 1); }
    }
    const coverage = got / (need || 1);
    if (coverage < 0.5) continue; // most of what was asked for must be there
    for (const t of bonusTerms) if (d.title.includes(t) || d.meta.includes(t)) score += 2 * (w.get(t) ?? 1);
    if (d.title.includes(p.topic.toLowerCase())) score += 20;
    if (d.n.unit.toLowerCase().includes(p.topic.toLowerCase())) score += 14;
    if (p.year && d.n.year === p.year) score += 8;
    out.push({
      key: `static-${d.n.slug}`, group: "Notes", title: d.n.title, subtitle: `Year ${d.n.year} · ${d.n.unit}${d.n.group ? ` · ${d.n.group}` : ""}${d.n.paper ? ` · ${d.n.paper.satLabel}` : ""}`,
      href: `/notes/${d.n.slug}`, kind: d.n.paper ? "paper" : "static", score: 50 + score + coverage * 30,
    });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 14);
}

// ---------- ranking ----------
const GROUP_FOR_WANT: Record<string, string[]> = {
  notes: ["Notes"], papers: ["Notes"], files: ["Library files"], mcqs: ["MCQs & flashcards", "Notes"], flashcards: ["MCQs & flashcards"], timetable: ["Pages"], answer: ["Notes", "Library files"],
};
const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function rerank(hits: SiteHit[], p: ParsedQuery): SiteHit[] {
  const wantGroups = GROUP_FOR_WANT[p.wants] ?? [];
  const topic = p.topic.toLowerCase();
  const seenTitle = new Set<string>();
  const topicTerms = [...new Set(topic.split(/[^a-z0-9]+/).filter((w) => w.length >= 3))];
  const hay = (h: SiteHit) => `${h.title} ${h.subtitle}`.toLowerCase();
  // words that most candidates share ("drugs", "notes") are weak evidence; rare ones are strong
  const idf = new Map(topicTerms.map((t) => [t, Math.log(1 + hits.length / (1 + hits.filter((h) => hay(h).includes(t)).length))] as const));
  const idfSum = [...idf.values()].reduce((s, v) => s + v, 0) || 1;
  const coverageOf = new Map<string, number>();
  const scored = hits.map((h) => {
    let s = h.score;
    const t = h.title.toLowerCase();
    if (topicTerms.length) {
      const text = hay(h);
      const coverage = topicTerms.reduce((acc, w) => acc + (text.includes(w) ? idf.get(w) ?? 0 : 0), 0) / idfSum;
      coverageOf.set(h.key, coverage);
      s += 40 * coverage;
      if (topicTerms.length > 1 && coverage < 0.45 && h.kind !== "static" && h.kind !== "paper") s -= 28;
    }
    if (topic && t.includes(topic)) s += 18;
    if (wantGroups.includes(h.group)) s += 12;
    if (p.year) {
      const m = h.subtitle.match(/Year (\d)/);
      if (m) s += Number(m[1]) === p.year ? 14 : -12;
    }
    if (p.wants === "papers" && /past paper|cat\b|exam|supplementary|paper/i.test(`${h.title} ${h.subtitle}`)) s += 12;
    if (p.wants === "mcqs" && /mcq|quiz|questions/i.test(`${h.title} ${h.subtitle}`)) s += 12;
    if (p.wants !== "papers" && /scan|ocr|screenshot|camscanner|untitled/i.test(h.title)) s -= 14;
    return { ...h, score: s };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((h) => {
    // weak matches are noise: a note that shares only a common word with a multi-word topic, or scores very low, is dropped
    const cov = coverageOf.get(h.key) ?? 1;
    if (h.score < 30) return false;
    if (topicTerms.length > 1 && cov < 0.3 && h.kind !== "static" && h.kind !== "paper" && h.group !== "Pages") return false;
    const k = normTitle(h.title) + h.group;
    if (seenTitle.has(k)) return false;
    seenTitle.add(k);
    return true;
  });
}

// ---------- passages ----------
function bestPassages(text: string, terms: string[], max = 3, size = 650): string[] {
  const body = strip(text);
  if (!body || !terms.length) return [];
  // split into sentence-ish chunks, then slide a window of ~size characters over them
  const sentences = body.split(/(?<=[.!?:])\s+(?=[A-Z0-9(])/).filter((s) => s.length > 25);
  const windows: { start: number; text: string; score: number }[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    let w = sentences[i];
    let j = i + 1;
    while (w.length < size && j < sentences.length) w += ` ${sentences[j++]}`;
    const low = w.toLowerCase();
    let score = 0;
    let covered = 0;
    for (const t of terms) {
      const n = low.split(t).length - 1;
      if (n) { covered++; score += Math.min(n, 3) * (t.length >= 6 ? 2 : 1); }
    }
    score += covered * 3;
    if (covered) windows.push({ start: i, text: w.length > size + 200 ? `${w.slice(0, size + 200)}…` : w, score });
  }
  windows.sort((a, b) => b.score - a.score);
  const picked: typeof windows = [];
  for (const w of windows) {
    if (picked.length >= max) break;
    if (picked.some((x) => Math.abs(x.start - w.start) < 3)) continue;
    picked.push(w);
  }
  return picked.sort((a, b) => a.start - b.start).map((w) => w.text);
}

async function articleText(id: string): Promise<string> {
  const { data } = await supabase.from("articles").select("content").eq("id", id).maybeSingle();
  return String(data?.content ?? "");
}

async function gatherPassages(hits: SiteHit[], p: ParsedQuery): Promise<Passage[]> {
  const terms = scoringTerms(p);
  const out: Passage[] = [];
  const noteHits = hits.filter((h) => h.group === "Notes" && h.kind !== "paper" && h.kind !== "mcq" && h.score >= 45);
  const targets = noteHits.slice(0, 4);
  const texts = await Promise.all(targets.map(async (h) => {
    try {
      if (h.key.startsWith("static-")) return await loadStaticNoteText(h.key.slice(7));
      if (h.key.startsWith("article-")) return await articleText(h.key.slice(8));
    } catch { /* a note that will not load is skipped */ }
    return "";
  }));
  targets.forEach((h, i) => {
    for (const t of bestPassages(texts[i], terms, i === 0 ? 3 : 2)) out.push({ hitKey: h.key, title: h.title, text: t });
  });
  return out.slice(0, 7);
}

// ---------- retrieval ----------
export interface FindOptions { /** Also look inside the text of notes. Slower, so the search page asks for it second. */ deep?: boolean; year?: string; contentType?: string }
const findCache = new Map<string, { parsed: ParsedQuery; hits: SiteHit[]; related: string[] }>();

/**
 * Everything on the site that matches what a student typed, understood the way Ompath AI understands it
 * (filler words dropped, typos and abbreviations fixed, the year read). Used by the AI and by the search page.
 */
export async function findHits(input: string, o: FindOptions = {}): Promise<{ parsed: ParsedQuery; hits: SiteHit[]; related: string[] }> {
  const ck = JSON.stringify([input.trim().toLowerCase(), o.deep ?? true, o.year ?? "", o.contentType ?? ""]);
  const cached = findCache.get(ck);
  if (cached) return cached;
  const parsed = parseQuery(input);
  const yearNum = Number(String(o.year ?? "").match(/\d+/)?.[0]) || parsed.year;
  const deepOn = o.deep ?? true;
  const longest = parsed.topic.split(" ").filter((w) => w.length >= 6).sort((x, y) => y.length - x.length)[0];
  const queries = [...new Set([parsed.topic, ...(longest && longest !== parsed.topic ? [longest] : []), ...parsed.expansions.slice(0, 3), parsed.raw].filter((q) => q.length >= 2))];
  const opts = { year: yearNum ? `Year ${yearNum}` : undefined, contentType: o.contentType || undefined };
  const runs = await Promise.all(queries.map((q, i) => siteSearch(q, { ...opts, deep: deepOn && (i === 0 || q === longest) }).catch(() => ({ hits: [] as SiteHit[], related: [] as string[] }))));
  // students often forget the year: if a year was given and nothing came back, drop the filter
  let all = runs.flatMap((r) => r.hits);
  if (yearNum && !o.year && all.length < 3) {
    const loose = await siteSearch(parsed.topic, { deep: deepOn, contentType: o.contentType || undefined }).catch(() => ({ hits: [] as SiteHit[], related: [] as string[] }));
    all = [...all, ...loose.hits];
  }
  const merged = new Map<string, SiteHit>();
  for (const h of [...all, ...(o.contentType ? [] : staticHits({ ...parsed, year: yearNum ?? parsed.year }))]) {
    const prev = merged.get(h.key);
    merged.set(h.key, prev ? { ...prev, score: Math.max(prev.score, h.score) + 4 } : h); // found by several variants: more likely right
  }
  const hits = rerank([...merged.values()], { ...parsed, year: yearNum ?? parsed.year }).slice(0, 40);
  const out = { parsed, hits, related: [...new Set(runs.flatMap((r) => r.related))].slice(0, 8) };
  findCache.set(ck, out);
  if (findCache.size > 40) findCache.delete(findCache.keys().next().value as string);
  return out;
}

export async function retrieve(input: string): Promise<Retrieval> {
  const { parsed, hits: found } = await findHits(input);
  const hits = found.slice(0, 30);
  const passages = parsed.wants === "timetable" || parsed.wants === "files" ? [] : await gatherPassages(hits, parsed);
  const topicWords = [...new Set(parsed.topic.split(/[^a-z0-9]+/).filter((w) => w.length >= 3))];
  const needed = Math.max(1, Math.ceil(topicWords.length * 0.6));
  const onTopic = (txt: string) => topicWords.filter((w) => txt.toLowerCase().includes(w)).length >= needed;
  const topScore = hits[0]?.score ?? 0;
  const grounded = passages.some((x) => onTopic(x.text)) || (topScore >= 90 && hits.slice(0, 3).some((h) => h.group !== "Pages" && onTopic(`${h.title} ${h.subtitle}`)));
  return { parsed, hits, passages, grounded };
}

// ---------- answer ----------
export interface AiTurnInput { question: string; history: { role: "user" | "assistant"; content: string }[]; retrieval: Retrieval }

/** What we send the model for one question: the matching items and the passages we pulled from them. */
function buildSources(r: Retrieval) {
  const byKey = new Map(r.hits.map((h) => [h.key, h] as const));
  const withText = new Set(r.passages.map((p) => p.hitKey));
  const sources = r.passages.reduce<Record<string, string[]>>((acc, p) => { (acc[p.hitKey] ??= []).push(p.text); return acc; }, {});
  const list = [...withText].map((k) => ({ kind: "site", title: byKey.get(k)?.title ?? "", subtitle: byKey.get(k)?.subtitle ?? "", snippet: (sources[k] ?? []).join(" … ").slice(0, 2600) }));
  for (const h of r.hits.slice(0, 8)) if (!withText.has(h.key) && list.length < 8) list.push({ kind: "site", title: h.title, subtitle: h.subtitle, snippet: h.snippet ?? "" });
  return list;
}

export interface StreamHandlers { onText: (full: string) => void; signal?: AbortSignal }

/** Streams the model's answer. Resolves with the final text; throws a friendly Error when the model cannot answer. */
export async function streamAnswer(t: AiTurnInput, h: StreamHandlers): Promise<string> {
  const question = t.retrieval.grounded
    ? t.question
    : `${t.question}\n\n(Nothing on Ompath Study matched this. Answer from sound general medical knowledge and begin by saying it is general guidance, not from the site's notes.)`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ompath-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ question, history: t.history.slice(-6), sources: buildSources(t.retrieval) }),
    signal: h.signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Ompath AI could not answer right now.");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let answer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const d = line.trim();
      if (!d.startsWith("data:")) continue;
      const payload = d.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (piece) { answer += piece; h.onText(answer); }
      } catch { /* a partial line: wait for the rest */ }
    }
  }
  if (!answer.trim()) throw new Error("Ompath AI gave no answer.");
  return answer;
}

/** Used when the model is unavailable: the matching passages, laid out as an answer. */
export function extractiveAnswer(r: Retrieval): string {
  if (!r.passages.length) {
    return r.hits.length
      ? "The AI writer is busy right now, but these are the matching notes and files. Tap one to read it."
      : "I could not find anything about that on Ompath Study. Try different words, or ask me again in a minute.";
  }
  const byTitle = new Map<string, string[]>();
  for (const p of r.passages) (byTitle.get(p.title) ?? byTitle.set(p.title, []).get(p.title)!).push(p.text);
  const parts = [...byTitle.entries()].slice(0, 3).map(([title, texts]) => `### ${title}\n${texts.slice(0, 2).map((x) => `- ${x}`).join("\n")}`);
  return `The AI writer is busy, so here are the most relevant parts of your notes:\n\n${parts.join("\n\n")}`;
}

// ---------- daily allowance (the model costs money, so guests get a fair daily number of questions) ----------
const USAGE_KEY = "ompath_ai_usage";
export const FREE_DAILY_QUESTIONS = 8;
const today = () => new Date().toISOString().slice(0, 10);
export function questionsUsedToday(): number {
  try { const v = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "null"); return v?.day === today() ? Number(v.n) || 0 : 0; } catch { return 0; }
}
export function countQuestion() {
  try { localStorage.setItem(USAGE_KEY, JSON.stringify({ day: today(), n: questionsUsedToday() + 1 })); } catch { /* storage blocked */ }
}
