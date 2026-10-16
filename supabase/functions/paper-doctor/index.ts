// The "paper doctor": goes through written papers (short-answer / long-answer / essay style notes), asks the AI for a tidier version of each, and queues
// the proposal in paper_fixes. Nothing on the site changes until an administrator approves it in /admin/paper-fixes.
// Called by the schedule (x-cron-key) or by a signed-in administrator. One paper per call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You tidy written exam papers for a free medical study website used by Kenyan medical students.
You are given one page.

Rules:
- Keep EVERY medical fact, number and model answer the author wrote. Never change a fact. Do not add doses or numbers you are not certain of.
- The page format is: a line "Question N", then the question, then lettered parts on their own lines like "A. Interpret the results. (4 marks)", then a blank line, then "Answer:" followed by the model answer, with each part's answer starting on its own line with the same letter ("A. ...", "B. ...").
- If the question text is only a topic fragment such as "Liver function tests." turn it into a complete instruction such as "Discuss liver function tests." or "Write short notes on liver function tests." If it is already a full question, leave it alone.
- Make part letters and answer letters consistent (A. B. C., never a mix of A. and (b)). Put marks in brackets at the end of each part, only where the author gave them.
- If a part has no model answer, write a short accurate textbook answer and say so in "issues". If you are not sure of a fact, say "Check your textbook for ..." instead of guessing.
- If the title or description calls the page an "MCQ Bank" but the questions are written (short or long answer), correct the title and description to say so (for example "Short Answer Questions"). Titles stay under 70 characters, the description is 120 to 155 characters of plain English.
- If a page is a true multiple-choice bank, or is already clean and consistent, answer with the single line NO_CHANGE and nothing else.

Otherwise answer in exactly this layout (no JSON, no code fences):
===ISSUES===
- one short line per thing you changed
===TITLE===
the corrected title
===DESCRIPTION===
the corrected description
===CONTENT===
the COMPLETE corrected page in the same markdown, every question included`;

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
    const { data: ids } = await supabase.rpc("paper_candidates", { n: 1 });
    const id = body?.article_id || (Array.isArray(ids) ? ids[0] : null);
    if (!id) return json({ success: true, done: true });
    const { data: a, error } = await supabase.from("articles").select("id, title, category, content, meta_description").eq("id", id).single();
    if (error || !a) return json({ error: error?.message || "not found" }, 500);

    const log = (status: string, extra: Record<string, unknown> = {}) => supabase.from("paper_fixes").upsert({ article_id: a.id, status, old_title: a.title, ...extra }, { onConflict: "article_id" });
    let raw = "";
    try {
      raw = await chatText(Deno.env.toObject(), [
        { role: "system", content: SYSTEM },
        { role: "user", content: `TITLE: ${a.title}\nCATEGORY: ${a.category}\nDESCRIPTION: ${a.meta_description || ""}\n\nPAGE:\n${a.content}` },
      ], { temperature: 0.2, maxTokens: 8000, timeoutMs: 100000 });
    } catch (e) { await log("skipped", { issues: [`AI unavailable: ${e instanceof Error ? e.message.slice(0, 120) : e}`] }); return json({ success: true, title: a.title, status: "skipped" }); }

    const part = (name: string) => {
      const start = raw.indexOf(`===${name}===`);
      if (start < 0) return "";
      const from = start + name.length + 6, next = raw.indexOf("\n===", from);
      return raw.slice(from, next < 0 ? undefined : next).trim();
    };
    if (/^\s*NO_CHANGE/i.test(raw) || !raw.includes("===CONTENT===")) { await log("clean", { issues: [] }); return json({ success: true, title: a.title, status: "clean" }); }
    const out = { issues: part("ISSUES").split("\n").map((x) => x.replace(/^[-*\s]+/, "").trim()).filter(Boolean), title: part("TITLE"), description: part("DESCRIPTION"), content: part("CONTENT").replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "") };
    const content = out.content;
    const count = (s: string) => (s.match(/^\s*(?:#+\s*)?Question\s+\d+/gim) || []).length;
    // refuse a proposal that lost questions or came back cut short
    if (content.length < a.content.length * 0.75 || count(content) < count(a.content)) {
      await log("skipped", { issues: ["The AI's rewrite came back incomplete, so it was not used."] });
      return json({ success: true, title: a.title, status: "skipped" });
    }
    await log("pending", {
      issues: out.issues.map((x) => x.slice(0, 200)).slice(0, 20),
      new_title: out.title ? String(out.title).slice(0, 120) : a.title,
      new_description: out.description ? String(out.description).slice(0, 200) : a.meta_description,
      old_content: a.content, new_content: content,
    });
    return json({ success: true, title: a.title, status: "pending", issues: out.issues.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
