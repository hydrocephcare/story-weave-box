// Model answers for the dental past papers. Each call takes one paper's next few unanswered questions and writes marks-sized point answers.
// Runs from cron in small batches so the free AI limits are never hit; uses its own key (PAPERS_GROQ_KEY) and falls back to a second model when one is rate-limited.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You write model answers for university exam questions for Kenyan dental, oral health, public health and allied health students. Return ONLY JSON: {"answers":[{"id":"<id>","answer":"..."}]} with one entry per question.
Rules:
- Point format: short lines that each start with "- ". Group with a bold lead-in where it helps (for example "**Causes**"). No long paragraphs.
- Size to the marks: about 1 point per mark (2 marks = 2 points, 5 marks = 5 to 6 points, 10 marks = 10 to 12, 20 marks = 16 to 20). If marks are not shown, give 5 to 8 points.
- If the question asks for a number of items (for example "list four ..."), give exactly that many first, then add a final line "**More answers:**" with the other acceptable points.
- Questions with lettered parts: answer each part under its letter, e.g. "**a)**".
- Multiple choice questions: give the correct letter and a one-line reason.
- "Draw a labelled diagram": describe what the diagram shows and list the labels to include.
- Calculations: show the working briefly. Use standard textbook facts only. Never invent figures, doses or references you are not sure of.`;

const MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];

async function ask(key: string, model: string, user: string) {
  const body: Record<string, unknown> = { model, temperature: 0.3, max_tokens: 7000, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] };
  if (model.includes("gpt-oss")) body.reasoning_effort = "low";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(110000) });
  if (!r.ok) throw new Error(`${model} ${r.status}`);
  const t = (await r.json()).choices?.[0]?.message?.content || "";
  const v = JSON.parse(t);
  return Array.isArray(v.answers) ? v.answers : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const cron = Deno.env.get("CRON_KEY");
    if (!cron || req.headers.get("x-cron-key") !== cron) return json({ error: "Not allowed." }, 403);
    const key = Deno.env.get("PAPERS_GROQ_KEY");
    if (!key) return json({ error: "No key set." }, 500);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: first } = await sb.from("paper_answers").select("slug").is("answer", null).lt("tries", 4).order("slug").order("idx").limit(1);
    if (!first?.length) return json({ success: true, status: "all answered" });
    const slug = first[0].slug;
    const { data: rows } = await sb.from("paper_answers").select("qkey, unit, marks, question").eq("slug", slug).is("answer", null).lt("tries", 4).order("idx").limit(5);
    if (!rows?.length) return json({ success: true, status: "none" });
    const prompt = `UNIT: ${rows[0].unit}\n\n` + rows.map((r) => `ID ${r.qkey}${r.marks ? ` (${r.marks} marks)` : ""}:\n${r.question}`).join("\n\n");
    let answers: { id: string; answer: string }[] = [], err = "";
    for (const m of MODELS) { try { answers = await ask(key, m, prompt); if (answers.length) break; } catch (e) { err = e instanceof Error ? e.message : String(e); } }
    const good = new Map(answers.filter((a) => a && typeof a.answer === "string" && a.answer.trim().length > 15).map((a) => [String(a.id), a.answer.trim()]));
    let saved = 0;
    for (const r of rows) {
      const a = good.get(r.qkey);
      if (a) { await sb.from("paper_answers").update({ answer: a, answered_at: new Date().toISOString() }).eq("slug", slug).eq("qkey", r.qkey); saved++; }
      else if (!err) await sb.rpc("paper_answer_miss", { _slug: slug, _qkey: r.qkey });
    }
    return json({ success: true, slug, saved, of: rows.length, ...(err && !saved ? { limited: err } : {}) });
  } catch (e) { return json({ success: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }, 500); }
});
