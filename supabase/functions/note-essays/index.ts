// Essays with model answers. First fills in model answers that are missing ("Model answer pending"), then writes a short set of essay questions
// (4 short-answer and 1 long-answer) with point-form model answers for any study note that has none. One job per call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";
import { cleanTopicTitle } from "../_shared/topicTitle.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const FILL = `You write model answers for medical exam essay questions for Kenyan medical students. Return ONLY a JSON array of strings, one model answer per question, in the same order.
Rules:
- Point format: short lines that each start with "- ". Group with a bold lead-in where it helps (for example "**Causes**"). No long paragraphs.
- Size to the marks: about 4 to 6 points for 5 marks, 10 to 14 points for 10 marks, up to 20 points for a long answer.
- Use the note provided when it covers the question; otherwise use standard medical teaching. Never invent doses or numbers you are not sure of.
- If a question is only a fragment, answer the most sensible full question it points to.`;

const WRITE = `You write essay questions with model answers for medical students from ONE study note. Return ONLY JSON:
{"saqs":[{"question":"...","answer":"...","marks":5}],"laqs":[{"question":"...","answer":"...","marks":20}]}
Rules:
- Exactly 4 short-answer questions (5 marks each) and 1 long-answer question (20 marks), all answerable from the note.
- Questions are full instructions ("Discuss ...", "List and explain ...", "Outline the management of ...").
- Answers are in point format: short lines each starting with "- ", grouped under bold lead-ins. 5 marks = 4 to 6 points; 20 marks = 14 to 20 points.
- Use only facts in the note. Never invent doses or numbers.`;

const arr = (raw: string) => { const s = raw.indexOf("["), e = raw.lastIndexOf("]"); if (s < 0 || e < s) return null; try { const v = JSON.parse(raw.slice(s, e + 1)); return Array.isArray(v) ? v : null; } catch { return null; } };
const obj = (raw: string) => { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s < 0 || e < s) return null; try { return JSON.parse(raw.slice(s, e + 1)); } catch { return null; } };
const pending = (a: unknown) => /^\s*(model answer pending|pending|tbd)?\s*$/i.test(String(a ?? ""));
const ansOf = (q: any) => q?.answer ?? q?.model_answer ?? "";

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
    const env = Deno.env.toObject();

    // 1) an essay set with missing model answers
    const { data: pend } = await supabase.rpc("essay_pending_candidates", { n: 1 });
    const pid = Array.isArray(pend) ? (pend[0]?.id ?? pend[0]) : null;
    if (pid) {
      const { data: e } = await supabase.from("essays").select("id, title, article_id, short_answer_questions, long_answer_questions").eq("id", pid).single();
      if (!e) return json({ error: "essay not found" }, 500);
      const sh: any[] = Array.isArray(e.short_answer_questions) ? e.short_answer_questions : [];
      const lg: any[] = Array.isArray(e.long_answer_questions) ? e.long_answer_questions : [];
      const all = [...sh.map((q, i) => ({ g: "s", i, q })), ...lg.map((q, i) => ({ g: "l", i, q }))].filter((x) => pending(ansOf(x.q))).slice(0, 12);
      let ctx = "";
      if (e.article_id) { const { data: a } = await supabase.from("articles").select("title, content").eq("id", e.article_id).maybeSingle(); if (a) ctx = `NOTE: ${a.title}\n${String(a.content).replace(/\r\n/g, "\n").slice(0, 5000)}\n\n`; }
      const list = all.map((x, k) => `${k + 1}. (${x.q.marks ?? (x.g === "l" ? 20 : 5)} marks) ${String(x.q.question).replace(/\*\*/g, "").slice(0, 300)}`).join("\n");
      let answers: any[] | null = null, err = "";
      for (let t = 0; t < 2 && !answers; t++) {
        try { const a = arr(await chatText(env, [{ role: "system", content: FILL }, { role: "user", content: `${ctx}QUESTIONS (${all.length}):\n${list}` }], { temperature: 0.3, maxTokens: 4200, timeoutMs: 80000 })); if (a && a.length >= all.length) answers = a; } catch (x) { err = x instanceof Error ? x.message.slice(0, 120) : String(x); }
      }
      if (!answers) return json({ success: true, status: "skipped", why: err || "answers not usable" });
      all.forEach((x, k) => { const txt = String(answers![k] ?? "").trim(); if (txt.length > 12) { (x.g === "s" ? sh : lg)[x.i] = { ...x.q, answer: txt, model_answer: txt }; } });
      await supabase.from("essays").update({ short_answer_questions: sh, long_answer_questions: lg, updated_at: new Date().toISOString() }).eq("id", e.id);
      return json({ success: true, status: "answers filled", title: e.title, filled: all.length });
    }

    // 2) a note with no essay questions yet
    const { data: ids } = await supabase.rpc("note_essay_candidates", { n: 1 });
    const id = (Array.isArray(ids) ? (ids[0]?.id ?? ids[0]) : null);
    if (!id) return json({ success: true, done: true });
    const { data: a } = await supabase.from("articles").select("id, title, category, content").eq("id", id).single();
    if (!a) return json({ error: "note not found" }, 500);
    const text = String(a.content).replace(/\r\n/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 9000);
    let out: any = null, err = "";
    for (let t = 0; t < 2 && !out; t++) {
      try { const o = obj(await chatText(env, [{ role: "system", content: WRITE }, { role: "user", content: `TITLE: ${a.title}\nSUBJECT: ${a.category}\n\n${text}` }], { temperature: 0.4, maxTokens: 4200, timeoutMs: 80000 })); if (o?.saqs?.length >= 3) out = o; } catch (x) { err = x instanceof Error ? x.message.slice(0, 120) : String(x); }
    }
    const fixQ = (q: any, marks: number) => ({ question: String(q.question).trim(), answer: String(q.answer ?? q.model_answer ?? "").trim(), model_answer: String(q.answer ?? q.model_answer ?? "").trim(), marks: Number(q.marks) || marks });
    const saqs = (out?.saqs || []).filter((q: any) => q?.question && (q.answer || q.model_answer)).map((q: any) => fixQ(q, 5)).slice(0, 5);
    const laqs = (out?.laqs || []).filter((q: any) => q?.question && (q.answer || q.model_answer)).map((q: any) => fixQ(q, 20)).slice(0, 2);
    if (saqs.length < 3) {
      await supabase.from("essays").insert({ title: `${a.title} (essay questions pending)`, category: a.category, article_id: a.id, short_answer_questions: [], long_answer_questions: [], published: false, meta_description: err || "too few usable questions" });
      return json({ success: true, status: "skipped", why: err || "too few usable questions" });
    }
    const title = `${cleanTopicTitle(a.title)}: Essay questions`;
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70)}-${String(a.id).replace(/-/g, "").slice(0, 8)}`;
    const { error: insErr } = await supabase.from("essays").insert({ title, slug, category: a.category, article_id: a.id, short_answer_questions: saqs, long_answer_questions: laqs, published: true, meta_description: `${saqs.length + laqs.length} essay questions with point-form model answers on ${String(a.title).slice(0, 70)}.` });
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ success: true, status: "created", title: a.title, saqs: saqs.length, laqs: laqs.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
