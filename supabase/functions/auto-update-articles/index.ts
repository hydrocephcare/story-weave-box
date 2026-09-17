import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOmniRoute, omniRouteConfig, omniRouteConfigured } from "../_shared/omniroute.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 5;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanHeading(text: string): string {
  return text.replace(/^#+\s*/, "").replace(/^\*+|\*+$/g, "").replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
}

function clipNotes(notes: string, maxChars = 28000): string {
  const clean = notes.trim();
  if (clean.length <= maxChars) return clean;
  const headLen = Math.floor(maxChars * 0.6);
  const tailLen = maxChars - headLen;
  return clean.slice(0, headLen) + "\n\n[...truncated...]\n\n" + clean.slice(-tailLen);
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  // Prefer the OmniRoute combo (free providers) when configured; fall back to Gemini.
  const omni = omniRouteConfig();
  if (omni) {
    try {
      return await callOmniRoute(omni, {
        messages: [{ role: "user", content: prompt }],
        maxTokens: 4000,
      });
    } catch (e: any) {
      console.log("OmniRoute unavailable, falling back to Gemini:", e?.message || String(e));
    }
  }

  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      if (response.status === 429) continue;
    } catch { continue; }
  }
  throw new Error("All Gemini models rate-limited");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Get Gemini API key
    const { data: keySetting } = await supabase.from("app_settings").select("value").eq("key", "gemini_api_key").maybeSingle();
    const { data: keysSetting } = await supabase.from("app_settings").select("value").eq("key", "gemini_api_keys").maybeSingle();
    
    let apiKeys: string[] = [];
    try { apiKeys = JSON.parse((keysSetting as any)?.value || "[]").filter(Boolean); } catch {}
    if (!apiKeys.length && (keySetting as any)?.value) apiKeys = [(keySetting as any).value];
    for (const name of ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4", "GEMINI_API_KEY_5"]) {
      const v = Deno.env.get(name);
      if (v && !apiKeys.includes(v)) apiKeys.push(v);
    }
    if (!apiKeys.length && !omniRouteConfigured()) throw new Error("No AI provider configured. Set OMNIROUTE_BASE_URL/OMNIROUTE_API_KEY secrets or a Gemini API key.");

    // Get last updated cursor from app_settings
    const { data: cursorSetting } = await supabase.from("app_settings").select("value").eq("key", "auto_update_cursor").maybeSingle();
    const lastUpdatedId = (cursorSetting as any)?.value || "";

    // Fetch next batch of articles that haven't been auto-updated recently
    let query = supabase
      .from("articles")
      .select("id, title, content, category, meta_title, meta_description, slug, og_image_url")
      .eq("published", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (lastUpdatedId) {
      query = query.gt("id", lastUpdatedId);
    }

    const { data: articles, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    if (!articles || articles.length === 0) {
      // Reset cursor - start from beginning
      await supabase.from("app_settings").upsert({ key: "auto_update_cursor", value: "" }, { onConflict: "key" });
      return new Response(JSON.stringify({ message: "All articles updated. Cursor reset.", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; title: string; status: string }[] = [];
    const apiKey = apiKeys.length ? apiKeys[Math.floor(Math.random() * apiKeys.length)] : "";

    for (const article of articles) {
      try {
        const safeContent = clipNotes(article.content || "");
        
        // Generate improved meta title, meta description, and format check
        const prompt = `You are a medical SEO expert. Given this article, generate:
1. An SEO-optimized meta title (max 60 chars, include key medical terms)
2. An SEO-optimized meta description (max 155 chars, compelling and informative)
3. A clean URL slug (lowercase, hyphens, no UUIDs, max 5-6 words)
4. Check if the content formatting is clean (no broken markdown, no raw hashtags showing)

Article Title: ${article.title}
Category: ${article.category}
Current Content (first 3000 chars):
${safeContent.slice(0, 3000)}

Return ONLY valid JSON:
{"meta_title":"...","meta_description":"...","slug":"...","needs_format_fix":false,"format_notes":""}`;

        const text = await callGemini(prompt, apiKey);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { results.push({ id: article.id, title: article.title, status: "parse_error" }); continue; }
        
        const parsed = JSON.parse(jsonMatch[0]);
        const updates: Record<string, any> = {};
        
        if (parsed.meta_title && (!article.meta_title || article.meta_title === article.title)) {
          updates.meta_title = parsed.meta_title.slice(0, 80);
        }
        if (parsed.meta_description && (!article.meta_description || article.meta_description.length < 50)) {
          updates.meta_description = parsed.meta_description.slice(0, 160);
        }
        if (parsed.slug && (!article.slug || article.slug.includes("-") && article.slug.match(/^[0-9a-f]{8}-/))) {
          updates.slug = parsed.slug.replace(/[^a-z0-9-]/g, "").slice(0, 80);
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await supabase.from("articles").update(updates).eq("id", article.id);
          results.push({ id: article.id, title: article.title, status: "updated" });
        } else {
          results.push({ id: article.id, title: article.title, status: "no_changes" });
        }

        // Auto-generate essay (SAQs + LAQ) if none exists yet for this article
        try {
          const { data: existingEssay } = await supabase
            .from("essays")
            .select("id")
            .eq("article_id", article.id)
            .is("deleted_at", null)
            .maybeSingle();

          if (!existingEssay) {
            const essayPrompt = `You are a medical examiner. Create exam-style written questions from this article.

Return ONLY valid JSON (no markdown, no commentary):
{"saqs":[{"question":"...","model_answer":"...","marks":5}],"laqs":[{"question":"...","model_answer":"...","marks":20}]}

REQUIREMENTS:
- EXACTLY 5 SAQs (5 marks each) — clinically structured, concise model answers
- EXACTLY 1 LAQ (20 marks) — comprehensive, well-structured model answer
- Questions must come from the article content below

Article Title: ${article.title}
Category: ${article.category}
Content:
${safeContent.slice(0, 12000)}`;

            const essayText = await callGemini(essayPrompt, apiKey);
            const essayMatch = essayText.match(/\{[\s\S]*\}/);
            if (essayMatch) {
              const parsedEssay = JSON.parse(essayMatch[0]);
              const saqs = Array.isArray(parsedEssay?.saqs)
                ? parsedEssay.saqs.filter((q: any) => q?.question && (q?.model_answer || q?.answer))
                    .map((q: any) => ({
                      question: compactWhitespace(String(q.question)),
                      model_answer: compactWhitespace(String(q.model_answer || q.answer)),
                      marks: Number(q.marks) || 5,
                    }))
                : [];
              const laqs = Array.isArray(parsedEssay?.laqs)
                ? parsedEssay.laqs.filter((q: any) => q?.question && (q?.model_answer || q?.answer))
                    .map((q: any) => ({
                      question: compactWhitespace(String(q.question)),
                      model_answer: compactWhitespace(String(q.model_answer || q.answer)),
                      marks: Number(q.marks) || 20,
                    }))
                : [];

              if (saqs.length > 0 || laqs.length > 0) {
                await supabase.from("essays").insert({
                  article_id: article.id,
                  title: `${article.title} — Practice Questions`,
                  category: article.category,
                  short_answer_questions: saqs,
                  long_answer_questions: laqs,
                  published: true,
                });
                (results[results.length - 1] as any).essay_added = true;
              }
            }
          }
        } catch (essayErr) {
          console.error("Essay generation failed for", article.id, essayErr);
        }

        // Small delay between API calls
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        results.push({ id: article.id, title: article.title, status: `error: ${(err as Error).message?.slice(0, 100)}` });
      }
    }

    // Save cursor
    const lastId = articles[articles.length - 1].id;
    if (cursorSetting) {
      await supabase.from("app_settings").update({ value: lastId }).eq("key", "auto_update_cursor");
    } else {
      await supabase.from("app_settings").insert({ key: "auto_update_cursor", value: lastId });
    }

    // Save update log
    const logEntry = {
      key: "auto_update_log",
      value: JSON.stringify({
        timestamp: new Date().toISOString(),
        batch_size: articles.length,
        results,
        last_id: lastId,
      }),
    };
    await supabase.from("app_settings").upsert(logEntry, { onConflict: "key" });

    return new Response(JSON.stringify({
      message: `Processed ${articles.length} articles`,
      updated: results.filter(r => r.status === "updated").length,
      results,
      essays_generated: (results as any[]).filter((r: any) => r.essay_added).length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Auto-update error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
