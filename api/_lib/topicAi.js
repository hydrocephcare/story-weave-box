// Writes and checks a full topic page with an AI model. Used by api/topic-ai.js (on demand, when someone opens a topic the site has little on)
// and by scripts/topics/ai-fill.mjs (a few a day in the background). Nothing here is clinical advice: the page says so, and every page is
// saved as "not reviewed" until a person marks it reviewed.

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
  return `You are writing a complete, accurate study page about "${name}" for medical students (subject area: ${category || "medicine"}). It will be published on a medical education website, so correctness matters more than length.

First decide whether "${name}" is a real medical, anatomical, physiological, biochemical, microbiological, pharmacological or health-science topic. If it is not (for example a person, a brand, a joke or a non-medical word), reply with exactly {"medical": false}.

Otherwise reply with ONLY one JSON object, no other text, in this shape:
{
 "medical": true,
 "summary": "2 to 3 plain sentences saying what it is, under 70 words",
 "aka": ["other names and abbreviations, if any"],
 "sections": [ {"h": "heading", "p": "a short paragraph", "b": ["bullet", "bullet"]} ],
 "whenToSeekHelp": ["warning signs that mean a person should see a doctor or health worker urgently (diseases only; otherwise an empty list)"],
 "faq": [ {"q": "a question a student would ask", "a": "a short correct answer"} ],
 "related": ["names of 4 to 8 closely related topics"]
}

Use these section headings, in this order, and leave out one only if it truly does not apply: ${KINDS[kind].map((h) => `"${h}"`).join(", ")}.
In "Management" (diseases) cover non-drug care, the classes and names of usual medicines (never doses), when to refer, and follow-up.
Each section needs a "p" or a "b" (or both). Bullets are short facts, not sentences copied from a textbook. 3 to 4 questions in "faq".

Rules: use only standard, widely accepted medical knowledge. If you are not sure of a fact, leave it out. Never give drug doses, units of dose, or brand names. Never invent statistics, guidelines or references. Write in plain words a first-year student can follow.
${context ? `\nWhat the Ompath Study library already says about it (use it as your main source, and keep to it where it is specific):\n${clip(context, 4500)}\n` : ""}`;
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

/** Calls the model and returns a checked page (or {medical:false}). `fetchImpl` is injectable for tests. */
export async function generateTopicPage({ name, category, context, apiKey, model = "claude-sonnet-5-5", fetchImpl = fetch, timeoutMs = 52000 }) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 2600, messages: [{ role: "user", content: buildPrompt({ name, category, context }) }] }),
    });
    if (!r.ok) throw new Error(`model API ${r.status}`);
    const j = await r.json();
    const text = (j.content ?? []).map((c) => c.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in the reply");
    const page = sanitizePage(JSON.parse(m[0]));
    return page.medical ? { ...page, kind: kindOf(category, name), model, generatedAt: new Date().toISOString().slice(0, 10) } : page;
  } finally {
    clearTimeout(timer);
  }
}

export const slugOf = (name) => String(name).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const validName = (name) => typeof name === "string" && /^[A-Za-z][A-Za-z0-9 '’()\-,./&]{2,79}$/.test(name.trim());
