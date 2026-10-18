// The "paper doctor": goes through written papers (short-answer / long-answer / essay style notes), asks the AI for a tidier version of each, and queues
// the proposal in paper_fixes. Nothing on the site changes until an administrator approves it in /admin/paper-fixes.
// Called by the schedule (x-cron-key) or by a signed-in administrator. One section of one paper per call, so long papers take several calls.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatText } from "../_shared/aiChat.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

const SEG_MAX = 8000;
const QUESTION_LINE = /^\s*(?:#+\s*)?Question\s+\d+/i;

/** Cuts a long page into sections of about 11,000 characters, always at the start of a question. */
function sections(text: string): string[] {
  if (text.length <= SEG_MAX + 2000) return [text];
  const lines = text.split("\n"), out: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length >= SEG_MAX && QUESTION_LINE.test(line)) { out.push(cur); cur = ""; }
    else if (cur.length >= SEG_MAX * 1.5 && line.trim() === "") { out.push(cur); cur = ""; }
    cur += line + "\n";
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const countQuestions = (s: string) => s.split("\n").filter((l) => QUESTION_LINE.test(l)).length;

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

    const original = String(a.content).replace(/\r\n/g, "\n");
    const parts = sections(original);
    const { data: prev } = await supabase.from("paper_fixes").select("*").eq("article_id", a.id).maybeSingle();
    const resume = !body?.force && prev?.status === "working" && prev.pass >= 2 ? prev : null;   // a half-done run from the first pass starts again with the stricter instructions
    const seg = resume ? Math.min(resume.seg, parts.length - 1) : 0;
    const save = (status: string, extra: Record<string, unknown> = {}) => supabase.from("paper_fixes").upsert({ article_id: a.id, status, old_title: a.title, pass: 2, first_content: prev?.first_content ?? prev?.old_content ?? a.content, ...extra }, { onConflict: "article_id" });

    let raw = "";
    try {
      raw = await chatText(Deno.env.toObject(), [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${seg === 0 ? `TITLE: ${a.title}\nCATEGORY: ${a.category}\nDESCRIPTION: ${a.meta_description || ""}\n\n` : ""}${parts.length > 1 ? `SECTION ${seg + 1} OF ${parts.length}\n` : ""}PAGE:\n${parts[seg]}` },
      ], { temperature: 0.2, maxTokens: 4500, timeoutMs: 100000 });
    } catch (e) { await save("skipped", { issues: [`AI unavailable: ${e instanceof Error ? e.message.slice(0, 120) : e}`] }); return json({ success: true, title: a.title, status: "skipped" }); }

    const part = (name: string) => {
      const start = raw.indexOf(`===${name}===`);
      if (start < 0) return "";
      const from = start + name.length + 6, next = raw.indexOf("\n===", from);
      return raw.slice(from, next < 0 ? undefined : next).trim();
    };
    const unchanged = /^\s*NO_CHANGE/i.test(raw) || !raw.includes("===CONTENT===");
    let segText = parts[seg];
    let segIssues: string[] = [];
    if (!unchanged) {
      segText = part("CONTENT").replace(/^```(?:markdown)?\n?/, "").replace(/\n?```$/, "");
      segIssues = part("ISSUES").split("\n").map((x) => x.replace(/^[-*\s]+/, "").trim()).filter(Boolean).map((x) => x.slice(0, 200));
      // refuse a rewrite of this section that lost questions or came back cut short
      if (segText.length < parts[seg].length * 0.75 || countQuestions(segText) < countQuestions(parts[seg])) { segText = parts[seg]; segIssues = ["Part of the AI's rewrite came back incomplete, so that section was left as it is."]; }
    }

    const doneText = (resume?.new_content ? String(resume.new_content) : "") + (resume?.new_content ? "\n" : "") + segText.replace(/\n+$/, "");
    const issues = [...(resume?.issues || []), ...segIssues].slice(0, 30);
    const changed = !!resume?.changed || segText.trim() !== parts[seg].trim();
    const title = seg === 0 ? (part("TITLE") || a.title).slice(0, 120) : resume?.new_title || a.title;
    const description = seg === 0 ? (part("DESCRIPTION") || a.meta_description || "").slice(0, 200) : resume?.new_description || a.meta_description;

    if (seg + 1 < parts.length) {
      await save("working", { issues, seg: seg + 1, changed: changed || title !== a.title, new_title: title, new_description: description, new_content: doneText });
      return json({ success: true, title: a.title, status: "working", section: seg + 1, of: parts.length });
    }
    if (!changed && title === a.title && issues.length === 0) { await save("clean", { issues: [], seg: 0 }); return json({ success: true, title: a.title, status: "clean" }); }
    await save("pending", { issues, seg: 0, new_title: title, new_description: description, old_content: a.content, new_content: doneText });
    return json({ success: true, title: a.title, status: "pending", issues: issues.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
