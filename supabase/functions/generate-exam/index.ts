import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { balanceBank, placeNewQuestions } from "../_shared/mcqPositions.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeUnitName(category: string): string {
  const raw = (category || "Uncategorized").trim();
  const lower = raw.toLowerCase();

  if (lower.includes("pharmacology")) return "Pharmacology";
  if (lower.includes("pathology")) return "Pathology";
  if (raw.startsWith("Weekly Exam")) return "Weekly Exam";
  return raw;
}

async function generateWithFallback(prompt: string, timeoutMs = 45000): Promise<string> {
  return await chatText(Deno.env.toObject(), [
    { role: "system", content: "You are a senior medical exam writer. Return ONLY valid JSON, no markdown or code blocks." },
    { role: "user", content: prompt },
  ], { temperature: 0.4, maxTokens: 4500, timeoutMs });
}

function parseMcqs(raw: string) {
  const start = raw.indexOf("[");
  if (start < 0) return [];
  // a long answer can be cut off in the middle of the last question: keep the complete ones
  const whole = raw.slice(start);
  let parsed: any = null;
  try { parsed = JSON.parse(whole.slice(0, whole.lastIndexOf("]") + 1)); } catch {
    let end = whole.length;
    for (let tries = 0; tries < 80 && parsed === null; tries++) {
      const cut = whole.lastIndexOf("}", end - 1);   // close the list after the last complete question
      if (cut < 0) break;
      try { parsed = JSON.parse(whole.slice(0, cut + 1) + "]"); } catch { end = cut; }
    }
  }
  try {
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((q: any) => q?.question && Array.isArray(q?.options) && q.options.length >= 4)
      .map((q: any) => ({
        question: String(q.question).trim(),
        options: q.options.slice(0, 5).map((o: any) => String(o).trim()),
        correct_answer: Number.isInteger(q.correct_answer) ? Math.min(Math.max(q.correct_answer, 0), Math.min(q.options.length, 5) - 1) : 0,
        explanation: q.explanation ? String(q.explanation).trim() : "",
      }));
  } catch {
    return [];
  }
}

function parseEssays(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { saqs: [], laqs: [] };
  try {
    const parsed = JSON.parse(match[0]);
    const saqs = Array.isArray(parsed?.saqs)
      ? parsed.saqs
          .filter((q: any) => q?.question && (q?.model_answer || q?.answer))
          .map((q: any) => ({ question: String(q.question).trim(), answer: String(q.model_answer || q.answer).trim(), marks: 5 }))
      : [];
    const laqs = Array.isArray(parsed?.laqs)
      ? parsed.laqs
          .filter((q: any) => q?.question && (q?.model_answer || q?.answer))
          .map((q: any) => ({ question: String(q.question).trim(), answer: String(q.model_answer || q.answer).trim(), marks: 20 }))
      : [];
    return { saqs, laqs };
  } catch {
    return { saqs: [], laqs: [] };
  }
}

type Mcq = { question: string; options: string[]; correct_answer: number; explanation: string };
type Dispute = { i: number; q: string; key: string; ai: string };

/** A second, independent pass over written questions (the "question doctor"). The reviewer never sees the answer key: it picks its own answer, says whether
 * the question is complete and unambiguous, writes a missing explanation, and rewrites the options to similar length so the right answer cannot be spotted
 * by being the longest. strict = new AI-written exams (a question the reviewer disagrees with is dropped); otherwise the stored question is kept and the
 * disagreement is reported for a human to look at. Questions that are cut off or unanswerable are always taken out. */
async function reviewQuestions(qs: Mcq[], strict = true): Promise<{ kept: Mcq[]; dropped: number; disputed: Dispute[]; fixed: number }> {
  const kept: Mcq[] = []; const disputed: Dispute[] = []; let dropped = 0, fixed = 0;
  for (let i = 0; i < qs.length; i += 12) {
    const chunk = qs.slice(i, i + 12);
    const prompt = `You are a strict medical examiner checking multiple-choice questions.\nFor EACH question:\n1. Decide on your own which option is the single best answer (your_answer, index 0-based).\n2. status: "ok", or "incomplete" if the question or an option is cut off, meaningless or missing information, or "ambiguous" if two options could be right or none is.\n3. Rewrite the options so they are similar in length, grammar and level of detail, so the right answer cannot be recognised by being longer or more specific. Keep each option's meaning, the same order, and the same number of options.\n4. If the explanation is missing or empty, write one clear sentence (max 25 words) for "explanation", otherwise leave it "".\nReturn ONLY a JSON array, one object per question: [{"i":0,"your_answer":0,"status":"ok","options":["..."],"explanation":""}]\n\nQuestions:\n${chunk.map((q, k) => `${k}. ${q.question}\n${q.options.map((o, j) => `${"ABCDE"[j]}. ${o}`).join("\n")}\nExplanation: ${q.explanation || "(none)"}`).join("\n\n")}`;
    let reviewed: any[] | null = null;
    try {
      const raw = await chatText(Deno.env.toObject(), [{ role: "system", content: "Return ONLY valid JSON, no markdown." }, { role: "user", content: prompt }], { temperature: 0.1, maxTokens: 4000, timeoutMs: 40000 });
      const m = raw.match(/\[[\s\S]*\]/); reviewed = m ? JSON.parse(m[0]) : null;
    } catch { reviewed = null; }
    if (!Array.isArray(reviewed) && strict) {                          // a new exam is never published unchecked: ask once more, and if the reviewer is still down drop the chunk
      try {
        const raw2 = await chatText(Deno.env.toObject(), [{ role: "system", content: "Return ONLY valid JSON, no markdown." }, { role: "user", content: prompt }], { temperature: 0.1, maxTokens: 4000, timeoutMs: 40000 });
        const m2 = raw2.match(/\[[\s\S]*\]/); reviewed = m2 ? JSON.parse(m2[0]) : null;
      } catch { reviewed = null; }
      if (!Array.isArray(reviewed)) { dropped += chunk.length; continue; }
    }
    if (!Array.isArray(reviewed)) { kept.push(...chunk); continue; }   // the reviewer was unavailable: keep stored questions as written rather than lose them
    chunk.forEach((q, k) => {
      const r = reviewed!.find((x: any) => Number(x?.i) === k);
      if (!r) { kept.push(q); return; }
      if (r.status === "incomplete") { dropped++; return; }
      const mismatch = Number(r.your_answer) !== q.correct_answer || r.status === "ambiguous";
      if (mismatch) {
        disputed.push({ i: i + k, q: q.question.slice(0, 120), key: q.options[q.correct_answer] || "", ai: q.options[Number(r.your_answer)] || "" });
        if (strict) { dropped++; return; }
      }
      const okOpts = Array.isArray(r.options) && r.options.length === q.options.length && r.options.every((o: any) => typeof o === "string" && o.trim());
      const explanation = !q.explanation?.trim() && typeof r.explanation === "string" && r.explanation.trim() ? r.explanation.trim() : q.explanation;
      if (explanation !== q.explanation) fixed++;
      kept.push({ ...q, options: okOpts && !mismatch ? r.options.map((o: string) => o.trim()) : q.options, explanation });
    });
  }
  return { kept, dropped, disputed, fixed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // who is calling: the weekly schedule (secret key) or a signed-in administrator
    const authz = req.headers.get("authorization") || "";
    const cronOk = !!Deno.env.get("CRON_KEY") && req.headers.get("x-cron-key") === Deno.env.get("CRON_KEY");
    if (!cronOk) {
      const token = authz.replace(/^Bearer\s+/i, "");
      const { data: u } = token ? await supabase.auth.getUser(token) : { data: null };
      const { data: isAdmin } = u?.user ? await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" }) : { data: false };
      if (!isAdmin) return new Response(JSON.stringify({ error: "Administrators only." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const body = await req.json().catch(() => ({}));
    if (body?.review) {
      // check one stored question set that has not been through the reviewer yet (weekly exams first, then everything else)
      const [{ data: sets }, { data: logged }] = await Promise.all([
        supabase.from("mcq_sets").select("id, title, category").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(1000),
        supabase.from("mcq_review_log").select("set_id"),
      ]);
      const seen = new Set((logged || []).map((r: any) => r.set_id));
      const pending = (sets || []).filter((r: any) => !seen.has(r.id));
      const todo = pending.find((r: any) => /^Weekly Exam/i.test(r.category || "")) || pending[0];
      if (!todo) return new Response(JSON.stringify({ success: true, done: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: full } = await supabase.from("mcq_sets").select("questions").eq("id", todo.id).single();   // only the one set being checked is read
      const before = (Array.isArray(full?.questions) ? full!.questions : []) as Mcq[];
      const weekly = /^Weekly Exam/i.test(todo.category || "");
      const reviewed = await reviewQuestions(before, weekly);
      const { dropped, disputed, fixed } = reviewed;
      // dropping or fixing questions can leave the letters uneven: even them out again (nothing moves when they are fair)
      const kept = balanceBank(reviewed.kept, { seed: todo.id }).questions as Mcq[];
      if (kept.length >= Math.max(8, Math.floor(before.length * 0.6)) && (dropped || fixed || kept.some((k, i) => JSON.stringify(k.options) !== JSON.stringify(before[i]?.options)))) {
        await supabase.from("mcq_sets").update({ questions: kept }).eq("id", todo.id);
      }
      await supabase.from("mcq_review_log").upsert({ set_id: todo.id, checked: before.length, dropped, disputed });
      return new Response(JSON.stringify({ success: true, title: todo.title, before: before.length, kept: kept.length, dropped, disputed: disputed.length, fixed, remaining: pending.length - 1 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const maxUnits = Math.max(1, Math.min(8, Number(body?.units) || 3));   // a run finishes inside the function's time limit; the next run continues with the units still waiting

    // 1. which units exist (ids and categories only: tiny), 2. which have had an exam most recently, 3. read the content of the ones that are due
    const [{ data: setRows }, { data: artRows }, { data: past }] = await Promise.all([
      supabase.from("mcq_sets").select("id, category").eq("published", true).is("deleted_at", null),
      supabase.from("articles").select("id, category, updated_at").eq("published", true).is("deleted_at", null),
      supabase.from("mcq_sets").select("category, created_at").like("category", "Weekly Exam:%").order("created_at", { ascending: false }).limit(400),
    ]);
    if ((!setRows || setRows.length === 0) && (!artRows || artRows.length === 0)) {
      return new Response(JSON.stringify({ error: "No published content to generate exam from" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const setIds = new Map<string, string[]>(), artIds = new Map<string, string[]>();
    for (const [rows, into] of [[setRows, setIds], [artRows, artIds]] as const) for (const r of (rows || []) as any[]) {
      const unit = normalizeUnitName(r.category || "Uncategorized");
      if (unit === "Weekly Exam" || unit === "Uncategorized") continue;
      if (!into.has(unit)) into.set(unit, []);
      into.get(unit)!.push(r.id);
    }
    const lastExam = new Map<string, number>();
    for (const p of (past || []) as any[]) { const u = String(p.category).replace(/^Weekly Exam:\s*/, ""); if (!lastExam.has(u)) lastExam.set(u, Date.parse(p.created_at)); }
    const weekAgo = Date.now() - 6 * 86_400_000;
    const [{ data: readRows }, { data: wrongAnswers }, { data: passwordSetting }] = await Promise.all([
      supabase.from("user_resource_progress").select("resource_id").eq("resource_type", "article").gte("last_opened_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(3000),
      supabase.from("user_answers").select("question_text").eq("is_correct", false).order("created_at", { ascending: false }).limit(300),
      supabase.from("app_settings").select("value").eq("key", "exam_password").maybeSingle(),
    ]);

    // Which units get an exam: enough material, none in the past 6 days (unless forced), then ranked by how long the unit has waited, how much
    // material it has and how often students get its questions wrong. Picking rotates through the years so Year 4 and 5 are not starved by Year 3.
    // what this week's students actually read, and which notes were published or edited this week: both pull their unit up the list
    const unitOfArticle = new Map<string, string>(), freshByUnit = new Map<string, number>(), readByUnit = new Map<string, number>();
    for (const r of (artRows || []) as any[]) {
      const u = normalizeUnitName(r.category || "Uncategorized"); unitOfArticle.set(r.id, u);
      if (r.updated_at && Date.parse(r.updated_at) > Date.now() - 7 * 86_400_000) freshByUnit.set(u, (freshByUnit.get(u) || 0) + 1);
    }
    for (const r of (readRows || []) as any[]) { const u = unitOfArticle.get(r.resource_id); if (u) readByUnit.set(u, (readByUnit.get(u) || 0) + 1); }
    const madeThisWeek = new Map<number, number>();   // exams already written this week, by year
    const yearOfUnit = (u: string) => Number(/Year\s*(\d)/i.exec(u)?.[1]) || 0;
    for (const p of (past || []) as any[]) if (Date.parse(p.created_at) > weekAgo) { const y = yearOfUnit(String(p.category)); madeThisWeek.set(y, (madeThisWeek.get(y) || 0) + 1); }
    const wantYear = Number(body?.year) || 0, wantUnit = body?.unit ? String(body.unit).toLowerCase() : "", force = body?.force === true;
    const yearOf = (u: string) => Number(/Year\s*(\d)/i.exec(u)?.[1]) || 0;
    const wrongText = ((wrongAnswers as any[]) || []).map((a: any) => String(a.question_text || "").toLowerCase());
    const score = (u: string) => {
      const material = (setIds.get(u)?.length || 0) + (artIds.get(u)?.length || 0);
      const words = u.toLowerCase().replace(/year\s*\d\s*:/, "").split(/[^a-z]+/).filter((w) => w.length > 4);
      const weak = words.length ? wrongText.filter((t) => words.some((w) => t.includes(w))).length : 0;
      const waitedDays = Math.min(400, (Date.now() - (lastExam.get(u) ?? 0)) / 86_400_000);
      return (yearOf(u) === 4 ? 40 : 0) /* the owner's year: its rotation exams come first */ + waitedDays + Math.min(material, 60) / 6 + Math.min(weak, 30) * 0.7 + Math.min(freshByUnit.get(u) || 0, 10) * 4 + Math.min(readByUnit.get(u) || 0, 40) * 1.5;
    };
    const ranked = [...new Set([...setIds.keys(), ...artIds.keys()])]
      .filter((u) => (setIds.get(u)?.length || 0) + (artIds.get(u)?.length || 0) >= 3 && (force || (lastExam.get(u) ?? 0) < weekAgo)
        && (!wantYear || yearOf(u) === wantYear) && (!wantUnit || u.toLowerCase().includes(wantUnit)))
      .sort((x, y) => score(y) - score(x));
    // every year that has material gets an exam before any year gets a second one; inside a year the highest score goes first
    const units: string[] = [], made = new Map(madeThisWeek), pool = [...ranked];
    while (units.length < maxUnits && pool.length) {
      pool.sort((x, y) => (made.get(yearOf(x)) || 0) - (made.get(yearOf(y)) || 0) || score(y) - score(x));
      const next = pool.shift()!; units.push(next); made.set(yearOf(next), (made.get(yearOf(next)) || 0) + 1);
    }
    const byUnit = new Map<string, string[]>();
    for (const unit of units) {
      const arr: string[] = []; byUnit.set(unit, arr);
      // notes first, newest edits at the top (what this week's students read), then a sample of the existing questions
      const { data: arts } = await supabase.from("articles").select("title, content, updated_at").in("id", (artIds.get(unit) || []).slice(0, 40));
      (arts || []).sort((x: any, y: any) => Date.parse(y.updated_at || 0) - Date.parse(x.updated_at || 0)).slice(0, 25).forEach((article: any) => arr.push(`[Article] ${article.title}: ${(article.content || "").slice(0, 300)}`));
      const { data: sets } = await supabase.from("mcq_sets").select("title, questions").in("id", (setIds.get(unit) || []).slice(0, 40));
      (sets || []).forEach((set: any) => (Array.isArray(set.questions) ? set.questions : []).slice(0, 12).forEach((q: any) => arr.push(`[MCQ] ${q?.question || ""}`)));
    }

    const weakTopics = ((wrongAnswers as any[]) || []).map((a: any) => a.question_text).filter(Boolean).slice(0, 80);
    const examPassword = passwordSetting?.value || "";
    const now = new Date();
    const dateText = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const createdExams: any[] = [];
    const skipped: string[] = [];

    for (const [unit, snippets] of byUnit.entries()) {
      if (snippets.length === 0) continue;

      const context = snippets.slice(0, 30).join("\n");
      const weakForUnit = weakTopics.filter((q) => q.toLowerCase().includes(unit.toLowerCase())).slice(0, 20);
      const weakBlock = weakForUnit.length ? `\nPrioritize weak topics:\n${weakForUnit.join("\n")}` : "";

      const mcqPrompt = `Create exactly 35 hard MCQs for a ${unit} weekly medical exam for students who must UNDERSTAND the subject, not cram.\n\nQuestion style (follow strictly):\n- At least 24 of the questions are short clinical or applied scenarios (a patient, a lab result, an experiment, a drug given) that need two-step reasoning: first work out what is going on, then answer a question about mechanism, next step, consequence or the best explanation. The rest test an uncommon but important detail or a "why" that can only be answered by understanding.\n- Do NOT write plain recall questions such as "Which of the following is a feature of X?" or "X is caused by?".\n- Exactly FIVE options per question. Every wrong option must be a real, closely related entity or statement that a half-prepared student would be tempted by. No joke options, no "all of the above" or "none of the above".\n- All five options must have the same grammatical form and nearly the same length (within 20 percent). The correct option must NOT be the longest, the shortest, the most detailed or the most hedged one, and it must not be the only one containing a qualifier. Do not reuse a key word from the question stem only in the correct option.\n- Put the correct answer at any position. Vary it freely: never put it in the same position twice in a row.\n- Cover many different topics from the context; no two questions may test the same fact.\n\nContent context:\n${context}${weakBlock}\n\nReturn ONLY valid JSON array with schema: {"question":"...","options":["...","...","...","...","..."],"correct_answer":0,"explanation":"..."}`;
      // 30 questions with one-sentence explanations fit the writer's output limit; an answer that comes back short is tried once more, and a unit that still has fewer than 15 is skipped
      const compact = `${mcqPrompt.replace("exactly 35", "exactly 30")}\n\nKeep every explanation to ONE sentence of at most 25 words. All five options must be about the same length and style, and the correct answer must NOT be the longest or the most detailed one. Make the wrong options plausible, and vary which letter is correct.`;
      // Only questions that an independent reviewer answered the same way make it into the exam. Up to three batches are written until there are enough.
      let examMcqs: ReturnType<typeof parseMcqs> = [], lastErr = "", reviewedDropped = 0;
      const seenQ = new Set<string>(), started = Date.now();
      for (let attempt = 0; attempt < 3 && examMcqs.length < 34 && Date.now() - started < 240_000; attempt++) {
        try {
          const batch = parseMcqs(await generateWithFallback(compact));
          if (batch.length < 8) { lastErr = `batch ${attempt + 1} had only ${batch.length} usable questions`; continue; }
          const r = await reviewQuestions(batch, true);
          reviewedDropped += r.dropped;
          for (const q of r.kept) { const key = q.question.toLowerCase().replace(/\W+/g, " ").slice(0, 70); if (!seenQ.has(key) && examMcqs.length < 36) { seenQ.add(key); examMcqs.push(q); } }
        } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
      }
      // a right answer that is clearly longer or shorter than the wrong ones gives itself away: leave those out while at least 26 remain
      const cue = (q: { options: string[]; correct_answer: number }) => { const L = q.options.map((o) => o.length); const w = L.filter((_, i) => i !== q.correct_answer); return L[q.correct_answer] / Math.max(1, w.reduce((a, b) => a + b, 0) / w.length); };
      const fair = examMcqs.filter((q) => { const c = cue(q); return c <= 1.25 && c >= 0.75; });
      const cueDropped = examMcqs.length - fair.length;
      examMcqs = (fair.length >= 26 ? fair : examMcqs).slice(0, 30);
      const reviewNote = `${reviewedDropped} dropped by the reviewer, ${cueDropped} left out for length cues, ${examMcqs.length} kept`;
      if (examMcqs.length < 20) { skipped.push(`${unit}: ${lastErr || `only ${examMcqs.length} questions passed the reviewer`}`); continue; }
      // one even, shuffled deal of answer letters for the whole paper. (The old planner also banned a repeated or neighbouring letter, which let a
      // student rule out up to three of four letters from the previous answer.)
      examMcqs = placeNewQuestions(examMcqs);

      const essayPrompt = `Create written exam section for ${unit}. Return ONLY valid JSON:\n{"saqs":[{"question":"...","model_answer":"...","marks":5}],"laqs":[{"question":"...","model_answer":"...","marks":20}]}\n\nRules:\n- exactly 4 SAQs with 5 marks each (Section B) and exactly 1 LAQ with 20 marks (Section C)\n- every question needs reasoning, not recall: a short case or a "explain why" that needs application of the mechanism, a comparison, or a justified plan\n- every model answer is structured, with the number of points matched to the marks (about one point per mark); keep each SAQ answer under 90 words and the LAQ answer under 260 words so the JSON is never cut off\n- the LAQ must cover a broad, high-yield area of the unit and ask for causes, pathophysiology/mechanism, features and management or consequences`;
      let { saqs, laqs } = parseEssays(await generateWithFallback(essayPrompt, 80000).catch(() => ""));
      if (!saqs.length || !laqs.length) { const again = parseEssays(await generateWithFallback(essayPrompt, 80000).catch(() => "")); if (again.saqs.length + again.laqs.length > saqs.length + laqs.length) ({ saqs, laqs } = again); }

      const examTitle = `Weekly ${unit} Exam - ${dateText}`;

      const { data: inserted, error: insertError } = await supabase
        .from("mcq_sets")
        .insert({
          title: `${examTitle} (Section A: MCQs)`,
          slug: `${`${examTitle} section a mcqs`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70)}-${Math.random().toString(16).slice(2, 10)}`,
          questions: examMcqs,
          published: true,
          original_notes: JSON.stringify({ type: "weekly_exam", unit, saqs, laqs, generated_at: now.toISOString(), reviewed: true }),
          category: `Weekly Exam: ${unit}`,
          access_password: examPassword,
        })
        .select("id, title")
        .single();

      if (insertError) {
        console.error("Failed to insert exam for unit", unit, insertError.message); skipped.push(`${unit}: ${insertError.message}`);
        continue;
      }

      await supabase.from("essays").insert({
        title: `${examTitle} (Sections B & C)` ,
        category: `Weekly Exam: ${unit}`,
        short_answer_questions: saqs,
        long_answer_questions: laqs,
        published: true,
        article_id: null,
      });

      createdExams.push({ review: reviewNote, unit, exam_id: inserted.id, title: inserted.title, mcq_count: examMcqs.length, saq_count: saqs.length, laq_count: laqs.length });
    }

    return new Response(JSON.stringify({ success: true, unit_count: createdExams.length, exams: createdExams, skipped, tried: units, last: Object.fromEntries([...lastExam].slice(0, 6)) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Exam generation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
