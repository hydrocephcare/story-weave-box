// Polishes all public published blogs in bulk (the page-open endpoint does one at a time). Long pages are done piece by piece.
//   node scripts/blogs/polish-batch.mjs [count] [--year N] [--minutes M]
// Needs POLISH_WRITE_KEY (made on /admin/polish) plus GROQ_API_KEYS and/or GEMINI_API_KEYS in the environment. Results go to the blog_polish table, never into the articles.
import fs from "node:fs";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { yearOf } from "../../api/_lib/blogPolishCore.js";
import { polishArticle } from "../../api/_lib/blogPolishRun.js";
import { verifyBlogContent } from "../../api/_lib/blogPolishVerify.js";

const SB = process.env.SUPABASE_URL || "https://strfwaqvxvkhjbqrwmla.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional: the write key does the job without it
const WRITE = process.env.POLISH_WRITE_KEY || "";
const KEY = SERVICE || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
// on your own computer the keys can sit in the git-ignored files .groq-keys.local and .gemini-keys.local (one key per line); in GitHub they come from secrets
const fromFile = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const groq = [process.env.GROQ_API_KEYS, fromFile(".groq-keys.local")].filter(Boolean).join(",");
const gem = [process.env.GEMINI_API_KEYS, fromFile(".gemini-keys.local")].filter(Boolean).join(",");
if (!SERVICE && !WRITE) throw new Error("POLISH_WRITE_KEY or SUPABASE_SERVICE_ROLE_KEY is required.");
if (!groq.trim() || !gem.trim()) throw new Error("Both GROQ_API_KEYS and GEMINI_API_KEYS are required.");

const yi = process.argv.indexOf("--year"), mi = process.argv.indexOf("--minutes");
const ONLY = yi >= 0 ? Number(process.argv[yi + 1]) : 0;
const MINUTES = mi >= 0 ? Number(process.argv[mi + 1]) : 50;
const COUNT = Number(process.argv.find((a, i) => /^\d+$/.test(a) && i !== yi + 1 && i !== mi + 1) || 30);
const started = Date.now();

const sb = async (path, { method = "GET", body, headers = {} } = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...(SERVICE ? {} : { "x-polish-key": WRITE }), "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json = null; try { json = t ? JSON.parse(t) : null; } catch { /* not json */ }
  return { ok: r.ok, status: r.status, json, text: t };
};

const rows = [];
for (let o = 0; o < 4000; o += 500) {
  const r = await sb(`articles?select=id,title,category,content,original_notes&published=eq.true&deleted_at=is.null&password_protected=eq.false&order=created_at.asc&offset=${o}&limit=500`);
  if (!r.ok || !Array.isArray(r.json)) throw new Error("Could not read published articles: " + r.status + " " + r.text.slice(0, 160));
  rows.push(...r.json); if (r.json.length < 500) break;
}
const have = await sb("blog_polish?select=article_id,status,updated_at,ai_review_status,verdict&limit=5000");
if (!have.ok) throw new Error("The blog_polish AI verification migration is not ready: " + have.text.slice(0, 160));
const state = new Map((have.json ?? []).map((x) => [x.article_id, x]));
const hours = (x) => (Date.now() - new Date(x.updated_at).getTime()) / 3_600_000;
const eligible = (a) => {
  const s = state.get(a.id);
  if (!s) return true;
  if (s.verdict === "irrelevant") return false;
  return (s.status === "failed" && hours(s) > 12) || (s.status === "partial" && hours(s) > 1) || (s.status === "working" && hours(s) > 0.5) || (s.status === "done" && s.ai_review_status !== "passed" && hours(s) > 12);
};
// Year 2 and Year 1 first, then Year 3 and the rest
const order = (a) => { const y = yearOf(a.category); return y ? [0, 2, 1, 3, 4, 5, 6].indexOf(y) : 7; };
const queue = rows.filter((a) => (ONLY ? yearOf(a.category) === ONLY : true) && eligible(a)).sort((a, b) => order(a) - order(b));
console.log(`${queue.length} blogs still to polish; doing up to ${COUNT} (about ${MINUTES} minutes).`);

const ask = (prompt, timeoutMs, maxTokens) => askModel(prompt, { env: { GROQ_API_KEYS: groq }, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
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
    if (r.verdict === "irrelevant") {
      await sb(`blog_polish?article_id=eq.${a.id}`, { method: "PATCH", body: { title: r.title, description: r.description, verdict: r.verdict, reason: r.reason || "Not medical study material; not AI-verified.", status: "done", ai_review_status: "held", ai_review_model: null, ai_reviewed_at: new Date().toISOString(), ai_review_issues: [{ severity: "medium", where: "content type", problem: "Not medical study material.", fix: "No medical verification badge is applied." }], updated_at: new Date().toISOString() } });
      kept++; console.log("not medical study material: " + a.title.slice(0, 65));
      continue;
    }
    if (r.status !== "done") {
      await sb(`blog_polish?article_id=eq.${a.id}`, { method: "PATCH", body: { status: "partial", content: null, reason: r.reason || "The writer was interrupted; the daily queue will retry.", ai_review_status: null, updated_at: new Date().toISOString() } });
      failed++; strikes++;
      console.log("partial: " + a.title.slice(0, 65));
      continue;
    }
    const review = await verifyBlogContent(a, r.content, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gem }, { allowRepair: true, timeoutMs: 50000 });
    const saved = await sb(`blog_polish?article_id=eq.${a.id}`, { method: "PATCH", body: {
      title: r.title, description: r.description, image_query: r.image_query,
      content: review.status === "passed" ? review.content : null,
      verdict: r.verdict, reason: review.status === "held" ? "Gemini verification held: " + (review.issues?.[0]?.problem || "review did not pass") : (r.reason || null),
      status: "done", model: "groq", ai_review_status: review.status, ai_review_model: review.model,
      ai_reviewed_at: review.at, ai_review_issues: review.issues || [], updated_at: new Date().toISOString()
    } });
    if (!saved.ok) throw new Error("Could not save the Gemini review: " + saved.text.slice(0, 160));
    strikes = 0;
    if (review.status === "passed" && r.content) { done++; console.log("verified and polished: " + a.title.slice(0, 70)); }
    else if (review.status === "passed") { kept++; console.log("verified; original retained: " + a.title.slice(0, 65)); }
    else { failed++; console.log("held for automatic retry: " + a.title.slice(0, 65)); }
  } catch (e) {
    failed++; strikes++;
    await sb(`blog_polish?article_id=eq.${a.id}`, { method: "PATCH", body: { status: "failed", reason: String(e?.message ?? "failed").slice(0, 200), updated_at: new Date().toISOString() } });
    console.log(`failed: ${a.title.slice(0, 60)} (${String(e?.message).slice(0, 60)})`);
  }
}
console.log(`finished: ${done} polished, ${kept} kept as they were, ${failed} failed. ${Math.max(0, queue.length - done - kept - failed)} left.`);
