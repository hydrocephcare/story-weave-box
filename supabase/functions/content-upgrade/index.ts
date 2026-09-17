import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callOmniRoute, omniRouteConfig, omniRouteConfigured } from "../_shared/omniroute.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
const DEFAULT_SITE_URL = "https://ompathstudy.com";

function normalizeBaseUrl(url: string | null | undefined): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

async function resolveSiteUrl(sb: any): Promise<string> {
  const { data } = await sb
    .from("app_settings")
    .select("value")
    .eq("key", "site_url")
    .maybeSingle();

  return normalizeBaseUrl((data as any)?.value);
}

async function resolveSiteUrlFromBodyOrSettings(
  sb: any,
  provided: unknown,
): Promise<string> {
  if (typeof provided === "string" && provided.trim()) return normalizeBaseUrl(provided);
  return resolveSiteUrl(sb);
}

async function callGemini(apiKey: string, prompt: string, maxTokens = 8000): Promise<string> {
  // Prefer the OmniRoute combo (free providers) when configured; fall back to Gemini.
  const omni = omniRouteConfig();
  if (omni) {
    try {
      return await callOmniRoute(omni, {
        messages: [{ role: "user", content: prompt }],
        maxTokens,
        temperature: 0.3,
      });
    } catch (e: any) {
      console.log("OmniRoute unavailable, falling back to Gemini:", e?.message || String(e));
    }
  }

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 40_000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) continue;

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
    } catch {
      continue;
    }
  }

  throw new Error("All Gemini models failed");
}

async function generateArticleImage(prompt: string): Promise<string> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not set");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
    if (response.status === 402) throw new Error("AI credits exhausted. Please top up workspace usage.");
    throw new Error("Failed to generate image");
  }

  const data = await response.json();
  const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) throw new Error("No image returned by Gemini image model");

  return imageUrl;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJsonFromResponse(responseText: string): any {
  let cleaned = (responseText || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error("No JSON found in AI response");

  const firstChar = cleaned[jsonStart];
  const jsonEnd = cleaned.lastIndexOf(firstChar === "[" ? "]" : "}");
  if (jsonEnd === -1) throw new Error("No JSON closing token found");

  cleaned = cleaned.slice(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    const normalized = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(normalized);
  }
}

function toSlug(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function extractFirstImageUrl(markdown: string): string | null {
  if (!markdown) return null;
  const mdImage = markdown.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/i)?.[1];
  if (mdImage) return mdImage;

  const htmlImage = markdown.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
  return htmlImage || null;
}

function cleanStudyMarkdown(value: string): string {
  return String(value || "")
    .replace(/```markdown\s*/gi, "")
    .replace(/```\s*$/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

function topicImage(title = "", category = ""): string {
  const base = "https://dekyjrfwvavtoivqivno.supabase.co/storage/v1/object/public/story-covers/articles";
  const s = `${title} ${category}`.toLowerCase();
  if (/communication|skills|patient|interview/.test(s)) return `${base}/communication.jpg`;
  if (/genetic|cytogen|mutation/.test(s)) return `${base}/genetics.jpg`;
  if (/molecular|dna|rna|transcription|translation/.test(s)) return `${base}/molecular-biology.jpg`;
  if (/biochem|enzyme|metabolism|steroid|hormone|blood|heme|liver|protein/.test(s)) return `${base}/clinical-biochem.jpg`;
  if (/micro|bacter|strept|aseptic|gene transfer/.test(s)) return `${base}/microbiology.jpg`;
  if (/parasite|amoeb|ameb|giardia|malaria|leishmania|trypanosoma|trichomonas|entomology|vector|cestode|pinworm/.test(s)) return `${base}/parasitology.jpg`;
  if (/immun|antibody|complement/.test(s)) return `${base}/immunology.jpg`;
  if (/git|gastric|intestinal|digestion|absorption/.test(s)) return `${base}/git-physiology.jpg`;
  if (/epidemiology|statistics|population|demography/.test(s)) return `${base}/epidemiology.jpg`;
  return `${base}/physiology.jpg`;
}

function tagsForYearTwo(title = "", category = ""): string[] {
  const unit = category.replace(/^Year\s*\d+\s*:\s*/i, "");
  return ["Year 2", unit, ...title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 5).slice(0, 4)].slice(0, 8);
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const siteUrl = await resolveSiteUrlFromBodyOrSettings(sb, body?.site_url);

    const geminiKey = typeof body?.geminiKey === "string" && body.geminiKey.trim()
      ? body.geminiKey.trim()
      : Deno.env.get("GEMINI_API_KEY");

    if (action === "scan") {
      if (!geminiKey && !omniRouteConfigured()) throw new Error("No AI provider configured. Set OMNIROUTE_BASE_URL/OMNIROUTE_API_KEY secrets or a GEMINI_API_KEY.");

      const { data: articles } = await sb
        .from("articles")
        .select("id, title, content, category, is_raw")
        .eq("published", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!articles?.length) return json({ suggestions: [], message: "No articles to scan" });

      const summaries = articles
        .map((a: any, i: number) => {
          const hasTable = a.content?.includes("|---") || a.content?.includes("| ---");
          const wordCount = a.content?.split(/\s+/).length || 0;
          const bulletCount = (a.content?.match(/^- /gm) || []).length;
          const headingCount = (a.content?.match(/^#{2,3}\s/gm) || []).length;
          return `${i + 1}. id=${a.id} | "${a.title}" (${a.category}) – ${wordCount} words, ${headingCount} headings, ${bulletCount} bullets, raw=${a.is_raw}, hasTable=${hasTable}`;
        })
        .join("\n");

      const scanPrompt = `You are a medical content quality reviewer. Review these articles and suggest improvements.

Articles:
${summaries}

For each article that needs improvement, suggest ONE specific upgrade. Focus on:
- Articles that are too short (< 500 words) → suggest "expand content"
- Articles with too many bullet points and few paragraphs → suggest "improve formatting"
- Raw/unformatted articles → suggest "format with AI"
- Articles missing key sections → suggest "add missing sections"
- Articles with poor category assignment → suggest "fix category"

Return ONLY a JSON array (max 10 items), each with: {"id": "<real article id>", "title": "...", "suggestion": "...", "type": "format|expand|category|sections", "priority": "high|medium|low", "auto_safe": true/false}
Return ONLY the JSON array, no markdown.`;

      const result = await callGemini(geminiKey, scanPrompt);
      try {
        const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        return json({ suggestions: JSON.parse(cleaned) });
      } catch {
        return json({ suggestions: [] });
      }
    }

    if (action === "upgrade") {
      if (!geminiKey && !omniRouteConfigured()) throw new Error("No AI provider configured. Set OMNIROUTE_BASE_URL/OMNIROUTE_API_KEY secrets or a GEMINI_API_KEY.");

      const id = body?.id;
      const upgradeType = body?.type || "format";
      if (!id) throw new Error("Missing article id");

      const { data: article } = await sb.from("articles").select("*").eq("id", id).single();
      if (!article) throw new Error("Article not found");

      let prompt = "";
      if (upgradeType === "format") {
        prompt = `You are a medical content formatter. Take this article and improve readability for mobile and desktop.

Rules:
- Use ## for major sections and ### for subsections
- Prefer clear paragraphs over excessive bullets
- Keep ALL existing information
- Preserve any markdown tables
- Bold key terms with **term**
- Keep medical accuracy

Article title: ${article.title}
Content:
${article.content}

Return ONLY the improved content.`;
      } else if (upgradeType === "expand") {
        prompt = `You are a medical content expert. Expand this article while keeping all existing content.

Rules:
- Keep ALL existing content
- Add clinical details, pathophysiology, diagnosis, and treatment where relevant
- Add a summary table at the end if appropriate
- Keep formatting clean and consistent
- Target at least 800 words total

Article title: ${article.title}
Category: ${article.category}
Content:
${article.content}

Return ONLY the expanded content.`;
      } else {
        prompt = `Review and improve this medical article. Fix formatting issues and add missing details without removing core information.

Article: ${article.title}
Content:
${article.content}

Return ONLY the improved content.`;
      }

      const improved = await callGemini(geminiKey, prompt, 12_000);
      return json({
        id: article.id,
        title: article.title,
        original_length: article.content.length,
        improved_length: improved.length,
        improved_content: improved,
      });
    }

    if (action === "year2_article_pass") {
      if (!geminiKey && !omniRouteConfigured()) throw new Error("No AI provider configured. Set OMNIROUTE_BASE_URL/OMNIROUTE_API_KEY secrets or a GEMINI_API_KEY.");
      const batchSize = Math.min(Math.max(Number(body?.batch_size || 4), 1), 8);
      const cursor = typeof body?.cursor === "string" && body.cursor ? body.cursor : null;
      let query = sb
        .from("articles")
        .select("id,title,category,content,slug")
        .eq("published", true)
        .is("deleted_at", null)
        .ilike("category", "Year 2:%")
        .order("id", { ascending: true })
        .limit(batchSize);
      if (cursor) query = query.gt("id", cursor);
      const { data: articles, error } = await query;
      if (error) throw error;
      if (!articles?.length) return json({ success: true, updated: 0, done: true, next_cursor: null, processed_articles: [] });

      const processed: any[] = [];
      for (const article of articles) {
        try {
          const prompt = `You are editing Year 2 MBChB study notes for a clean TeachMeAnatomy-style website.

Return ONLY valid JSON:
{"title":"clean concise title","meta_title":"max 60 chars","meta_description":"150-155 chars","content":"markdown article"}

Strict rules:
- Keep factual accuracy and preserve all useful existing facts.
- Remove university names, emojis, exam headers, duplicated blank lines, and noisy answer-key formatting.
- If the article is short, add high-yield Year 2 detail: definition, mechanism/life cycle/pathogenesis, clinical relevance, diagnosis, treatment/prevention, and exam pearls.
- Format with one H1-style opening title line using ##, then clear ### subsections, paragraphs, concise bullets, and at least one markdown table where useful.
- Do not include MCQ option blocks as article content; convert them into explanatory notes.
- Target 900-1400 words unless the source is already complete.

Current title: ${article.title}
Category: ${article.category}

Current content:
${String(article.content || "").slice(0, 22000)}`;
          const text = await callGemini(geminiKey, prompt, 14000);
          const result = extractJsonFromResponse(text);
          const nextTitle = String(result?.title || article.title || "Year 2 Study Note").replace(/\s+/g, " ").trim().slice(0, 90);
          const content = cleanStudyMarkdown(String(result?.content || article.content || ""));
          const metaTitle = String(result?.meta_title || nextTitle).replace(/\s+/g, " ").trim().slice(0, 60);
          const metaDescription = String(result?.meta_description || content.replace(/[#*_`>\-]/g, " ").replace(/\s+/g, " ").trim()).slice(0, 155);
          const image = topicImage(nextTitle, article.category);
          await sb.from("articles").update({
            title: nextTitle,
            content,
            meta_title: metaTitle,
            meta_description: metaDescription,
            featured_image: image,
            og_image_url: image,
            tags: tagsForYearTwo(nextTitle, article.category),
            updated_at: new Date().toISOString(),
          }).eq("id", article.id);
          processed.push({ id: article.id, title: nextTitle, action: "updated", length: content.length });
        } catch (e: any) {
          processed.push({ id: article.id, title: article.title, action: "failed", error: e?.message || String(e) });
        }
      }
      return json({ success: true, updated: processed.filter((p) => p.action === "updated").length, done: articles.length < batchSize, next_cursor: articles[articles.length - 1]?.id || null, processed_articles: processed });
    }

    if (action === "generate_image") {
      const id = body?.id;
      if (!id) throw new Error("Missing article id");

      const { data: article } = await sb
        .from("articles")
        .select("id, title, category, content")
        .eq("id", id)
        .single();

      if (!article) throw new Error("Article not found");

      const imagePrompt = `Create a clean educational medical illustration for a study blog article.

Title: ${article.title}
Category: ${article.category}

Style requirements:
- medical textbook style
- simple, clear anatomy/clinical concept
- no logos, no text labels, no watermark
- white or very light background
- high clarity and professional look
- suitable as a hero image for an education article`;

      const imageDataUrl = await generateArticleImage(imagePrompt);
      return json({ image_data_url: imageDataUrl });
    }

    if (action === "apply") {
      const articleId = body?.id;
      const content = body?.content;
      const title = typeof body?.title === "string" ? body.title.trim() : null;

      if (!articleId || !content) throw new Error("Missing id or content");

      const updatePayload: Record<string, string> = { content };
      if (title) updatePayload.title = title;

      const { error } = await sb.from("articles").update(updatePayload).eq("id", articleId);
      if (error) throw error;

      return json({ success: true });
    }

    if (action === "list_articles_seo") {
      const yearFilter = body?.year || null;
      const batchSize = Math.min(Math.max(Number(body?.batch_size || 100), 1), 200);
      const cursor = typeof body?.cursor === "string" && body.cursor ? body.cursor : null;
      const includeUnpublished = body?.include_unpublished !== false;

      let query = sb
        .from("articles")
        .select("id, title, category, slug, meta_title, meta_description, og_image_url, published")
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .limit(batchSize);

      if (!includeUnpublished) query = query.eq("published", true);
      if (yearFilter && /^Year [1-6]$/.test(yearFilter)) query = query.like("category", `${yearFilter}:%`);
      if (cursor) query = query.gt("id", cursor);

      const { data: articles, error } = await query;
      if (error) throw error;

      const normalized = (articles || []).map((a: any) => {
        const fallbackSlug = toSlug(a.title) || "article";
        const safeSlug = (a.slug && String(a.slug).trim()) ? String(a.slug).trim() : fallbackSlug;
        const url = `${siteUrl}/blog/${a.id}-${safeSlug}`;
        const missingFields = [
          !a.meta_title || !String(a.meta_title).trim(),
          !a.meta_description || !String(a.meta_description).trim(),
          !a.slug || !String(a.slug).trim(),
          !a.og_image_url || !String(a.og_image_url).trim(),
        ].filter(Boolean).length;

        return {
          id: a.id,
          title: a.title,
          category: a.category,
          slug: a.slug || "",
          meta_title: a.meta_title || "",
          meta_description: a.meta_description || "",
          og_image_url: a.og_image_url || "",
          published: Boolean(a.published),
          url,
          seo_status: missingFields === 0 ? "complete" : "missing",
          missing_count: missingFields,
        };
      });

      const nextCursor = articles?.length ? articles[articles.length - 1].id : null;
      return json({
        articles: normalized,
        next_cursor: nextCursor,
        done: (articles?.length || 0) < batchSize,
      });
    }

    // Generate SEO metadata for articles using Gemini
    if (action === "generate_seo") {
      if (!geminiKey && !omniRouteConfigured()) throw new Error("No AI provider configured. Set OMNIROUTE_BASE_URL/OMNIROUTE_API_KEY secrets or a GEMINI_API_KEY.");

      const yearFilter = body?.year || null;
      const batchSize = Math.min(Math.max(Number(body?.batch_size || 10), 1), 25);
      const cursor = typeof body?.cursor === "string" ? body.cursor : null;
      const includeAll = Boolean(body?.include_all);
      const includeUnpublished = body?.include_unpublished !== false;
      const requestedFields = body?.fields || {};
      const fields = {
        title: Boolean(requestedFields?.title),
        meta_title: requestedFields?.meta_title !== false,
        meta_description: requestedFields?.meta_description !== false,
        slug: requestedFields?.slug !== false,
        og_image_url: requestedFields?.og_image_url !== false,
      };

      if (!fields.title && !fields.meta_title && !fields.meta_description && !fields.slug && !fields.og_image_url) {
        throw new Error("No SEO fields selected");
      }

      let query = sb
        .from("articles")
        .select("id, title, content, category, meta_title, meta_description, slug, og_image_url, published")
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .limit(batchSize);

      if (!includeUnpublished) query = query.eq("published", true);
      if (yearFilter && /^Year [1-6]$/.test(yearFilter)) query = query.like("category", `${yearFilter}:%`);
      if (cursor) query = query.gt("id", cursor);

      if (!includeAll) {
        const missingFilters: string[] = [];
        if (fields.title) missingFilters.push("title.eq.");
        if (fields.meta_title) missingFilters.push("meta_title.eq.");
        if (fields.meta_description) missingFilters.push("meta_description.eq.");
        if (fields.slug) missingFilters.push("slug.eq.");
        if (fields.og_image_url) missingFilters.push("og_image_url.eq.");
        if (missingFilters.length) query = query.or(missingFilters.join(","));
      }

      const { data: articles, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      if (!articles?.length) return json({ done: true, updated: 0, processed_articles: [] });

      const processedArticles: Array<{ id: string; title: string; action: string }> = [];
      let updated = 0;

      for (const article of articles) {
        try {
          const contentSnippet = (article.content || "").slice(0, 10000);
          const seoPrompt = `You are a professional medical SEO editor. Generate optimized metadata for this article.
Return ONLY valid JSON.
Schema:
{"title":"string (concise article title)","meta_title":"string (60 chars max, high-volume keywords, professional)","meta_description":"string (150-160 chars, compelling, summarizes key learning points, ends with a call to study)","slug":"url-friendly lowercase hyphenated"}

Article: ${article.title}
Category: ${article.category}
Content: ${contentSnippet}`;

          const text = await callGemini(geminiKey, seoPrompt, 1200);
          const seo = extractJsonFromResponse(text);

          const nextTitle = String(seo?.title || seo?.meta_title || article.title || "").replace(/\s+/g, " ").trim();
          const updateData: Record<string, string> = {};

          if (fields.title && nextTitle) updateData.title = nextTitle.slice(0, 120);
          if (fields.meta_title) {
            const metaTitle = String(seo?.meta_title || nextTitle || article.title || "").replace(/\s+/g, " ").trim();
            if (metaTitle) updateData.meta_title = metaTitle.slice(0, 60);
          }
          if (fields.meta_description) {
            const metaDescription = String(seo?.meta_description || "").replace(/\s+/g, " ").trim();
            if (metaDescription) updateData.meta_description = metaDescription.slice(0, 160);
          }
          if (fields.slug) {
            const slugSource = String(seo?.slug || updateData.title || article.title || article.slug || "");
            updateData.slug = toSlug(slugSource) || article.id;
          }
          if (fields.og_image_url) {
            const firstImage = extractFirstImageUrl(article.content || "");
            const existingImage = String(article.og_image_url || "").trim();
            updateData.og_image_url = firstImage || existingImage || `${siteUrl}/placeholder.svg`;
          }

          if (Object.keys(updateData).length > 0) {
            await sb.from("articles").update(updateData).eq("id", article.id);
            updated++;
            processedArticles.push({ id: article.id, title: article.title, action: "seo_updated" });
          } else {
            processedArticles.push({ id: article.id, title: article.title, action: "no_change" });
          }
        } catch (e: any) {
          processedArticles.push({ id: article.id, title: article.title, action: `error: ${e.message}` });
        }
      }

      const lastId = articles[articles.length - 1]?.id || null;
      return json({ updated, processed_articles: processedArticles, next_cursor: lastId, done: articles.length < batchSize });
    }

    // Generate SEO for a single article
    if (action === "generate_seo_single") {
      if (!geminiKey && !omniRouteConfigured()) throw new Error("No AI provider configured. Set OMNIROUTE_BASE_URL/OMNIROUTE_API_KEY secrets or a GEMINI_API_KEY.");

      const id = body?.id;
      if (!id) throw new Error("Missing article id");

      const requestedFields = body?.fields || {};
      const fields = {
        title: Boolean(requestedFields?.title),
        meta_title: requestedFields?.meta_title !== false,
        meta_description: requestedFields?.meta_description !== false,
        slug: requestedFields?.slug !== false,
        og_image_url: requestedFields?.og_image_url !== false,
      };

      const { data: article } = await sb
        .from("articles")
        .select("id, title, content, category, slug, og_image_url")
        .eq("id", id)
        .maybeSingle();
      if (!article) throw new Error("Article not found");

      const contentSnippet = (article.content || "").slice(0, 10000);
      const seoPrompt = `You are an SEO editor for medical study content. Return ONLY valid JSON.
Schema:
{"title":"string","meta_title":"string max 60 chars","meta_description":"string max 155 chars","slug":"url-friendly lowercase hyphenated"}

Article title: ${article.title}
Category: ${article.category}
Content preview: ${contentSnippet}`;

      const text = await callGemini(geminiKey, seoPrompt, 1200);
      const seo = extractJsonFromResponse(text);

      const nextTitle = String(seo?.title || seo?.meta_title || article.title || "").replace(/\s+/g, " ").trim();
      const updateData: Record<string, string> = {};

      if (fields.title && nextTitle) updateData.title = nextTitle.slice(0, 120);
      if (fields.meta_title) {
        const metaTitle = String(seo?.meta_title || nextTitle || article.title || "").replace(/\s+/g, " ").trim();
        if (metaTitle) updateData.meta_title = metaTitle.slice(0, 60);
      }
      if (fields.meta_description) {
        const metaDescription = String(seo?.meta_description || "").replace(/\s+/g, " ").trim();
        if (metaDescription) updateData.meta_description = metaDescription.slice(0, 160);
      }
      if (fields.slug) {
        const slugSource = String(seo?.slug || updateData.title || article.slug || article.title || "");
        updateData.slug = toSlug(slugSource) || article.id;
      }
      if (fields.og_image_url) {
        const firstImage = extractFirstImageUrl(article.content || "");
        const existingImage = String(article.og_image_url || "").trim();
        updateData.og_image_url = firstImage || existingImage || `${siteUrl}/placeholder.svg`;
      }

      await sb.from("articles").update(updateData).eq("id", article.id);

      const finalSlug = updateData.slug || toSlug(article.slug || article.title) || "article";
      return json({ success: true, seo: updateData, url: `${siteUrl}/blog/${article.id}-${finalSlug}` });
    }

    if (action === "bulk_seo") {
      if (!geminiKey && !omniRouteConfigured()) throw new Error("No AI provider configured. Set OMNIROUTE_BASE_URL/OMNIROUTE_API_KEY secrets or a GEMINI_API_KEY.");

      const { data: articles, error: fetchError } = await sb
        .from("articles")
        .select("id, title, content")
        .eq("published", true)
        .is("deleted_at", null)
        .or("meta_description.is.null,meta_description.eq.")
        .limit(10);

      if (fetchError) throw fetchError;
      if (!articles?.length) return json({ updated: 0, message: "No articles missing meta description" });

      const results = [];
      for (const article of articles) {
        try {
          const contentSnippet = (article.content || "").slice(0, 500);
          const prompt = `Generate a compelling SEO meta description (150-160 characters) for this medical article.
Title: ${article.title}
Content: ${contentSnippet}

Return ONLY the description text, no quotes, no labels. Keep it between 150-160 characters.`;

          const description = await callGemini(geminiKey, prompt, 100);
          const cleanDescription = description.replace(/^["']|["']$/g, "").trim().slice(0, 160);

          const { error: updateError } = await sb
            .from("articles")
            .update({ meta_description: cleanDescription })
            .eq("id", article.id);

          if (updateError) throw updateError;
          results.push({ id: article.id, title: article.title, status: "updated" });
        } catch (e: any) {
          results.push({ id: article.id, title: article.title, status: "error", error: e.message });
        }
      }

      return json({ 
        updated: results.filter(r => r.status === "updated").length, 
        processed: results.length,
        results 
      });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
