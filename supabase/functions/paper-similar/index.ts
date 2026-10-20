// A practice paper "like this one": new questions in the style and spread of a past paper, with model answers. Written once per paper and kept, so each paper
// costs one AI call however many students ask. Only papers that exist in paper_answers can be asked for.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You write a NEW practice exam paper for Kenyan dental, oral health, public health and allied health students, in the style of the past paper shown. Return ONLY JSON:
{"questions":[{"n":1,"text":"...","marks":5,"answer":"..."}]}
Rules:
- Write the same number of questions as the past paper (at least 4, at most 8), covering the same unit and the topics the unit's other papers draw on, but with DIFFERENT wording and different angles. Never copy a past question.
- Each text is a full exam instruction ("Describe ...", "Outline ...", "State five ...", "Explain ..."), with the same mix of marks (2, 5, 10, 20) as the past paper. A question may have lettered parts written on new lines inside the text.
- answer: marks-sized point format: lines starting with "- ", grouped under bold lead-ins where it helps, about 1 point per mark. If the question asks for N items, give N then a final line "**More answers:**" with other acceptable points.
- Standard textbook facts only. Never invent figures or references. No backslash-n characters, use real line breaks.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { slug } = await req.json().catch(() => ({}));
    if (!slug || typeof slug !== "string") return json({ error: "Which paper?" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: have } = await sb.from("paper_similar").select("questions").eq("slug", slug).maybeSingle();
    if (have?.questions) return json({ questions: have.questions });
    const { data: mine } = await sb.from("paper_answers").select("unit, marks, question").eq("slug", slug).order("idx").limit(14);
    if (!mine?.length) return json({ error: "Unknown paper." }, 404);
    const unit = mine[0].unit;
    const { data: others } = await sb.from("paper_answers").select("question").eq("unit", unit).neq("slug", slug).limit(60);
    const sample = (others ?? []).sort(() => Math.random() - 0.5).slice(0, 14).map((r: any) => String(r.question).slice(0, 200));
    const key = Deno.env.get("PAPERS_GROQ_KEY");
    if (!key) return json({ error: "Not available right now." }, 503);
    const user = `UNIT: ${unit}\n\nTHIS PAST PAPER (${mine.length} questions):\n${mine.map((r: any) => `${r.marks ? `(${r.marks} marks) ` : ""}${String(r.question).slice(0, 300)}`).join("\n")}\n\nOTHER PAPERS OF THE SAME UNIT (for topic coverage):\n${sample.join("\n")}`;
    let questions: any[] = [];
    for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(100000),
          body: JSON.stringify({ model, temperature: 0.7, max_tokens: 7000, reasoning_effort: "low", response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }) });
        if (!r.ok) continue;
        const v = JSON.parse((await r.json()).choices?.[0]?.message?.content || "{}");
        questions = (Array.isArray(v.questions) ? v.questions : []).filter((q: any) => q && typeof q.text === "string" && typeof q.answer === "string" && q.text.length > 15)
          .map((q: any, i: number) => ({ n: i + 1, text: q.text.replace(/\\n/g, "\n").trim(), marks: Number(q.marks) || null, answer: q.answer.replace(/\\n/g, "\n").trim() })).slice(0, 8);
        if (questions.length >= 3) break;
      } catch { /* try the next model */ }
    }
    if (questions.length < 3) return json({ error: "Could not write one just now. Try again in a minute." }, 503);
    await sb.from("paper_similar").upsert({ slug, questions });
    return json({ questions });
  } catch { return json({ error: "Something went wrong." }, 500); }
});
