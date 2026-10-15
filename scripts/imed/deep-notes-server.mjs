// One-off: two layers per topic. The short revision page stays the default and is written exactly as before. The deep exam notes are a second,
// separate write that looks at what the revision page already has and adds what is missing; they are written once, on request, and saved.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };

edit("supabase/functions/_shared/topicAi.js", (s) => {
  if (s.includes("buildDeepPrompt")) return s;
  // the revision page goes back to how it was written before
  s = swap(s, 'physiology: ["Overview", "How it works", "Regulation", "What goes wrong", "Clinical correlations", "Investigations and how to read them", "Common exam traps", "Exam pearls"],', 'physiology: ["Overview", "How it works", "Regulation", "What goes wrong", "Clinical relevance", "Exam pearls"],');
  s = swap(s, 'general: ["Overview", "Key concepts", "How it works", "Clinical relevance", "Investigations or applications", "Related conditions", "Common mistakes", "Exam pearls"],', 'general: ["Overview", "Key concepts", "Clinical relevance", "Exam pearls", "Common mistakes"],');
  s = swap(s, 'depth: pick(c?.depth, ["quick", "full"], "full"),', 'depth: pick(c?.depth, ["quick", "full"], "quick"),');
  s = swap(s, '\n  // the publishing rule: a full page is only accepted when it is deep (7+ sections, 8+ examiner questions); a thin answer is retried with the next key or provider\n  if (deep && page.medical && (page.sections.length < 7 || page.exam.length < 8)) throw new Error("too thin");', "");
  s = swap(s, "export const slugOf =", `/** The second layer: deep exam notes that build on the revision page, so the writer is told what is already there and asked for what is missing. */
export function buildDeepPrompt({ name, category, base }) {
  const have = (Array.isArray(base?.sections) ? base.sections : []).map((x) => String(x?.h ?? "")).filter(Boolean).join("; ");
  const points = (Array.isArray(base?.sections) ? base.sections : []).flatMap((x) => [x?.p, ...(Array.isArray(x?.b) ? x.b : [])]).filter(Boolean).map((x) => clip(x, 110)).slice(0, 24).join(" | ");
  const asked = (Array.isArray(base?.exam) ? base.exam : []).map((x) => clip(String(x).split(" — ")[0], 100)).slice(0, 8).join(" | ");
  return \`You are a clinical reasoning tutor. The site already has a SHORT REVISION page on "\${name}" (area: \${category || "medicine"}). Write the DEEP EXAM NOTES that sit behind it, for a Year 4 clinical student in East African and other low-resource hospitals.

The revision page already has these sections: \${have || "(none)"}.
Points it already makes: \${clip(points, 2600)}
Examiner questions it already asks: \${clip(asked, 900)}

Do NOT repeat the revision page. First decide what an examiner could ask on "\${name}" that the revision page does not answer, then write those sections in depth. Choose the sections that fit this topic from: bedside history and how to examine; how to read each investigation (with calculated indices and diagnostic criteria); severity and staging; complicating and confounding factors; step by step management and monitoring; complications and when to escalate; special groups; where results mislead; look-alike conditions.
\${DEEP_RULES}
Reply with ONLY one JSON object: {"sections": [{"h": "heading", "p": "short paragraph", "b": ["bullet"], "t": [{"a": "test or item", "b": "the question it answers and what the result means"}]}], "exam": ["10-12 NEW tricky examiner questions that are not in the list above, each followed by ' — ' and the key points of a good answer"]}
5 to 9 sections. Rules: standard accepted medical knowledge only; leave out anything you are unsure of; no doses, no brand names, no invented statistics. Every bullet under 40 words. Plain words.\`;
}

/** Checks the deep notes with the same safety rules as a page (no doses, no links). Throws when they are too thin to be worth saving. */
export function sanitizeDeep(raw, name = "this topic") {
  const page = sanitizePage({ medical: true, summary: \`Deep exam notes on \${name}, covering what the revision page leaves out.\`, sections: raw?.sections, exam: raw?.exam });
  if (page.sections.length < 4 || page.exam.length < 6) throw new Error("deep notes too thin");
  return { sections: page.sections, exam: page.exam };
}

export async function generateDeepNotes({ name, category, base, env, fetchImpl = fetch, timeoutMs }) {
  const { text, model } = await askModel(buildDeepPrompt({ name, category, base }), { env, fetchImpl, timeoutMs: timeoutMs ?? 55000, maxTokens: 9000 });
  const m = text.match(/\\{[\\s\\S]*\\}/);
  if (!m) throw new Error("no JSON in the reply");
  return { ...sanitizeDeep(JSON.parse(m[0]), name), model, generatedAt: new Date().toISOString().slice(0, 10) };
}

/** Groq first (free), then Gemini, the same order as the revision page. */
export async function generateDeepWithFallback(input, env) {
  const groq = String(env.GROQ_API_KEYS ?? "").trim();
  if (groq) { try { return await generateDeepNotes({ ...input, timeoutMs: 32000, env: { GROQ_API_KEYS: groq } }); } catch { /* fall back to Gemini */ } }
  return generateDeepNotes({ ...input, timeoutMs: groq ? 24000 : input.timeoutMs, env: { GEMINI_API_KEYS: env.GEMINI_API_KEYS, GROQ_API_KEYS: groq } });
}

export const slugOf =`);
  return s;
});

edit("api/_lib/topicWrite.js", (s) => {
  if (s.includes("generateDeepWithFallback")) return s;
  s = swap(s, 'import { generateWithFallback, validName } from', 'import { generateWithFallback, generateDeepWithFallback, validName } from');
  s = swap(s, "  try {\n    const input = {", `  if (body.mode === "deep") {
    // the deep exam notes: a second write that builds on the revision page it is given
    try {
      const base = body.base && typeof body.base === "object" ? body.base : {};
      const deep = await generateDeepWithFallback({ name, category: String(body.category ?? "").slice(0, 60), base }, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: keys });
      return res.status(200).json({ status: "published", deep });
    } catch (e) {
      return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: /429|503/.test(String(e?.message)) ? "busy" : "failed" });
    }
  }
  try {
    const input = {`);
  return s;
});
console.log("server side done");
