// Delayed clinical topic review. Pages are fetched one at a time; only section patches are sent back to SQL.
const TOPIC_URL = "https://www.ompathstudy.com/topic/";
const list = (value) => [...new Set(String(value || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];
const json = (value) => JSON.stringify(value);
const parseJson = (text) => {
  const source = String(text || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = source.indexOf("{");
  if (start < 0) return null;
  let depth = 0, quote = false, escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') quote = false; continue; }
    if (c === '"') quote = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { try { return JSON.parse(source.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
};
async function completeGemini(env, prompt) {
  const keys = list(env.GEMINI_API_KEYS || env.GEMINI_API_KEY);
  const models = list(env.TOPIC_REVIEW_GEMINI_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite");
  let last = "Gemini reviewer is not configured";
  for (const key of keys) for (const model of models) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: json({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 9000, responseMimeType: "application/json" } })
      });
      if (!response.ok) { last = "Gemini " + response.status; continue; }
      const result = await response.json();
      const text = (result.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (text) return { text, model };
      last = "Gemini returned an empty review";
    } catch (error) { last = String(error?.message || error).slice(0, 120); }
  }
  throw new Error(last);
}
async function completeGroq(env, prompt, maxTokens = 9000) {
  const keys = list(env.GROQ_API_KEYS || env.GROQ_API_KEY);
  const models = list(env.GROQ_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b");
  let last = "Groq is not configured";
  for (const key of keys) for (const model of models) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: json({ model, temperature: 0.1, max_tokens: maxTokens, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] })
      });
      if (!response.ok) { last = "Groq " + response.status; continue; }
      const text = (await response.json()).choices?.[0]?.message?.content;
      if (text) return { text, model };
      last = "Groq returned an empty response";
    } catch (error) { last = String(error?.message || error).slice(0, 120); }
  }
  throw new Error(last);
}
const REVIEW_SYSTEM = `You are an independent senior medical evidence reviewer for an MBChB medical education library. Review the supplied topic page, not the quality of its prose alone. Check physiology directionality, causal mechanisms, recognised classifications only, diagnostic criteria, emergency steps and sequence, drug names/doses/routes, contradictions, MCQ answers and distractors, complete sentences, image relevance, type-specific missing sections, and material covered by standard authoritative references and guidelines (WHO, NICE, RCOG, FIGO, Resuscitation Council, ILCOR, ATLS, Kenya Ministry of Health, and specialist societies where relevant). Do not claim to have opened a reference or verified a guideline version unless the supplied material supports it. Mark unverifiable claims as unverifiable rather than guessing. A patient-information page is not an adequate comparator for MBChB depth; identify missing clinical and exam-relevant detail. Return ONLY JSON with exactly this shape: {"verdict":"approved|needs_fix|rejected","findings":[{"section":"section key or heading","claim":"specific claim being assessed","verdict":"supported|unsupported|contradicted|unverifiable","severity":"high|medium|low","reference":"guideline body/document/year or why unverifiable","suggested_fix":"complete replacement or precise correction"}],"missing_sections":["section key"],"completeness_score":0.0}. Keep findings specific and actionable. Do not invent citations, statistics, stages or recommendations.`;
function reviewPrompt(page, name, category) {
  return REVIEW_SYSTEM + "\nTopic: " + name + "\nCategory: " + category + "\nTopic type: " + page.topicType + "\nPage JSON: " + json(page);
}
function isCriticalHigh(finding) {
  return finding.severity === "high" && /management|drug|dose|classification|diagnos|criteria|algorithm|emergency|procedure|resuscitation/i.test(String(finding.section || "") + " " + String(finding.claim || ""));
}
function normaliseReview(raw) {
  const verdict = ["approved", "needs_fix", "rejected"].includes(raw?.verdict) ? raw.verdict : "needs_fix";
  const findings = (Array.isArray(raw?.findings) ? raw.findings : []).map((f) => ({
    section: String(f.section || "general").slice(0, 120), claim: String(f.claim || "").slice(0, 1200),
    verdict: ["supported", "unsupported", "contradicted", "unverifiable"].includes(f.verdict) ? f.verdict : "unverifiable",
    severity: ["high", "medium", "low"].includes(f.severity) ? f.severity : "medium",
    reference: String(f.reference || "").slice(0, 500), suggested_fix: String(f.suggested_fix || "").slice(0, 1800)
  })).filter((f) => f.claim);
  return { verdict, findings, missing_sections: Array.isArray(raw?.missing_sections) ? raw.missing_sections.map(String).slice(0, 30) : [], completeness_score: Math.max(0, Math.min(1, Number(raw?.completeness_score) || 0)) };
}
async function rewriteAffected(env, page, review, name) {
  const keys = new Set([
    ...review.findings.filter((f) => !isCriticalHigh(f) && f.suggested_fix && f.verdict !== "supported").map((f) => f.section),
    ...review.missing_sections
  ]);
  if (!keys.size) return null;
  const affected = (page.sections || []).filter((s) => keys.has(s.key) || keys.has(s.h) || keys.has(s.heading));
  const instructions = review.findings.filter((f) => keys.has(f.section)).map((f) => ({ section: f.section, claim: f.claim, reference: f.reference, correction: f.suggested_fix, severity: f.severity }));
  const prompt = "You are the Groq medical content generator. Rewrite ONLY the affected sections of the existing " + page.topicType + " page for " + name + ". Return ONLY JSON {\"sections\":[{\"key\":\"\",\"heading\":\"\",\"applicable\":true,\"confidence\":\"high|medium|low\",\"content\":{\"p\":\"complete paragraphs\",\"b\":[],\"t\":[],\"images\":[]}}],\"faq\":[],\"exam\":[],\"mcqs\":[]}. Existing affected sections: " + json(affected) + ". Findings: " + json(instructions) + ". Missing sections: " + json(review.missing_sections) + ". Correct only evidence-supported errors, generate missing sections to the schema depth, preserve unrelated correct content, do not invent doses, statistics, classification, URLs or citations, and write complete sentences.";
  const result = await completeGroq(env, prompt, 11000);
  const parsed = parseJson(result.text);
  if (!parsed || (!Array.isArray(parsed.sections) && !Array.isArray(parsed.faq) && !Array.isArray(parsed.exam) && !Array.isArray(parsed.mcqs))) throw new Error("Groq returned an invalid section patch");
  return { sections: Array.isArray(parsed.sections) ? parsed.sections : [], faq: Array.isArray(parsed.faq) ? parsed.faq : null, exam: Array.isArray(parsed.exam) ? parsed.exam : null, mcqs: Array.isArray(parsed.mcqs) ? parsed.mcqs : null, model: result.model };
}
async function rest(env, path, options = {}) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase service credentials are missing");
  const response = await fetch(base + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: options.prefer || "return=representation" },
    body: options.body ? json(options.body) : undefined
  });
  if (!response.ok) throw new Error("Supabase REST " + response.status + ": " + (await response.text()).slice(0, 240));
  return response.status === 204 ? null : response.json();
}
async function rpc(env, name, args) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(base + "/rest/v1/rpc/" + name, { method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: json(args) });
  if (!response.ok) throw new Error("Review RPC " + name + " failed: " + response.status);
  return response.json();
}
async function purgeTopic(env, slug) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) return false;
  const response = await fetch("https://api.cloudflare.com/client/v4/zones/" + env.CLOUDFLARE_ZONE_ID + "/purge_cache", {
    method: "POST", headers: { Authorization: "Bearer " + env.CLOUDFLARE_API_TOKEN, "Content-Type": "application/json" },
    body: json({ files: [TOPIC_URL + encodeURIComponent(slug)] })
  });
  if (!response.ok) throw new Error("Cloudflare cache purge failed: " + response.status);
  const result = await response.json();
  if (!result.success) throw new Error("Cloudflare rejected the cache purge");
  return true;
}
async function saveFindings(env, jobId, slug, findings) {
  if (!findings.length) return;
  await rest(env, "audit_findings", { method: "POST", prefer: "return=minimal", body: findings.map((f) => ({
    job_id: jobId, article_id: slug, section: f.section, claim: f.claim, verdict: f.verdict, severity: f.severity,
    reference: f.reference, suggested_fix: f.suggested_fix, status: "pending", requires_review: isCriticalHigh(f)
  })) });
}
async function updateJob(env, id, patch) {
  await rest(env, "review_jobs?id=eq." + encodeURIComponent(id), { method: "PATCH", prefer: "return=minimal", body: patch });
}
export async function runTopicReviewBatch(env, { limit = 5 } = {}) {
  const jobs = await rpc(env, "claim_topic_review_jobs", { p_limit: Math.min(5, Math.max(1, limit)) });
  const result = { claimed: Array.isArray(jobs) ? jobs.length : 0, approved: 0, needs_review: 0, fixed: 0, failed: 0 };
  for (const job of Array.isArray(jobs) ? jobs : []) {
    try {
      const rows = await rest(env, "topic_pages?select=slug,name,category,content,model,status&slug=eq." + encodeURIComponent(job.article_id) + "&limit=1");
      const pageRow = rows?.[0];
      if (!pageRow || pageRow.status !== "published" || !pageRow.content) {
        await updateJob(env, job.id, { status: "rejected", completed_at: new Date().toISOString(), last_error: "Published topic page no longer exists" });
        continue;
      }
      let page = pageRow.content;
      let approved = false, needsReview = false, loops = Number(job.loop_count || 0), changed = false, lastReview = null;
      const generatorWasGemini = /gemini/i.test(String(pageRow.model || page.model || ""));
      const reviewer = generatorWasGemini ? "groq" : "gemini";
      for (; loops <= 2; loops++) {
        const rawReview = reviewer === "gemini" ? await completeGemini(env, reviewPrompt(page, pageRow.name, pageRow.category)) : await completeGroq(env, reviewPrompt(page, pageRow.name, pageRow.category), 9000);
        lastReview = normaliseReview(parseJson(rawReview.text));
        if (lastReview.verdict === "approved" && lastReview.completeness_score >= 0.9 && lastReview.missing_sections.length === 0 && !lastReview.findings.some(isCriticalHigh) && !needsReview) {
          approved = true;
          await rest(env, "topic_pages?slug=eq." + encodeURIComponent(job.article_id), { method: "PATCH", prefer: "return=minimal", body: { ai_checked_at: new Date().toISOString(), ai_review_status: "approved", requires_review: false, review_status: "ai_checked", last_reviewed_at: new Date().toISOString(), review_loops: loops } });
          break;
        }
        await saveFindings(env, job.id, job.article_id, lastReview.findings);
        const critical = lastReview.findings.some(isCriticalHigh);
        const patch = await rewriteAffected(env, page, lastReview, pageRow.name).catch((error) => { throw error; });
        if (!patch || loops >= 2) { needsReview = true; break; }
        const safeSections = patch.sections.filter((s) => {
          const key = String(s.key || "");
          const related = lastReview.findings.filter((f) => f.section === key || f.section === s.heading || f.section === s.h);
          return !related.some(isCriticalHigh);
        });
        if (!safeSections.length && !patch.faq && !patch.exam && !patch.mcqs) { needsReview = true; break; }
        const applied = await rpc(env, "apply_topic_review_sections", {
          p_slug: job.article_id, p_sections: safeSections, p_faq: patch.faq, p_exam: patch.exam, p_mcqs: patch.mcqs,
          p_reason: "Automated " + reviewer.toUpperCase() + " review correction", p_source: reviewer + " topic review", p_loop: loops + 1
        });
        if (!applied?.ok) throw new Error("Section patch was not saved");
        const fresh = await rest(env, "topic_pages?select=content&slug=eq." + encodeURIComponent(job.article_id) + "&limit=1");
        page = fresh?.[0]?.content || page;
        changed = true;
        if (critical) needsReview = true;
      }
      if (approved) {
        await updateJob(env, job.id, { status: "approved", completed_at: new Date().toISOString(), loop_count: loops, last_error: null });
        result.approved++;
      } else {
        await rest(env, "topic_pages?slug=eq." + encodeURIComponent(job.article_id), { method: "PATCH", prefer: "return=minimal", body: { requires_review: true, ai_review_status: "needs_review", review_status: "needs_review", review_loops: Math.min(loops, 2) } });
        await updateJob(env, job.id, { status: "needs_review", completed_at: new Date().toISOString(), loop_count: Math.min(loops, 2), last_error: needsReview ? "Human review required or two correction loops exhausted" : "Review did not approve page" });
        result.needs_review++;
      }
      if (changed) { await purgeTopic(env, job.article_id); result.fixed++; }
    } catch (error) {
      await updateJob(env, job.id, { status: "failed", last_error: String(error?.message || error).slice(0, 400), completed_at: new Date().toISOString() }).catch(() => {});
      result.failed++;
    }
  }
  return result;
}
