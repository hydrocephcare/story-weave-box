// Writes and checks a full topic page with a Gemini model. Used by the topic-ai edge function (on demand, when someone opens a topic the site
// has little on) and by scripts/topics/ai-fill.mjs (a few a day in the background). Plain JS with no Deno or Node APIs, so both can import it.
// Nothing here is clinical advice: the page says so, and every page is saved as "not reviewed" until a person marks it reviewed.

export const KINDS = {
  disease: ["Overview", "Causes and risk factors", "How it presents", "Tests and diagnosis", "Management", "Complications and outlook", "Prevention", "Exam pearls", "Common mistakes"],
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

const DOSE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|ug|g|ml|mL|iu|IU|units?|mmol|mEq)\b|\bmg\/kg\b/;
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function buildPrompt({ name, category, context = "" }) {
  const kind = kindOf(category, name);
  return `Write an accurate study page about "${name}" (area: ${category || "medicine"}) for medical students and the general public.

If "${name}" is not a real medical, anatomical, physiological, biochemical, microbiological, pharmacological or health topic (a person, brand, joke, non-medical word), reply exactly {"medical": false}.

Otherwise reply with ONLY one JSON object:
{"medical": true, "summary": "2-3 plain sentences, under 60 words", "aka": ["other names/abbreviations"], "sections": [{"h": "heading", "p": "short paragraph", "b": ["short bullet"]}], "whenToSeekHelp": ["warning signs needing urgent medical care (diseases only, else [])"], "faq": [{"q": "question", "a": "short answer"}], "related": ["4-8 related topic names"]}

Section headings, in order (skip one only if it truly does not apply): ${KINDS[kind].map((h) => `"${h}"`).join(", ")}.
For diseases, "Management" covers non-drug care, drug classes and usual medicine names (never doses), referral and follow-up. Each section needs "p" or "b". 3 faq items.
Rules: standard accepted medical knowledge only; leave out anything you are unsure of; no doses, no brand names, no invented statistics or references. Be concise: every bullet under 25 words. Plain words a first-year student can follow.
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
    return h && (p || b.length) ? { h, ...(p ? { p } : {}), ...(b.length ? { b } : {}) } : null;
  }).filter(Boolean);
  if (sections.length < 3) throw new Error("too few sections");
  const list = (a, n, max) => (Array.isArray(a) ? a : []).map((x) => okText(x, max)).filter((x) => x.length >= 4).slice(0, n);
  const faq = (Array.isArray(raw.faq) ? raw.faq : []).map((f) => ({ q: clip(f?.q, 200), a: okText(f?.a, 500) })).filter((f) => f.q.length >= 8 && f.a.length >= 8).slice(0, 5);
  return { medical: true, summary, aka: list(raw.aka, 6, 60), sections, whenToSeekHelp: list(raw.whenToSeekHelp, 7, 240), faq, related: list(raw.related, 8, 60) };
}

/**
 * Asks a Gemini model. Tried in order: the Lovable gateway (what Ompath AI uses), OmniRoute, then a Google key directly.
 * env is a plain object of secrets. Throws if every route fails.
 */
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
        const r = await fetchImpl(url, { method: "POST", signal, headers: { "content-type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, stream: false, temperature: 0.3, max_tokens: 2400, messages: [{ role: "user", content: prompt }] }) });
        if (!r.ok) throw new Error(`model API ${r.status}`);
        return (await r.json())?.choices?.[0]?.message?.content;
      });
      if (typeof text === "string" && text.trim()) return { text, model };
      lastErr = new Error("empty reply");
    } catch (e) { lastErr = e; }
  }
  for (const key of [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3].filter(Boolean)) {
    for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
      try {
        const text = await timed(async (signal) => {
          const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 2400, responseMimeType: "application/json" } }) });
          if (!r.ok) throw new Error(`gemini ${r.status}`);
          return (await r.json())?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        });
        if (text?.trim()) return { text, model };
        lastErr = new Error("empty reply");
      } catch (e) { lastErr = e; }
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
