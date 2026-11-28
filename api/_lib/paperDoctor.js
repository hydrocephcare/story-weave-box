import { neon } from "@neondatabase/serverless";
import { isNeonAdmin } from "./neonAdmin.js";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { supabaseAiEnv } from "./supabaseAiEnv.js";

const SYSTEM = `You tidy written exam papers for a free medical study website used by Kenyan medical students. The text was pasted or scanned from Word and PDF files, so its structure is often damaged.
You are given one page, or one section of a long page. Return the same material, cleanly structured.

Page format to produce:
- Each question starts with a line "Question N" (numbered in order), then ONE line with the full question, then its answer.
- If the question has lettered parts, put them on their own lines like "A. Interpret the results. (4 marks)", then a blank line, then "Answer:" and the model answer with each part's answer starting on its own line with the same letter.
- If the answer is a set of points, write them as plain bullet lines ("- ...") or short paragraphs. Never put labels and text in separate pieces, and never glue two items on one line.

What to repair:
1. MISSING QUESTIONS. Many answers appear with no question above them (a heading such as "Definition" or "Types of ..." followed by answer points). Work out the question the answer is clearly responding to and write it as a complete exam question with its marks if the author gave them (for example "Explain non-shivering thermogenesis. (5 marks)"). Mention each restored question in the issues as "Restored question: ...". If you cannot tell what is asked, keep the text and write "Question N" with "(question not recorded)".
2. FUSED TEXT. Separate glued words and lists: "Preparation for CollectionPatient instructions" becomes "Preparation for Collection: Patient instructions"; "a) ... cancerb) ... tumorsc) ..." becomes separate a), b), c) lines. Remove stray symbols such as "****", "---", and loose "o" bullets; join sentences that were cut in half. Fix "e g." to "e.g." and split-up abbreviations ("RB Cs" -> "RBCs", "NSAI Ds" -> "NSAIDs", "AT Pase" -> "ATPase").
3. COVER LINES. Put the exam cover details (programme, unit code, unit title, examination year, department, time) on one short line each, with nothing glued together. Drop "good luck" lines.
4. TOPIC FRAGMENTS. If a question is only a fragment such as "Liver function tests." make it a full instruction ("Discuss liver function tests.").
5. DUPLICATES. If the same topic is answered more than once, KEEP every copy (never delete) but list "Repeated topic: ..." in the issues.

Rules:
- Keep EVERY medical fact, number and model answer the author wrote. Never change a fact. Do not add doses or numbers you are not certain of. If a part has no model answer, write a short accurate textbook answer and say so in the issues; if you are not sure of a fact write "Check your textbook for ..." instead of guessing.
- Do not shorten the content: the corrected text must contain all the original information.
- If the title or description calls the page an "MCQ Bank" but the questions are written, correct them (titles under 70 characters, the description 120 to 155 characters of plain English). Only do this when you are given the title (first section).
- If this is a true multiple-choice bank that is already tidy, answer with the single line NO_CHANGE and nothing else.

Otherwise answer in exactly this layout (no JSON, no code fences):
===ISSUES===
- one short line per thing you changed
===TITLE===
the corrected title (first section only, otherwise leave empty)
===DESCRIPTION===
the corrected description (first section only, otherwise leave empty)
===CONTENT===
the COMPLETE corrected text of this section, every question included`;

const SYSTEM_MCQ = `You complete multiple-choice question pages for a free medical study website used by Kenyan medical students. The text was pasted or scanned from Word and PDF files: the questions and options are there, but the ANSWERS ARE MISSING.
You are given one page, or one section of a long page. Return the same material with an answer added to every question you can answer with confidence.

Format to produce, for each question:
- keep the question line and its options exactly as written (fix only obvious scan damage such as a stray symbol in front of an option letter, or an option letter written as a number)
- directly after the last option add two lines:
**Answer:** C. the full text of the correct option
**Explanation:** one or two sentences saying why it is right and why the most tempting wrong option is not

Rules:
- Only answer when you are confident the answer is correct by standard medical teaching. If a question is cut off, has fewer than two options, or you are not sure, leave it exactly as it was and list it in the issues as "Question N not answered: reason".
- Never change what a question asks. Never add or remove questions. Keep the numbering.
- "All of the above" and "except" questions: read them carefully.
Answer in exactly this layout (no JSON, no code fences):
===ISSUES===
- one short line per thing you changed or skipped (for example "Added answers to 18 questions")
===TITLE===
(leave empty)
===DESCRIPTION===
(leave empty)
===CONTENT===
the COMPLETE text of this section with the answers added, every question included`;

const needsAnswers = (text) => {
  const mcqPart = text.split(/\n\s*(?:#+\s*)?\**\s*(?:short answer|essay|long answer|saq|laq)/i)[0];
  const questions = (mcqPart.match(/(?:^|\n)\s*\(?a[.)]\s+\S/gi) || []).length;
  const answers = (mcqPart.match(/answer\s*[:：]/gi) || []).length;
  const written = (mcqPart.match(/\(\s*\d+\s*marks?\s*\)/gi) || []).length;
  return questions >= 6 && answers < questions * 0.4 && written < 3;
};
const MCQ_LINE = /^\s*(?:#+\s*)?(?:Question\s+)?\d{1,3}[.)]\s+\S/i;
const QUESTION_LINE = /^\s*(?:#+\s*)?Question\s+\d+/i;
const SEG_MAX = 8000;
function sections(text, mcq = false) {
  const max = mcq ? 5500 : SEG_MAX;
  if (text.length <= max + 1500) return [text];
  const lines = text.split("\n"), out = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length >= max && (mcq ? MCQ_LINE : QUESTION_LINE).test(line)) { out.push(cur); cur = ""; }
    else if (cur.length >= max * 1.5 && line.trim() === "") { out.push(cur); cur = ""; }
    cur += line + "\n";
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const countQuestions = (value, mcq = false) => value.split("\n").filter((line) => (mcq ? MCQ_LINE : QUESTION_LINE).test(line)).length;

const db = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
};
const parseBody = (value) => typeof value === "string" ? JSON.parse(value || "{}") : value || {};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!(await isNeonAdmin(token))) return res.status(403).json({ error: "Administrator access required." });
    const body = parseBody(req.body);
    const sql = db();
    const ids = body.article_id ? [{ id: body.article_id }] : await sql.query("SELECT id FROM public.paper_candidates(1)");
    const id = body.article_id || ids[0]?.id;
    if (!id) return res.status(200).json({ success: true, done: true });
    const rows = await sql.query("SELECT id,title,category,content,meta_description FROM public.articles WHERE id=$1 AND published=true AND deleted_at IS NULL LIMIT 1", [id]);
    const article = rows[0];
    if (!article) return res.status(404).json({ error: "Published paper not found." });

    const original = String(article.content || "").replace(/\r\n/g, "\n");
    const answerMode = needsAnswers(original) || body.mode === "answers";
    const level = answerMode ? 3 : 2;
    const parts = sections(original, answerMode);
    const previousRows = await sql.query("SELECT * FROM public.paper_fixes WHERE article_id=$1 LIMIT 1", [article.id]);
    const prev = previousRows[0] || null;
    const resume = !body.force && prev?.status === "working" && Number(prev.pass) >= level ? prev : null;
    const seg = resume ? Math.min(Number(resume.seg) || 0, parts.length - 1) : 0;
    const aiEnv = supabaseAiEnv(req);
    const save = async (status, extra = {}) => {
      const record = {
        status, old_title: article.title, pass: level,
        first_content: prev?.first_content ?? prev?.old_content ?? article.content,
        issues: extra.issues ?? prev?.issues ?? [],
        seg: extra.seg ?? 0,
        changed: extra.changed ?? prev?.changed ?? false,
        new_title: extra.new_title ?? prev?.new_title ?? null,
        new_description: extra.new_description ?? prev?.new_description ?? null,
        old_content: extra.old_content ?? prev?.old_content ?? null,
        new_content: extra.new_content ?? prev?.new_content ?? null,
      };
      await sql.query(`INSERT INTO public.paper_fixes
        (article_id,status,old_title,pass,first_content,issues,seg,changed,new_title,new_description,old_content,new_content)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
        ON CONFLICT(article_id) DO UPDATE SET
          status=EXCLUDED.status,old_title=EXCLUDED.old_title,pass=EXCLUDED.pass,
          first_content=EXCLUDED.first_content,issues=EXCLUDED.issues,seg=EXCLUDED.seg,
          changed=EXCLUDED.changed,new_title=EXCLUDED.new_title,new_description=EXCLUDED.new_description,
          old_content=EXCLUDED.old_content,new_content=EXCLUDED.new_content,created_at=now()`,
        [article.id,record.status,record.old_title,record.pass,record.first_content,JSON.stringify(record.issues),record.seg,record.changed,record.new_title,record.new_description,record.old_content,record.new_content]);
    };

    let raw = "";
    try {
      const system = answerMode ? SYSTEM_MCQ : SYSTEM;
      const user = `${seg === 0 ? `TITLE: ${article.title}\nCATEGORY: ${article.category}\nDESCRIPTION: ${article.meta_description || ""}\n\n` : ""}${parts.length > 1 ? `SECTION ${seg + 1} OF ${parts.length}\n` : ""}PAGE:\n${parts[seg]}`;
      const result = await askModel(system + "\n\n" + user, { env: aiEnv, plain: true, timeoutMs: 85000, maxTokens: 4500 });
      raw = result.text;
    } catch (e) {
      await save("skipped", { issues: [`AI unavailable: ${String(e?.message || e).slice(0, 120)}`] });
      return res.status(200).json({ success: true, title: article.title, status: "skipped" });
    }

    const part = (name) => {
      const start = raw.indexOf(`===${name}===`);
      if (start < 0) return "";
      const from = start + name.length + 6, next = raw.indexOf("\n===", from);
      return raw.slice(from, next < 0 ? undefined : next).trim();
    };
    const unchanged = /^\s*NO_CHANGE/i.test(raw) || !raw.includes("===CONTENT===");
    let segText = parts[seg], segIssues = [];
    if (!unchanged) {
      segText = part("CONTENT").replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "");
      segIssues = part("ISSUES").split("\n").map((x) => x.replace(/^[-*\s]+/, "").trim()).filter(Boolean).map((x) => x.slice(0, 200));
      if (segText.length < parts[seg].length * 0.75 || countQuestions(segText, answerMode) < countQuestions(parts[seg], answerMode)) {
        segText = parts[seg]; segIssues = ["Part of the AI rewrite was incomplete, so the original section was preserved."];
      }
    }
    const doneText = (resume?.new_content ? String(resume.new_content) : "") + (resume?.new_content ? "\n" : "") + segText.replace(/\n+$/, "");
    const issues = [...(resume?.issues || []), ...segIssues].slice(0, 30);
    const changed = Boolean(resume?.changed) || segText.trim() !== parts[seg].trim();
    const title = seg === 0 ? (part("TITLE") || article.title).slice(0, 120) : resume?.new_title || article.title;
    const description = seg === 0 ? (part("DESCRIPTION") || article.meta_description || "").slice(0, 200) : resume?.new_description || article.meta_description;

    if (seg + 1 < parts.length) {
      await save("working", { issues, seg: seg + 1, changed: changed || title !== article.title, new_title: title, new_description: description, new_content: doneText });
      return res.status(200).json({ success: true, title: article.title, status: "working", section: seg + 1, of: parts.length });
    }
    if (!changed && title === article.title && issues.length === 0) {
      await save("clean", { issues: [], seg: 0 });
      return res.status(200).json({ success: true, title: article.title, status: "clean" });
    }
    await save("pending", { issues, seg: 0, new_title: title, new_description: description, old_content: article.content, new_content: doneText });
    return res.status(200).json({ success: true, title: article.title, status: "pending", issues: issues.length });
  } catch (error) {
    console.error("[paper-doctor] failed", String(error).slice(0, 240));
    return res.status(500).json({ error: "Paper doctor could not complete this check." });
  }
}
