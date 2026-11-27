// Polishes public published blogs in bulk using Neon directly. No Supabase REST endpoint or legacy service key is used.
// node scripts/blogs/polish-batch.mjs [count] [--year N] [--minutes M]
// Required GitHub Actions secrets: DATABASE_URL, POLISH_WRITE_KEY, GROQ_API_KEYS, GEMINI_API_KEYS.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { yearOf } from "../../api/_lib/blogPolishCore.js";
import { polishArticle } from "../../api/_lib/blogPolishRun.js";
import { verifyBlogContent } from "../../api/_lib/blogPolishVerify.js";
import { verifyPolishWriteKey } from "../../api/_lib/neonPolishStore.js";

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
const writeKey = process.env.POLISH_WRITE_KEY || "";
const fromFile = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const groq = [process.env.GROQ_API_KEYS, fromFile(".groq-keys.local")].filter(Boolean).join(",");
const gem = [process.env.GEMINI_API_KEYS, fromFile(".gemini-keys.local")].filter(Boolean).join(",");
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!writeKey) throw new Error("POLISH_WRITE_KEY is required.");
if (!groq.trim() || !gem.trim()) throw new Error("Both GROQ_API_KEYS and GEMINI_API_KEYS are required.");

const sql = neon(databaseUrl);
if (!(await verifyPolishWriteKey(writeKey))) throw new Error("POLISH_WRITE_KEY does not match the key configured in Ompath Study Admin → Polish.");

const yi = process.argv.indexOf("--year"), mi = process.argv.indexOf("--minutes");
const ONLY = yi >= 0 ? Number(process.argv[yi + 1]) : 0;
const MINUTES = mi >= 0 ? Number(process.argv[mi + 1]) : 50;
const COUNT = Number(process.argv.find((a, i) => /^\d+$/.test(a) && i !== yi + 1 && i !== mi + 1) || 30);
const started = Date.now();

const articles = [];
for (let offset = 0; offset < 4000; offset += 500) {
  const page = await sql.query(
    `SELECT id,title,category,content,original_notes
       FROM public.articles
      WHERE published = true AND deleted_at IS NULL AND password_protected = false
        AND (scheduled_at IS NULL OR scheduled_at <= now())
      ORDER BY created_at ASC LIMIT 500 OFFSET $1`,
    [offset],
  );
  articles.push(...page);
  if (page.length < 500) break;
}
const have = await sql.query(
  "SELECT article_id,status,updated_at,ai_review_status,verdict FROM public.blog_polish ORDER BY updated_at DESC LIMIT 5000",
);
const state = new Map(have.map((x) => [x.article_id, x]));
const hours = (x) => (Date.now() - new Date(x.updated_at).getTime()) / 3_600_000;
const eligible = (a) => {
  const s = state.get(a.id);
  if (!s) return true;
  if (s.verdict === "irrelevant") return false;
  return (s.status === "failed" && hours(s) > 12)
    || (s.status === "partial" && hours(s) > 1)
    || (s.status === "working" && hours(s) > 0.5)
    || (s.status === "done" && s.ai_review_status !== "passed" && hours(s) > 12);
};
const order = (a) => { const y = yearOf(a.category); return y ? [0, 2, 1, 3, 4, 5, 6].indexOf(y) : 7; };
const queue = articles.filter((a) => (!ONLY || yearOf(a.category) === ONLY) && eligible(a)).sort((a, b) => order(a) - order(b));
console.log(`${queue.length} published blogs eligible; processing up to ${COUNT} in ${MINUTES} minutes.`);

const ask = (prompt, timeoutMs, maxTokens) =>
  askModel(prompt, { env: { GROQ_API_KEYS: groq }, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
const save = async (id, row) => {
  const allowed = new Set(["title","description","image_query","verdict","reason","model","content","status","ai_review_status","ai_review_model","ai_reviewed_at","ai_review_issues"]);
  const entries = Object.entries(row).filter(([key, value]) => allowed.has(key) && value !== undefined);
  if (!entries.length) return;
  const set = entries.map(([key], i) => `${key} = $${i + 2}${key === "ai_review_issues" ? "::jsonb" : ""}`).join(", ");
  const values = entries.map(([key, value]) => key === "ai_review_issues" ? JSON.stringify(value ?? []) : value);
  await sql.query(`UPDATE public.blog_polish SET ${set}, updated_at = now() WHERE article_id = $1`, [id, ...values]);
};

let done = 0, kept = 0, failed = 0, strikes = 0;
for (const a of queue) {
  if (done + kept + failed >= COUNT || (Date.now() - started) / 60000 > MINUTES || strikes >= 3) break;
  const had = state.get(a.id);
  const claim = had
    ? await sql.query(
      "UPDATE public.blog_polish SET status='working', updated_at=now() WHERE article_id=$1 AND status=$2 AND updated_at=$3 RETURNING article_id",
      [a.id, had.status, had.updated_at],
    )
    : await sql.query(
      "INSERT INTO public.blog_polish (article_id,status) VALUES ($1,'working') ON CONFLICT (article_id) DO NOTHING RETURNING article_id",
      [a.id],
    );
  if (!claim.length) continue;
  try {
    const result = await polishArticle(a, ask, { chunk: true });
    if (result.verdict === "irrelevant") {
      await save(a.id, {
        title: result.title, description: result.description, verdict: result.verdict,
        reason: result.reason || "Not medical study material; not AI-verified.", status: "done",
        ai_review_status: "held", ai_review_model: null, ai_reviewed_at: new Date().toISOString(),
        ai_review_issues: [{ severity: "medium", where: "content type", problem: "Not medical study material.", fix: "No medical verification badge is applied." }],
      });
      kept++; console.log("not study material: " + a.title.slice(0, 65)); continue;
    }
    if (result.status !== "done") {
      await save(a.id, { status: "partial", content: null, reason: result.reason || "The writer was interrupted; the daily queue will retry.", ai_review_status: null });
      failed++; strikes++; console.log("partial: " + a.title.slice(0, 65)); continue;
    }
    const review = await verifyBlogContent(a, result.content, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: gem }, { allowRepair: true, timeoutMs: 50000 });
    await save(a.id, {
      title: result.title, description: result.description, image_query: result.image_query,
      content: review.status === "passed" ? review.content : null,
      verdict: result.verdict,
      reason: review.status === "held" ? "Gemini verification held: " + (review.issues?.[0]?.problem || "review did not pass") : (result.reason || null),
      status: "done", model: "groq", ai_review_status: review.status, ai_review_model: review.model,
      ai_reviewed_at: review.at, ai_review_issues: review.issues || [],
    });
    strikes = 0;
    if (review.status === "passed" && result.content) { done++; console.log("verified and polished: " + a.title.slice(0, 70)); }
    else if (review.status === "passed") { kept++; console.log("verified; original retained: " + a.title.slice(0, 65)); }
    else { failed++; console.log("held for automatic retry: " + a.title.slice(0, 65)); }
  } catch (error) {
    failed++; strikes++;
    await save(a.id, { status: "failed", reason: String(error?.message ?? "failed").slice(0, 200) });
    console.log(`failed: ${a.title.slice(0, 60)} (${String(error?.message).slice(0, 60)})`);
  }
}
console.log(`finished: ${done} polished, ${kept} kept as they were, ${failed} failed. ${Math.max(0, queue.length - done - kept - failed)} left.`);
