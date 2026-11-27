import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { isNeonAdmin } from "./neonAdmin.js";
import { askModel, askGeminiModel } from "../../supabase/functions/_shared/topicAi.js";
import { balanceBank, placeNewQuestions } from "../../supabase/functions/_shared/mcqPositions.js";

const send = (res, status, data) => res.status(status).json(data);
const parseBody = (body) => typeof body === "string" ? JSON.parse(body || "{}") : body || {};
const db = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
};
const env = () => process.env;
const normalizeUnit = (value) => String(value || "Uncategorized").trim();
const yearOf = (value) => Number(/Year\s*(\d)/i.exec(String(value))?.[1]) || 0;

async function generateText(prompt, maxTokens = 5000) {
  const result = await askModel(prompt, { env: env(), timeoutMs: 60000, maxTokens, plain: true });
  if (!result?.text?.trim()) throw new Error("The AI writer returned an empty response.");
  return result.text;
}

function parseMcqs(raw) {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(value)) return [];
    return value.filter((q) => q?.question && Array.isArray(q.options) && q.options.length >= 4).map((q) => ({
      question: String(q.question).trim(),
      options: q.options.slice(0, 5).map((x) => String(x).trim()),
      correct_answer: Number.isInteger(q.correct_answer) ? Math.max(0, Math.min(4, q.correct_answer)) : 0,
      explanation: String(q.explanation || "").trim(),
    }));
  } catch { return []; }
}

function parseEssays(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { saqs: [], laqs: [] };
  try {
    const data = JSON.parse(match[0]);
    const saqs = Array.isArray(data.saqs) ? data.saqs.filter((x) => x?.question && (x.model_answer || x.answer)).map((x) => ({
      question: String(x.question).trim(), answer: String(x.model_answer || x.answer).trim(), marks: 5,
    })) : [];
    const laqs = Array.isArray(data.laqs) ? data.laqs.filter((x) => x?.question && (x.model_answer || x.answer)).map((x) => ({
      question: String(x.question).trim(), answer: String(x.model_answer || x.answer).trim(), marks: 20,
    })) : [];
    return { saqs, laqs };
  } catch { return { saqs: [], laqs: [] }; }
}

async function reviewQuestions(questions, strict = true) {
  const kept = [], disputed = [];
  let dropped = 0, fixed = 0;
  for (let i = 0; i < questions.length; i += 15) {
    const chunk = questions.slice(i, i + 15);
    const prompt = [
      "You are an independent medical examiner. Check each MCQ against current medical knowledge.",
      "For every question determine your own single best answer, status (ok, incomplete, ambiguous), and rewrite options to similar length and grammar without changing their meaning or order.",
      "Do not preserve an incorrect answer key. If your answer differs from the supplied key or two answers could be correct, mark ambiguous.",
      "Return ONLY a JSON array: [{\"i\":0,\"your_answer\":0,\"status\":\"ok\",\"options\":[\"A\",\"B\",\"C\",\"D\",\"E\"],\"explanation\":\"...\"}].",
      chunk.map((q, k) => k + ". " + q.question + "\n" + q.options.map((o, n) => "ABCDE"[n] + ". " + o).join("\n") + "\nKey: " + q.correct_answer + "\nExplanation: " + q.explanation).join("\n\n"),
    ].join("\n\n");
    let result = null;
    for (let attempt = 0; attempt < (strict ? 2 : 1); attempt++) {
      try {
        const answer = await askGeminiModel(prompt, { env: env(), timeoutMs: 45000, maxTokens: 5000 });
        const match = answer.text.match(/\[[\s\S]*\]/);
        result = match ? JSON.parse(match[0]) : null;
        if (Array.isArray(result)) break;
      } catch { result = null; }
    }
    if (!Array.isArray(result)) {
      if (strict) dropped += chunk.length;
      else kept.push(...chunk);
      continue;
    }
    chunk.forEach((q, k) => {
      const checked = result.find((x) => Number(x?.i) === k);
      if (!checked || checked.status === "incomplete") { dropped++; return; }
      const mismatch = Number(checked.your_answer) !== q.correct_answer || checked.status === "ambiguous";
      if (mismatch) {
        disputed.push({ index: i + k, question: q.question.slice(0, 120), supplied: q.correct_answer, reviewer: checked.your_answer });
        if (strict) { dropped++; return; }
      }
      const optionsOk = Array.isArray(checked.options) && checked.options.length === q.options.length && checked.options.every((x) => typeof x === "string" && x.trim());
      const explanation = q.explanation || String(checked.explanation || "").trim();
      if (explanation !== q.explanation) fixed++;
      kept.push({ ...q, options: optionsOk && !mismatch ? checked.options.map((x) => x.trim()) : q.options, explanation });
    });
  }
  return { kept, dropped, disputed, fixed };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { error: "POST only." });
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!(await isNeonAdmin(token))) return send(res, 403, { error: "Administrator access required." });
    const body = parseBody(req.body);
    const sql = db();

    if (body.review) {
      const [sets, logs] = await Promise.all([
        sql.query("SELECT id,title,category FROM public.mcq_sets WHERE published=true AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1000"),
        sql.query("SELECT set_id FROM public.mcq_review_log"),
      ]);
      const checkedIds = new Set(logs.map((x) => String(x.set_id)));
      const pending = sets.filter((x) => !checkedIds.has(String(x.id)));
      const target = pending.find((x) => /^Weekly Exam/i.test(x.category || "")) || pending[0];
      if (!target) return send(res, 200, { success: true, done: true });
      const rows = await sql.query("SELECT questions FROM public.mcq_sets WHERE id=$1 LIMIT 1", [target.id]);
      const before = Array.isArray(rows[0]?.questions) ? rows[0].questions : [];
      const weekly = /^Weekly Exam/i.test(target.category || "");
      const review = await reviewQuestions(before, weekly);
      const balanced = balanceBank(review.kept, { seed: String(target.id) }).questions;
      const changed = review.dropped > 0 || review.fixed > 0 || balanced.length !== before.length;
      if (balanced.length >= Math.max(8, Math.floor(before.length * 0.6)) && changed) {
        await sql.query("UPDATE public.mcq_sets SET questions=$2::jsonb,updated_at=now() WHERE id=$1", [target.id, JSON.stringify(balanced)]);
      }
      await sql.query(
        "INSERT INTO public.mcq_review_log(set_id,checked,dropped,disputed) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(set_id) DO UPDATE SET checked=EXCLUDED.checked,dropped=EXCLUDED.dropped,disputed=EXCLUDED.disputed,reviewed_at=now()",
        [target.id, before.length, review.dropped, JSON.stringify(review.disputed)],
      );
      return send(res, 200, { success: true, title: target.title, before: before.length, kept: balanced.length, dropped: review.dropped, disputed: review.disputed.length, fixed: review.fixed, remaining: pending.length - 1 });
    }

    const [articles, banks, examPasswordRows] = await Promise.all([
      sql.query("SELECT id,title,category,content,updated_at FROM public.articles WHERE published=true AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 3000"),
      sql.query("SELECT id,title,category,questions,created_at FROM public.mcq_sets WHERE published=true AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3000"),
      sql.query("SELECT value FROM public.app_settings WHERE key='exam_password' LIMIT 1"),
    ]);
    const groups = new Map();
    const add = (category, item, type) => {
      const unit = normalizeUnit(category);
      if (!unit || unit === "Uncategorized" || /^Weekly Exam/i.test(unit)) return;
      if (!groups.has(unit)) groups.set(unit, { articles: [], banks: [] });
      groups.get(unit)[type].push(item);
    };
    articles.forEach((x) => add(x.category, x, "articles"));
    banks.forEach((x) => add(x.category, x, "banks"));
    const requestedYear = Number(body.year) || 0;
    const requestedUnit = String(body.unit || "").toLowerCase();
    const force = body.force === true;
    const maxUnits = Math.max(1, Math.min(3, Number(body.units) || 1));
    const candidates = [...groups.entries()].filter(([unit, g]) =>
      g.articles.length + g.banks.length >= 3 &&
      (!requestedYear || yearOf(unit) === requestedYear) &&
      (!requestedUnit || unit.toLowerCase().includes(requestedUnit))
    ).sort((a, b) => (b[1].articles.length + b[1].banks.length) - (a[1].articles.length + a[1].banks.length));
    const chosen = [];
    for (const [unit, group] of candidates) {
      if (chosen.length >= maxUnits) break;
      if (!force) {
        const recent = await sql.query("SELECT id FROM public.mcq_sets WHERE category=$1 AND created_at > now()-interval '7 days' LIMIT 1", ["Weekly Exam: " + unit]);
        if (recent.length) continue;
      }
      chosen.push([unit, group]);
    }
    if (!chosen.length) return send(res, 200, { success: true, unit_count: 0, exams: [], skipped: ["No eligible units found (or recent exams already exist)."] });

    const password = String(examPasswordRows[0]?.value || "");
    const created = [], skipped = [];
    for (const [unit, group] of chosen) {
      const articleContext = group.articles.slice(0, 20).map((x) => "[Article] " + x.title + ": " + String(x.content || "").slice(0, 700));
      const mcqContext = group.banks.slice(0, 10).flatMap((x) => (Array.isArray(x.questions) ? x.questions.slice(0, 8) : []).map((q) => "[MCQ] " + String(q?.question || "")));
      const context = articleContext.concat(mcqContext).join("\n");
      if (context.length < 300) { skipped.push(unit + ": insufficient source content."); continue; }

      const prompt = [
        "Create exactly 30 challenging medical MCQs for a weekly exam in " + unit + ".",
        "At least 20 must be short clinical or applied scenarios requiring two-step reasoning.",
        "Avoid simple recall. Use exactly five plausible options A-E, with similar grammar and length.",
        "Do not use all/none of the above. Vary the correct answer position and do not repeat the same tested fact.",
        "Each explanation must be one concise sentence of no more than 25 words.",
        "Return ONLY a valid JSON array with objects: question, options (five strings), correct_answer (zero-based integer), explanation.",
        "Use the following source material as the syllabus context:\n" + context,
      ].join("\n\n");
      let questions = [];
      try { questions = parseMcqs(await generateText(prompt, 6000)); }
      catch (error) { skipped.push(unit + ": " + (error instanceof Error ? error.message : String(error))); continue; }
      if (questions.length < 20) { skipped.push(unit + ": only " + questions.length + " usable MCQs generated."); continue; }

      const review = await reviewQuestions(questions, true);
      questions = balanceBank(review.kept, { seed: unit + new Date().toISOString().slice(0, 10) }).questions;
      if (questions.length < 20) { skipped.push(unit + ": only " + questions.length + " MCQs passed independent review."); continue; }
      questions = placeNewQuestions(questions.slice(0, 30));

      const essayPrompt = [
        "Create a written medical exam for " + unit + ".",
        "Return ONLY JSON with keys saqs and laqs.",
        "Create exactly four SAQs with five marks each and one LAQ with twenty marks.",
        "Questions must require application, reasoning, comparison or justified clinical decisions, not simple recall.",
        "Each answer must be structured, proportionate to marks, clinically accurate and concise.",
        "Schema: {\\"saqs\\":[{\\"question\\":\\"...\\",\\"model_answer\\":\\"...\\"}],\\"laqs\\":[{\\"question\\":\\"...\\",\\"model_answer\\":\\"...\\"}]}",
      ].join("\n");
      let essays = { saqs: [], laqs: [] };
      try { essays = parseEssays(await generateText(essayPrompt, 4500)); } catch {}
      if (essays.saqs.length < 3 || essays.laqs.length < 1) { skipped.push(unit + ": written paper did not pass format validation."); continue; }

      const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const title = "Weekly " + unit + " Exam - " + date;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 65) + "-" + randomBytes(4).toString("hex");
      let mcqId = null, essayId = null;
      try {
        const mcq = await sql.query(
          "INSERT INTO public.mcq_sets(title,slug,questions,published,original_notes,category,access_password) VALUES($1,$2,$3::jsonb,false,$4,$5,$6) RETURNING id,title",
          [title + " (Section A: MCQs)", slug, JSON.stringify(questions), JSON.stringify({ type: "weekly_exam", unit, review: "Independent Gemini review passed", generated_at: new Date().toISOString() }), "Weekly Exam: " + unit, password],
        );
        mcqId = mcq[0]?.id;
        if (!mcqId) throw new Error("MCQ paper could not be saved.");
        const essay = await sql.query(
          "INSERT INTO public.essays(title,category,short_answer_questions,long_answer_questions,published,article_id) VALUES($1,$2,$3::jsonb,$4::jsonb,false,NULL) RETURNING id",
          [title + " (Sections B & C)", "Weekly Exam: " + unit, JSON.stringify(essays.saqs), JSON.stringify(essays.laqs)],
        );
        essayId = essay[0]?.id;
        if (!essayId) throw new Error("Written paper could not be saved.");
        await sql.query("UPDATE public.essays SET published=true,updated_at=now() WHERE id=$1", [essayId]);
        await sql.query("UPDATE public.mcq_sets SET published=true,updated_at=now() WHERE id=$1", [mcqId]);
        created.push({ unit, exam_id: mcqId, title: mcq[0].title, mcq_count: questions.length, saq_count: essays.saqs.length, laq_count: essays.laqs.length });
      } catch (error) {
        if (essayId) await sql.query("DELETE FROM public.essays WHERE id=$1", [essayId]).catch(() => {});
        if (mcqId) await sql.query("DELETE FROM public.mcq_sets WHERE id=$1", [mcqId]).catch(() => {});
        skipped.push(unit + ": " + (error instanceof Error ? error.message : String(error)));
      }
    }
    return send(res, 200, { success: true, unit_count: created.length, exams: created, skipped, tried: chosen.map((x) => x[0]) });
  } catch (error) {
    console.error("[generate-exam]", error instanceof Error ? error.message : String(error));
    return send(res, 500, { error: error instanceof Error ? error.message : "Exam generation failed." });
  }
}
