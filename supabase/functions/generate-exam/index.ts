import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callOmniRoute, omniRouteConfig } from "../_shared/omniroute.ts";

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

async function callGeminiFallback(prompt: string): Promise<string> {
  // Prefer the OmniRoute combo (free providers) when configured; fall back to Gemini keys.
  const omni = omniRouteConfig();
  if (omni) {
    try {
      return await callOmniRoute(omni, {
        messages: [
          { role: "system", content: "You are a senior medical exam writer. Return ONLY valid JSON, no markdown or code blocks." },
          { role: "user", content: prompt },
        ],
      });
    } catch (e: any) {
      console.log("OmniRoute unavailable, falling back to Gemini:", e?.message || String(e));
    }
  }

  const keys: string[] = [];
  for (const name of ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4", "GEMINI_API_KEY_5"]) {
    const v = Deno.env.get(name);
    if (v && !keys.includes(v)) keys.push(v);
  }
  if (keys.length === 0) throw new Error("No GEMINI_API_KEY configured");

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"];
  for (const apiKey of keys) {
    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `You are a senior medical exam writer. Return ONLY valid JSON, no markdown or code blocks.\n\n${prompt}` }] }],
            }),
          }
        );
        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) return text;
        }
        if (response.status === 429) continue;
      } catch (e) {
        console.error(`Gemini ${model} key ...${apiKey.slice(-4)} failed:`, e);
      }
    }
  }
  throw new Error("All Gemini keys/models exhausted");
}

async function generateWithFallback(prompt: string): Promise<string> {
  return await callGeminiFallback(prompt);
}

function parseMcqs(raw: string) {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
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

    const [{ data: mcqSets }, { data: articles }, { data: wrongAnswers }, { data: passwordSetting }] = await Promise.all([
      supabase.from("mcq_sets").select("title, questions, category").eq("published", true),
      supabase.from("articles").select("title, content, category").eq("published", true),
      supabase.from("user_answers").select("question_text").eq("is_correct", false).order("created_at", { ascending: false }).limit(300),
      supabase.from("app_settings").select("value").eq("key", "exam_password").maybeSingle(),
    ]);

    if ((!mcqSets || mcqSets.length === 0) && (!articles || articles.length === 0)) {
      return new Response(JSON.stringify({ error: "No published content to generate exam from" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const byUnit = new Map<string, string[]>();

    (mcqSets || []).forEach((set: any) => {
      const unit = normalizeUnitName(set.category || "Uncategorized");
      if (unit === "Weekly Exam" || unit === "Uncategorized") return;
      if (!byUnit.has(unit)) byUnit.set(unit, []);
      const arr = byUnit.get(unit)!;
      const qs = Array.isArray(set.questions) ? set.questions : [];
      qs.slice(0, 12).forEach((q: any) => arr.push(`[MCQ] ${q?.question || ""}`));
    });

    (articles || []).forEach((article: any) => {
      const unit = normalizeUnitName(article.category || "Uncategorized");
      if (unit === "Weekly Exam" || unit === "Uncategorized") return;
      if (!byUnit.has(unit)) byUnit.set(unit, []);
      byUnit.get(unit)!.push(`[Article] ${article.title}: ${(article.content || "").slice(0, 500)}`);
    });

    const weakTopics = (wrongAnswers || []).map((a: any) => a.question_text).filter(Boolean).slice(0, 80);
    const examPassword = passwordSetting?.value || "";
    const now = new Date();
    const dateText = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const createdExams: any[] = [];

    for (const [unit, snippets] of byUnit.entries()) {
      if (snippets.length === 0) continue;

      const context = snippets.slice(0, 80).join("\n");
      const weakForUnit = weakTopics.filter((q) => q.toLowerCase().includes(unit.toLowerCase())).slice(0, 20);
      const weakBlock = weakForUnit.length ? `\nPrioritize weak topics:\n${weakForUnit.join("\n")}` : "";

      const mcqPrompt = `Create exactly 35 high-quality MCQs for a ${unit} weekly medical exam.\n\nContent context:\n${context}${weakBlock}\n\nReturn ONLY valid JSON array with schema: {"question":"...","options":["A","B","C","D"],"correct_answer":0,"explanation":"..."}`;
      const mcqText = await generateWithFallback(mcqPrompt);
      const examMcqs = parseMcqs(mcqText);
      if (examMcqs.length === 0) continue;

      const essayPrompt = `Create written exam section for ${unit}. Return ONLY valid JSON:\n{"saqs":[{"question":"...","model_answer":"...","marks":5}],"laqs":[{"question":"...","model_answer":"...","marks":20}]}\n\nRules:\n- exactly 4 SAQs with 5 marks each\n- exactly 1 LAQ with 20 marks`;
      const essayText = await generateWithFallback(essayPrompt);
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
        console.error("Failed to insert exam for unit", unit, insertError.message);
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

    return new Response(JSON.stringify({ success: true, unit_count: createdExams.length, exams: createdExams }), {
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
