const SUPABASE_URL = "https://dekyjrfwvavtoivqivno.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";

async function fetchFromSupabase(table, field, value) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${field}=eq.${encodeURIComponent(value)}&select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const data = await res.json();
  return data?.[0] || null;
}

function esc(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripHtml(input, max = 160) {
  return (input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]*\)/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildHTML({ title, description, content, url, image, noindex = false }) {
  const safeTitle = esc(title || "Ompath Study");
  const safeDesc = esc(description || "Medical study platform for Kenyan students");
  const safeContent = (content || "").slice(0, 5000);
  const robotsTag = noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  ${robotsTag}
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${esc(url || "https://www.ompathstudy.com")}">
  ${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  ${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}
  <link rel="canonical" href="${esc(url || "https://www.ompathstudy.com")}">
  <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6;color:#1a1a1a}h1{font-size:2rem;margin-bottom:.5rem}.meta{color:#666;font-size:.875rem;margin-bottom:1.5rem}</style>
</head>
<body>
  <article>
    <h1>${safeTitle}</h1>
    <p class="meta">${safeDesc}</p>
    <div>${safeContent}</div>
  </article>
</body>
</html>`;
}

function extractUuid(str) {
  const m = (str || "").match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  const { slug, story, mcq, flashcard, essay, prerender, year } = req.query;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  try {
    let record = null;
    let pageUrl = "https://www.ompathstudy.com";

    if (slug) {
      const articleId = extractUuid(slug);
      if (articleId) record = await fetchFromSupabase("articles", "id", articleId);
      if (!record) record = await fetchFromSupabase("articles", "slug", slug);
      if (!record) {
        const stripped = slug.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-?/, "");
        if (stripped && stripped !== slug) record = await fetchFromSupabase("articles", "slug", stripped);
      }
      pageUrl = `https://www.ompathstudy.com/blog/${slug}`;
      if (record) {
        return res.status(200).send(buildHTML({
          title: record.meta_title || record.title,
          description: record.meta_description || stripHtml(record.content) || `${record.title}`,
          content: `<p>${esc(stripHtml(record.content, 3000))}</p>`,
          url: pageUrl,
          image: record.og_image_url || record.cover_image,
        }));
      }
      return res.status(404).send(buildHTML({
        title: "Article Not Found",
        description: "This article may have been removed or the link is incorrect.",
        url: pageUrl,
        noindex: true,
      }));
    }

    if (mcq) {
      const mcqId = extractUuid(mcq);
      if (mcqId) record = await fetchFromSupabase("mcq_sets", "id", mcqId);
      if (!record) record = await fetchFromSupabase("mcq_sets", "slug", mcq);
      pageUrl = `https://www.ompathstudy.com/mcqs/${mcq}`;
      if (record) {
        const qCount = Array.isArray(record.questions) ? record.questions.length : 0;
        const desc = record.meta_description || `Practice ${qCount} MCQs on ${record.title} with OmpathStudy. Built for Kenyan medical students.`;
        const qList = Array.isArray(record.questions)
          ? record.questions.slice(0, 20).map((q, i) => `<p><strong>Q${i+1}:</strong> ${esc(q.question || q.text || "")}</p>`).join("")
          : "";
        return res.status(200).send(buildHTML({
          title: record.meta_title || `${record.title} | MCQ Quiz | OmpathStudy Kenya`,
          description: desc,
          content: qList,
          url: pageUrl,
          image: record.og_image_url,
        }));
      }
      return res.status(404).send(buildHTML({ title: "MCQ Not Found", description: "This MCQ set was not found.", url: pageUrl, noindex: true }));
    }

    if (flashcard) {
      const fcId = extractUuid(flashcard);
      if (fcId) record = await fetchFromSupabase("flashcard_sets", "id", fcId);
      if (!record) record = await fetchFromSupabase("flashcard_sets", "slug", flashcard);
      pageUrl = `https://www.ompathstudy.com/flashcards/${flashcard}`;
      if (record) {
        return res.status(200).send(buildHTML({
          title: record.meta_title || `${record.title} | Flashcards | OmpathStudy Kenya`,
          description: record.meta_description || `Study flashcards on ${record.title} with OmpathStudy.`,
          content: `<p>${esc(record.description || record.title)}</p>`,
          url: pageUrl,
          image: record.og_image_url,
        }));
      }
      return res.status(404).send(buildHTML({ title: "Flashcards Not Found", description: "This flashcard set was not found.", url: pageUrl, noindex: true }));
    }

    if (essay) {
      res.setHeader("Location", "https://www.ompathstudy.com/blog");
      return res.status(301).send(buildHTML({ title: "Medical Study Notes | OmpathStudy Kenya", description: "Browse medical study notes on OmpathStudy.", url: "https://www.ompathstudy.com/blog", noindex: true }));
    }

    if (story) {
      const storyId = extractUuid(story);
      if (storyId) record = await fetchFromSupabase("stories", "id", storyId);
      if (!record) record = await fetchFromSupabase("stories", "slug", story);
      pageUrl = `https://www.ompathstudy.com/stories/${story}`;
      if (record) {
        return res.status(200).send(buildHTML({
          title: record.meta_title || record.title,
          description: record.meta_description || stripHtml(record.content) || `${record.title}`,
          content: `<p>${esc(stripHtml(record.content, 3000))}</p>`,
          url: pageUrl,
          image: record.og_image_url || record.cover_image_url,
        }));
      }
      return res.status(404).send(buildHTML({ title: "Story Not Found", description: "This story was not found.", url: pageUrl, noindex: true }));
    }

    const pageTitles = {
      blog: "Medical Study Notes & Articles | OmpathStudy Kenya",
      mcqs: "Medical MCQ Practice Quizzes | OmpathStudy Kenya",
      flashcards: "Medical Study Flashcards | OmpathStudy Kenya",
      stories: "Medical School Stories | OmpathStudy Kenya",
      exams: "Timed Medical Exams | OmpathStudy Kenya",
    };
    const pageDescs = {
      blog: "Browse medical study notes covering Pathology, Pharmacology, Anatomy and more for Kenyan MBChB students.",
      mcqs: "Practice interactive medical MCQs with answers and explanations. Built for Kenyan medical students.",
      flashcards: "Active recall medical flashcards for Pathology, Pharmacology and Physiology revision.",
      stories: "Personal stories and experiences from medical students and doctors in Kenya.",
      exams: "Timed medical examinations for students at Kenyan medical schools.",
    };
    if (prerender && pageTitles[prerender]) {
      return res.status(200).send(buildHTML({
        title: pageTitles[prerender],
        description: pageDescs[prerender],
        url: `https://www.ompathstudy.com/${prerender}`,
      }));
    }

    if (year) {
      return res.status(200).send(buildHTML({
        title: `Year ${year} Study Materials | OmpathStudy Kenya`,
        description: `Browse Year ${year} medical study notes, flashcards, MCQs, and exams on OmpathStudy for Kenyan health students.`,
        url: `https://www.ompathstudy.com/year/${year}`,
      }));
    }

    return res.status(200).send(buildHTML({
      title: "Free Medical Study Platform for Kenyan Students",
      description: "Comprehensive medical study notes, flashcards, MCQs, and exam preparation for Kenyan medical students.",
      url: "https://www.ompathstudy.com",
    }));

  } catch (error) {
    console.error("OG Proxy Error:", error);
    return res.status(200).send(buildHTML({
      title: "Ompath Study",
      description: "Medical study platform for Kenyan students",
    }));
  }
}
