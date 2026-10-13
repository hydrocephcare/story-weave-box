// POST /api/ai-polish { id }: polishes one Year 1 to 3 blog the first time anyone opens it, and keeps the result for everyone.
//   - a clear title and a search description
//   - for notes: layout and wording polished (all facts kept)
//   - for question banks: only put into the site's question format, and only when they are not in it already
//   - a verdict (keep / review / irrelevant) that the admin can act on; nothing is ever deleted here
// The stored article is never changed. The result is saved in blog_polish (needs SUPABASE_SERVICE_ROLE_KEY in Vercel), which the page reads.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { cleanMeta, isBank, isScanOnly, needsMcqFormat, parseJson, plain, soundPolish, VERDICTS, yearOf } from "./blogPolishCore.js";

const SB = process.env.SUPABASE_URL || "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const DAILY_CAP = Number(process.env.POLISH_DAILY_CAP || 40);
const hits = new Map(); // per visitor, per hour (best effort)
const LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const META_PROMPT = (a, sample) => `You are the editor of a medical study website for MBChB students in Kenya. Judge this page and write its title and search description.
Current title: "${a.title}"
Category: ${a.category}

Start of the page:
"""
${sample}
"""

Answer with ONLY this JSON:
{"verdict":"keep|review|irrelevant","reason":"one short sentence","title":"...","description":"..."}

Rules:
- verdict "irrelevant" only when this is not study material at all (a notice, handbook, timetable, letter, advert, personal details, empty or meaningless text). "review" when it is weak, partly broken or unclear. Otherwise "keep".
- title: clear and specific, under 65 characters, in title case, no quotation marks. Keep a paper's unit, year or semester when it is a past paper (for example "Biochemistry End of Year Exam 2015"). Never invent facts. Drop file codes, "Questions and Answers" repeats and "Awaiting Edit".
- description: 130 to 155 characters, plain sentences saying what a student will learn or practise. No hype, no "Free study material".`;

const NOTE_PROMPT = (a, content) => `You are polishing a medical study note for MBChB students. Make it a clean, good page without changing the medicine.
Title: "${a.title}" (${a.category}).

Rules:
1. Keep every fact, number, unit, drug, abbreviation and every picture line (a line starting with ![ ) exactly. Do not add new medical facts.
2. Layout: clear "## " sections (3 to 9, plain headings), "### " only for real sub-sections, short paragraphs of at most three sentences, bullet lists for lists and sequences, a table only when the original compares things.
3. Wording: fix typing and grammar mistakes, remove chat leftovers ("Got it, here are the notes"), page markers, duplicated lines and stray symbols, make unclear sentences clearer. Keep the author's meaning.
4. Bold ("**") only the few terms a student must remember, never more than two in a paragraph.
5. Do not add a title line at the top. Output ONLY the finished markdown, no commentary, no code fences.

NOTE:
"""
${content}
"""`;

const BANK_PROMPT = (a, content) => `You are formatting a medical question bank for a study website. Change ONLY the format, never a question, an option or an answer.
Title: "${a.title}" (${a.category}).

Format every multiple-choice question exactly like this:

### Question 1
Question text

A. option
B. option
C. option
D. option

Answer: B. the correct option text
Explanation: one or two sentences (only if the original had one)

Rules:
1. Keep every question, option, answer and explanation word for word. Do not add questions, answers or explanations that are not there. If the original has no answer for a question, write "Answer: not given" and leave it.
2. Keep headings, section titles, instructions and picture lines (lines starting with ![ ).
3. Remove only stray symbols and page markers.
4. Output ONLY the finished markdown, no commentary, no code fences.

BANK:
"""
${content}
"""`;

async function sb(path, { method = "GET", body, headers = {} } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json, headers: r.headers };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ status: "invalid" });
  const groq = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const gem = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || (!groq.trim() && !gem.trim())) return res.status(503).json({ status: "unavailable" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
  if (mine.length >= LIMIT) return res.status(429).json({ status: "busy" });
  hits.set(ip, [...mine, now]);
  if (hits.size > 5000) hits.clear();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return res.status(400).json({ status: "invalid" });

  // only public, published Year 1 to 3 blogs
  const got = await sb(`articles?select=id,title,category,content,published,deleted_at,password_protected&id=eq.${id}`);
  const a = got.json?.[0];
  if (!a || !a.published || a.deleted_at || a.password_protected || ![1, 2, 3].includes(yearOf(a.category))) return res.status(404).json({ status: "invalid" });

  // already done or being done: nothing to do
  const existing = (await sb(`blog_polish?select=status,updated_at&article_id=eq.${id}`)).json?.[0];
  const ageH = existing ? (now - new Date(existing.updated_at).getTime()) / 3_600_000 : 0;
  if (existing && !((existing.status === "failed" && ageH > 12) || (existing.status === "partial" && ageH > 1) || (existing.status === "working" && ageH > 0.2))) return res.status(200).json({ status: existing.status });

  // a daily limit, so visitors cannot use up the AI quota
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const count = await sb(`blog_polish?select=article_id&created_at=gte.${since.toISOString()}&limit=1`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const used = Number(String(count.headers.get("content-range") || "").split("/")[1] || 0);
  if (used >= DAILY_CAP && !existing) return res.status(429).json({ status: "busy" });

  // claim it, so two visitors do not do the same page
  const stamp = new Date().toISOString();
  let claimed;
  if (existing) claimed = await sb(`blog_polish?article_id=eq.${id}&status=eq.${existing.status}`, { method: "PATCH", body: { status: "working", updated_at: stamp }, headers: { Prefer: "return=representation" } });
  else claimed = await sb("blog_polish?on_conflict=article_id", { method: "POST", body: { article_id: id, status: "working" }, headers: { Prefer: "resolution=ignore-duplicates,return=representation" } });
  if (!claimed.json?.length) return res.status(200).json({ status: "working" });

  const env = { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gem };
  const ask = (prompt, timeoutMs, maxTokens) => askModel(prompt, { env, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
  const save = (row) => sb(`blog_polish?article_id=eq.${id}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() } });

  try {
    // 1. verdict, title, description
    const meta = parseJson(await ask(META_PROMPT(a, plain(a.content).slice(0, 2600) || a.title), 20000, 600)) ?? {};
    const verdict = VERDICTS.includes(meta.verdict) ? meta.verdict : "keep";
    const { title, description } = cleanMeta(meta.title, meta.description);
    const row = { title: title || null, description: description || null, verdict, reason: String(meta.reason ?? "").slice(0, 240) || null, model: "ai" };

    // 2. the text
    let content = null, status = "done", why = "";
    const text = a.content;
    if (verdict === "irrelevant" || isScanOnly(text)) why = "text left as it was";
    else if (text.length > 14000) why = "too long to polish in one go";
    else if (isBank(text) && !needsMcqFormat(text)) why = "question format already fine";
    else {
      const bank = isBank(text);
      try {
        const out = (await ask(bank ? BANK_PROMPT(a, text) : NOTE_PROMPT(a, text), 38000, 7000)).replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
        const bad = soundPolish(text, out, { headings: !bank });
        if (bad) why = `polish rejected: ${bad}`; else content = out;
      } catch (e) { status = "partial"; why = "text will be tried again"; }
    }
    await save({ ...row, content, status, reason: [row.reason, why].filter(Boolean).join(" | ").slice(0, 400) || null });
    return res.status(200).json({ status });
  } catch (e) {
    await save({ status: "failed", reason: String(e?.message ?? "failed").slice(0, 200) });
    return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: "failed" });
  }
}
