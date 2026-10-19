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
    const env = Deno.env.toObject();

    /** One call to the writer: `count` questions from `text`, never repeating the stems in `avoid`. */
    const generate = async (a: { title: string; category: string }, text: string, count: number, avoid: string[] = []) => {
      const avoidBlock = avoid.length ? `\n\nDo NOT repeat or rephrase any of these existing questions:\n${avoid.slice(0, 40).map((q) => `- ${q.slice(0, 120)}`).join("\n")}` : "";
      let best: ReturnType<typeof parse> = [];
      let err = "";
      for (let attempt = 0; attempt < 2 && best.length < Math.min(count, Math.max(6, Math.floor(count * 0.7))); attempt++) {
        try {
          const raw = await chatText(env, [
            { role: "system", content: SYSTEM },
            { role: "user", content: `Write exactly ${count} questions from this note.\nTITLE: ${a.title}\nSUBJECT: ${a.category}\n\n${text}${avoidBlock}` },
          ], { temperature: 0.45, maxTokens: 4200, timeoutMs: 70000 });
          const got = parse(raw);
          if (got.length > best.length) best = got;
        } catch (e) { err = e instanceof Error ? e.message.slice(0, 120) : String(e); }
      }
      return { questions: best, err };
    };
    const clean = (t: string) => String(t).replace(/\r\n/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    // a bank is meant to hold about 30 questions: two calls (first half and second half of the note) when the note is long enough
    const plan = (len: number) => Math.max(12, Math.min(30, Math.round(len / 250)));
    const notAlreadyAsked = (qs: ReturnType<typeof parse>, have: string[]) => {
      const seen = new Set(have.map((q) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60)));
      return qs.filter((q) => { const k = q.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; });
    };

    // 1) a note with no bank yet gets a new bank
    const { data: ids } = body?.mode === "topup" ? { data: null } : await supabase.rpc("note_mcq_candidates", { n: 1 });
    const id = body?.article_id || (Array.isArray(ids) ? (ids[0]?.id ?? ids[0]) : null);
    if (id) {
      const { data: a, error } = await supabase.from("articles").select("id, title, category, content").eq("id", id).single();
      if (error || !a) return json({ error: error?.message || "not found" }, 500);
      const full = clean(a.content);
      const total = plan(Math.min(full.length, 12000));
      const halves = total > 16 ? [full.slice(0, 6000), full.slice(6000, 12000) || full.slice(0, 6000)] : [full.slice(0, 9000)];
      let questions: ReturnType<typeof parse> = [];
      let lastErr = "";
      for (const part of halves) {
        const r = await generate(a, part, Math.ceil(total / halves.length), questions.map((q) => q.question));
        lastErr = r.err || lastErr;
        questions = [...questions, ...notAlreadyAsked(r.questions, questions.map((q) => q.question))];
      }
      if (questions.length < 8) {
        // remember the miss so the same note is not retried every minute: an unpublished placeholder keeps it out of the queue
        await supabase.from("mcq_sets").insert({ title: `${a.title} (questions pending)`, category: a.category, questions: [], published: false, source_reference: a.id, source_type: "note_generated", original_notes: JSON.stringify({ failed: lastErr || "too few usable questions", at: new Date().toISOString() }) });
        return json({ success: true, title: a.title, status: "skipped", why: lastErr || `only ${questions.length} usable` });
      }
      const title = `${String(a.title).slice(0, 80)}: MCQs`;
      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70)}-${String(a.id).replace(/-/g, "").slice(0, 8)}`;
      const { error: insErr } = await supabase.from("mcq_sets").insert({
        title, slug, category: a.category, questions, published: true, source_reference: a.id, source_type: "note_generated",
        meta_description: `${questions.length} practice MCQs with explanations on ${String(a.title).slice(0, 70)}, written from the Ompath Study notes.`,
        original_notes: JSON.stringify({ type: "note_mcqs", article_id: a.id, generated_at: new Date().toISOString(), topped: questions.length >= 24 }),
      });
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ success: true, title: a.title, questions: questions.length });
    }

    // 2) no new notes waiting: top up an existing short bank towards 30 questions
    const { data: tops } = await supabase.rpc("note_mcq_topup_candidates", { n: 1 });
    const topId = body?.set_id || (Array.isArray(tops) ? (tops[0]?.id ?? tops[0]) : null);
    if (!topId) return json({ success: true, done: true });
    const { data: set } = await supabase.from("mcq_sets").select("id, title, category, questions, source_reference, original_notes").eq("id", topId).single();
    if (!set) return json({ error: "bank not found" }, 500);
    const mark = async (extra: Record<string, unknown>) => {
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(String(set.original_notes || "{}")); } catch { /* keep empty */ }
      await supabase.from("mcq_sets").update({ original_notes: JSON.stringify({ ...meta, topped: true, ...extra }) }).eq("id", set.id);
    };
    const { data: src } = await supabase.from("articles").select("title, category, content").eq("id", set.source_reference).maybeSingle();
    const have: any[] = Array.isArray(set.questions) ? set.questions : [];
    if (!src) { await mark({ topup_note: "source note missing" }); return json({ success: true, status: "no source" }); }
    const full = clean(src.content);
    const need = Math.max(0, Math.min(30, plan(Math.min(full.length, 12000))) - have.length);
    if (need < 4) { await mark({ topup_note: "note too short for more" }); return json({ success: true, title: set.title, status: "already enough" }); }
    // use the part of the note the first round probably used least: the second half when the bank is short, otherwise the whole note
    const part = full.length > 6000 ? full.slice(Math.floor(full.length * 0.35), Math.floor(full.length * 0.35) + 8000) : full;
    const r = await generate(src, part, Math.min(need, 18), have.map((q) => q.question));
    const extra = notAlreadyAsked(r.questions, have.map((q) => q.question));
    if (extra.length < 3) { await mark({ topup_note: r.err || "no new usable questions" }); return json({ success: true, title: set.title, status: "topup skipped" }); }
    const merged = [...have, ...extra].slice(0, 36);
    await supabase.from("mcq_sets").update({ questions: merged, meta_description: `${merged.length} practice MCQs with explanations on ${String(src.title).slice(0, 70)}, written from the Ompath Study notes.`, updated_at: new Date().toISOString() }).eq("id", set.id);
    await mark({ topup_note: `added ${extra.length}` });
    await supabase.from("mcq_review_log").delete().eq("set_id", set.id);   // the question doctor looks at the enlarged bank again
    return json({ success: true, title: set.title, status: "topped up", questions: merged.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
