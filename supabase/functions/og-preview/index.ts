import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SITE_URL = "https://www.ompathstudy.com";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function slugify(value: string): string {
  return (value || "").toLowerCase().trim().replace(/&/g, " and ").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "into", "onto", "this", "that", "notes", "note", "mcq", "mcqs", "quiz", "questions"]);

function tokenize(value: string): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function similarity(a: string, b: string): number {
  const target = new Set(tokenize(a));
  const candidate = new Set(tokenize(b));
  if (!target.size || !candidate.size) return 0;
  let overlap = 0;
  target.forEach((token) => { if (candidate.has(token)) overlap++; });
  return overlap / (new Set([...target, ...candidate]).size || 1);
}

function cleanPublicSlug(rawSlug: string | null | undefined, fallbackTitle: string, fallback = "study"): string {
  const base = String(rawSlug || slugify(fallbackTitle) || fallback).trim().toLowerCase();
  return base
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "")
    .replace(/-[0-9a-f]{6}$/i, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function stripRichText(input: string, maxLength = 160): string {
  return (input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>|#]/g, " ")
    .replace(/data:image\/[^\s)]+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractFirstImage(content: string): string | null {
  if (!content) return null;
  const md = content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1];
  if (md) return md;
  const html = content.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/i)?.[1];
  return html || null;
}

function extractUuid(value: string | null): string | null {
  if (!value) return null;
  if (UUID_REGEX.test(value)) return value;
  const match = value.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-|$)/i);
  return match?.[1] || null;
}

async function findClosestLivePath(sb: any, table: "articles" | "mcq_sets", param: string, prefix: "/blog" | "/mcqs"): Promise<string> {
  const { data } = await sb
    .from(table)
    .select("id, title, slug, updated_at, created_at")
    .eq("published", true)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(500);

  let best: any = null;
  let bestScore = 0;
  for (const row of data || []) {
    const publicSlug = cleanPublicSlug(row.slug, row.title, table === "articles" ? "article" : "quiz");
    // Exact public-slug match: return immediately so /blog/clean-slug never
    // 301-redirects to /blog/clean-slug (loop prevention for sitemap URLs).
    if (publicSlug === String(param || "").toLowerCase()) {
      return `${prefix}/${publicSlug}`;
    }
    const score = Math.max(similarity(param, publicSlug), similarity(param, row.title || ""));
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  if (!best || bestScore < 0.28) return prefix;
  return `${prefix}/${cleanPublicSlug(best.slug, best.title, table === "articles" ? "article" : "quiz")}`;
}

async function resolveSiteUrl(sb: any): Promise<string> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "site_url").maybeSingle();
  const raw = String((data as any)?.value || "").trim();
  if (!raw) return DEFAULT_SITE_URL;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const cleaned = withProto.replace(/\/+$/, "");
  try {
    const u = new URL(cleaned);
    if (/(^|\.)ompathstudy\.com$/i.test(u.hostname) && u.hostname.toLowerCase() !== "www.ompathstudy.com") {
      u.hostname = "www.ompathstudy.com";
    }
    u.protocol = "https:";
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return cleaned;
  }
}

function esc(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build clean body text for crawlers - plain text paragraphs only, NO html tags in content */
function buildBodyText(text: string): string {
  if (!text) return "";
  // Split into paragraphs, escape each, wrap in <p> tags
  return text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map(p => `<p>${esc(p)}</p>`)
    .join("\n");
}

function buildOgHtml(options: {
  title: string;
  description: string;
  image: string;
  canonical: string;
  isCrawler: boolean;
  bodyText?: string;
  publishedAt?: string;
  author?: string;
  type?: string;
  noindex?: boolean;
}): string {
  const { title, description, image, canonical, isCrawler, bodyText, publishedAt, author, type = "article", noindex = false } = options;
  const ogImage = image || `${DEFAULT_SITE_URL}/og-default.png`;
  const redirectMarkup = isCrawler ? "" : `<meta http-equiv="refresh" content="0;url=${esc(canonical)}">\n  <script>window.location.replace(${JSON.stringify(canonical)});</script>`;
  const robotsTag = noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">';
  const KEYWORDS = "MBChB, medical school Kenya, University of Nairobi, Kenyatta University, JKUAT, Moi University, Egerton, Maseno, Uganda Makerere, MUST, KMTC, medical notes, MCQs, flashcards, past papers, pathology, pharmacology, anatomy, physiology, microbiology, biochemistry, OmpathStudy, Ompath Study";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": type === "article" ? "Article" : "WebPage",
    "headline": title,
    "description": description,
    "image": ogImage,
    "url": canonical,
    ...(publishedAt ? { "datePublished": publishedAt } : {}),
    "author": { "@type": "Organization", "name": author || "OmpathStudy" },
    "publisher": { "@type": "Organization", "name": "OmpathStudy", "logo": { "@type": "ImageObject", "url": `${DEFAULT_SITE_URL}/icon-512.png` } },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="keywords" content="${esc(KEYWORDS)}">
  ${robotsTag}
  <meta property="og:type" content="${type === 'article' ? 'article' : 'website'}">
  <meta property="og:site_name" content="OmpathStudy">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <link rel="canonical" href="${esc(canonical)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${redirectMarkup}
</head>
<body>
  <h1>${esc(title)}</h1>
  <p>${esc(description)}</p>
  ${bodyText || ""}
  <p><a href="${esc(canonical)}">View on OmpathStudy</a></p>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slugParam = decodeURIComponent(url.searchParams.get("slug")?.trim() || "");
    const storyParam = url.searchParams.get("story");
    const mcqParam = url.searchParams.get("mcq");
    const flashcardParam = url.searchParams.get("flashcard");
    const essayParam = url.searchParams.get("essay");
    const prerenderParam = url.searchParams.get("prerender");
    const yearParam = url.searchParams.get("year");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const siteUrl = await resolveSiteUrl(supabase);
    const userAgent = (req.headers.get("user-agent") || "").toLowerCase();
    const isCrawler = /(bot|crawl|spider|facebookexternalhit|whatsapp|twitterbot|slackbot|telegrambot|discordbot|linkedinbot|gptbot|chatgpt-user|oai-searchbot|claude|anthropic|perplexity|google-extended|bytespider|amazonbot|youbot|cohere|mistral)/i.test(userAgent);

    let title = "", description = "", image = "", canonicalPath = "", bodyText = "", publishedAt = "", type = "article";

    // ── Year Hubs ──
    if (yearParam) {
      title = `Year ${yearParam} Medical Notes, MCQs & Exams – Kenya`;
      description = `Year ${yearParam} medical study notes, flashcards, MCQs and timed exams for Kenyan and East African medical schools.`;
      canonicalPath = `/year/${yearParam}`;
      type = "website";
      const { data: arts } = await supabase.from("articles").select("title").ilike("category", `Year ${yearParam}%`).limit(10);
      if (arts?.length) {
        bodyText = `<h2>Topics for Year ${yearParam}</h2><ul>` + arts.map(a => `<li>${esc(a.title)}</li>`).join("") + `</ul>`;
      }
    }
    // ── Listing Pages ──
    else if (prerenderParam) {
      type = "website";
      const configs: Record<string, { title: string; desc: string; path: string; table?: string }> = {
        home: { title: "OmpathStudy – Free Medical Notes, MCQs, Flashcards & Exams | Kenya MBChB", desc: "Free MBChB study notes, MCQs with answers, flashcards and timed exams covering pathology, pharmacology, anatomy, microbiology and more. Built for medical students across Kenya and East Africa.", path: "/", table: "articles" },
        blog: { title: "Medical Study Notes – Pathology, Pharmacology, Anatomy | Kenya", desc: "Free medical study notes for Kenyan and East African medical schools. Pathology, pharmacology, anatomy, microbiology and more.", path: "/blog", table: "articles" },
        mcqs: { title: "Medical MCQs with Answers & Explanations – Kenya", desc: "Practice MBChB MCQs with detailed answers and explanations. Chemical pathology, hematopathology, immunopathology, pharmacology, microbiology MCQs for Kenyan & East African medical students.", path: "/mcqs", table: "mcq_sets" },
        flashcards: { title: "Medical Flashcards – Pathology, Pharmacology, Anatomy | Kenya MBChB", desc: "Active-recall medical flashcards for Kenyan medical schools. Quick revision by year and unit.", path: "/flashcards", table: "flashcard_sets" },
        stories: { title: "Medical School Stories & Experiences – Kenya & East Africa", desc: "Real medical school stories and reflections from MBChB and clinical students at Kenyan and East African universities.", path: "/stories", table: "stories" },
        exams: { title: "Timed Medical Exams & Past Papers – Kenya MBChB", desc: "Timed past-paper-style medical exams for MBChB students at Kenyan and East African medical schools.", path: "/exams" },
      };
      // Redirect essay requests to blog
      if (prerenderParam === "essays") {
        const canonical = `${siteUrl}/blog`;
        const html = buildOgHtml({ title: "Medical Study Notes | OmpathStudy Kenya", description: "Browse study notes on OmpathStudy.", image: "", canonical, isCrawler, noindex: true });
        return new Response(html, { status: 301, headers: { ...corsHeaders, "content-type": "text/html; charset=utf-8", "location": canonical } });
      }
      const cfg = configs[prerenderParam];
      if (cfg) {
        title = cfg.title;
        description = cfg.desc;
        canonicalPath = cfg.path;
        if (cfg.table) {
          const { data } = await supabase.from(cfg.table).select("title").eq("published", true).limit(15).order("created_at", { ascending: false });
          if (data?.length) bodyText = `<ul>` + data.map((r: any) => `<li>${esc(r.title)}</li>`).join("") + `</ul>`;
        }
      }
    }
    // ── Single Story ──
    else if (storyParam) {
      const storyId = extractUuid(storyParam);
      if (!storyId) return notFoundResponse(siteUrl, `/stories/${storyParam}`, isCrawler);
      const { data: story } = await supabase.from("stories").select("title, content, cover_image_url, id, created_at").eq("id", storyId).eq("published", true).is("deleted_at", null).maybeSingle();
      if (!story) return notFoundResponse(siteUrl, `/stories/${storyParam}`, isCrawler);
      title = `${story.title} – Medical School Story | Kenya MBChB`;
      description = stripRichText(story.content || "", 155) || `Read ${story.title} on OmpathStudy.`;
      image = story.cover_image_url || extractFirstImage(story.content || "") || "";
      bodyText = buildBodyText(stripRichText(story.content || "", 3000));
      publishedAt = story.created_at;
      canonicalPath = `/stories/${story.id}-${slugify(story.title) || "story"}`;
    }
    // ── Single MCQ ──
    else if (mcqParam) {
      const mcqId = extractUuid(mcqParam);
      let mcq: any = null;
      if (mcqId) {
        const { data } = await supabase.from("mcq_sets").select("title, category, questions, created_at, slug, id").eq("id", mcqId).eq("published", true).is("deleted_at", null).maybeSingle();
        mcq = data;
      }
      if (!mcq) {
        const { data } = await supabase.from("mcq_sets").select("title, category, questions, created_at, slug, id").eq("slug", mcqParam).eq("published", true).is("deleted_at", null).maybeSingle();
        mcq = data;
      }
      if (!mcq) {
        // Try cleanPublicSlug match before falling back to redirect.
        const { data: candidates } = await supabase.from("mcq_sets").select("id, title, slug").eq("published", true).is("deleted_at", null).limit(1000);
        const wanted = String(mcqParam || "").toLowerCase();
        const hit = (candidates || []).find((row: any) =>
          cleanPublicSlug(row.slug, row.title, "quiz") === wanted ||
          slugify(row.title || "") === wanted ||
          String(row.slug || "").toLowerCase() === wanted
        );
        if (hit?.id) {
          const { data } = await supabase.from("mcq_sets").select("title, category, questions, created_at, slug, id").eq("id", hit.id).eq("published", true).is("deleted_at", null).maybeSingle();
          mcq = data;
        }
      }
      if (!mcq) {
        const dest = await findClosestLivePath(supabase, "mcq_sets", mcqParam, "/mcqs");
        if (dest === `/mcqs/${String(mcqParam).toLowerCase()}`) {
          return notFoundResponse(siteUrl, `/mcqs/${mcqParam}`, isCrawler);
        }
        return redirectResponse(siteUrl, dest);
      }
      const qCount = Array.isArray(mcq.questions) ? mcq.questions.length : 0;
      const cat = mcq.category || "Medical";
      const firstQ = Array.isArray(mcq.questions) && mcq.questions[0]
        ? stripRichText(mcq.questions[0].question || mcq.questions[0].text || "", 90)
        : "";
      const mcqItems = Array.isArray(mcq.questions) ? mcq.questions.filter((q: any) => Array.isArray(q?.options) && q.options.length >= 2) : [];
      const writtenItems = Array.isArray(mcq.questions) ? mcq.questions.filter((q: any) => !Array.isArray(q?.options) || q.options.length < 2) : [];
      title = `${mcq.title} – ${mcqItems.length} MCQs${writtenItems.length ? ` + ${writtenItems.length} Written` : ""} | Kenya MBChB`.slice(0, 95);
      description = (firstQ
        ? `${qCount} ${cat} exam questions on ${mcq.title} for medical students. Includes MCQs, answers, explanations and written questions. Sample: ${firstQ}`
        : `${qCount} ${cat} exam questions on ${mcq.title} with MCQs, answers, explanations, SAQs and essays for MBChB students.`
      ).slice(0, 160);
      publishedAt = mcq.created_at;
      type = "website";
      // Rich, unique body: question + options + correct answer + explanation
      if (Array.isArray(mcq.questions)) {
        bodyText = `<p>This MCQ set contains ${qCount} questions on <strong>${esc(mcq.title)}</strong> in the ${esc(cat)} unit. Each question includes the correct answer and a detailed explanation for active recall and exam preparation.</p>` +
          mcq.questions.slice(0, 25).map((q: any, i: number) => {
            const qText = esc(stripRichText(q.question || q.text || "", 300));
            const isMcq = Array.isArray(q.options) && q.options.length >= 2;
            const opts = isMcq
              ? q.options.map((o: string, idx: number) => `<li>${String.fromCharCode(65 + idx)}. ${esc(stripRichText(o, 150))}</li>`).join("")
              : "";
            const correctIdx = typeof q.correct_answer === "number" ? q.correct_answer : (typeof q.answer === "number" ? q.answer : -1);
            const correctText = correctIdx >= 0 && Array.isArray(q.options) && q.options[correctIdx]
              ? `<p><em>Correct answer: ${String.fromCharCode(65 + correctIdx)} – ${esc(stripRichText(q.options[correctIdx], 150))}</em></p>`
              : "";
            const writtenAnswer = !isMcq && (q.model_answer || q.answer || q.explanation) ? `<p><em>Model answer:</em> ${esc(stripRichText(q.model_answer || q.answer || q.explanation, 500))}</p>` : "";
            const expl = isMcq && q.explanation ? `<p>${esc(stripRichText(q.explanation, 400))}</p>` : "";
            return `<section><h3>Q${i + 1}: ${qText}</h3>${opts ? `<ol type="A">${opts}</ol>` : ""}${correctText}${expl}${writtenAnswer}</section>`;
          }).join("\n");
      }
      canonicalPath = `/mcqs/${cleanPublicSlug(mcq.slug, mcq.title, "quiz")}`;
    }
    // ── Single Flashcard ──
    else if (flashcardParam) {
      const fcId = extractUuid(flashcardParam);
      let fc: any = null;
      if (fcId) {
        const { data } = await supabase.from("flashcard_sets").select("title, category, cards, created_at, slug, id").eq("id", fcId).eq("published", true).is("deleted_at", null).maybeSingle();
        fc = data;
      }
      if (!fc) {
        const { data } = await supabase.from("flashcard_sets").select("title, category, cards, created_at, slug, id").eq("slug", flashcardParam).eq("published", true).is("deleted_at", null).maybeSingle();
        fc = data;
      }
      if (!fc) return notFoundResponse(siteUrl, `/flashcards/${flashcardParam}`, isCrawler);
      const cardCount = Array.isArray(fc.cards) ? fc.cards.length : 0;
      const fcCat = fc.category || "Medical";
      const firstCard = Array.isArray(fc.cards) && fc.cards[0]
        ? stripRichText(fc.cards[0].question || "", 80)
        : "";
      title = `${fc.title} – ${cardCount} ${fcCat} Flashcards | Kenya MBChB`.slice(0, 95);
      description = (firstCard
        ? `${cardCount} ${fcCat} flashcards on ${fc.title} for medical students across Kenya and East Africa. Sample: ${firstCard}`
        : `${cardCount} ${fcCat} active-recall flashcards on ${fc.title} for MBChB students at Kenyan and East African medical schools.`
      ).slice(0, 160);
      publishedAt = fc.created_at;
      type = "website";
      if (Array.isArray(fc.cards)) {
        bodyText = `<p>${cardCount} active-recall flashcards on <strong>${esc(fc.title)}</strong> in the ${esc(fcCat)} unit. Each card includes the question and full answer for spaced-repetition study.</p>` +
          fc.cards.slice(0, 25).map((c: any, i: number) => {
            const qText = esc(stripRichText(c.question || "", 250));
            const aText = esc(stripRichText(c.answer || c.back || "", 400));
            return `<section><h3>Card ${i + 1}: ${qText}</h3>${aText ? `<p>${aText}</p>` : ""}</section>`;
          }).join("\n");
      }
      canonicalPath = `/flashcards/${cleanPublicSlug(fc.slug, fc.title, "flashcards")}`;
    }
    // ── Single Essay (redirect to blog) ──
    else if (essayParam) {
      const canonical = `${siteUrl}/blog`;
      const html = buildOgHtml({ title: "OmpathStudy Kenya", description: "Medical study platform for Kenyan students.", image: "", canonical, isCrawler, noindex: true });
      return new Response(html, { status: 301, headers: { ...corsHeaders, "content-type": "text/html; charset=utf-8", "location": canonical } });
    }
    // ── Single Article ──
    else if (slugParam) {
      const articleId = extractUuid(slugParam);
      let article: any = null;

      if (articleId) {
        const { data } = await supabase.from("articles").select("title, content, meta_title, meta_description, og_image_url, slug, id, created_at, category").eq("id", articleId).eq("published", true).is("deleted_at", null).maybeSingle();
        article = data;
      }
      if (!article) {
        const { data } = await supabase.from("articles").select("title, content, meta_title, meta_description, og_image_url, slug, id, created_at, category").eq("slug", slugParam.toLowerCase()).eq("published", true).is("deleted_at", null).maybeSingle();
        article = data;
      }
      if (!article) {
        const { data: candidates } = await supabase.from("articles").select("id, title, slug, created_at").eq("published", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
        const wanted = slugParam.toLowerCase();
        article = (candidates || []).find((row: any) =>
          cleanPublicSlug(row.slug, row.title, "article") === wanted ||
          slugify(row.title) === wanted ||
          String(row.slug || "").toLowerCase() === wanted
        ) || null;
        if (article?.id) {
          const { data } = await supabase.from("articles").select("title, content, meta_title, meta_description, og_image_url, slug, id, created_at, category").eq("id", article.id).eq("published", true).is("deleted_at", null).maybeSingle();
          article = data;
        }
      }

      if (!article) {
        const dest = await findClosestLivePath(supabase, "articles", slugParam, "/blog");
        if (dest === `/blog/${slugParam.toLowerCase()}`) {
          return notFoundResponse(siteUrl, `/blog/${slugParam}`, isCrawler);
        }
        return redirectResponse(siteUrl, dest);
      }

      const articleSlug = cleanPublicSlug(article.slug, article.title, "article");
      const cat = (article.category || "").replace(/^Year\s*\d+:\s*/i, "").trim() || "Medical";
      const cleanSnippet = stripRichText(article.content || "", 155);
      title = (article.meta_title?.trim()
        || `${article.title} – ${cat} Notes & MCQs | Kenya MBChB`).slice(0, 95);
      description = (article.meta_description?.trim()
        || (cleanSnippet
          ? cleanSnippet
          : `${article.title} study notes and MCQs for medical students in Kenyan and African medical schools. ${cat} unit revision.`)
      ).slice(0, 160);
      image = article.og_image_url || extractFirstImage(article.content || "") || "";
      bodyText = buildBodyText(stripRichText(article.content || "", 8000));
      publishedAt = article.created_at;
      canonicalPath = `/blog/${articleSlug}`;
    }
    // ── Root fallback ──
    else {
      title = "OmpathStudy | Medical Notes, MCQs & Exams";
      description = "Free medical study notes, MCQs, flashcards and timed exams for MBChB and health students across Kenya and East Africa.";
      canonicalPath = "/";
      type = "website";
    }

    const canonical = `${siteUrl}${canonicalPath}`;
    const html = buildOgHtml({ title, description, image, canonical, isCrawler, bodyText, publishedAt, type });
    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, "content-type": "text/html; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("OG preview error:", error);
    return new Response("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><title>OmpathStudy</title><meta name=\"description\" content=\"Free medical notes, MCQs, flashcards and timed exams for MBChB and health students.\"><meta name=\"robots\" content=\"index, follow\"></head><body><h1>OmpathStudy</h1><p>Free medical study notes, MCQs, flashcards and timed exams.</p><nav><a href=\"/blog\">Study notes</a> <a href=\"/mcqs\">MCQs</a> <a href=\"/flashcards\">Flashcards</a> <a href=\"/exams\">Exams</a></nav></body></html>", { status: 200, headers: { ...corsHeaders, "content-type": "text/html; charset=utf-8", "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  }
});

function redirectResponse(siteUrl: string, path: string): Response {
  const destination = `${siteUrl}${path}`;
  return new Response(null, {
    status: 301,
    headers: { "location": destination, "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400", "Access-Control-Allow-Origin": "*" },
  });
}

function notFoundResponse(siteUrl: string, path: string, isCrawler: boolean): Response {
  const html = buildOgHtml({
    title: "Page Not Found",
    description: "This page may have been removed or the link is incorrect.",
    image: "",
    canonical: `${siteUrl}${path}`,
    isCrawler,
    noindex: true,
  });
  return new Response(html, {
    status: 404,
    headers: { "Access-Control-Allow-Origin": "*", "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}
