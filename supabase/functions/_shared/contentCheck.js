// A second AI reads medical study material the way a strict senior clinician would and lists what is wrong. It is used on the notes, the topic pages
// and the deep exam notes, so a page that carries a wrong threshold, a wrong first-line drug or an MCQ whose marked answer is wrong does not get the
// "AI cross-checked" mark. This is a safety net, not a doctor's review, and the site says so. Plain JS (no Deno or Node APIs) so scripts and edge code share it.
import { askModel } from "./topicAi.js";

export const CHECK_RULES = `Check for these errors and nothing else:
- a wrong number, unit or threshold (for example a diagnostic cut-off, a duration, a ratio) compared with current standard guidelines (WHO, Kenya MoH, EASL/AASLD, KDIGO, ESC/AHA, BTS and similar);
- a wrong first-line drug or step, or advice that could harm a patient;
- a sign, test, score or eponym that is misnamed or described wrongly;
- the same fact written two different ways in the same text (for example "> 250" in one place and ">= 250" in another);
- a multiple-choice question whose marked answer is wrong, or that has two defensible answers, or whose answer is not one of the options;
- a cause, table row or line that makes no clinical sense;
- a missing safety caveat that a student could be hurt by learning without it.
Do not comment on style, length or formatting. Do not suggest additions that are merely nice to have.
Be CERTAIN before you flag anything. If the text already says what you would say, it is correct: do not flag it. Your "fix" must say something DIFFERENT from the text. Units such as cells/µL and cells/mm³ are the same unit. Ignore missing units when the unit is stated nearby.`;

export function buildCheckPrompt({ title, kind = "note", text }) {
  return `You are a strict senior consultant checking a ${kind} titled "${title}" written for medical students in Kenya and similar settings. Another AI wrote it, so assume it can contain confident mistakes.
${CHECK_RULES}

Reply with ONLY one JSON object: {"verdict": "ok" or "issues", "issues": [{"severity": "high" or "medium" or "low", "where": "the section, or a short quote under 120 characters", "problem": "what is wrong, in one sentence", "fix": "the correct statement, in one sentence"}]}
"high" = wrong in a way that would lose marks or harm a patient; "medium" = misleading or inconsistent; "low" = minor. If you find nothing wrong, reply {"verdict": "ok", "issues": []}. Never invent a problem to look useful.

TEXT TO CHECK:
${String(text).slice(0, 15000)}`;
}

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function sanitizeCheck(raw) {
  const issues = (Array.isArray(raw?.issues) ? raw.issues : []).map((x) => ({
    severity: ["high", "medium", "low"].includes(x?.severity) ? x.severity : "low",
    where: clip(x?.where, 140), problem: clip(x?.problem, 300), fix: clip(x?.fix, 300),
  })).filter((x) => x.problem.length >= 8).slice(0, 25);
  const high = issues.filter((x) => x.severity === "high").length;
  const medium = issues.filter((x) => x.severity === "medium").length;
  // a page is "validated" only when nothing serious was found
  return { validated: high === 0, high, medium, issues };
}

/** A second look at what the first pass claimed: each claim is kept only if a fresh read agrees it is a real error in the text. */
export async function verifyIssues({ text, issues, env, fetchImpl = fetch, timeoutMs = 50000 }) {
  if (!issues.length) return issues;
  const list = issues.map((x, i) => `${i + 1}. [${x.where}] claimed problem: ${x.problem} | claimed fix: ${x.fix}`).join("\n");
  const prompt = `You are a senior consultant. A junior reviewer claims the problems below exist in the TEXT. Many such claims are wrong: the reviewer may have misread, or the text may already say exactly what the reviewer wants. For each claim decide if it is a REAL error in the TEXT according to current standard guidelines.

CLAIMS:
${list}

TEXT:
${String(text).slice(0, 15000)}

Reply with ONLY one JSON object: {"real": [numbers of the claims that are real errors]}`;
  // the verifier is a DIFFERENT model family from the first reader when the keys allow (Groq if the first pass used Gemini), so one model's habit is not repeated
  const other = env.GROQ_API_KEYS && env.GEMINI_API_KEYS ? { GROQ_API_KEYS: env.GROQ_API_KEYS } : env;
  const r = await askModel(prompt, { env: other, fetchImpl, timeoutMs, maxTokens: 800 });
  const m = r.text.match(/{[sS]*}/);
  if (!m) return issues;
  const keep = new Set((JSON.parse(m[0]).real ?? []).map(Number));
  return issues.filter((_, i) => keep.has(i + 1));
}

/** Splits long text at "##" headings into pieces of about 14,000 characters, so each answer stays short and accurate. */
export function chunkText(text, max = 14000) {
  const parts = String(text).split(/(?=^##\s)/m);
  const out = [];
  let cur = "";
  for (const p of parts) {
    if (cur && cur.length + p.length > max) { out.push(cur); cur = ""; }
    cur += p;
  }
  if (cur.trim()) out.push(cur);
  return out.length ? out : [""];
}

/** Checks the whole text (in pieces) with the AI keys in env; returns { validated, high, medium, issues, model }. Throws when no answer could be had. */
export async function checkContent({ title, kind = "note", text, env, fetchImpl = fetch, timeoutMs = 50000 }) {
  const all = [];
  let model = "";
  for (const piece of chunkText(text)) {
    if (!piece.trim()) continue;
    const r = await askModel(buildCheckPrompt({ title, kind, text: piece }), { env, fetchImpl, timeoutMs, maxTokens: 3500 });
    model = r.model;
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in the reply");
    const found = sanitizeCheck(JSON.parse(m[0])).issues.filter((x) => x.severity !== "low");
    all.push(...(await verifyIssues({ text: piece, issues: found, env, fetchImpl, timeoutMs })));
  }
  return { ...sanitizeCheck({ issues: all }), model, at: new Date().toISOString().slice(0, 10) };
}

/** The deep notes as plain text for the cross-check: sections, then viva questions, MCQs, cases, numbers and mistakes. */
export function deepToText(deep) {
  const sec = (deep.sections ?? []).map((x) => `## ${x.h}\n${x.p ?? ""}\n${(x.b ?? []).join("\n")}\n${(x.t ?? []).map((r) => `${r.a}: ${r.b}`).join("\n")}`);
  const viva = (deep.vivas ?? []).map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n") || (deep.exam ?? []).join("\n");
  const mcq = (deep.mcqs ?? []).map((x) => `MCQ: ${x.q}\n${x.o.map((o, i) => `${"ABCD"[i]}. ${o}`).join("\n")}\nMarked answer: ${"ABCD"[x.a]}. ${x.e}`).join("\n");
  const cases = (deep.cases ?? []).map((c) => `Case: ${c.v}\n${c.qs.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n")}`).join("\n");
  return [...sec, `## Numbers to memorise\n${(deep.facts ?? []).join("\n")}`, `## Viva questions\n${viva}`, `## MCQs\n${mcq}`, `## Cases\n${cases}`, `## Common mistakes\n${(deep.mistakes ?? []).join("\n")}`].join("\n\n");
}
