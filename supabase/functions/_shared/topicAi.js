// Writes and checks a full topic page with a Gemini model. Used by the topic-ai edge function (on demand, when someone opens a topic the site
// has little on) and by scripts/topics/ai-fill.mjs (a few a day in the background). Plain JS with no Deno or Node APIs, so both can import it.
// Nothing here is clinical advice: the page says so, and every page is saved as "not reviewed" until a person marks it reviewed.

export const KINDS = {
  disease: ["Definition and diagnosis", "Severity and staging", "Causes, most likely first", "How it presents", "Investigations", "Red flags and complications", "Management", "Follow-up and prevention", "Often confused with", "Where results can mislead"],
  anatomy: ["Overview", "Location and structure", "Relations", "Blood supply", "Nerve supply", "Function", "Clinical relevance and injuries", "Exam pearls"],
  physiology: ["Overview", "How it works", "Regulation", "What goes wrong", "Clinical relevance", "Exam pearls"],
  microbe: ["Overview", "Features of the organism", "Transmission and life cycle", "Disease it causes", "Diagnosis", "Treatment and control", "Exam pearls"],
  general: ["Overview", "Key concepts", "Clinical relevance", "Exam pearls", "Common mistakes"],
};

/** Which layout a topic gets, from the subject the site filed it under. */
export function kindOf(category = "", name = "") {
  const c = `${category} ${name}`.toLowerCase();
  if (/anatom|embryolog|histolog/.test(c)) return "anatomy";
  if (/microbio|parasit|bacteri|virus|virolog|mycolog|entomolog/.test(c)) return "microbe";
  if (/physiolog|biochem|molecular|genetic/.test(c)) return "physiology";
  if (/patholog|medicine|psychiatr|paediatr|obstet|gynae|surger|pharmac|public health|disease|disorder|syndrome/.test(c)) return "disease";
  return "general";
}

// a drug dose (500 mg, 5 mL, 2 units) is dropped, but a lab value or threshold (26.5 µmol/L, 0.3 mg/dL, 20,000 IU/mL, 6.5 mmol/L) is kept
const DOSE = /\b\d+(\.\d+)?\s?(?:mg|mcg|µg|ug|g|ml|mL|iu|IU|units?|mmol|mEq)(?![A-Za-z\/])|\bmg\/kg\b|\b\d+(\.\d+)?\s?mg\/(?!d)/;
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function buildPrompt({ name, category, context = "" }) {
  const kind = kindOf(category, name);
  return `You are a clinical reasoning tutor. Write an accurate study page about "${name}" (area: ${category || "medicine"}) that teaches a student to think like a clinician, not to recite a list. It is read by medical and clinical students worldwide, including in low-resource hospitals.

If "${name}" is not a real medical, anatomical, physiological, biochemical, microbiological, pharmacological or health topic (a person, brand, joke, non-medical word), reply exactly {"medical": false}.

Otherwise reply with ONLY one JSON object:
{"medical": true, "subject": "ONE of: Anatomy, Physiology, Biochemistry & genetics, Pharmacology, Microbiology & immunology, Pathology, Psychiatry, Paediatrics, Obstetrics & gynaecology, Surgery, Public health, Medicine", "summary": "2-3 plain sentences, under 60 words", "aka": ["other names/abbreviations"], "sections": [{"h": "heading", "p": "short paragraph", "b": ["short bullet"], "t": [{"a": "test or item", "b": "the question it answers and what the result means"}]}], "whenToSeekHelp": ["warning signs needing urgent medical care (diseases only, else [])"], "faq": [{"q": "question", "a": "short answer"}], "exam": ["2-3 examiner questions a student should be able to answer"], "related": ["4-8 related topic names"]}

Section headings, in order (skip one only if it truly does not apply): ${KINDS[kind].map((h) => `"${h}"`).join(", ")}.
Reasoning to build in (for diseases): do not stop at the label. Give the diagnostic criteria; stage the severity with the recognised system; categorise where the problem is; list causes by category, most likely first, including infections and conditions common in the tropics and low-resource settings (for example HIV, TB, malaria, hepatitis B, rheumatic heart disease, sickle cell, schistosomiasis, herbal remedies) where relevant; then what could kill the patient soon.
"Investigations" uses the "t" table: every row is Test -> the question it answers -> what a result means. Never list a test without its reason. Mention what to do when a test is unavailable.
"Management": treat the cause, then supportive care and monitoring; give drug classes and usual medicine names and say WHY each is chosen and why alternatives are avoided (toxicity, bleeding, interactions). Never give doses.
"Often confused with" separates look-alike conditions. "Where results can mislead" flags lab values or signs that can be falsely normal or abnormal.
For anatomy, physiology and other topics, still explain how it works and why it matters clinically, then what goes wrong.
Each section needs "p", "b" or "t". 3 faq items.
Rules: standard accepted medical knowledge only; leave out anything you are unsure of; no doses, no brand names, no invented statistics or references. Lab thresholds and diagnostic criteria are welcome. Every bullet under 28 words. Plain words a first-year student can follow.
${context ? `\nThe Ompath Study library says (use as main source, keep to it where specific):\n${clip(context, 3000)}\n` : ""}`;
}

/** Checks and tidies whatever the model returned. Returns {medical:false} or a safe page; throws when it is not usable. */
export function sanitizePage(raw) {
  if (!raw || typeof raw !== "object") throw new Error("not an object");
  if (raw.medical === false) return { medical: false };
  const summary = clip(raw.summary, 500);
  if (summary.length < 40 || DOSE.test(summary)) throw new Error("summary not acceptable");
  const okText = (s, max) => { const t = clip(s, max); return t && !DOSE.test(t) ? t : ""; };
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 12).map((s) => {
    const h = clip(s?.h, 60);
    const p = okText(s?.p, 1100);
    const b = (Array.isArray(s?.b) ? s.b : []).map((x) => okText(x, 280)).filter((x) => x.length >= 6).slice(0, 12);
    const t = (Array.isArray(s?.t) ? s.t : []).map((r) => ({ a: okText(r?.a, 120), b: okText(r?.b, 320) })).filter((r) => r.a.length >= 2 && r.b.length >= 6).slice(0, 14);
    return h && (p || b.length || t.length) ? { h, ...(p ? { p } : {}), ...(b.length ? { b } : {}), ...(t.length ? { t } : {}) } : null;
  }).filter(Boolean);
  if (sections.length < 3) throw new Error("too few sections");
  const list = (a, n, max) => (Array.isArray(a) ? a : []).map((x) => okText(x, max)).filter((x) => x.length >= 4).slice(0, n);
  const faq = (Array.isArray(raw.faq) ? raw.faq : []).map((f) => ({ q: clip(f?.q, 200), a: okText(f?.a, 500) })).filter((f) => f.q.length >= 8 && f.a.length >= 8).slice(0, 5);
  return { medical: true, subject: clip(raw.subject, 40), summary, aka: list(raw.aka, 6, 60), sections, whenToSeekHelp: list(raw.whenToSeekHelp, 7, 240), faq, exam: list(raw.exam, 4, 240), related: list(raw.related, 8, 60) };
}

/**
 * Asks a Gemini model. Tried in order: the Lovable gateway (what Ompath AI uses), OmniRoute, then a Google key directly.
 * env is a plain object of secrets. Throws if every route fails.
 */
let turn = 0;
const deadKeys = new Set();
const deadModels = new Set();
export async function askModel(prompt, { env = {}, fetchImpl = fetch, timeoutMs = 50000 } = {}) {
  const gateways = [];
  if (env.LOVABLE_API_KEY) gateways.push(["https://ai.gateway.lovable.dev/v1/chat/completions", env.LOVABLE_API_KEY, env.TOPIC_AI_MODEL || "google/gemini-3-flash-preview"]);
  if (env.OMNIROUTE_BASE_URL && env.OMNIROUTE_API_KEY) gateways.push([`${String(env.OMNIROUTE_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/chat/completions`, env.OMNIROUTE_API_KEY, env.OMNIROUTE_MODEL || "ompathstudy"]);
  let lastErr = new Error("no model configured");
  const timed = async (fn) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fn(ctl.signal); } finally { clearTimeout(timer); }
  };
  for (const [url, key, model] of gateways) {
    try {
      const text = await timed(async (signal) => {
        const r = await fetchImpl(url, { method: "POST", signal, headers: { "content-type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, stream: false, temperature: 0.3, max_tokens: 3600, messages: [{ role: "user", content: prompt }] }) });
        if (!r.ok) throw new Error(`model API ${r.status}`);
        return (await r.json())?.choices?.[0]?.message?.content;
      });
      if (typeof text === "string" && text.trim()) return { text, model };
      lastErr = new Error("empty reply");
    } catch (e) { lastErr = e; }
  }
  // Google keys: any number, comma separated in GEMINI_API_KEYS (or GEMINI_API_KEY, _2, _3). They take turns, so no single key is worn out,
  // and a key that is over its limit or refused is skipped for the rest of this run.
  const keys = [...new Set([...String(env.GEMINI_API_KEYS ?? "").split(/[\s,]+/), env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].map((k) => String(k ?? "").trim()).filter(Boolean))];
  const models = String(env.GEMINI_MODELS ?? "gemini-2.5-flash,gemini-3.8-flash,gemini-2.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    if (deadKeys.has(key)) continue;
    for (const model of models) {
      if (deadModels.has(key + model)) continue;
      try {
        const text = await timed(async (signal) => {
          const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", signal, headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 7000, responseMimeType: "application/json", ...(model.includes("2.5-flash") && !model.includes("lite") ? { thinkingConfig: { thinkingBudget: 0 } } : model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } }) });
          if (r.status === 404) deadModels.add(key + model);
          if (r.status === 429 || r.status === 503) { deadModels.add(key + model); setTimeout(() => deadModels.delete(key + model), 45_000).unref?.(); }
          if (r.status === 403 || r.status === 401) deadKeys.add(key);
          if (!r.ok) throw new Error(`gemini ${r.status}`);
          return (await r.json())?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        });
        if (text?.trim()) return { text, model };
        lastErr = new Error("empty reply");
      } catch (e) { lastErr = e; }
      if (deadKeys.has(key)) break;
    }
  }
  throw lastErr;
}

/** Writes a checked page (or {medical:false}). `fetchImpl` is injectable for tests. */
export async function generateTopicPage({ name, category, context, env, fetchImpl = fetch, timeoutMs }) {
  const { text, model } = await askModel(buildPrompt({ name, category, context }), { env, fetchImpl, timeoutMs });
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in the reply");
  const page = sanitizePage(JSON.parse(m[0]));
  return page.medical ? { ...page, kind: kindOf(category, name), model, generatedAt: new Date().toISOString().slice(0, 10) } : page;
}

export const slugOf = (name) => String(name).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const validName = (name) => typeof name === "string" && /^[A-Za-z][A-Za-z0-9 '’()\-,./&]{2,79}$/.test(name.trim());

/**
 * The whole "write this page once" flow, shared by the edge function and the tests. Returns { code, body }:
 * 200 published | 202 generating | 404 rejected | 429 busy | 502 failed | 503 unavailable | 400 invalid
 */
export async function topicAiCore(input, { env, fetchImpl = fetch }) {
  const name = String(input?.name ?? "").trim();
  if (!validName(name)) return { code: 400, body: { status: "invalid" } };
  const slug = slugOf(name);
  if (!slug || slug.length > 80) return { code: 400, body: { status: "invalid" } };
  const url = env.SUPABASE_URL, svc = env.SUPABASE_SERVICE_ROLE_KEY;
  const hasModel = env.LOVABLE_API_KEY || env.GEMINI_API_KEY || (env.OMNIROUTE_BASE_URL && env.OMNIROUTE_API_KEY);
  if (!url || !svc || !hasModel) return { code: 503, body: { status: "unavailable" } };

  const rest = (p, init = {}) => fetchImpl(`${url}/rest/v1/${p}`, { ...init, headers: { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json", ...(init.headers || {}) } });
  const save = (row) => rest("topic_pages?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ slug, name, category: input.category ?? null, updated_at: new Date().toISOString(), ...row }) });
  try {
    const found = await rest(`topic_pages?slug=eq.${encodeURIComponent(slug)}&select=status,content,updated_at`);
    const have = (found.ok ? await found.json() : [])[0];
    if (have?.status === "published" && have.content) return { code: 200, body: { status: "published", slug, page: have.content } };
    if (have?.status === "rejected") return { code: 404, body: { status: "rejected" } };
    const age = have ? Date.now() - Date.parse(have.updated_at || 0) : Infinity;
    if (have?.status === "generating" && age < 3 * 60_000) return { code: 202, body: { status: "generating" } };
    if (have?.status === "failed" && age < 10 * 60_000) return { code: 502, body: { status: "failed" } };

    // a daily limit keeps the AI bill small even if a crawler or a joker walks the site
    const cap = Number(env.TOPIC_AI_DAILY_CAP || 60);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const count = await rest(`topic_pages?created_at=gte.${encodeURIComponent(since)}&select=slug`, { headers: { Prefer: "count=exact", Range: "0-0" } });
    if (Number((count.headers.get("content-range") || "").split("/")[1] || 0) >= cap) return { code: 429, body: { status: "busy" } };

    await save({ status: "generating" });
    let page;
    try { page = await generateTopicPage({ name, category: String(input.category ?? ""), context: String(input.context ?? "").slice(0, 3500), env, fetchImpl }); }
    catch { await save({ status: "failed" }); return { code: 502, body: { status: "failed" } }; }
    if (!page.medical) { await save({ status: "rejected" }); return { code: 404, body: { status: "rejected" } }; }
    await save({ status: "published", content: page, model: page.model, reviewed: false });
    return { code: 200, body: { status: "published", slug, page } };
  } catch { return { code: 502, body: { status: "failed" } }; }
}
