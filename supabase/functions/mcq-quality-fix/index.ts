import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_OPTIONS = 5; // A-E max
const MIN_OPTIONS = 4; // A-D min

interface McqQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation?: string;
}

// Detect and fix bad MCQs
function fixQuestion(q: McqQuestion): { fixed: McqQuestion; issues: string[] } | null {
  const issues: string[] = [];
  let question = (q.question || "").trim();
  let options = [...(q.options || [])];
  let correct = q.correct_answer ?? 0;
  const explanation = q.explanation;

  if (!question || options.length < 2) return null;

  const combined = options.join(" ").replace(/\s+/g, " ").trim();
  const splitMatches = Array.from(combined.matchAll(/(?:^|\s)([A-F])[.)]\s*([\s\S]*?)(?=\s+[A-F][.)]\s*|$)/gi));
  if (options.length === 1 && splitMatches.length >= 2) {
    const firstLetter = combined.match(/(?:^|\s)([A-F])[.)]\s*/i)?.[1]?.toUpperCase();
    options = splitMatches.map((m) => String(m[2] || "").trim()).filter(Boolean);
    correct = firstLetter ? Math.max(0, firstLetter.charCodeAt(0) - 65) : correct;
    issues.push("Split combined A-E options into separate choices");
  }

  // Strip markdown headers from question
  question = question.replace(/^#{1,6}\s+/gm, "").replace(/^Question\s*\d+\s*/i, "").replace(/\s*Choices:\s*$/i, "").trim();

  // Remove duplicate options (keep first occurrence)
  const seen = new Map<string, number>();
  const uniqueOptions: string[] = [];
  const indexMap: number[] = [];
  for (let i = 0; i < options.length; i++) {
    const normalized = options[i].trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.set(normalized, uniqueOptions.length);
      uniqueOptions.push(options[i].trim());
      indexMap.push(i);
    } else if (i === correct) {
      // If the duplicate was the correct answer, point to the first occurrence
      correct = seen.get(normalized)!;
      issues.push(`Duplicate correct option "${options[i].trim()}" merged`);
    } else {
      issues.push(`Removed duplicate option: "${options[i].trim()}"`);
    }
  }

  // Remap correct_answer to new index
  const newCorrectIdx = indexMap.indexOf(correct);
  correct = newCorrectIdx >= 0 ? newCorrectIdx : 0;
  options = uniqueOptions;

  // Remove garbage options (too long, contain markdown/explanation text)
  options = options.filter((opt, i) => {
    const isGarbage = opt.length > 200 || /^[-—]+$/.test(opt) || /\b(?:explanation|rationale|answer key)\b/i.test(opt);
    if (isGarbage) {
      issues.push(`Removed garbage option: "${opt.slice(0, 50)}..."`);
      if (i < correct) correct = Math.max(0, correct - 1);
      else if (i === correct) correct = 0;
      return false;
    }
    return true;
  });

  // Clean trailing dashes/hyphens from options like "Leukotrienes -"
  options = options.map(opt => {
    const cleaned = opt.replace(/\s*[-–—]+\s*$/, "").trim();
    if (cleaned !== opt) issues.push(`Cleaned trailing dash from "${opt}"`);
    return cleaned;
  });

  // Cap at MAX_OPTIONS
  if (options.length > MAX_OPTIONS) {
    issues.push(`Trimmed from ${options.length} to ${MAX_OPTIONS} options`);
    options = options.slice(0, MAX_OPTIONS);
    if (correct >= MAX_OPTIONS) correct = 0;
  }

  // Too few options after cleanup
  if (options.length < MIN_OPTIONS) {
    issues.push(`Only ${options.length} valid options remaining — skipped`);
    return null;
  }

  // Ensure correct_answer is in bounds
  correct = Math.min(Math.max(correct, 0), options.length - 1);

  options = options.map((opt, i) => {
    let out = opt.replace(/\s+—\s+related\s+(?:option|finding)$/i, "").replace(/\s+/g, " ").trim();
    if (out !== opt) issues.push("Removed visible padding text from option");
    if (out.length > 140) { out = out.slice(0, 137).replace(/\s+\S*$/, "") + "…"; issues.push("Trimmed overlong option"); }
    return out;
  });

  if (issues.length === 0) return null; // No fixes needed

  return {
    fixed: { question, options, correct_answer: correct, explanation },
    issues,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const singleSetId = body.set_id as string | undefined;
    const useAi = body.use_ai === true;
    const BATCH = 20;
    const MAX_RUNTIME = 140_000;
    const started = Date.now();

    let cursor = "00000000-0000-0000-0000-000000000000";
    let totalScanned = 0;
    let totalFixed = 0;
    let totalRemoved = 0;
    const log: { id: string; title: string; fixes: number; removed: number; details: string[] }[] = [];

    // If single set, just fix that one
    if (singleSetId) {
      const { data: set } = await sb.from("mcq_sets").select("*").eq("id", singleSetId).single();
      if (!set) return new Response(JSON.stringify({ error: "Set not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const questions = (set.questions as McqQuestion[]) || [];
      const fixedQuestions: McqQuestion[] = [];
      const allIssues: string[] = [];
      let removedCount = 0;

      for (const q of questions) {
        const result = fixQuestion(q);
        if (result === null) {
          // No issues or too broken — keep original if no issues detected
          const testResult = fixQuestion(q);
          if (testResult === null) {
            fixedQuestions.push(q);
          }
        } else if (result) {
          fixedQuestions.push(result.fixed);
          allIssues.push(...result.issues);
        }
      }

      // Re-check: push originals that had no issues
      const finalQuestions: McqQuestion[] = [];
      for (const q of questions) {
        const result = fixQuestion(q);
        if (result === null) {
          finalQuestions.push(q);
        } else {
          finalQuestions.push(result.fixed);
        }
      }

      // Remove questions that became invalid (< 4 options)
      const validQuestions = finalQuestions.filter(q => q.options.length >= MIN_OPTIONS);
      removedCount = finalQuestions.length - validQuestions.length;

      if (!dryRun && allIssues.length > 0) {
        await sb.from("mcq_sets").update({ questions: validQuestions as any }).eq("id", singleSetId);
      }

      return new Response(JSON.stringify({
        done: true,
        set_id: singleSetId,
        title: set.title,
        original_count: questions.length,
        fixed_count: validQuestions.length,
        removed: removedCount,
        issues: allIssues,
        dry_run: dryRun,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Batch mode: scan all MCQ sets
    while (true) {
      if (Date.now() - started > MAX_RUNTIME) break;

      const { data: sets, error } = await sb
        .from("mcq_sets")
        .select("id, title, questions")
        .is("deleted_at", null)
        .eq("published", true)
        .gt("id", cursor)
        .order("id", { ascending: true })
        .limit(BATCH);

      if (error || !sets || sets.length === 0) break;

      for (const set of sets) {
        cursor = set.id;
        totalScanned++;
        if (Date.now() - started > MAX_RUNTIME) break;

        const questions = (set.questions as McqQuestion[]) || [];
        let hasIssues = false;
        const setIssues: string[] = [];

        // Check each question
        const fixedQuestions: McqQuestion[] = [];
        for (const q of questions) {
          const result = fixQuestion(q);
          if (result) {
            fixedQuestions.push(result.fixed);
            setIssues.push(...result.issues);
            hasIssues = true;
          } else {
            fixedQuestions.push(q);
          }
        }

        // Remove questions that became invalid
        const validQuestions = fixedQuestions.filter(q => q.options.length >= MIN_OPTIONS);
        const removedCount = fixedQuestions.length - validQuestions.length;

        if (hasIssues || removedCount > 0) {
          if (!dryRun) {
            await sb.from("mcq_sets").update({ questions: validQuestions as any }).eq("id", set.id);
          }
          totalFixed++;
          totalRemoved += removedCount;
          log.push({ id: set.id, title: set.title, fixes: setIssues.length, removed: removedCount, details: setIssues.slice(0, 10) });
          console.log(`Fixed: "${set.title}" — ${setIssues.length} issues, ${removedCount} removed`);
        }
      }
    }

    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`MCQ Quality Fix: ${totalScanned} scanned, ${totalFixed} fixed, ${totalRemoved} questions removed in ${elapsed}s`);

    return new Response(JSON.stringify({
      done: true,
      scanned: totalScanned,
      sets_fixed: totalFixed,
      questions_removed: totalRemoved,
      elapsed_seconds: elapsed,
      dry_run: dryRun,
      log,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("MCQ Quality Fix error:", e?.message);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
