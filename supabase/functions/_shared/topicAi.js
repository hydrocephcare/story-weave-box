// Writes and checks a full topic page with a Gemini model. Used by the topic-ai edge function (on demand, when someone opens a topic the site
// has little on) and by scripts/topics/ai-fill.mjs (a few a day in the background). Plain JS with no Deno or Node APIs, so both can import it.
// Nothing here is clinical advice: the page says so, and every page is saved as "not reviewed" until a person marks it reviewed.
import { placeNewQuestions, seededRandom } from "./mcqPositions.js";

export const DEEP_DISEASE = ["Definition and epidemiology", "Causes and risk factors, most likely first", "How it develops (pathophysiology)", "How it presents", "Bedside: history and how to examine", "Differential diagnosis", "Investigations and how to read them", "Severity and staging", "Complicating and confounding factors", "Management, step by step", "Complications and red flags", "Special groups", "Prognosis, follow-up and prevention", "Where results can mislead"];

export const KINDS = {
  disease: ["Definition and diagnosis", "Severity and staging", "Causes, most likely first", "How it presents", "Investigations", "Red flags and complications", "Management", "Follow-up and prevention", "Often confused with", "Where results can mislead"],
  anatomy: ["Overview", "Location and structure", "Relations", "Blood supply", "Nerve supply", "Function", "Clinical relevance and injuries", "Exam pearls"],
  physiology: ["Overview", "How it works", "Regulation", "What goes wrong", "Clinical relevance", "Exam pearls"],
  pharmacology: ["Drug class and classification", "Mechanism of action", "Clinical uses", "Adverse effects", "Contraindications and interactions", "Monitoring", "Exam pearls"],
  pathology: ["Definition and classification", "Causes", "Pathogenesis", "Morphology", "Clinical features", "Investigations", "Complications", "Exam pearls"],
  microbe: ["Overview", "Features of the organism", "Transmission and life cycle", "Pathogenesis", "Disease it causes", "Diagnosis", "Treatment and control", "Exam pearls"],
  biochemistry: ["Overview", "Key molecules and enzymes", "Pathway or mechanism", "Regulation", "Clinical relevance", "Laboratory assessment", "Exam pearls"],
  publicHealth: ["Overview", "Epidemiology", "Determinants", "Prevention and control", "Implementation", "Monitoring and evaluation", "Exam pearls"],
  general: ["Overview", "Key concepts", "Mechanisms and processes", "Clinical relevance", "Applications", "Common mistakes", "Exam pearls"],
};
export const DEEP_KINDS = {
  disease: DEEP_DISEASE,
  anatomy: ["Definition and anatomical overview", "Embryological development", "Gross anatomy and relations", "Blood supply", "Nerve supply and lymphatic drainage", "Histology and microanatomy", "Functions and biomechanics", "Applied anatomy and clinical correlations", "Common injuries and pathology", "Imaging and examination", "Variations and congenital anomalies", "Exam approach"],
  physiology: ["Overview and homeostasis", "Normal physiology step by step", "Cellular and molecular mechanisms", "Regulation and feedback", "Integration across organ systems", "Factors affecting normal function", "Pathophysiology: what goes wrong", "Clinical manifestations", "Investigations and interpretation", "Clinical applications", "Common misconceptions", "Exam approach"],
  pharmacology: ["Drug class and classification", "Prototypes and structure-activity relationships", "Mechanism of action", "Pharmacokinetics", "Pharmacodynamics", "Indications and clinical selection", "Contraindications and precautions", "Adverse effects and toxicity", "Interactions", "Monitoring and special populations", "Resistance and stewardship", "Exam approach"],
  pathology: ["Definition and classification", "Aetiology and risk factors", "Pathogenesis step by step", "Gross morphology", "Microscopic morphology", "Clinical manifestations", "Investigations and diagnostic criteria", "Grading and staging", "Complications and prognosis", "Treatment principles", "Clinical-pathological correlations", "Exam approach"],
  microbe: ["Classification and overview", "Morphology and structure", "Virulence factors", "Transmission and epidemiology", "Pathogenesis and host response", "Clinical manifestations", "Laboratory diagnosis and interpretation", "Treatment and antimicrobial pharmacology", "Resistance", "Prevention and public health", "Complications", "Exam approach"],
  biochemistry: ["Overview and biological role", "Structure and key components", "Pathway or mechanism step by step", "Enzymes and cofactors", "Regulation", "Integration and energy balance", "Clinical and disease correlations", "Laboratory assessment and interpretation", "Disorders and consequences", "Therapeutic implications", "Common errors", "Exam approach"],
  publicHealth: ["Definition and scope", "Epidemiology and burden", "Determinants and risk factors", "Surveillance and data interpretation", "Screening and prevention", "Interventions and implementation", "Health systems and policy", "Equity and community engagement", "Monitoring and evaluation", "Clinical relevance", "Common limitations", "Exam approach"],
  general: ["Definition and scope", "Core concepts", "Mechanisms and processes", "Types and classification", "Clinical or practical applications", "Measurement and interpretation", "Examples and case applications", "Limitations and common errors", "Related concepts", "Exam approach"],
};
export function kindOf(category = "", name = "") {
  const c = `${category} ${name}`.toLowerCase();
  if (/anatom|embryolog|histolog/.test(c)) return "anatomy";
  if (/pharmac|drug class|pharmacokinetic|pharmacodynamic/.test(c)) return "pharmacology";
  if (/patholog|histopath|morpholog/.test(c)) return "pathology";
  if (/microbio|parasit|bacteri|virus|virolog|mycolog|entomolog/.test(c)) return "microbe";
  if (/biochem|molecular|genetic|metabolic pathway/.test(c)) return "biochemistry";
  if (/public health|epidemiolog|community health|health promotion/.test(c)) return "publicHealth";
  if (/physiolog|homeostasis|physiological/.test(c)) return "physiology";
  if (/medicine|psychiatr|paediatr|obstet|gynae|surger|disease|disorder|syndrome|clinical/.test(c)) return "disease";
  return "general";
}

// a drug dose (500 mg, 5 mL, 2 units) is dropped, but a lab value or threshold (26.5 µmol/L, 0.3 mg/dL, 20,000 IU/mL, 6.5 mmol/L) is kept
const DOSE = /\b\d+(\.\d+)?\s?(?:mg|mcg|µg|ug|g|ml|mL|iu|IU|units?|mmol|mEq)(?![A-Za-z\/])|\bmg\/kg\b|\b\d+(\.\d+)?\s?mg\/(?!d)/;
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** What the reader chose before the page was written: { level, angles, setting, depth }. Anything missing means the full, deep page. */
export function cleanChoices(c) {
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  return {
    level: pick(c?.level, ["year3", "year4", "year5"], "year4"),
    angles: (Array.isArray(c?.angles) ? c.angles : []).filter((a) => Object.hasOwn(ANGLE_TEXT, a)).slice(0, 6),
    setting: pick(c?.setting, ["tropical", "general"], "tropical"),
    depth: "full",
  };
}
const ANGLE_TEXT = { bedside: "the bedside (history, how to examine, named signs and how to elicit them)", medicine: "internal medicine reasoning", surgery: "surgical angles and when to operate", pathology: "pathology and mechanisms", drugs: "pharmacology (why each drug, why others are avoided, monitoring)", emergency: "emergency first steps" };
const READER = { year3: "an early clinical student (explain mechanisms simply and link them to basic science)", year4: "a Year 4 clinical student preparing for ward rounds and written and oral exams", year5: "a final-year student or intern who must manage the patient (decisions, escalation, monitoring)" };

const ACCURACY_RULES = `
ACCURACY RULES (read before you write): every number, cut-off, drug and sign must match standard current guidelines. Name a sign, score or eponym only if you are certain of the name and of what it shows; otherwise describe it in plain words. Write each threshold the same way every time it appears (for example always "250 or more", never "over 250" in one place and "250 or more" in another). Describe examination signs by what actually happens (for example in shifting dullness the fluid falls to the dependent flank, so that flank is dull and the upper flank is resonant). If you are not sure of a fact, leave it out. Do not invent statistics.`;

const DEEP_RULES = `
DEPTH: for a complete topic overview, follow the minimum section count supplied by the caller; for a focused deep-note part, follow the requested 3-5 sections. Each section must contain 4-8 meaningful bullets, a useful comparison table, or a genuinely explanatory paragraph plus bullets. Never pad with repetition.
AUDIENCE: teach two audiences together. Begin the summary in plain language that an interested member of the public can understand; then add the accurate technical framing needed by a medical student. Define specialist terms at first use, use a short real-world example or clinical vignette where it clarifies the idea, and keep patient-facing explanations distinct from professional clinical decisions.
DISEASES: cover definition, epidemiology, causes and risk factors, mechanisms, presentation, history and examination, differentials, investigations with interpretation and thresholds, severity/staging, management rationale, pharmacology, complications, special groups, follow-up and prevention.
ANATOMY: cover development, gross anatomy, relations, blood supply, innervation, lymphatics, histology, function, applied anatomy, common injuries/variants, examination and imaging.
PHYSIOLOGY: explain normal function step by step, cellular mechanisms, feedback regulation, integration with other systems, factors that alter function, pathophysiology and clinical/laboratory correlations.
PHARMACOLOGY: cover classification and prototypes, mechanism, pharmacokinetics, pharmacodynamics, indications, contraindications, adverse effects, interactions, toxicity, monitoring, special populations and stewardship where relevant.
PATHOLOGY: cover aetiology, pathogenesis, gross and microscopic morphology, clinical manifestations, diagnostic tests, grading/staging, complications, prognosis and treatment principles.
MICROBIOLOGY: cover classification, morphology, virulence, transmission, pathogenesis, host response, clinical syndromes, specimen choice, laboratory diagnosis, treatment, resistance and prevention.
BIOCHEMISTRY: explain molecules, enzymes, pathways, rate-limiting steps, cofactors, regulation, integration, laboratory assessment and disease correlations.
PUBLIC HEALTH: cover epidemiology, determinants, surveillance, prevention, screening, interventions, implementation, health systems, equity and evaluation.
CLINICAL REASONING: for clinical topics, include bedside history/examination, investigation interpretation, management decisions, drug rationale, escalation, complications and follow-up. Include tropical and low-resource considerations only where relevant.
EXAMPLES: use illustrative examples and short cases, clearly label hypothetical examples, and never invent prevalence figures, patient outcomes or references.
EXAM: for a complete overview include 10-12 strategic questions testing mechanisms, interpretation, management choices, contraindications, complications and application—not simple definitions.`;

export function buildPrompt({ name, category, context = "", choices, fixes = [] }) {
  const kind = kindOf(category, name);
  const ch = cleanChoices(choices);
  const deep = ch.depth === "full";
  const headings = deep ? DEEP_KINDS[kind] : KINDS[kind];
  const minimumSections = deep ? Math.max(9, headings.length - 1) : Math.max(3, headings.length - 1);
  const focus = ch.angles.length ? ` The reader asked for special attention to: ${ch.angles.map((a) => ANGLE_TEXT[a]).join("; ")}.` : "";
  const setting = ch.setting === "tropical" ? "East African and other low-resource hospitals (common local conditions first, and tests that may not be available)" : "general international practice";
  return `You are a clinical reasoning tutor. Write an accurate study page about "${name}" (area: ${category || "medicine"}) that teaches a student to think like a clinician, not to recite a list. The reader is ${READER[ch.level]}. Setting: ${setting}.${focus}${deep ? DEEP_RULES : ""} The summary must start in plain language for the public, then give the precise clinical or scientific meaning.

PRE-GENERATION CLINICAL ENTITY DISAMBIGUATION (mandatory, before drafting): First classify the exact clinical entity intended by the topic name, subject/category and supplied context. If the name can refer to multiple entities, select the entity that best matches the subject/category and clinical setting; state that chosen scope explicitly in the FIRST sentence of the summary and in the new clinicalScope field. Put the other entity/entities under "Often confused with" and explain the distinguishing features. Never blend causes, presentation, investigations or management across entities. Example: for "umbilical vein thrombosis" filed under Paediatrics/neonatal, write about neonatal umbilical vein thrombosis, especially umbilical venous catheter (UVC)-associated thrombosis; do not mix it with antenatal umbilical cord thrombosis. Put antenatal cord thrombosis under "Often confused with". If the intended entity remains genuinely unclear after considering category and context, state the ambiguity rather than inventing a scope.

Interpret misspellings, phonetic spellings, incomplete phrases and mixed-up medical terms generously. If any part of "${name}" clearly identifies a medical topic (for example "jaundice"), do not reject the request just because another word is misspelled or nonsensical. Infer the most likely intended medical topic from the name and context, use its correct textbook title in "title", and explain the correction briefly in the summary when useful. If several meanings are plausible, choose the closest relevant medical topic and state the distinction. Reply {"medical": false} only when the query remains clearly unrelated to medicine or health after reasonable typo correction (such as a person, brand, joke, film or sport).

Otherwise reply with ONLY one JSON object:
{"medical": true, "clinicalScope": "one precise sentence naming the clinical entity and population/setting covered", "title": "the clean title a textbook would give this page: 2 to 8 words, correctly spelled, no typing mistakes and no phrases like 'difference btw' or 'what is'; for a comparison write 'A versus B'", "subject": "ONE of: Anatomy, Physiology, Biochemistry & genetics, Pharmacology, Microbiology & immunology, Pathology, Psychiatry, Paediatrics, Obstetrics & gynaecology, Surgery, Public health, Medicine", "summary": "2-3 plain sentences, under 60 words", "aka": ["other names/abbreviations"], "sections": [{"h": "heading", "p": "short paragraph", "b": ["short bullet"], "t": [{"a": "test or item", "b": "the question it answers and what the result means"}]}], "whenToSeekHelp": ["warning signs needing urgent medical care (diseases only, else [])"], "faq": [{"q": "question", "a": "short answer"}], "exam": ["${deep ? "10-12" : "6-8"} strategic examiner questions, each followed by ' — ' and the key points of a good answer"], "related": ["4-8 related topic names"]}

Section headings, in order (skip one only if it truly does not apply): ${headings.map((h) => `"${h}"`).join(", ")}.
MINIMUM DEPTH: provide at least ${minimumSections} substantive sections. Do not collapse the page into 3-4 broad headings. Each section must contain topic-specific information that belongs under its heading; for full depth use 4-8 meaningful bullets or a genuinely explanatory paragraph plus relevant bullets. Include the specific causes, clinical presentation, investigations, management decisions, complications and follow-up applicable to the chosen entity.
Reasoning to build in (for diseases): do not stop at the label. Give the diagnostic criteria; stage the severity with the recognised system; categorise where the problem is; list causes by category, most likely first, including infections and conditions common in the tropics and low-resource settings (for example HIV, TB, malaria, hepatitis B, rheumatic heart disease, sickle cell, schistosomiasis, herbal remedies) where relevant; then what could kill the patient soon.
"Investigations" uses the "t" table: every row is Test -> the question it answers -> what a result means. Never list a test without its reason. Mention what to do when a test is unavailable.
"Management": treat the cause, then supportive care and monitoring; give drug classes and usual medicine names and say WHY each is chosen and why alternatives are avoided (toxicity, bleeding, interactions). Never give doses.
"Often confused with" separates look-alike conditions. "Where results can mislead" flags lab values or signs that can be falsely normal or abnormal.
For anatomy, physiology and other topics, still explain how it works and why it matters clinically, then what goes wrong.
Each section needs "p", "b" or "t". 3 faq items.
Plan first, then write. The reader is a clinical-year student, so before you write, decide the angles an examiner would use for this topic: the bedside approach (history, examination, a patient lying in bed), internal medicine, surgery, pathology, pharmacology, complications and look-alike conditions, and the first things to do in an emergency. "exam" must hold ${deep ? "10-12" : "6-8"} strategic, tricky questions across those angles (what would you do next, what distinguishes it from, why is this drug avoided), never plain definitions.
${ACCURACY_RULES}
Rules: standard accepted medical knowledge only; leave out anything you are unsure of; no doses, no brand names, no invented statistics or references. Lab thresholds and diagnostic criteria are welcome. Every bullet under ${deep ? 40 : 28} words. Plain words a first-year student can follow.
${fixes.length ? `\nA CLINICAL REVIEWER FOUND THESE ERRORS IN THE PREVIOUS DRAFT. Correct them precisely and do not repeat them:\n- ${fixes.map((x) => clip(x, 400)).join("\n- ")}\n` : ""}${context ? `\nThe Ompath Study library says (use as main source, keep to it where specific):\n${clip(context, 3000)}\n` : ""}`;
}

/** Checks and tidies whatever the model returned. Returns {medical:false} or a safe page; throws when it is not usable. */
export function sanitizePage(raw, options = {}) {
  if (!raw || typeof raw !== "object") throw new Error("not an object");
  if (raw.medical === false) return { medical: false };
  const summary = clip(raw.summary, 500);
  if (summary.length < 40 || DOSE.test(summary)) throw new Error("summary not acceptable");
  const okText = (s, max) => { const t = clip(s, max); return t && !DOSE.test(t) ? t : ""; };
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 16).map((s) => {
    const h = clip(s?.h, 60);
    const p = okText(s?.p, 1500);
    const b = (Array.isArray(s?.b) ? s.b : []).map((x) => okText(x, 380)).filter((x) => x.length >= 6).slice(0, 16);
    const t = (Array.isArray(s?.t) ? s.t : []).map((r) => ({ a: okText(r?.a, 120), b: okText(r?.b, 320) })).filter((r) => r.a.length >= 2 && r.b.length >= 6).slice(0, 18);
    return h && (p || b.length || t.length) ? { h, ...(p ? { p } : {}), ...(b.length ? { b } : {}), ...(t.length ? { t } : {}) } : null;
  }).filter(Boolean);
  if (sections.length < 3) throw new Error("too few sections");
  const full = Boolean(options.name || options.category) && cleanChoices(options.choices).depth === "full";
  if (full) {
    const expected = DEEP_KINDS[kindOf(options.category ?? "", options.name ?? "")] ?? DEEP_KINDS.general;
    const minimum = Math.max(9, expected.length - 1);
    if (sections.length < minimum) throw new Error(`thin topic page: ${sections.length} sections; ${minimum} required`);
    const thin = sections.filter((section) => {
      const structured = (section.b?.length ?? 0) + (section.t?.length ?? 0);
      const words = (section.p ?? "").split(/\\s+/).filter(Boolean).length;
      return structured < 4 && words < 65;
    });
    if (thin.length) throw new Error(`thin sections: ${thin.map((section) => section.h).slice(0, 4).join(", ")}`);
    if ((raw.exam ?? []).filter((x) => String(x).includes("—")).length < 8) throw new Error("full topic page needs at least 8 applied examiner questions");
    if ((Array.isArray(raw.faq) ? raw.faq.filter((x) => clip(x?.q, 200).length >= 8 && clip(x?.a, 500).length >= 8).length : 0) < 3) throw new Error("full topic page needs at least 3 useful FAQs");
  }
  const list = (a, n, max) => (Array.isArray(a) ? a : []).map((x) => okText(x, max)).filter((x) => x.length >= 4).slice(0, n);
  const faq = (Array.isArray(raw.faq) ? raw.faq : []).map((f) => ({ q: clip(f?.q, 200), a: okText(f?.a, 500) })).filter((f) => f.q.length >= 8 && f.a.length >= 8).slice(0, 6);
  const title = clip(raw.title, 80).replace(/[<>]/g, "");
  return { medical: true, clinicalScope: clip(raw.clinicalScope, 240) || summary.split(/[.!?]/)[0].trim(), ...(/^[A-Za-z][A-Za-z0-9 '’()\-,./&:]{3,79}$/.test(title) ? { title } : {}), subject: clip(raw.subject, 40), summary, aka: list(raw.aka, 6, 60), sections, whenToSeekHelp: list(raw.whenToSeekHelp, 7, 240), faq, exam: list(raw.exam, 12, 480), related: list(raw.related, 8, 60) };
}

/**
 * Asks a Gemini model. Tried in order: the Lovable gateway (what Ompath AI uses), OmniRoute, then a Google key directly.
 * env is a plain object of secrets. Throws if every route fails.
 */
let turn = 0;
const deadKeys = new Set();
const deadModels = new Set();
const parseProviderKeys = (...values) => [...new Set(values.flatMap((value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {}
  return raw.split(/[\\s,;]+/).map((key) => key.trim()).filter(Boolean);
}))];
export async function askModel(prompt, { env = {}, fetchImpl = fetch, timeoutMs = 50000, maxTokens = 5000, plain = false } = {}) {
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
  const models = String(env.GEMINI_MODELS ?? "gemini-3.8-flash,gemini-3.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
  const start = keys.length ? turn++ % keys.length : 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    if (deadKeys.has(key)) continue;
    for (const model of models) {
      if (deadModels.has(key + model)) continue;
      try {
        const text = await timed(async (signal) => {
          const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", signal, headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens, ...(plain ? {} : { responseMimeType: "application/json" }), ...(model.includes("2.5-flash") && !model.includes("lite") ? { thinkingConfig: { thinkingBudget: 0 } } : model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } }) });
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
  // Groq: a free backup that takes over when every Gemini key is out of quota. Keys in GROQ_API_KEYS (comma separated), used in turn.
  const groqKeys = [...new Set(String(env.GROQ_API_KEYS ?? env.GROQ_API_KEY ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
  const groqModels = String(env.GROQ_MODELS ?? "openai/gpt-oss-20b,openai/gpt-oss-120b").split(",").map((m) => m.trim()).filter(Boolean);
  const gStart = groqKeys.length ? turn++ % groqKeys.length : 0;
  for (let i = 0; i < groqKeys.length; i++) {
    const key = groqKeys[(gStart + i) % groqKeys.length];
    for (const model of groqModels) {
      if (deadModels.has(key + model)) continue;
      try {
        const text = await timed(async (signal) => {
          const r = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal, headers: { "content-type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ model, temperature: 0.3, max_tokens: maxTokens, reasoning_effort: "low", ...(plain ? {} : { response_format: { type: "json_object" } }), messages: [{ role: "user", content: prompt }] }) });
          if (r.status === 429 || r.status === 503 || r.status === 404) { deadModels.add(key + model); setTimeout(() => deadModels.delete(key + model), 45_000).unref?.(); }
          if (!r.ok) throw new Error("groq " + r.status);
          return (await r.json())?.choices?.[0]?.message?.content;
        });
        if (text?.trim()) return { text, model };
        lastErr = new Error("empty reply");
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr;
}

/**
 * Calls Google's Gemini API directly. This is the independent review boundary:
 * no Lovable/OmniRoute gateway and no Groq fallback are permitted here.
 */
export async function askGeminiModel(prompt, { env = {}, fetchImpl = fetch, timeoutMs = 50000, maxTokens = 3500 } = {}) {
  const keys = [...new Set([
    ...String(env.GEMINI_API_KEYS ?? "").split(/[\s,]+/),
    env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3,
  ].map((key) => String(key ?? "").trim()).filter(Boolean))];
  const models = String(env.GEMINI_MODELS ?? "gemini-3.8-flash,gemini-3.5-flash-lite").split(",").map((model) => model.trim()).filter(Boolean);
  if (!keys.length) throw new Error("Gemini review is not configured (GEMINI_API_KEYS).");
  if (!models.length) throw new Error("No Gemini review model is configured.");

  const start = turn++ % keys.length;
  let lastError = new Error("All Gemini review attempts failed.");
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    for (const model of models) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
              ...(model.includes("2.5-flash") && !model.includes("lite") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        });
        if (!response.ok) {
          lastError = new Error(`Gemini review failed (${response.status}).`);
          continue;
        }
        const text = (await response.json())?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
        if (typeof text === "string" && text.trim()) return { text, model };
        lastError = new Error("Gemini returned an empty review.");
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastError;
}

/**
 * Calls Groq only. This provider boundary is deliberate: content generation and
 * independent Gemini review must never silently become the same model family.
 */
export async function askGroqModel(prompt, { env = {}, fetchImpl = fetch, timeoutMs = 50000, maxTokens = 5000 } = {}) {
  const keys = [...new Set(String(env.GROQ_API_KEYS ?? env.GROQ_API_KEY ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
  const models = String(env.GROQ_MODELS ?? "openai/gpt-oss-120b,openai/gpt-oss-20b").split(",").map((m) => m.trim()).filter(Boolean);
  if (!keys.length) throw new Error("Groq generation is not configured (GROQ_API_KEYS).");
  if (!models.length) throw new Error("No Groq generation model is configured.");

  const start = turn++ % keys.length;
  let lastError = new Error("All Groq generation attempts failed.");
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    for (const model of models) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", Authorization: "Bearer " + key },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: maxTokens,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!response.ok) {
          lastError = new Error("Groq generation failed (" + response.status + ").");
          continue;
        }
        const text = (await response.json())?.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim()) return { text, model };
        lastError = new Error("Groq returned an empty generation.");
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastError;
}

/** Generates and sanitizes a topic page using Groq, without Gemini generation fallback. */
export async function generateGroqTopicPage({ name, category, context, choices, fixes = [], env, fetchImpl = fetch, timeoutMs }) {
  const deep = cleanChoices(choices).depth === "full";
  const { text, model } = await askGroqModel(buildPrompt({ name, category, context, choices, fixes }), {
    env,
    fetchImpl,
    timeoutMs: timeoutMs ?? (deep ? 40000 : 35000),
    maxTokens: deep ? 8500 : 4500,
  });
  const json = extractJson(text);
  if (!json) throw new Error("Groq returned no valid JSON.");
  const page = sanitizePage(json, { name, category, choices });
  return page.medical ? { ...page, kind: kindOf(category, name), model, generatedAt: new Date().toISOString().slice(0, 10) } : page;
}

/**
 * Groq drafts; Gemini independently reviews. A maximum of one targeted rewrite
 * are allowed. Any unresolved clinical issue or unavailable reviewer holds the
 * page back: topicAiCore must never save an unreviewed draft as published.
 */
export async function generateReviewedTopicPage(input, { env, fetchImpl = fetch, maxFixRounds = 1, timeoutMs } = {}) {
  const rounds = Math.max(0, Math.min(2, Number(maxFixRounds) || 0));
  const fixes = [];
  let page;
  let review;
  for (let round = 0; round <= rounds; round++) {
    page = await generateGroqTopicPage({ ...input, fixes, env, fetchImpl, timeoutMs });
    if (!page.medical) return { page, review: { status: "not_applicable", rounds: round } };
    const pageText = [
      page.summary,
      ...(page.sections ?? []).flatMap((x) => [x.h, x.p, ...(x.b ?? []), ...(x.t ?? []).flatMap((r) => [r.a, r.b])]),
      ...(page.exam ?? []),
      ...(page.faq ?? []).flatMap((x) => [x.q, x.a]),
    ].filter(Boolean).join(" ");
    const pageWords = pageText.trim().split(/\s+/).filter(Boolean).length;
    if ((page.sections?.length || 0) < 9 || (page.exam?.length || 0) < 8 || (page.faq?.length || 0) < 3 || String(page.summary || "").length < 100 || pageWords < 700) {
      if (round < rounds) {
        fixes.push("The draft is too thin. Write at least nine substantive topic-specific sections, at least 700 meaningful words, eight examiner questions and three FAQs. Include the relevant physiology, mechanisms, types/classification, clinical application, investigations and interpretation, management and pharmacology where applicable. Do not pad or invent facts.");
        continue;
      }
      throw new Error("Topic page did not meet the minimum comprehensive-note standard after the correction round.");
    }
    const reviewKind = kindOf(input.category ?? "", input.name ?? "");
    const reviewHeadings = cleanChoices(input.choices).depth === "full" ? DEEP_KINDS[reviewKind] : KINDS[reviewKind];
    const reviewMinimumSections = cleanChoices(input.choices).depth === "full" ? Math.max(9, reviewHeadings.length - 1) : Math.max(3, reviewHeadings.length - 1);
    const reviewRequirements = ({
      disease: "aetiology and risk factors, pathophysiology, clinical features, differential diagnosis, investigations and interpretation, management rationale, complications and follow-up",
      anatomy: "development, spatial relations, blood and nerve supply, lymphatic drainage, histology, function and applied clinical anatomy",
      physiology: "normal mechanisms, cellular processes, feedback regulation, integration between systems, pathophysiology and clinical/laboratory correlations",
      pharmacology: "drug classification and prototypes, mechanism, pharmacokinetics, pharmacodynamics, indications, contraindications, adverse effects, interactions and monitoring",
      pathology: "aetiology, pathogenesis, gross and microscopic morphology, diagnostic features, grading/staging, complications and prognosis",
      microbe: "classification, morphology, virulence, transmission, pathogenesis, specimen selection, laboratory diagnosis, treatment, resistance and prevention",
      biochemistry: "molecules, enzymes, pathway steps, rate-limiting reactions, cofactors, regulation, laboratory assessment and clinical correlations",
      publicHealth: "epidemiology, determinants, surveillance, prevention, screening, implementation, health-system considerations, equity and evaluation",
      general: "the core concepts, mechanisms, types, practical applications, examples, limitations and common misconceptions",
    })[reviewKind];
    const reviewPrompt = `You are an independent senior clinical and scientific reviewer for a public-facing health education site and medical students in Kenya. Review the complete page for accuracy, accessibility AND completeness. Do not demand disease-only sections from anatomy, physiology, pharmacology, pathology, microbiology, biochemistry or public-health topics. You MUST: (1) verify the selected clinical entity against the topic name, category and context; flag mixed entities, especially causes/features/management borrowed from a different population or condition; (2) verify that the first summary sentence and clinicalScope identify the selected entity; (3) flag any section whose content does not match its heading (for example investigations placed under Clinical relevance); (4) perform a topic-type missing-sections and minimum-depth check. Expected section headings: ${reviewHeadings.join("; ")}. At least ${reviewMinimumSections} substantive sections and 700 meaningful words are required; flag a page that is substantially shorter or omits any of these topic-specific essentials: ${reviewRequirements}; (5) check incorrect diagnostic criteria or thresholds, wrong drug or management advice, unsafe omissions, inaccurate examination signs, contradictory facts and incorrect exam answers. Do not flag style or optional additions. Do not pass a page just because the prose is fluent. Be conservative about clinical claims, but strict about missing core content. If none, return exactly {"verdict":"ok","issues":[]}. Otherwise return {"verdict":"issues","issues":[{"severity":"high|medium","where":"section and short exact quote","problem":"specific error or omission","fix":"clinically correct replacement or specific missing content to add"}]}.
TITLE: ${input.name}
CATEGORY: ${input.category ?? "unspecified"}
SELECTED SCOPE: ${page.clinicalScope ?? "not stated"}
PAGE:
${JSON.stringify({ title: page.title, clinicalScope: page.clinicalScope, summary: page.summary, sections: page.sections, whenToSeekHelp: page.whenToSeekHelp, faq: page.faq, exam: page.exam }).slice(0, 24000)}`;
    const result = await askGeminiModel(reviewPrompt, { env, fetchImpl, timeoutMs: timeoutMs ?? 35000, maxTokens: 2200 });
    const parsed = extractJson(result.text);
    if (!parsed || !Array.isArray(parsed.issues) || !["ok", "issues"].includes(parsed.verdict) || (parsed.verdict === "issues" && parsed.issues.length === 0) || (parsed.verdict === "ok" && parsed.issues.length !== 0)) {
      throw new Error("Gemini clinical review returned an invalid response; page held back.");
    }
    const issues = parsed.issues.map((x) => ({
      severity: x?.severity === "high" ? "high" : "medium",
      where: clip(x?.where, 140),
      problem: clip(x?.problem, 300),
      fix: clip(x?.fix, 300),
    })).filter((x) => x.where && x.problem.length >= 8 && x.fix.length >= 8).slice(0, 12);
    if (parsed.verdict === "issues" && issues.length === 0) throw new Error("Gemini returned malformed clinical findings; page held back.");
    review = { status: issues.length ? "issues" : "passed", model: result.model, rounds: round, issues };
    if (!issues.length) {
      return { page: { ...page, aiReview: { status: "passed", model: result.model, reviewedAt: new Date().toISOString().slice(0, 10), fixRounds: round } }, review };
    }
    if (round === rounds) break;
    fixes.push(...issues.map((x) => `[${x.severity}] ${x.where}: ${x.problem}. Correct statement: ${x.fix}`));
  }
  const summary = (review?.issues ?? []).map((x) => `${x.where}: ${x.problem}`).join(" | ").slice(0, 500);
  throw new Error("Clinical review held this page back after targeted correction attempts: " + summary);
}

/** Writes a checked page (or {medical:false}). `fetchImpl` is injectable for tests. */
export async function generateTopicPage(input) {
  const result = await generateReviewedTopicPage(input, { env: input.env, fetchImpl: input.fetchImpl ?? fetch, timeoutMs: input.timeoutMs, maxFixRounds: 1 });
  return result.page;
}

/**
 * Groq first (a few seconds, free, keys in turn), then Gemini (keys in turn) when Groq is out of quota or down.
 * env: { GROQ_API_KEYS, GEMINI_API_KEYS }.
 */
export async function generateWithFallback(input, env) {
  // Keep the historical export name for callers, but do not fall back to Gemini:
  // Gemini is reserved for the independent review stage.
  return generateGroqTopicPage({ ...input, env });
}

/** The second layer: deep exam notes, written in three focused parts (run in parallel) that build on the revision page without repeating it. */
const DEEP_PARTS = {
  clinical: {
    ask: 'Write 3 or 4 sections, in this order: "Bedside: history and how to examine" (the history questions as bullets, then the examination step by step: each named sign, how to elicit it, what a positive result means, and what a bedside test cannot tell you), "Investigations and how to read them" (use the "t" table: every test, the question it answers and how to read the result, including indices and diagnostic criteria, plus what to do when a test is unavailable), "Diagnosis, staging and severity" (the recognised criteria or classification, written as bullets), and if it fits "Look-alike conditions" (use the "t" table: condition, what points to it, how to separate it).',
    out: '{"sections": [{"h": "heading", "p": "one short paragraph", "b": ["bullet"], "t": [{"a": "test or item", "b": "the question it answers and what the result means"}]}]}',
  },
  management: {
    ask: 'Write 4 or 5 sections, in this order: "Management step by step" (a numbered ladder in bullets: first things first, definitive treatment, monitoring, when to escalate or refer; name drug classes and medicines with the reason for each choice and what to avoid and why; no doses), "Drug effects and what to do" (the important adverse effects and interactions, and the action for each), "Complications and when to escalate", "Complicating and confounding factors" (HIV, TB, malnutrition, pregnancy, diabetes, drugs and herbal remedies, alcohol, kidney or liver failure, age extremes: how each changes the picture, the results or the treatment) and "Special groups" (children, pregnancy, the elderly, people with HIV, low-resource settings).',
    out: '{"sections": [{"h": "heading", "p": "one short paragraph", "b": ["bullet"], "t": [{"a": "item", "b": "what it means or what to do"}]}]}',
  },
  exam: {
    ask: 'Do NOT write sections. Write the examination material. Think of what Kenyan university examiners (viva, OSCE and written) most probably ask on this topic: put the MOST likely questions first. Write: "facts": 8 to 10 numbers, cut-offs, criteria or drug names a student must memorise, each one short line; "mnemonics": 0 to 3 memory aids, ONLY well-known standard ones taught in textbooks (for example RIPE for the first-line TB drugs); never invent an acronym, an empty list is better than an invented one; "vivas": 15 to 18 questions with answers, mixed: definitions, bedside "what would you do next", interpreting a result, "why is this avoided", "how do you tell X from Y", complications; each answer 1 to 3 sentences with the key points; set "hot": true on the 5 most probable questions; "mcqs": 6 to 8 multiple-choice questions, mostly clinical scenarios, each with exactly 4 options, "a" the index (0 to 3) of the one correct option, and "e" a one-sentence reason; "cases": 2 short clinical cases (age, presentation, findings) each with 3 questions and model answers; "mistakes": 6 to 8 common mistakes students make or that cost marks. If a list of PAST-PAPER questions is given, answer each of them inside "vivas" or "mcqs" and set "past": true on those.',
    out: '{"facts": ["..."], "mnemonics": [{"n": "name", "t": "what it stands for and why it matters"}], "vivas": [{"q": "question", "a": "answer", "hot": true, "past": false}], "mcqs": [{"q": "stem", "o": ["A", "B", "C", "D"], "a": 0, "e": "reason", "past": false}], "cases": [{"v": "vignette", "qs": [{"q": "question", "a": "answer"}]}], "mistakes": ["..."]}',
  },
};

export function buildDeepPrompt({ name, category, base, part = "clinical", past = [], fixes = [] }) {
  const have = (Array.isArray(base?.sections) ? base.sections : []).map((x) => String(x?.h ?? "")).filter(Boolean).join("; ");
  const points = (Array.isArray(base?.sections) ? base.sections : []).flatMap((x) => [x?.p, ...(Array.isArray(x?.b) ? x.b : [])]).filter(Boolean).map((x) => clip(x, 110)).slice(0, 24).join(" | ");
  const asked = (Array.isArray(base?.exam) ? base.exam : []).map((x) => clip(String(x).split(" — ")[0], 100)).slice(0, 8).join(" | ");
  const pastList = (Array.isArray(past) ? past : []).map((x) => clip(x, 220)).filter(Boolean).slice(0, 12);
  const P = DEEP_PARTS[part] ?? DEEP_PARTS.clinical;
  return `You are a clinical reasoning tutor writing PART OF the DEEP EXAM NOTES for "${name}" (area: ${category || "medicine"}), for a Year 4 clinical student in East African and other low-resource hospitals. The site already has a SHORT REVISION page; the deep notes sit behind it and must not repeat it.

The revision page already has these sections: ${have || "(none)"}.
Points it already makes: ${clip(points, 2200)}
Examiner questions it already asks: ${clip(asked, 800)}
${pastList.length ? `\nPAST-PAPER questions asked at this medical school on this topic (examiners repeat themselves, so answer each):\n- ${pastList.join("\n- ")}\n` : ""}
${fixes.length ? `\nA REVIEWER FOUND THESE ERRORS IN AN EARLIER DRAFT. Do not repeat them: wherever your text touches these facts, state them correctly:\n- ${fixes.map((x) => clip(x, 260)).join("\n- ")}\n` : ""}
YOUR PART: ${P.ask}
${DEEP_RULES}
${ACCURACY_RULES}
Reply with ONLY one JSON object of this shape: ${P.out}
Be thorough: this is exam-preparation material, so write 4 to 8 bullets or a short paragraph plus bullets in every section. Rules: standard accepted medical knowledge only; leave out anything you are unsure of; no doses, no brand names, no invented statistics. Every bullet under 45 words. Plain words.`;
}

const noAngle = (v) => String(v ?? "").replace(/<(?=[A-Za-z/!])/g, "< ");
const okLine = (v, max) => { const t = clip(noAngle(v), max); return t && !DOSE.test(t) ? t : ""; };

/** Checks the sections the model returned for one part (same safety rules as a page: no doses, no links, no tags). */
function cleanSections(rawSections, name) {
  if (!Array.isArray(rawSections) || !rawSections.length) return [];
  // the page check wants at least three sections; the padding is removed again afterwards
  const pad = ["a", "b", "c"].map((k) => ({ h: `__pad${k}`, p: "Padding text so a short part passes the page check." }));
  const page = sanitizePage({ medical: true, summary: `Deep exam notes on ${name}, covering what the revision page leaves out.`, sections: [...rawSections.map((x) => ({ ...x, h: noAngle(x?.h), p: noAngle(x?.p), b: (x?.b ?? []).map(noAngle), t: (x?.t ?? []).map((r) => ({ a: noAngle(r?.a), b: noAngle(r?.b) })) })), ...pad], exam: [] });
  // the questions live in their own lists, so a section the model made out of them is dropped
  return page.sections.filter((x) => !x.h.startsWith("__pad") && !/practice question|exam practice|viva|mcq|^questions?\b/i.test(x.h));
}

/** Checks and merges the three parts into one deep-notes object. Throws when the notes are too thin to be worth saving. */
export function sanitizeDeep(parts, name = "this topic") {
  const list = Array.isArray(parts) ? parts : [parts];
  const sections = [];
  let exam = {};
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    try { sections.push(...cleanSections(raw.sections, name)); } catch { /* a part with too few sections adds nothing */ }
    if (raw.vivas || raw.mcqs || raw.facts || raw.cases) exam = raw;
    // the first version of the deep notes only had "exam": strings "question — answer"
    if (!exam.vivas && Array.isArray(raw.exam)) exam = { ...exam, vivas: raw.exam.map((x) => { const [q, ...r] = String(x).split(" — "); return { q, a: r.join(" — ") }; }) };
  }
  const vivas = (Array.isArray(exam.vivas) ? exam.vivas : []).map((x) => ({ q: okLine(x?.q, 320), a: okLine(x?.a, 700), ...(x?.hot ? { hot: true } : {}), ...(x?.past ? { past: true } : {}) })).filter((x) => x.q.length >= 10 && x.a.length >= 8).slice(0, 20);
  const written = (Array.isArray(exam.mcqs) ? exam.mcqs : []).map((x) => {
    const o = (Array.isArray(x?.o) ? x.o : []).map((v) => okLine(v, 200));
    const a = Number(x?.a);
    return { q: okLine(x?.q, 500), o, a, e: okLine(x?.e, 400), ...(x?.past ? { past: true } : {}) };
  }).filter((x) => x.q.length >= 15 && x.o.length === 4 && x.o.every(Boolean) && new Set(x.o).size === 4 && Number.isInteger(x.a) && x.a >= 0 && x.a <= 3).slice(0, 10);
  // where the right answers sit is decided here, not by the model: one even deal for the page (the same deal for the same questions)
  const dealt = placeNewQuestions(written.map((x) => ({ question: x.q, options: x.o, correct_answer: x.a, explanation: x.e })), { rand: seededRandom(`${name}:${written.map((x) => x.q).join("|")}`) });
  const mcqs = written.map((x, i) => ({ ...x, o: dealt[i].options, a: dealt[i].correct_answer }));
  const cases = (Array.isArray(exam.cases) ? exam.cases : []).map((c) => ({
    v: okLine(c?.v, 600),
    qs: (Array.isArray(c?.qs) ? c.qs : []).map((x) => ({ q: okLine(x?.q, 300), a: okLine(x?.a, 600) })).filter((x) => x.q.length >= 8 && x.a.length >= 8).slice(0, 4),
  })).filter((c) => c.v.length >= 30 && c.qs.length >= 2).slice(0, 3);
  const facts = (Array.isArray(exam.facts) ? exam.facts : []).map((x) => okLine(x, 200)).filter((x) => x.length >= 6).slice(0, 12);
  const mnemonics = (Array.isArray(exam.mnemonics) ? exam.mnemonics : []).map((x) => ({ n: okLine(x?.n, 60), t: okLine(x?.t, 300) })).filter((x) => x.n && x.t.length >= 8).slice(0, 5);
  const mistakes = (Array.isArray(exam.mistakes) ? exam.mistakes : []).map((x) => okLine(x, 220)).filter((x) => x.length >= 8).slice(0, 10);
  const words = sections.map((x) => [x.h, x.p, ...(x.b ?? []), ...(x.t ?? []).flatMap((r) => [r.a, r.b])].filter(Boolean).join(" ")).join(" ").trim().split(/\s+/).filter(Boolean).length;
  if (sections.length < 7 || vivas.length < 12 || mcqs.length < 6 || cases.length < 2 || facts.length < 6 || mistakes.length < 5 || words < 900) {
    throw new Error("deep notes do not meet the comprehensive standard (need 7 sections, 12 vivas, 6 MCQs, 2 cases, 6 facts, 5 common mistakes and 900 explanatory words)");
  }
  // "exam" keeps the question and answer as one line each, so older pages and the database checks still read the notes
  return { sections: sections.slice(0, 14), facts, mnemonics, vivas, mcqs, cases, mistakes, exam: vivas.slice(0, 14).map((x) => `${x.q} — ${x.a}`) };
}

export async function generateDeepNotes({ name, category, base, past = [], fixes = [], env, fetchImpl = fetch, timeoutMs }) {
  const run = async (part) => {
    const { text, model } = await askModel(buildDeepPrompt({ name, category, base, part, past, fixes }), { env, fetchImpl, timeoutMs: timeoutMs ?? 55000, maxTokens: 6000 });
    const json = extractJson(text);
    if (!json) throw new Error("no JSON in the reply");
    return { json, model };
  };
  const done = await Promise.all(["clinical", "management", "exam"].map(run));
  return { ...sanitizeDeep(done.map((d) => d.json), name), model: done[0].model, generatedAt: new Date().toISOString().slice(0, 10) };
}

/**
 * Deep-note generation is Groq-only. Gemini is reserved for the independent
 * clinical review performed by generateCheckedDeep.
 */
/** Deep-note generation is Groq-only; Gemini is reserved for independent verification. */
export async function generateDeepWithFallback(input, env) {
  const groq = String(env.GROQ_API_KEYS ?? env.GROQ_API_KEY ?? "").trim();
  if (!groq) throw new Error("GROQ_API_KEYS is required for deep-note generation; Gemini is reserved for verification.");
  return generateDeepNotes({ ...input, timeoutMs: input.timeoutMs ?? 55000, env: { GROQ_API_KEYS: groq, GROQ_MODELS: env.GROQ_MODELS } });
}

/** The first complete JSON object in a model's reply (text before or after it, or a second object, is ignored). Returns null when there is none. */
export function extractJson(text) {
  const t = String(text ?? "");
  for (let start = t.indexOf("{"); start >= 0; start = t.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { break; } }
    }
  }
  return null;
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
  const hasModel = env.GROQ_API_KEYS || env.GROQ_API_KEY;
  const hasReviewer = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || env.GEMINI_API_KEY_2 || env.GEMINI_API_KEY_3;
  if (!url || !svc || !hasModel || !hasReviewer) return { code: 503, body: { status: "unavailable" } };

  const rest = (p, init = {}) => fetchImpl(`${url}/rest/v1/${p}`, { ...init, headers: { apikey: svc, Authorization: `Bearer ${svc}`, "content-type": "application/json", ...(init.headers || {}) } });
  const save = async (row, createIfMissing = false) => {
    const path = createIfMissing
      ? "topic_pages?on_conflict=slug"
      : `topic_pages?slug=eq.${encodeURIComponent(slug)}&status=neq.published`;
    const response = await rest(path, {
      method: createIfMissing ? "POST" : "PATCH",
      headers: { Prefer: createIfMissing ? "resolution=ignore-duplicates,return=minimal" : "return=representation" },
      body: JSON.stringify({ slug, name, category: input.category ?? null, updated_at: new Date().toISOString(), ...row }),
    });
    if (!response.ok) throw new Error(`topic_pages write failed (${response.status})`);
    return createIfMissing ? [] : response.json();
  };
  try {
    const found = await rest(`topic_pages?slug=eq.${encodeURIComponent(slug)}&select=status,content,updated_at`);
    if (!found.ok) throw new Error(`topic_pages lookup failed (${found.status})`);
    const have = (await found.json())[0];
    if (have?.status === "published" && have.content) return { code: 200, body: { status: "published", slug, page: have.content } };
    if (have?.status === "rejected") return { code: 404, body: { status: "rejected" } };
    const age = have ? Date.now() - Date.parse(have.updated_at || 0) : Infinity;
    if (have?.status === "generating" && age < 3 * 60_000) return { code: 202, body: { status: "generating" } };
    if (have?.status === "failed" && age < 10 * 60_000) return { code: 502, body: { status: "failed" } };

    const cap = Number(env.TOPIC_AI_DAILY_CAP || 60);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const count = await rest(`topic_pages?created_at=gte.${encodeURIComponent(since)}&select=slug`, { headers: { Prefer: "count=exact", Range: "0-0" } });
    if (!count.ok) throw new Error(`topic_pages count failed (${count.status})`);
    if (Number((count.headers.get("content-range") || "").split("/")[1] || 0) >= cap) return { code: 429, body: { status: "busy" } };

    await save({ status: "generating" }, !have);
    let page;
    try {
      const result = await generateReviewedTopicPage({ name, category: String(input.category ?? ""), context: String(input.context ?? "").slice(0, 3500), env, fetchImpl }, { env, fetchImpl });
      page = result.page;
    } catch {
      await save({ status: "failed" });
      return { code: 502, body: { status: "failed" } };
    }
    if (!page.medical) {
      await save({ status: "rejected" });
      return { code: 404, body: { status: "rejected" } };
    }
    if (page.aiReview?.status !== "passed" || !page.aiReview?.model) {
      await save({ status: "failed" });
      return { code: 502, body: { status: "failed" } };
    }
    const reviewedAt = new Date().toISOString();
    const saved = await save({
      status: "published",
      content: page,
      model: page.model,
      generator_model: page.model,
      ai_review_status: "passed",
      ai_review_model: page.aiReview.model,
      ai_reviewed_at: reviewedAt,
      ai_review_fix_rounds: Math.max(0, Math.min(2, Number(page.aiReview.fixRounds) || 0)),
      reviewed: false,
    });
    if (!saved?.length) {
      const latest = await rest(`topic_pages?slug=eq.${encodeURIComponent(slug)}&select=status,content`);
      if (!latest.ok) throw new Error("Could not confirm the published topic page.");
      const current = (await latest.json())[0];
      if (current?.status === "published" && current.content) return { code: 200, body: { status: "published", slug, page: current.content } };
      throw new Error("Topic page was not persisted.");
    }
    return { code: 200, body: { status: "published", slug, page } };
  } catch {
    return { code: 502, body: { status: "failed" } };
  }
}
