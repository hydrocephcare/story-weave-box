// Polishes Year 1 to 3 blogs in bulk (the page-open endpoint does one at a time). Long pages are done piece by piece.
//   node scripts/blogs/polish-batch.mjs [count] [--year N] [--minutes M]
// Needs POLISH_WRITE_KEY (made on /admin/polish) plus GROQ_API_KEYS and/or GEMINI_API_KEYS in the environment. Results go to the blog_polish table, never into the articles.
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { yearOf } from "../../api/_lib/blogPolishCore.js";
import { polishArticle } from "../../api/_lib/blogPolishRun.js";

const SB = process.env.SUPABASE_URL || "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional: the write key does the job without it
const WRITE = process.env.POLISH_WRITE_KEY || "";
const KEY = SERVICE || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo";
const groq = process.env.GROQ_API_KEYS || "";
const gem = process.env.GEMINI_API_KEYS || "";
if (!SERVICE && !WRITE) { console.log("POLISH_WRITE_KEY is not set: nothing to do."); process.exit(0); }
if (!groq.trim() && !gem.trim()) { console.log("No AI keys: nothing to do."); process.exit(0); }

const yi = process.argv.indexOf("--year"), mi = process.argv.indexOf("--minutes");
const ONLY = yi >= 0 ? Number(process.argv[yi + 1]) : 0;
const MINUTES = mi >= 0 ? Number(process.argv[mi + 1]) : 50;
const COUNT = Number(process.argv.find((a, i) => /^\d+$/.test(a) && i !== yi + 1 && i !== mi + 1) || 20);
const started = Date.now();

const sb = async (path, { method = "GET", body, headers = {} } = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...(SERVICE ? {} : { "x-polish-key": WRITE }), "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json = null; try { json = t ? JSON.parse(t) : null; } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json, text: t };
};

const rows = [];
for (let o = 0; o < 4000; o += 500) {
  const r = await sb(`articles?select=id,title,category,content&published=eq.true&deleted_at=is.null&password_protected=eq.false&order=created_at.asc&offset=${o}&limit=500`);
  if (!r.ok || !Array.isArray(r.json)) { console.log("Could not read the articles:", r.status, r.text.slice(0, 120)); process.exit(0); }
  rows.push(...r.json); if (r.json.length < 500) break;
}
const have = await sb("blog_polish?select=article_id,status,updated_at&limit=5000");
if (!have.ok) { console.log("The blog_polish table is not set up yet (run the SQL first):", have.text.slice(0, 120)); process.exit(0); }
const state = new Map((have.json ?? []).map((x) => [x.article_id, x]));
const hours = (x) => (Date.now() - new Date(x.updated_at).getTime()) / 3_600_000;
const eligible = (a) => {
  const s = state.get(a.id);
  if (!s) return true;
  return (s.status === "failed" && hours(s) > 12) || (s.status === "partial" && hours(s) > 1) || (s.status === "working" && hours(s) > 0.5);
};
// Year 2 and Year 1 first, then Year 3 and the rest
const order = (a) => [0, 2, 1, 3, 4, 5, 6].indexOf(yearOf(a.category));
const queue = rows.filter((a) => (ONLY ? yearOf(a.category) === ONLY : [1, 2, 3, 4, 5, 6].includes(yearOf(a.category))) && eligible(a)).sort((a, b) => order(a) - order(b));
console.log(`${queue.length} blogs still to polish; doing up to ${COUNT} (about ${MINUTES} minutes).`);

const ask = (prompt, timeoutMs, maxTokens) => askModel(prompt, { env: { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gem }, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
let done = 0, kept = 0, failed = 0, strikes = 0;
for (const a of queue) {
  if (done + kept + failed >= COUNT || (Date.now() - started) / 60000 > MINUTES || strikes >= 3) break;
  const had = state.get(a.id);
  const claim = had
    ? await sb(`blog_polish?article_id=eq.${a.id}&status=eq.${had.status}`, { method: "PATCH", body: { status: "working", updated_at: new Date().toISOString() }, headers: { Prefer: "return=representation" } })
    : await sb("blog_polish?on_conflict=article_id", { method: "POST", body: { article_id: a.id, status: "working" }, headers: { Prefer: "resolution=ignore-duplicates,return=representation" } });
  if (!claim.json?.length) continue; // someone else has it
  try {
    const r = await polishArticle(a, ask, { chunk: true });
    await sb(`blog_polish?article_id=eq.${a.id}`, { method: "PATCH", body: { title: r.title, description: r.description, image_query: r.image_query, content: r.content, verdict: r.verdict, reason: r.reason || null, status: r.status, model: "ai", updated_at: new Date().toISOString() } });
    strikes = 0;
    if (r.content) { done++; console.log(`polished: ${a.title.slice(0, 70)}`); } else { kept++; console.log(`kept as it was (${r.verdict}): ${a.title.slice(0, 60)} | ${r.reason.slice(0, 80)}`); }
  } catch (e) {
    failed++; strikes++;
    await sb(`blog_polish?article_id=eq.${a.id}`, { method: "PATCH", body: { status: "failed", reason: String(e?.message ?? "failed").slice(0, 200), updated_at: new Date().toISOString() } });
    console.log(`failed: ${a.title.slice(0, 60)} (${String(e?.message).slice(0, 60)})`);
  }
}
console.log(`finished: ${done} polished, ${kept} kept as they were, ${failed} failed. ${Math.max(0, queue.length - done - kept - failed)} left.`);
