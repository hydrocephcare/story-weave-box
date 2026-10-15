// POST /api/ai?task=agent { message, history, context }: the admin assistant. It only PLANS: it returns { reply, actions } and the browser, with the admin's own
// login, runs the actions after the admin presses Yes. Requires a signed-in administrator (checked against Supabase with the caller's own token).
const SUPABASE = "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo";
const list = (v) => [...new Set(String(v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
let turn = 0;

async function isAdmin(token) {
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
1. create_contest  args: { "title": string, "universities": "all" | [university slugs from the list, at least 2], "years": [1-6], "exam": string (words from an exam title in the list, or "" when none), "start": "YYYY-MM-DDTHH:mm" (Nairobi time), "minutes": number (5-240), "autoAdmit": true|false }
2. delete_contest  args: { "slug": string }   (permanent: also deletes its registrations and results)
3. set_stage       args: { "slug": string, "stage": "concept" | "registration" | "live" | "completed" }
4. none: no action, just answer or ask a question.`;

const system = (ctx) => `You are the Ompath Study admin assistant. You help the site owner run contests. You never run anything yourself: you plan, the owner confirms, then the browser runs it.
Now (Nairobi time): ${ctx.now}.
${TOOLS}
Universities (slug = name): ${(ctx.universities || []).map((u) => `${u.slug} = ${u.name}`).join("; ")}
Exams on the site (use words from these titles): ${(ctx.exams || []).slice(0, 150).join(" | ")}
Existing contests (slug, title, stage): ${(ctx.contests || []).map((c) => `${c.slug} (${c.title}, ${c.stage})`).join("; ") || "none"}
Rules:
- Reply in short, plain English. If a needed detail is missing (which universities, which exam, the start time), ask ONE short question and return no actions. Offer sensible defaults in the question.
- "tomorrow", "Friday" etc. must be turned into a real date using Now. Default length 30 minutes, default years [1,2,3], autoAdmit true.
- Only delete what the owner clearly named. If several contests match, ask which.
- Return ONLY JSON: {"reply": "...", "actions": [ ... ]}. "reply" says in one or two sentences what you will do (or asks the question).`;

async function groqJson(msgs, keys) {
  const models = list(process.env.GROQ_CHAT_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b");
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) for (const model of models) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${keys[(start + i) % keys.length]}` }, body: JSON.stringify({ model, messages: msgs, response_format: { type: "json_object" }, temperature: 0.1 }) });
      if (!r.ok) continue;
      const t = (await r.json())?.choices?.[0]?.message?.content;
      if (t) return t;
    } catch { /* next */ }
  }
  return null;
}

async function geminiJson(msgs, keys) {
  const models = list(process.env.GEMINI_CHAT_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite");
  const contents = msgs.slice(1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": keys[(start + i) % keys.length] }, body: JSON.stringify({ systemInstruction: { parts: [{ text: msgs[0].content }] }, contents, generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }) });
      if (!r.ok) continue;
      const t = (await r.json())?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (t?.trim()) return t;
    } catch { /* next */ }
  }
  return null;
}

const KNOWN = new Set(["create_contest", "delete_contest", "set_stage", "none"]);

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
  const groq = list(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY), gem = list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
  if (!groq.length && !gem.length) return res.status(503).json({ error: "AI is not configured." });
  const raw = (groq.length && (await groqJson(msgs, groq))) || (gem.length && (await geminiJson(msgs, gem)));
  if (!raw) return res.status(502).json({ error: "The assistant is busy. Try again in a moment." });
  let out;
  try { out = JSON.parse(String(raw).replace(/^```(?:json)?|```$/gm, "").trim()); } catch { return res.status(200).json({ reply: String(raw).slice(0, 600), actions: [] }); }
  const actions = (Array.isArray(out.actions) ? out.actions : []).filter((a) => a && KNOWN.has(a.tool) && a.tool !== "none" && a.args && typeof a.args === "object").slice(0, 5);
  return res.status(200).json({ reply: String(out.reply ?? "").slice(0, 800), actions });
}
