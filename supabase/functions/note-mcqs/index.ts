// Writes a short MCQ bank from one study note (the note students are reading), so every year has questions that match the notes.
// Called by the schedule (x-cron-key) or by a signed-in administrator. One note per call. The question doctor checks the new bank afterwards.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You write single-best-answer multiple-choice questions for Kenyan medical students from ONE study note. Return ONLY a JSON array, no markdown.
Each item: {"question":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"..."}
Rules:
- Use only facts that are in the note. Never invent doses, numbers or criteria.
- Test understanding (mechanism, diagnosis, next best step, key feature), not trivia. Prefer short clinical vignettes when the note allows.
- Exactly four options, one clearly best answer, the three wrong options plausible. All options about the same length; the correct one must NOT be the longest or most detailed. Spread the correct answer across positions 0 to 3.
- correct_answer is the 0-based index of the right option.
- The explanation is two sentences at most: why the answer is right and why the likeliest wrong option is not.
- No "all of the above" or "none of the above". Do not mention "the note" or "the text" in a question.`;

function parse(raw: string) {
  const start = raw.indexOf("[");
  if (start < 0) return [];
  const whole = raw.slice(start);
  let parsed: any = null;
  try { parsed = JSON.parse(whole.slice(0, whole.lastIndexOf("]") + 1)); } catch {
    let end = whole.length;
    for (let tries = 0; tries < 60 && parsed === null; tries++) {
      const cut = whole.lastIndexOf("}", end - 1);
      if (cut < 0) break;
      try { parsed = JSON.parse(whole.slice(0, cut + 1) + "]"); } catch { end = cut; }
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((q: any) => q?.question && Array.isArray(q?.options) && q.options.length >= 4 && Number.isInteger(q.correct_answer) && q.correct_answer >= 0 && q.correct_answer <= 3)
    .map((q: any) => ({
      question: String(q.question).trim(),
      options: q.options.slice(0, 4).map((o: any) => String(o).trim()),
      correct_answer: q.correct_answer,
      explanation: q.explanation ? String(q.explanation).trim() : "",
    }))
    .filter((q: any) => q.options.every((o: string) => o.length > 0) && new Set(q.options.map((o: string) => o.toLowerCase())).size === 4 && !/all of the above|none of the above/i.test(q.options.join(" ")));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cronOk = !!Deno.env.get("CRON_KEY") && req.headers.get("x-cron-key") === Deno.env.get("CRON_KEY");
    if (!cronOk) {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = token ? await supabase.auth.getUser(token) : { data: null };
      const { data: ok } = u?.user ? await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" }) : { data: false };
      if (!ok) return json({ error: "Administrators only." }, 403);
    }
    const body = await req.json().catch(() => ({}));
    const { data: ids } = await supabase.rpc("note_mcq_candidates", { n: 1 });
    const id = body?.article_id || (Array.isArray(ids) ? (ids[0]?.id ?? ids[0]) : null);
    if (!id) return json({ success: true, done: true });
    const { data: a, error } = await supabase.from("articles").select("id, title, category, content").eq("id", id).single();
    if (error || !a) return json({ error: error?.message || "not found" }, 500);

    const text = String(a.content).replace(/\r\n/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 9000);
    const count = text.length > 6000 ? 12 : text.length > 3500 ? 10 : 8;
    let questions: ReturnType<typeof parse> = [];
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && questions.length < Math.min(6, count); attempt++) {
      try {
        const raw = await chatText(Deno.env.toObject(), [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Write exactly ${count} questions from this note.\nTITLE: ${a.title}\nSUBJECT: ${a.category}\n\n${text}` },
        ], { temperature: 0.4, maxTokens: 4000, timeoutMs: 60000 });
        const got = parse(raw);
        if (got.length > questions.length) questions = got;
      } catch (e) { lastErr = e instanceof Error ? e.message.slice(0, 120) : String(e); }
    }
    if (questions.length < 6) {
      // remember the miss so the same note is not retried every minute: an unpublished placeholder keeps it out of the queue
      await supabase.from("mcq_sets").insert({ title: `${a.title} (questions pending)`, category: a.category, questions: [], published: false, source_reference: a.id, source_type: "note_generated", original_notes: JSON.stringify({ failed: lastErr || "too few usable questions", at: new Date().toISOString() }) });
      return json({ success: true, title: a.title, status: "skipped", why: lastErr || `only ${questions.length} usable` });
    }
    const { error: insErr } = await supabase.from("mcq_sets").insert({
      title: `${String(a.title).slice(0, 80)}: MCQs`,
      category: a.category,
      questions,
      published: true,
      source_reference: a.id,
      source_type: "note_generated",
      meta_description: `${questions.length} practice MCQs with explanations on ${String(a.title).slice(0, 70)}, written from the Ompath Study notes.`,
      original_notes: JSON.stringify({ type: "note_mcqs", article_id: a.id, generated_at: new Date().toISOString() }),
    });
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ success: true, title: a.title, questions: questions.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
