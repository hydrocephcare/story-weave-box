import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 15;
const MAX_RUNTIME_MS = 140_000; // 140s wall-clock safety (edge functions allow up to 150s)

// ── MCQ detection & extraction ──

function isMcqContent(content: string): boolean {
  const text = content || "";
  const lines = text.split("\n");
  const questionHeadings = (text.match(/^\s*(?:#+\s*)?(?:\*\*)?question\s*\d+/gim) || []).length;
  const answerLines = (text.match(/^\s*\*{0,2}answer\s*[:\-]\s*[A-E](?:[\).]|\b)/gim) || []).length;
  const optionLines = lines.filter((line) => {
    const t = line.trim();
    return /^[A-Ea-e][\).]\s+/.test(t) && t.length <= 140 && !/\bmarks?\b/i.test(t);
  }).length;
  const inlineOptionRuns = (text.match(/\b[a-e][\).]\s+[^\n]{2,120}(?=\s+[b-e][\).]\s+)/gi) || []).length;
  const hasMcqKeywords = /\bmcq|multiple choice|choose the (?:best|correct) answer\b/i.test(text);

  return (
    (questionHeadings >= 3 && (optionLines >= 12 || answerLines >= 3)) ||
    (questionHeadings >= 5 && optionLines >= 8) ||
    (answerLines >= 5 && optionLines >= 10) ||
    (hasMcqKeywords && optionLines >= 6) ||
    inlineOptionRuns >= 2
  );
}

function looksLikeEssayContent(content: string): boolean {
  const text = content || "";
  const explicitEssayKeywords = /\b(?:essay|saq|laq|short\s+answer|long\s+answer)\b/i.test(text);
  const longEssaySignals = (text.match(/\blong\s+essay\s+question\b/gi) || []).length;
  const shortAnswerSignals = (text.match(/\bshort\s+answer\s+questions?\b/gi) || []).length;
  const marksSignals = (text.match(/\(\s*\d+\s*marks?\s*\)/gi) || []).length;
  const subQuestionSignals = (text.match(/^\s*[a-e][\).]\s+.+$/gim) || []).length;
  const essayDirectiveSignals = (text.match(/\b(?:discuss|outline|describe|explain|classify|differentiate|calculate)\b/gi) || []).length;
  return (
    explicitEssayKeywords || longEssaySignals >= 1 || shortAnswerSignals >= 1 ||
    (marksSignals >= 5 && subQuestionSignals >= 5 && essayDirectiveSignals >= 4)
  );
}

type ExtractedMcq = { question: string; options: string[]; correct_answer: number; explanation?: string };

function isLikelyValidMcqItem(item: ExtractedMcq): boolean {
  if (!item.question || item.question.trim().length < 8 || item.question.trim().length > 320) return false;
  if (!Array.isArray(item.options) || item.options.length < 4 || item.options.length > 6) return false;
  const maxLen = Math.max(...item.options.map((o) => o.trim().length));
  const avgLen = item.options.reduce((a, o) => a + o.trim().length, 0) / item.options.length;
  if (maxLen > 180 || avgLen > 90) return false;
  const all = `${item.question} ${item.options.join(" ")}`;
  if (/\b(?:long\s+essay|short\s+answer|\(\s*\d+\s*marks?\s*\)|discuss|describe|outline|explain)\b/i.test(all)) return false;
  return true;
}

function extractMcqsFromContent(content: string): ExtractedMcq[] {
  const questions: ExtractedMcq[] = [];
  const seen = new Set<string>();
  const normalized = (content || "").replace(/\r/g, "");

  const push = (item: ExtractedMcq | null) => {
    if (!item || !isLikelyValidMcqItem(item)) return;
    const key = item.question.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    questions.push(item);
  };

  const parseInline = (raw: string): ExtractedMcq | null => {
    const compact = raw.replace(/\*\*/g, " ").replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
    if (compact.length < 20) return null;
    const norm = compact.replace(/^[-*]\s*/, "").replace(/^question\s*\d+\s*[:\-.]?\s*/i, "").replace(/^\d+\.\s*/, "");
    const idx = norm.search(/\b[A-Ea-e][\).]\s+/);
    if (idx < 0) return null;
    const qText = norm.slice(0, idx).replace(/[:\-]\s*$/, "").trim();
    if (qText.length < 8) return null;
    const optPart = norm.slice(idx);
    const re = /([A-Ea-e])[\).]\s*([\s\S]*?)(?=(?:\s*[A-Ea-e][\).]\s)|(?:\s*Answer\s*[:\-])|(?:\s*Explanation\s*[:\-])|$)/g;
    const entries: [string, string][] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(optPart)) !== null) entries.push([m[1].toUpperCase(), m[2].trim()]);
    if (entries.length < 4) return null;
    const aLetter = optPart.match(/answer\s*[:\-]\s*([A-Ea-e])/i)?.[1]?.toUpperCase() || null;
    const correct = aLetter ? Math.max(0, entries.findIndex(([k]) => k === aLetter)) : 0;
    const explanation = optPart.match(/explanation\s*[:\-]\s*(.+)$/i)?.[1]?.trim();
    return { question: qText, options: entries.map(([, v]) => v), correct_answer: correct, explanation: explanation || undefined };
  };

  const headingBlocks = normalized.split(/(?=^\s*(?:#+\s*)?(?:\*\*)?question\s*\d+\b)/gim).filter((b) => /question\s*\d+/i.test(b));
  const qBlocks = headingBlocks.length > 0 ? headingBlocks : normalized.split(/(?=^\s*\d+\.\s+)/gm).filter((b) => /^\s*\d+\.\s+/.test(b));

  for (const block of qBlocks) {
    if (block.trim().length < 20) continue;
    const lines = block.split("\n");
    const qParts: string[] = [];
    const optMap: Record<string, string> = {};
    const expParts: string[] = [];
    let curOpt: string | null = null;
    let ansLetter: string | null = null;
    let inExp = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(?:#+\s*)?(?:\*\*)?question\s*\d+/i.test(line)) continue;
      const am = line.match(/^\*{0,2}answer\s*[:\-]\s*([A-Ea-e])/i);
      if (am) { ansLetter = am[1].toUpperCase(); curOpt = null; inExp = false; continue; }
      if (/^\*{0,2}explanation\s*[:\-]/i.test(line)) { inExp = true; curOpt = null; expParts.push(line.replace(/^\*{0,2}explanation\s*[:\-]\s*/i, "")); continue; }
      const om = line.match(/^([A-Ea-e])[\).]\s*(.+)$/);
      if (om) { curOpt = om[1].toUpperCase(); optMap[curOpt] = om[2].trim(); inExp = false; continue; }
      if (inExp) { expParts.push(line); continue; }
      if (curOpt) { optMap[curOpt] = `${optMap[curOpt]} ${line}`.trim(); continue; }
      qParts.push(line.replace(/^\d+\.\s*/, ""));
    }

    const entries = Object.entries(optMap).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length < 4) { push(parseInline(block)); continue; }
    const qText = qParts.join(" ").replace(/\s+/g, " ").trim();
    if (qText.length < 8) { push(parseInline(block)); continue; }
    let correct = 0;
    if (ansLetter) { const i = entries.findIndex(([k]) => k === ansLetter); if (i >= 0) correct = i; }
    const explanation = expParts.join(" ").replace(/\s+/g, " ").trim() || undefined;
    push({ question: qText, options: entries.map(([, v]) => v), correct_answer: correct, explanation });
  }

  if (questions.length < 5) {
    const inlines = normalized.split("\n").filter((l) => /\b[A-Ea-e][\).]\s/.test(l) && /answer\s*[:\-]\s*[A-Ea-e]/i.test(l));
    for (const l of inlines) push(parseInline(l));
  }

  return questions;
}

function normalizeTitle(title: string): string {
  const trimmed = (title || "").replace(/\s+/g, " ").trim();
  const clean = trimmed.replace(/^\d{4}\s+(end\s+year|mid\s+year|supplementary)\s+/i, "").replace(/^yr\s*\d+\s+/i, "").replace(/\s*\|\s*complete\s*set$/i, "").trim();
  if (clean.length > 10 && clean === clean.toUpperCase()) {
    return clean.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bMcq\b/g, "MCQ");
  }
  return clean || trimmed || "Untitled";
}

// ── Main handler: loops through ALL articles in batches ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const startedAt = Date.now();

    let cursor = "00000000-0000-0000-0000-000000000000";
    let totalScanned = 0;
    let totalMigrated = 0;
    const allLog: Array<{ id: string; title: string; mcqs: number }> = [];
    let batchesProcessed = 0;

    // Keep looping through batches until we run out of articles or time
    while (true) {
      // Time guard: stop if we're running low
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        console.log(`Time limit reached after ${batchesProcessed} batches, ${totalScanned} scanned, ${totalMigrated} migrated`);
        break;
      }

      const { data: articles, error: fetchErr } = await sb
        .from("articles")
        .select("id, title, content, category")
        .is("deleted_at", null)
        .eq("published", true)
        .order("id", { ascending: true })
        .gt("id", cursor)
        .limit(BATCH_SIZE);

      if (fetchErr) {
        console.error("Fetch error:", fetchErr.message);
        break;
      }

      if (!articles || articles.length === 0) {
        console.log("All articles processed.");
        break;
      }

      batchesProcessed++;

      for (const article of articles) {
        // Update cursor regardless
        cursor = article.id;
        totalScanned++;

        // Time guard per-article
        if (Date.now() - startedAt > MAX_RUNTIME_MS) break;

        const content = (article.content || "").slice(0, 32000);

        // Skip essays
        if (looksLikeEssayContent(content)) continue;

        // Check if MCQ content
        const titleHintsMcq = /\bmcq\b|multiple\s+choice/i.test(article.title || "");
        if (!isMcqContent(content) && !titleHintsMcq) continue;

        const mcqs = extractMcqsFromContent(content);
        if (mcqs.length < 3 && !(titleHintsMcq && mcqs.length >= 1)) continue;

        // Migrate: insert MCQ set
        const { error: insertErr } = await sb.from("mcq_sets").insert({
          title: normalizeTitle(article.title),
          questions: mcqs,
          published: true,
          original_notes: "",
          category: article.category || "Uncategorized",
          access_password: "",
        });

        if (insertErr) {
          console.error(`Failed to migrate article ${article.id}:`, insertErr.message);
          continue;
        }

        // Soft-delete the source article
        await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
        totalMigrated++;
        allLog.push({ id: article.id, title: article.title, mcqs: mcqs.length });
        console.log(`Migrated: "${article.title}" → ${mcqs.length} MCQs`);
      }
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`MCQ Auto-Audit complete: ${totalScanned} scanned, ${totalMigrated} migrated in ${elapsed}s across ${batchesProcessed} batches`);

    return new Response(
      JSON.stringify({
        done: true,
        scanned: totalScanned,
        migrated: totalMigrated,
        batches: batchesProcessed,
        elapsed_seconds: elapsed,
        log: allLog,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("MCQ Auto-Audit error:", e?.message);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
