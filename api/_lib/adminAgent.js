// POST /api/ai?task=agent { message, history, context }: the admin assistant. It only PLANS: it returns { reply, actions } and the browser, with the admin's own
// login, runs the actions after the admin presses Yes. Requires a signed-in administrator (checked against Supabase with the caller's own token).
import { askJson } from "./llm.js";
const SUPABASE = "https://dekyjrfwvavtoivqivno.supabase.co";
const ANON = "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];

export async function isAdmin(token) {
  try {
    const u = await fetch(`${SUPABASE}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return false;
    const id = (await u.json())?.id;
    if (!id) return false;
    const r = await fetch(`${SUPABASE}/rest/v1/rpc/has_role`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ _user_id: id, _role: "admin" }) });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

const TOOLS = `Tools you can plan (use ONLY these; each action is {"tool": "...", "args": {...}}):
1. create_contest  args: { "title": string, "universities": "all" | [university slugs from the list, at least 2], "years": [1-6], "exam": string (words from a REAL exam title in the list; or "__none__" ONLY if the admin said to create it without questions for now), "start": "YYYY-MM-DDTHH:mm" (Nairobi time), "minutes": number (5-240), "autoAdmit": true|false }
2. delete_contest  args: { "slug": string }   (permanent: also deletes its registrations and results)
3. set_stage       args: { "slug": string, "stage": "concept" | "registration" | "live" | "completed" }
4. go_to           args: { "path": string }   (open an admin page; only paths from the list below)
5. set_autopilot_mode args: { "key": "approve_access" | "daily_digest", "mode": "off" | "ask" | "auto" }
6. run_autopilot   args: {}   (run the Autopilot jobs now)
7. seo_scan        args: {}   (read-only report of search-description and title problems across all posts; runs straight away)
8. seo_fix         args: { "limit": number }   (rewrites up to 15 weak or missing search descriptions; the old text is kept so it can be undone)
9. site_stats      args: { "days": number }   (read-only visitors summary)
10. contest_report args: { "slug": string }   (read-only: registrations per university for one contest)
11. publish_note   args: { "title": string (optional), "category": string (one from the category list, or ""), "year": 1-6 or null, "enrich": true|false }   (set "enrich": true when the admin says add more content / expand / make it fuller; otherwise false. Use this when the admin pastes or gives notes/text to polish and publish. The text itself is taken from their message: NEVER repeat it. The browser polishes it and shows a preview they approve.)
12. make_mcqs      args: { "count": 1-30, "from": "message" | "note", "title": string, "category": string }   (write MCQs from the text in their message, or from the note just polished ("note"); previewed before publishing)
13. create_flashcards args: { "count": 1-40, "from": "message" | "note", "title": string, "category": string }   (flashcards from the pasted text, or from the note just polished; previewed before publishing)
14. write_article  args: { "topic": string, "category": string, "year": 1-6 or null }   (write a NEW note from scratch on a topic; saved for review, previewed first)
15. find_content   args: { "query": string }   (read-only: search the site's posts by title; runs straight away)
16. clean_notifications args: { "days": number }   (clear the admin's own notification bell: mark all read, remove read ones older than days)
17. notification_report args: {}   (read-only: how the latest notifications and emails did, including failures)
18. send_notification args: { "title": string, "message": string, "link": string, "audience": "all_users" | "subscribers" | "study_year", "year": 1-6 or null }   (message students; always needs the admin's Yes)
19. remember       args: { "note": string }   (keep a preference or fact for future tasks, e.g. "Year 3 pathology notes go in the 'Year 3: General Pathology' category")
20. forget         args: { "match": string }   (remove remembered notes containing these words)
21b. check_questions args: {}   (the AI examiner re-answers question sets blind, flags answers that look wrong, removes broken questions, writes missing explanations; use for "check the questions", "are the answers right")
21a. generate_exam args: { "year": 1-6 or null, "unit": string (words from a unit name, optional), "count": 1-3 }   (writes new weekly exams from the notes and publishes them to the Exam Center; use for "make an exam for year 4", "generate this week's pathology exam")
21. site_health     args: {}   (read-only report: visitors and growth, content and SEO health, what is waiting; it offers one-tap fixes. Use for "how is the site", "is it growing", "check everything")
22. update_post     args: { "query": string (words from the post title), "title": string?, "meta_description": string?, "category": string? }   (change an existing post; the old values are kept so it can be undone)
23. publish_post    args: { "query": string (words from the draft title) }   (publish unpublished drafts whose title matches; max 5)
24. briefing        args: {}   (read-only: today's briefing: visitors, what to celebrate, what needs a look, suggestions)
25. import_mcqs    args: { "title": string, "category": string }   (the pasted text already CONTAINS MCQs (with or without answers): structure them exactly as written and publish them as an MCQ set; previewed first)
27. pending_summary args: {}   (read-only: how many written-paper changes, AI note drafts and disputed answers are waiting, and the state of the AI background jobs. Use for "what is pending", "how many drafts", "what is waiting for me")
28. approve_paper_fixes args: { "count": number | "all" }   (approve the AI paper doctor's pending changes to written papers; "approve all", "approve everything", "approve the 140" mean count "all")
29. approve_drafts args: { "count": number | "all" }   (publish pending AI note drafts from the "AI notes to approve" list)
30. job_control    args: { "job": "review-questions" | "paper-doctor" | "note-mcqs" | "weekly-exams", "action": "pause" | "resume" | "every", "minutes": 1-120 (only with "every") }   (steer the AI background jobs: the question checker, the paper doctor, the MCQ writer that builds banks from the notes (note-mcqs), the Friday exam writer; weekly-exams can only be paused or resumed)
31. set_subscriptions args: { "mode": "on" | "off" }   (switch the whole subscription system on, restoring the original prices, plans, Pro features and daily limits, or off so everything is free; use for "switch subscriptions back on", "make everything free")
26. none: no action, just answer or ask a question.
Admin pages (path = what it is): /admin = main admin; /admin/contests = contests; /admin/contests/new = quick contest builder; /admin/contests/setup = advanced contest setup; /admin/contests/appeals = contest appeals; /admin/autopilot = Autopilot switches and log; /admin/access = book access rules; /admin/analytics = visitors; /admin/activity = searches and AI keys; /admin/comments = comments; /admin/drafts = AI notes to approve; /admin/content-checks = content checks; /admin/content-health = content health; /admin/polish = polished blogs; /admin/duplicates = repeated pages; /admin/thin-topics = deep exam notes; /admin/monetise = monetise; /admin/tools = all admin tools.`;

const system = (ctx) => `You are the Ompath Study admin assistant. You help the site owner run the whole site: contests, notes, MCQs and exams, SEO, approvals and the AI background jobs. You never run anything yourself: you plan, the owner confirms, then the browser runs it.
Now (Nairobi time): ${ctx.now}.
${TOOLS}
Things the admin asked you to remember (use them): ${(ctx.memory || []).join(" | ") || "nothing yet"}.
Auto-run is ${ctx.autorun ? "ON: safe steps run without a confirm card, so never ask 'shall I go ahead' for them" : "OFF: every change is confirmed by the admin"}.
Note categories on the site: ${(ctx.categories || []).slice(0, 40).join(" | ")}
Universities (slug = name): ${(ctx.universities || []).map((u) => `${u.slug} = ${u.name}`).join("; ")}
Exams on the site (use words from these titles): ${(ctx.exams || []).slice(0, 50).map((t) => String(t).slice(0, 60)).join(" | ")}
The admin is on this page: ${ctx.page || "unknown"}.
Recent problems they hit (newest last): ${(ctx.problems || []).map((p) => p.what).join(" || ") || "none"}.
Existing contests (slug, title, stage): ${(ctx.contests || []).map((c) => `${c.slug} (${c.title}, ${c.stage})`).join("; ") || "none"}
Rules:
- For create_contest you need ALL of: which universities, the questions (an exam from the list), and the start time. If the admin has not said which exam or questions to use, DO NOT plan the contest yet: ask with buttons ("ask") offering up to 4 exam titles from the list that fit what they said, plus "Create it without questions for now". Never guess an exam and never leave it empty.
- "approve all", "approve everything", "publish all pending" refer to the pending written-paper changes (approve_paper_fixes with count "all") unless the admin clearly means AI note drafts (approve_drafts). If unsure how many are pending, plan pending_summary first. Never plan publish_post with an empty query.
- Reply in short, plain English. If a needed detail is missing (which universities, which exam, the start time), ask ONE short question and return no actions. Offer sensible defaults in the question.
- "tomorrow", "Friday" etc. must be turned into a real date using Now. Default length 30 minutes, default years [1,2,3], autoAdmit true.
- Only delete what the owner clearly named. If several contests match, ask which.
- If the admin hit a problem, explain it in plain words first, then plan the closest working alternative (for example a different page or a retry). If it is a missing database file (a message about running SQL), name the file and tell them to run it. Never invent buttons that do not exist.
- You can help while they navigate: say what the page they are on does and what to do next.
- The admin message may be cut off for you when they paste long text; that is fine, the browser has all of it. If they paste notes and say polish/publish, plan publish_note (and make_mcqs with from "note" if they also want questions). If it is not clear what to do with pasted text, ask.
- Pasted text arrives as an attachment you cannot see in full. If the admin attached text and did not say what to do, ask with buttons: [Polish and publish as a note, Polish, add more content and publish, These are MCQs: publish them, Make MCQs from it, Make flashcards from it].
- To ask the admin a question with buttons, add "ask": {"question": "...", "options": ["short option", ...]} (2 to 5 options) and no actions.
- Return ONLY JSON: {"reply": "...", "ask": null, "actions": [ ... ]}. "reply" says in one or two sentences what you will do (or asks the question).`;

const KNOWN = new Set(["create_contest", "delete_contest", "set_stage", "go_to", "set_autopilot_mode", "run_autopilot", "seo_scan", "seo_fix", "site_stats", "contest_report", "publish_note", "make_mcqs", "create_flashcards", "write_article", "find_content", "clean_notifications", "notification_report", "send_notification", "remember", "forget", "site_health", "update_post", "publish_post", "briefing", "import_mcqs", "generate_exam", "check_questions", "pending_summary", "approve_paper_fixes", "approve_drafts", "job_control", "set_subscriptions", "none"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !(await isAdmin(token))) return res.status(403).json({ error: "Administrators only." });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const message = String(body.message ?? "").slice(0, 2000).trim();
  if (!message) return res.status(400).json({ error: "Tell me what you need." });
  const ctx = body.context && typeof body.context === "object" ? body.context : {};
  const msgs = [{ role: "system", content: system(ctx) }];
  for (const h of (Array.isArray(body.history) ? body.history : []).slice(-8)) if (h && (h.role === "user" || h.role === "assistant")) msgs.push({ role: h.role, content: String(h.content ?? "").slice(0, 1500) });
  msgs.push({ role: "user", content: message });
  const got = await askJson(msgs, { prefer: "groq", fast: true, temperature: 0.1, maxTokens: 1500 });
  if (got.error) return res.status(502).json({ error: got.error });
  const raw = got.text;
  let out;
  try { out = JSON.parse(String(raw).replace(/^```(?:json)?|```$/gm, "").trim()); } catch { return res.status(200).json({ reply: String(raw).slice(0, 600), actions: [] }); }
  const actions = (Array.isArray(out.actions) ? out.actions : []).filter((a) => a && KNOWN.has(a.tool) && a.tool !== "none" && (a.args && typeof a.args === "object" ? true : (a.args = {}, true))).filter((a) => !((a.tool === "publish_post" || a.tool === "update_post") && !String(a.args?.query || "").trim())).slice(0, 5);
  const ask = out.ask && typeof out.ask === "object" && String(out.ask.question || "").trim() && Array.isArray(out.ask.options) ? { question: String(out.ask.question).slice(0, 300), options: out.ask.options.map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 5) } : null;
  return res.status(200).json({ reply: String(out.reply ?? "").slice(0, 800), ask: ask && ask.options.length >= 2 ? ask : null, actions });
}
