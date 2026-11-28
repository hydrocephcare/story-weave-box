import { neon } from "@neondatabase/serverless";
import { isNeonAdmin } from "./neonAdmin.js";
import { balanceBank, statedAnswerLetter } from "../../supabase/functions/_shared/mcqPositions.js";

const MAX_OPTIONS = 5;
const MIN_OPTIONS = 4;
const parseBody = (value) => typeof value === "string" ? JSON.parse(value || "{}") : value || {};
const db = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
};

function fixQuestion(q) {
  const issues = [];
  let question = String(q?.question || "").trim();
  let options = Array.isArray(q?.options) ? [...q.options] : [];
  let correct = Number.isInteger(q?.correct_answer) ? q.correct_answer : 0;
  const explanation = q?.explanation;
  if (!question || options.length < 2) return null;

  const combined = options.join(" ").replace(/\s+/g, " ").trim();
  const splitMatches = Array.from(combined.matchAll(/(?:^|\s)([A-F])[.)]\s*([\s\S]*?)(?=\s+[A-F][.)]\s*|$)/gi));
  if (options.length === 1 && splitMatches.length >= 2) {
    options = splitMatches.map((m) => String(m[2] || "").trim()).filter(Boolean);
    const stated = statedAnswerLetter(String(q.explanation || "") + " " + combined);
    if (stated < 0 || stated >= options.length) return null;
    correct = stated;
    issues.push("Split combined A-E options into separate choices");
  }
  question = question.replace(/^#{1,6}\s+/gm, "").replace(/^Question\s*\d+\s*/i, "").replace(/\s*Choices:\s*$/i, "").trim();

  const seen = new Map(), uniqueOptions = [], indexMap = [];
  for (let i = 0; i < options.length; i++) {
    const normalized = String(options[i]).trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.set(normalized, uniqueOptions.length);
      uniqueOptions.push(String(options[i]).trim());
      indexMap.push(i);
    } else if (i === correct) {
      correct = seen.get(normalized);
      issues.push("Duplicate correct option merged");
    } else issues.push("Removed duplicate option");
  }
  const newCorrectIdx = indexMap.indexOf(correct);
  if (newCorrectIdx < 0) return null;
  correct = newCorrectIdx;
  options = uniqueOptions;

  const garbage = (opt) => opt.length > 200 || /^[-—]+$/.test(opt) || /\b(?:explanation|rationale|answer key)\b/i.test(opt);
  if (garbage(options[correct] ?? "")) return null;
  options = options.filter((opt, i) => {
    if (garbage(opt)) {
      issues.push("Removed a malformed option");
      if (i < correct) correct = Math.max(0, correct - 1);
      return false;
    }
    return true;
  });
  options = options.map((opt) => {
    const cleaned = opt.replace(/\s*[-–—]+\s*$/, "").trim();
    if (cleaned !== opt) issues.push("Cleaned trailing dash from an option");
    return cleaned;
  });
  if (options.length > MAX_OPTIONS) {
    issues.push("Trimmed options to five");
    const right = options[correct];
    options = [...options.filter((_, i) => i !== correct).slice(0, MAX_OPTIONS - 1)];
    correct = Math.min(correct, MAX_OPTIONS - 1);
    options.splice(correct, 0, right);
  }
  if (options.length < MIN_OPTIONS) return null;
  correct = Math.min(Math.max(correct, 0), options.length - 1);
  options = options.map((opt) => opt.replace(/\s+—\s+related\s+(?:option|finding)$/i, "").replace(/\s+/g, " ").trim().slice(0, 140));
  if (!issues.length) return null;
  return { fixed: { question, options, correct_answer: correct, explanation }, issues };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!(await isNeonAdmin(token))) return res.status(403).json({ error: "Administrator access required." });
    const body = parseBody(req.body);
    const dryRun = body.dry_run === true;
    const sql = db();

    if (body.set_id) {
      const rows = await sql.query("SELECT id,title,questions FROM public.mcq_sets WHERE id=$1 AND deleted_at IS NULL LIMIT 1", [body.set_id]);
      const set = rows[0];
      if (!set) return res.status(404).json({ error: "Set not found." });
      const questions = Array.isArray(set.questions) ? set.questions : [];
      const fixedQuestions = [], allIssues = [];
      for (const q of questions) {
        const result = fixQuestion(q);
        if (result) { fixedQuestions.push(result.fixed); allIssues.push(...result.issues); }
        else fixedQuestions.push(q);
      }
      const validQuestions = fixedQuestions.filter((q) => Array.isArray(q.options) && q.options.length >= MIN_OPTIONS);
      const removed = fixedQuestions.length - validQuestions.length;
      if (!dryRun && (allIssues.length || removed)) {
        const balanced = balanceBank(validQuestions, { seed: String(body.set_id) }).questions;
        await sql.query("UPDATE public.mcq_sets SET questions=$2::jsonb,updated_at=now() WHERE id=$1", [body.set_id, JSON.stringify(balanced)]);
      }
      return res.status(200).json({ done: true, set_id: body.set_id, title: set.title, original_count: questions.length,
        fixed_count: validQuestions.length, removed, issues: allIssues.slice(0, 100), dry_run: dryRun });
    }

    const BATCH = 20, MAX_RUNTIME = 100000, started = Date.now();
    let cursor = String(body.cursor || "00000000-0000-0000-0000-000000000000");
    let scanned = 0, fixedSets = 0, removedTotal = 0, hasMore = false;
    const log = [];
    while (Date.now() - started < MAX_RUNTIME) {
      const sets = await sql.query("SELECT id,title,questions FROM public.mcq_sets WHERE deleted_at IS NULL AND published=true AND id>$1 ORDER BY id ASC LIMIT $2", [cursor, BATCH]);
      if (!sets.length) { hasMore = false; break; }
      for (const set of sets) {
        cursor = String(set.id); scanned++;
        const questions = Array.isArray(set.questions) ? set.questions : [];
        const fixedQuestions = [], setIssues = [];
        for (const q of questions) {
          const result = fixQuestion(q);
          if (result) { fixedQuestions.push(result.fixed); setIssues.push(...result.issues); }
          else fixedQuestions.push(q);
        }
        const validQuestions = fixedQuestions.filter((q) => Array.isArray(q.options) && q.options.length >= MIN_OPTIONS);
        const removed = fixedQuestions.length - validQuestions.length;
        if (setIssues.length || removed) {
          if (!dryRun) {
            const balanced = balanceBank(validQuestions, { seed: String(set.id) }).questions;
            await sql.query("UPDATE public.mcq_sets SET questions=$2::jsonb,updated_at=now() WHERE id=$1", [set.id, JSON.stringify(balanced)]);
          }
          fixedSets++; removedTotal += removed;
          log.push({ id: set.id, title: set.title, fixes: setIssues.length, removed, details: setIssues.slice(0, 10) });
        }
        if (Date.now() - started >= MAX_RUNTIME) break;
      }
      if (sets.length < BATCH) { hasMore = false; break; }
      hasMore = true;
      if (Date.now() - started >= MAX_RUNTIME) break;
    }
    return res.status(200).json({ done: !hasMore, scanned, sets_fixed: fixedSets, questions_removed: removedTotal,
      cursor: hasMore ? cursor : null, dry_run: dryRun, log });
  } catch (error) {
    console.error("[mcq-quality-fix] failed", String(error).slice(0, 240));
    return res.status(500).json({ error: "MCQ quality repair could not complete." });
  }
}
