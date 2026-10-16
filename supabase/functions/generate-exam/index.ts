import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

async function generateWithFallback(prompt: string): Promise<string> {
  return await chatText(Deno.env.toObject(), [
    { role: "system", content: "You are a senior medical exam writer. Return ONLY valid JSON, no markdown or code blocks." },
    { role: "user", content: prompt },
  ], { temperature: 0.4, maxTokens: 8000, timeoutMs: 40000 });
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
        options: q.options.slice(0, 4).map((o: any) => String(o).trim()),
        correct_answer: Number.isInteger(q.correct_answer) ? Math.min(Math.max(q.correct_answer, 0), 3) : 0,
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
    const maxUnits = Math.max(1, Math.min(8, Number(body?.units) || 3));   // a run finishes inside the function's time limit; the next run continues with the units still waiting

    // 1. which units exist (ids and categories only: tiny), 2. which have had an exam most recently, 3. read the content of the ones that are due
    const [{ data: setRows }, { data: artRows }, { data: past }] = await Promise.all([
      supabase.from("mcq_sets").select("id, category").eq("published", true).is("deleted_at", null),
      supabase.from("articles").select("id, category").eq("published", true).is("deleted_at", null),
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
    const units = [...new Set([...setIds.keys(), ...artIds.keys()])]
      .filter((u) => (setIds.get(u)?.length || 0) + (artIds.get(u)?.length || 0) >= 3 && (lastExam.get(u) ?? 0) < weekAgo)   // enough material, and no exam in the past 6 days
      .sort((x, y) => (lastExam.get(x) ?? 0) - (lastExam.get(y) ?? 0))                                                       // never-examined units first, then the longest wait
      .slice(0, maxUnits);

    const [{ data: wrongAnswers }, { data: passwordSetting }] = await Promise.all([
      supabase.from("user_answers").select("question_text").eq("is_correct", false).order("created_at", { ascending: false }).limit(300),
      supabase.from("app_settings").select("value").eq("key", "exam_password").maybeSingle(),
    ]);
    const byUnit = new Map<string, string[]>();
    for (const unit of units) {
      const arr: string[] = []; byUnit.set(unit, arr);
      const { data: sets } = await supabase.from("mcq_sets").select("title, questions").in("id", (setIds.get(unit) || []).slice(0, 40));
      (sets || []).forEach((set: any) => (Array.isArray(set.questions) ? set.questions : []).slice(0, 12).forEach((q: any) => arr.push(`[MCQ] ${q?.question || ""}`)));
      const { data: arts } = await supabase.from("articles").select("title, content").in("id", (artIds.get(unit) || []).slice(0, 25));
      (arts || []).forEach((article: any) => arr.push(`[Article] ${article.title}: ${(article.content || "").slice(0, 500)}`));
    }

    const weakTopics = ((wrongAnswers as any[]) || []).map((a: any) => a.question_text).filter(Boolean).slice(0, 80);
    const examPassword = passwordSetting?.value || "";
    const now = new Date();
    const dateText = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const createdExams: any[] = [];
    const skipped: string[] = [];

    for (const [unit, snippets] of byUnit.entries()) {
      if (snippets.length === 0) continue;

      const context = snippets.slice(0, 80).join("\n");
      const weakForUnit = weakTopics.filter((q) => q.toLowerCase().includes(unit.toLowerCase())).slice(0, 20);
      const weakBlock = weakForUnit.length ? `\nPrioritize weak topics:\n${weakForUnit.join("\n")}` : "";

      const mcqPrompt = `Create exactly 35 high-quality MCQs for a ${unit} weekly medical exam.\n\nContent context:\n${context}${weakBlock}\n\nReturn ONLY valid JSON array with schema: {"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}`;
      let mcqText = "";
      try { mcqText = await generateWithFallback(mcqPrompt); } catch (e) { skipped.push(`${unit}: ${e instanceof Error ? e.message : e}`); continue; }
      const examMcqs = parseMcqs(mcqText);
      if (examMcqs.length === 0) { skipped.push(`${unit}: the writer gave no usable questions (${mcqText.length} characters: ${mcqText.slice(0, 160).replace(/\s+/g, " ")})`); continue; }

      const essayPrompt = `Create written exam section for ${unit}. Return ONLY valid JSON:\n{"saqs":[{"question":"...","model_answer":"...","marks":5}],"laqs":[{"question":"...","model_answer":"...","marks":20}]}\n\nRules:\n- exactly 4 SAQs with 5 marks each\n- exactly 1 LAQ with 20 marks`;
      const essayText = await generateWithFallback(essayPrompt).catch(() => "");
      const { saqs, laqs } = parseEssays(essayText);

      const examTitle = `Weekly ${unit} Exam - ${dateText}`;

      const { data: inserted, error: insertError } = await supabase
        .from("mcq_sets")
        .insert({
          title: `${examTitle} (Section A: MCQs)`,
          questions: examMcqs,
          published: true,
          original_notes: JSON.stringify({ type: "weekly_exam", unit, saqs, laqs, generated_at: now.toISOString() }),
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

      createdExams.push({ unit, exam_id: inserted.id, title: inserted.title, mcq_count: examMcqs.length, saq_count: saqs.length, laq_count: laqs.length });
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
