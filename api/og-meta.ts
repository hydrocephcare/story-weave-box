import { topicTitle } from "../src/lib/topicMeta.js";
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
// Use the default Node.js runtime: Neon Auth SDK imports Node-compatible modules
// that Vercel Edge Runtime does not support.

/** Which subject picture (public/unit-img) goes on a share card, by the words of the unit or the page. */
const SUBJECT_PICS: [RegExp, string][] = [
  [/embryo/i, "embryology"], [/histolog/i, "histology"], [/anatom|aponeur/i, "anatomy"], [/immun/i, "immunology"], [/microbio|bacteri/i, "microbiology"],
  [/parasit/i, "parasitology"], [/virolog/i, "virology"], [/biochem|metabol/i, "biochemistry"], [/genetic|molecular/i, "genetics"], [/physiolog|git|endocrin/i, "physiology"],
  [/haemat|hemat/i, "haematology"], [/patholog/i, "pathology"], [/pharmac/i, "pharmacology"], [/epidemi|statist|public health/i, "epidemiology"], [/communication/i, "communication"],
  [/surg/i, "surgery"], [/obstet|gynae/i, "obstetrics"], [/paed|pediatr/i, "paediatrics"], [/psych/i, "psychiatry"], [/internal medicine|medicine/i, "medicine"],
];
const OG_FALLBACK_IMAGE = "https://www.ompathstudy.com/og-default.png";
/** A share picture drawn from the note's own title, year and unit (api/note-card.js), for notes that have no picture of their own. */
function cardUrl(title: unknown, category: unknown, kind: string, blurb = "", image = ""): string {
  const p = new URLSearchParams({ title: String(title || "Study notes").slice(0, 140), kind });
  const m = String(category || "").match(/^Year\s*(\d)\s*:\s*(.*)$/i);
  if (m) { p.set("year", m[1]); p.set("unit", m[2].slice(0, 40)); } else if (category) p.set("unit", String(category).slice(0, 40));
  if (kind === "Topic") { p.set("pic", "wiki"); if (blurb) p.set("blurb", String(blurb).replace(/\s+/g, " ").slice(0, 150)); }
  else if (image) p.set("image", image); // a good picture of the page's own: it is put on the card, which always carries the Ompath Study name
  return `https://www.ompathstudy.com/api/note-card?${p.toString()}`;
}
/** A picture that says something about the page: not a scanned exam page, a camera file, a screenshot or a logo, and not for papers. */
function goodShareImage(title: unknown, ...urls: unknown[]): string {
  if (/past paper|\bexam(ination)?s?\b|\bcat\b|\bsupp(lementary)?\b|make-?up|marking scheme|\bmcqs?\b|\bsaqs?\b|question bank|\bquiz\b|assessment|course outline|timetable|\bnotice\b/i.test(String(title || ""))) return "";
  for (const u of urls) {
    const url = String(u || "");
    if (!/^https:\/\//.test(url)) continue;
    const file = decodeURIComponent(url.split("?")[0].split("/").pop() || "").toLowerCase();
    if (/(^|[-_ ])(page|pg|scan|scanned|img|dsc|screenshot|whatsapp|photo|image|doc)[-_ ]?0*\d*(\.|[-_ ]|$)|page-\d+|logo|icon|default|placeholder/.test(file)) continue;
    return url;
  }
  return "";
}
const GEO_KEYWORDS = "Kenya, Africa, global medical students, MBChB, clinical medicine, nursing, University of Nairobi, Kenyatta University, Moi University, Kabarak University, Aga Khan University";
const STATIC_PAGE_META: Record<string, { title: string; description: string; links: string[]; image?: string }> = {
  "/": {
    title: "OmpathStudy | Free Medical Notes, MCQs & Exams",
    description: "Free medical notes, MCQs, flashcards and timed exams for medical, clinical medicine, nursing and health students worldwide.",
    links: ["/blog", "/mcqs", "/flashcards", "/exams", "/stories", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/blog": {
    title: "Medical Study Notes | Ompath Study",
    description: "Browse free medical study notes in pathology, pharmacology, anatomy, physiology, microbiology and biochemistry.",
    links: ["/", "/mcqs", "/flashcards", "/exams", "/stories", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/mcqs": {
    title: "Medical MCQs with Answers | Ompath Study",
    description: "Practice medical MCQs with answers and explanations by year and unit for exam-focused revision.",
    links: ["/", "/blog", "/flashcards", "/exams", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/flashcards": {
    title: "Medical Flashcards | Ompath Study",
    description: "Study active-recall medical flashcards by year and unit for fast revision across core medical subjects.",
    links: ["/", "/blog", "/mcqs", "/exams", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/essays": {
    title: "Medical Essay Questions & Answers | Ompath Study",
    description: "Practice structured short- and long-answer medical questions with model answers for exam revision.",
    links: ["/", "/blog", "/mcqs", "/flashcards", "/exams", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/exams": {
    title: "Timed Medical Exams | Ompath Study",
    description: "Take timed medical exams and past-paper style MCQ practice for MBChB revision by year and unit.",
    links: ["/", "/blog", "/mcqs", "/flashcards", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/contests": {
    title: "Inter-University Medical Contests: coming soon | Ompath Study",
    description: "Medical students from universities across the world compete on one board. Briefings, rules and dates are published here before each contest opens. Coming soon.",
    image: cardUrl("Inter-University Medical Contest", "", "Coming soon", "Universities compete on one board. Dates and rules will be published here."),
    links: ["/", "/blog", "/mcqs", "/flashcards", "/exams", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/friend-zone": {
    title: "Friend Zone: study games with friends | Ompath Study",
    description: "Challenge a friend on any topic. Pick a game, share the code and everyone starts together after a countdown: quizzes, image spot, true or false, case showdowns and more.",
    image: cardUrl("Friend Zone: study games with friends", "", "Games"),
    links: ["/", "/blog", "/mcqs", "/flashcards", "/exams", "/year/1", "/year/2", "/year/3", "/year/4", "/year/5", "/year/6"],
  },
  "/ai": {
    title: "Ompath Study AI: notes, past papers and anatomy pictures for MBChB students",
    description: "Ask Ompath Study AI for notes, past papers, your timetable and anatomy spot questions with pictures. Made for medical students worldwide. Log in free and ask.",
    image: "https://www.ompathstudy.com/og/ai.png",
    links: ["/", "/blog", "/papers", "/stories"],
  },
  "/finalists": {
    title: "Share your experience | Stories",
    description: "Contributors from every background can share experiences, lessons, knowledge and ideas with readers around the world.",
    image: "https://www.ompathstudy.com/og/share-story.png?v=2",
    links: ["/share-your-story", "/stories", "/blog", "/papers", "/mcqs"],
  },
  "/share-your-story": {
    title: "Share your story | Stories",
    description: "Everyone has a story worth sharing. Publish personal experiences, ideas, knowledge and creative writing. Your name can stay private.",
    image: "https://www.ompathstudy.com/og/share-story-all.png?v=3",
    links: ["/stories", "/blog", "/papers", "/mcqs", "/exams"],
  },
  "/stories": {
    title: "Every medical student has a story. Share yours | Ompath Study",
    description: "Read real stories from medical school, from first year to final year, and add yours in two minutes. Your name can stay private.",
    image: "https://www.ompathstudy.com/og/stories.png?v=3",
    links: ["/", "/blog", "/mcqs", "/flashcards", "/exams"],
  },
};

// share-your-story pages made for one year or one group, so the link preview in WhatsApp says who it is for
for (const y of [1, 2, 3, 4, 5, 6]) {
  STATIC_PAGE_META[`/share-your-story/year-${y}`] = {
    title: `Share your story | Stories`,
    description: `Publish a personal experience, idea or lesson with the Stories community. Your name can stay private.`,
    image: "https://www.ompathstudy.com/og/share-story-all.png?v=3",
    links: ["/share-your-story", "/finalists", "/stories", "/blog"],
  };
}
STATIC_PAGE_META["/share-your-story/other"] = {
  title: "Share your story | Stories",
  description: "People from every profession, background and country are welcome to publish personal experiences, ideas and knowledge.",
  image: "https://www.ompathstudy.com/og/share-story-all.png?v=3",
  links: ["/share-your-story", "/finalists", "/stories"],
};

function isCrawler(userAgent: string | null): boolean {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return false;
  return (
    ua.includes("bot") ||
    ua.includes("crawl") ||
    ua.includes("spider") ||
    ua.includes("openseo-audit") ||
    ua.includes("ompathstudymonitor") ||
    // Google fetchers that do NOT contain "bot" in the UA string. Without
    // these, Google-InspectionTool / GoogleOther get the JS shell while
    // Googlebot gets the pre-rendered page — which is exactly what makes
    // Search Console report "Google chose a different canonical".
    ua.includes("inspectiontool") ||
    ua.includes("googleother") ||
    ua.includes("google-safety") ||
    ua.includes("google-extended") ||
    ua.includes("mediapartners-google") ||
    ua.includes("facebookexternalhit") ||
    ua.includes("whatsapp") ||
    ua.includes("telegram") ||
    ua.includes("discord") ||
    ua.includes("slack") ||
    ua.includes("linkedin") ||
    ua.includes("twitter") ||
    ua.includes("prerender") ||
    ua.includes("google") ||
    ua.includes("bing") ||
    ua.includes("semrush") ||
    ua.includes("ahrefs")
  );
}

function cleanForMetaSnippet(input: string): string {
  if (!input) return "";
  return input
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(summary|introduction|overview|note)[:\s]*/i, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanQuestionStem(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^Question\s+\d+[\s:-]*/i, "")
    .replace(/\s*-\s*\(\s*$/, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOption(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^[A-E][.)]\s*/i, "")
    .replace(/\s*-\s*\(\s*$/, "")
    .replace(/\s*\(\s*$/, "")
    .replace(/\s*-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function to160(input: string): string {
  const s = cleanForMetaSnippet(input);
  if (!s) return "";
  return s.length <= 160 ? s : s.slice(0, 157).trimEnd() + "...";
}

function toMetaTitle(input: string, fallback = "Medical Study Resource"): string {
  const clean = cleanForMetaSnippet(input || fallback)
    .replace(/\s*[|–-]\s*OmpathStudy\s*(Kenya)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || fallback;
  // a stored title that begins mid-sentence ("TO NEOPLASIA MCQs") or is far shorter than the real title is a leftover from an old clean-up: use the real one
  const mangled = /^(to|of|and|the|in|for|on|with|a|an)\s/i.test(clean) || (fallback.length > clean.length + 12 && clean.length < 14);
  const base = mangled ? cleanForMetaSnippet(fallback).replace(/\s+/g, " ").trim() || clean : clean;
  if (base.length <= 62) return base;
  const cut = base.slice(0, 62);
  return cut.slice(0, Math.max(30, cut.lastIndexOf(" "))).replace(/[\s,:;&–-]+$/, ""); // end on a whole word, no dangling "..."
}

function cleanResourceBaseTitle(input: string): string {
  return String(input || "")
    .replace(/\s*[|–—-]\s*Ompath\s*Study(?:\s*Kenya)?\s*$/i, "")
    .replace(/\s*(?:[|:–—-]\s*)?(?:MCQs?|Flashcards?)\s*$/i, "")
    .replace(/\s*(?:[|:–—-]\s*)?(?:MCQs?|Flashcards?)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Medical revision";
}

function resourceMetaTitle(input: string, slug: string | null | undefined, category: string | null | undefined, kind: "MCQs" | "Flashcards"): string {
  const base = cleanResourceBaseTitle(input);
  const baseTokens = slugify(base).split("-").filter(Boolean);
  const excluded = new Set(["mcq", "mcqs", "quiz", "questions", "flashcard", "flashcards", "and", "the", "for", "of", "in", "on", "to", "set"]);
  const extras = String(slug || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter((token) => !baseTokens.includes(token) && !excluded.has(token));
  const rawCategory = String(category || "").trim();
  const year = rawCategory.match(/^Year\s*([1-6])\s*:?\s*(.*)$/i);
  const categoryLabel = year ? `Y${year[1]} ${year[2]}`.trim() : rawCategory;
  const descriptor = (extras.length ? `Set ${extras.join(" ")}` : categoryLabel || "Revision").slice(0, 18);
  const shortBase = base.length > 32 ? base.slice(0, 32).replace(/\s+\S*$/, "") : base;
  return `${shortBase} (${descriptor}) ${kind} | Ompath Study`;
}

function toMetaDescription(input: string, fallback: string): string {
  const clean = cleanForMetaSnippet(input || fallback)
    .replace(/\s*[-–—]{2,}\s*/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
  const value = clean.length >= 50 ? clean : fallback;
  const enriched = /\b(Kenya|Africa|MBChB|medical students)\b/i.test(value) ? value : `${value.replace(/[.\s]+$/, "")}. Free notes for medical students worldwide.`;
  return enriched.length <= 155 ? enriched : enriched.slice(0, 152).trimEnd() + "...";
}

function articleMetaTitle(article: Record<string, string>): string {
  const raw = article.meta_title && !(article.meta_title.length >= 58 && String(article.title || "").startsWith(article.meta_title))
    ? article.meta_title
    : article.title;
  const base = cleanForMetaSnippet(raw || article.title || "Medical study notes")
    .replace(/\s*[|–—-]\s*Ompath\s*Study(?:\s*Kenya)?\s*$/i, "")
    .replace(/\s*[|–—:]\s*part\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Medical study notes";
  const slug = String(article.slug || "").toLowerCase();
  const part = slug.match(/(?:^|-)part-(\d+)(?:-|$)/i);
  const stop = new Set(["the", "and", "for", "of", "in", "on", "to", "a", "an", "with", "blog", "notes", "note", "study", "medical", "mcq", "mcqs", "past", "paper", "article"]);
  const baseTokens = new Set(slugify(base).split("-").filter(Boolean));
  const extras = slug.split(/[^a-z0-9]+/).filter((token) => token && !baseTokens.has(token) && !stop.has(token) && !/^[0-9a-f]{8}$/.test(token));
  const descriptor = part ? `Part ${part[1]}` : extras.length ? extras.slice(-2).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" ") : `Ref ${String(article.id || slug).replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
  const suffix = ` — ${descriptor} | OmpathStudy`;
  const maxBase = Math.max(20, 62 - suffix.length);
  const shortBase = base.length > maxBase ? base.slice(0, maxBase).replace(/\s+\S*$/, "") : base;
  return `${shortBase}${suffix}`;
}

function articleDescription(article: Record<string, string>): string {
  const title = cleanForMetaSnippet(article.title || "");
  const fallback = `${title} study notes with key clinical points, exam-focused explanations and revision support for medical students.`;
  let provided = cleanForMetaSnippet(article.meta_description || "").replace(/\s*[-–—]{2,}\s*/g, " — ").trim();
  if (title && provided.toLowerCase().startsWith(title.toLowerCase())) {
    provided = provided.slice(title.length).replace(/^\s*[|:;,.–—-]+\s*/, "").trim();
  }
  const fromContent = cleanForMetaSnippet(article.content || "");
  return toMetaDescription(provided || fromContent, fallback);
}

function htmlEscape(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function storyPlainText(raw: string): string {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/gi, " $1 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|section)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function storyBodyHtml(raw: string): string {
  const content = String(raw || "")
    .replace(/^\s*<p><em>By [^<]*<\/em><\/p>/i, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|section)>/gi, "\n");
  const blocks = content.split(/\n+/).map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    const heading = /^<h[2-6]\b/i.test(trimmed) || /^#{2,6}\s+/.test(trimmed);
    const listItem = /^<li\b/i.test(trimmed) || /^[-*•]\s+/.test(trimmed);
    const text = storyPlainText(trimmed);
    if (!text) return "";
    if (heading) return "<h2>" + htmlEscape(text.replace(/^#{2,6}\s+/, "")) + "</h2>";
    if (listItem) return "<p>• " + htmlEscape(text.replace(/^[-*•]\s+/, "")) + "</p>";
    return "<p>" + htmlEscape(text) + "</p>";
  }).filter(Boolean);
  return blocks.join("") || "<p>" + htmlEscape(storyPlainText(raw)) + "</p>";
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_PREFIX_REGEX =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-(.+)$/i;

function slugify(value: string): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanPublicSlug(rawSlug: string | null | undefined, fallbackTitle: string, fallback = "study"): string {
  const base = String(rawSlug || slugify(fallbackTitle) || fallback).trim().toLowerCase();
  return base
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "")
    .replace(/-[0-9a-f]{6,12}$/i, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "into", "onto", "this", "that", "notes", "note", "mcq", "mcqs", "quiz", "questions", "study"]);

const LEGACY_REDIRECT_PATHS = new Set([
  "/blog/amebiasis-pathogenic-free-living-amebae-guide",
  "/blog/entamoeba-histolytica-amoebiasis",
  "/blog/liver-tumors-benign-and-malignant-overview",
  "/blog/lymphoma-overview-classification",
  "/blog/liver-tumors-summary-notes",
  "/blog/non-hodgkin-lymphoma",
  "/blog/pleural-effusion-lights-criteria-y4",
  "/blog/pneumothorax-clinical-management-y4",
  "/blog/bronchial-asthma-internal-medicine-y4",
  "/mcqs/medical-bacteriology-mcqs",
  "/mcqs/chemical-pathology-mcqs",
  "/mcqs/cardiovascular-pathology-mcqs",
  "/mcqs/respiratory-pathology-mcqs",
  "/mcqs/glomerular-diseases-mcqs",
  "/mcqs/sickle-cell-anaemia-mcqs",
  "/mcqs/infective-endocarditis-mcqs",
  "/mcqs/biliary-tract-disease-mcqs",
  "/mcqs/rheumatic-heart-disease-mcqs",
  "/mcqs/paed-2021-mcqs",
  "/mcqs/congenital-heart-disease-mcqs",
  "/mcqs/gout-mcqs",
  "/mcqs/pneumonia-mcqs",
  "/mcqs/osteoarthritis-presentation-mcqs",
  "/mcqs/fibromyalgia-presentation-mcqs",
  "/mcqs/crystal-arthropathies-mcqs",
  "/mcqs/sepsis-mcqs",
  "/mcqs/hepatic-amoebiasis-mcqs",
  "/mcqs/blood-transfusion-mcqs",
  "/essays/congenital-heart-disease-essay-questions",
]);

function tokenScore(target: string, candidate: string): number {
  const a = new Set(String(target || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t)));
  const b = new Set(String(candidate || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t)));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach((t) => { if (b.has(t)) overlap++; });
  return (2 * overlap) / (a.size + b.size);
}

async function closestLivePath(table: string, param: string, prefix: "/blog" | "/mcqs" | "/flashcards" | "/essays" | "/contests", fallback: string): Promise<string | null> {
  const rows = await sbFetch(table, "select=id,title,slug,password_protected,scheduled_at,published,deleted_at&published=eq.true&deleted_at=is.null&limit=1000");
  let best: Record<string, string> | null = null;
  let score = 0;
  for (const row of rows || []) {
    const publicSlug = cleanPublicSlug(row.slug, row.title, fallback);
    const nextScore = Math.max(tokenScore(param, publicSlug), tokenScore(param, row.title || ""));
    if (nextScore > score) {
      best = row;
      score = nextScore;
    }
  }
  // Only pre-approved legacy URLs may use this high-confidence fallback.
  // Unknown/missing slugs must return 410, not a misleading permanent redirect.
  return best && score >= 0.72 ? `${prefix}/${cleanPublicSlug(best.slug, best.title, fallback)}` : null;
}

async function verifiedLegacyRedirect(path: string, table: string, param: string, prefix: "/blog" | "/mcqs" | "/flashcards" | "/essays", fallback: string): Promise<string | null> {
  if (!LEGACY_REDIRECT_PATHS.has(path)) return null;
  return closestLivePath(table, param, prefix, fallback);
}

function redirectOrGone(path: string | null, hub: string, self = ""): Response {
  // a redirect to the same address is a loop: answer "gone" instead
  if (path && path !== self) return permanentRedirect(path);
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><title>Page removed | OmpathStudy</title></head><body><h1>This page has been removed</h1><p>It was replaced or merged into other study material. Browse the latest on <a href="https://www.ompathstudy.com${hub}">OmpathStudy</a>.</p></body></html>`,
    { status: 410, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, follow", "cache-control": "public, max-age=3600" } },
  );
}

function extractUuidFromParam(value?: string | null): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  if (UUID_REGEX.test(v)) return v;
  const match = v.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-|$)/i,
  );
  return match?.[1] || null;
}

const NEON_AUTH_URL =
  process.env.NEON_AUTH_URL ||
  process.env.VITE_NEON_AUTH_URL ||
  "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth";
const NEON_DATA_API_URL =
  process.env.NEON_DATA_API_URL ||
  process.env.VITE_NEON_DATA_API_URL ||
  "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1";

const neon = createClient({
  auth: { adapter: SupabaseAuthAdapter(), url: NEON_AUTH_URL, allowAnonymous: true },
  dataApi: { url: NEON_DATA_API_URL },
});

/** Read-only public metadata queries through Neon; preserves the existing PostgREST filters. */
async function sbFetch(table: string, params: string) {
  const search = new URLSearchParams(params);
  const select = search.get("select") || "*";
  let query: any = neon.from(table).select(select);

  for (const [key, raw] of search.entries()) {
    if (key === "select" || key === "limit" || key === "order") continue;
    if (raw.startsWith("eq.")) {
      query = query.eq(key, raw.slice(3));
    } else if (raw === "is.null") {
      query = query.is(key, null);
    } else if (raw.startsWith("in.(") && raw.endsWith(")")) {
      const values = raw.slice(4, -1).split(",").filter(Boolean);
      query = query.in(key, values);
    } else {
      throw new Error(`Unsupported metadata filter: ${key}=${raw}`);
    }
  }

  const order = search.get("order");
  if (order) {
    const [column, direction] = order.split(".");
    query = query.order(column, { ascending: direction !== "desc", nullsFirst: false });
  }
  const limit = Number(search.get("limit"));
  if (Number.isFinite(limit) && limit > 0) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Neon metadata query failed on ${table}: ${error.message || String(error)}`);
  }
  return data || [];
}

function isPublicScheduled(row: Record<string, any> | null | undefined): boolean {
  return Boolean(row && row.published === true && !row.deleted_at && row.password_protected !== true
    && (!row.scheduled_at || new Date(row.scheduled_at).getTime() <= Date.now()));
}

async function fetchArticleBySlug(slug: string) {
  const decoded = decodeURIComponent(slug).trim().toLowerCase();
  const cols =
    "id,title,content,slug,published,deleted_at,password_protected,scheduled_at,meta_title,meta_description,og_image_url,created_at,updated_at,category";

  // 1. Try exact slug match
  const bySlug = await sbFetch(
    "articles",
    `select=${cols}&slug=eq.${encodeURIComponent(decoded)}&published=eq.true&deleted_at=is.null&order=created_at.asc&limit=1`
  );
  if (bySlug && bySlug.length > 0 && isPublicScheduled(bySlug[0])) return bySlug[0];

  // 2. Check if param is UUID-prefixed: {uuid}-{slug}
  const uuidPrefixMatch = decoded.match(UUID_PREFIX_REGEX);
  if (uuidPrefixMatch) {
    const uuid = uuidPrefixMatch[1];
    const strippedSlug = uuidPrefixMatch[2];

    // 2a. Try by ID (most reliable)
    const byId = await sbFetch(
      "articles",
      `select=${cols}&id=eq.${encodeURIComponent(uuid)}&published=eq.true&deleted_at=is.null&limit=1`
    );
    if (byId && byId.length > 0 && isPublicScheduled(byId[0])) return byId[0];

    // 2b. Try stripped slug
    const byStripped = await sbFetch(
      "articles",
      `select=${cols}&slug=eq.${encodeURIComponent(strippedSlug)}&published=eq.true&deleted_at=is.null&limit=1`
    );
    if (byStripped && byStripped.length > 0 && isPublicScheduled(byStripped[0])) return byStripped[0];
  }

  // 3. Try pure UUID
  if (UUID_REGEX.test(decoded)) {
    const byId = await sbFetch(
      "articles",
      `select=${cols}&id=eq.${encodeURIComponent(decoded)}&published=eq.true&deleted_at=is.null&limit=1`
    );
    if (byId && byId.length > 0 && isPublicScheduled(byId[0])) return byId[0];
  }

  const candidates = await sbFetch(
    "articles",
    `select=id,title,slug&published=eq.true&deleted_at=is.null&limit=1000`
  );
  const wantedCanonical = cleanPublicSlug(decoded, "", "article");
  const match = (candidates || []).filter(isPublicScheduled).find((row: Record<string, string>) =>
    cleanPublicSlug(row.slug, row.title, "article") === wantedCanonical ||
    slugify(row.title || "") === decoded ||
    // the public address (hash suffix removed) is what the sitemap lists
    cleanPublicSlug(row.slug, row.title, "article") === decoded ||
    String(row.slug || "").toLowerCase() === decoded
  );
  if (match?.id) {
    const byClean = await sbFetch(
      "articles",
      `select=${cols}&id=eq.${encodeURIComponent(match.id)}&published=eq.true&deleted_at=is.null&limit=1`
    );
    if (byClean && byClean.length > 0 && isPublicScheduled(byClean[0])) return byClean[0];
  }

  return null;
}

async function fetchMcqSetBySlugOrId(param: string) {
  const cols = "id,title,category,questions,slug,created_at,meta_title,meta_description,og_image_url";
  const decoded = decodeURIComponent(param).trim();

  const bySlug = await sbFetch(
    "mcq_sets",
    `select=${cols}&slug=eq.${encodeURIComponent(decoded)}&published=eq.true&deleted_at=is.null&limit=1`
  );
  if (bySlug && bySlug.length > 0) return bySlug[0];

  const id = extractUuidFromParam(param);
  if (id) {
    const byId = await sbFetch(
      "mcq_sets",
      `select=${cols}&id=eq.${encodeURIComponent(id)}&published=eq.true&deleted_at=is.null&limit=1`
    );
    if (byId && byId.length > 0) return byId[0];
  }

  const candidates = await sbFetch(
    "mcq_sets",
    `select=id,title,slug&published=eq.true&deleted_at=is.null&limit=1000`
  );
  const wanted = decoded.toLowerCase();
  const wantedCanonical = cleanPublicSlug(decoded, "", "quiz");
  const match = (candidates || []).find((row: Record<string, string>) =>
    cleanPublicSlug(row.slug, row.title, "quiz") === wantedCanonical ||
    slugify(row.title || "") === wanted ||
    String(row.slug || "").toLowerCase() === wanted
  );
  if (!match?.id) return null;
  const byClean = await sbFetch(
    "mcq_sets",
    `select=${cols}&id=eq.${encodeURIComponent(match.id)}&published=eq.true&deleted_at=is.null&limit=1`
  );
  return byClean && byClean.length > 0 ? byClean[0] : null;
}

/**
 * Decide what a public crawler may see on a paid MCQ page.
 * The browser's paywall is not an access-control boundary; never serialize
 * locked questions into crawler HTML or structured data.
 */
async function getMcqCrawlerAccess(setId: string, slug: string) {
  try {
    const rows = await sbFetch(
      "app_settings",
      "select=key,value&key=in.(subscriptions_enabled,access_price_kes,mcq_paywall_enabled,paywall_free_ratio,mcq_paywall_excluded_ids)"
    );
    const settings = new Map<string, string>((rows || []).map((row: { key: string; value: string }) => [row.key, row.value] as [string, string]));
    const excludedRaw = settings.get("mcq_paywall_excluded_ids") || "[]";
    let excluded: string[] = [];
    try {
      const parsed = JSON.parse(excludedRaw);
      if (Array.isArray(parsed)) excluded = parsed.map(String);
    } catch { /* malformed exclusion list must not grant access */ }
    const locked =
      settings.get("subscriptions_enabled") === "true" &&
      settings.get("mcq_paywall_enabled") === "true" &&
      Number(settings.get("access_price_kes") || 0) > 0 &&
      !excluded.includes(setId) &&
      !excluded.includes(slug);
    // Search crawlers receive the complete published bank. The paywall is
    // explicitly declared in WebPage structured data below; this does not
    // grant normal browser/API access to the premium questions.
    return { locked, ratio: 1, verified: true };
  } catch (error) {
    console.error("Could not verify MCQ crawler access settings; hiding question content:", error);
    return { locked: true, ratio: 0, verified: false };
  }
}

async function fetchFlashcardSetBySlugOrId(param: string) {
  const cols = "id,title,category,cards,slug,created_at";
  const decoded = decodeURIComponent(param).trim();

  const bySlug = await sbFetch(
    "flashcard_sets",
    `select=${cols}&slug=eq.${encodeURIComponent(decoded)}&published=eq.true&deleted_at=is.null&limit=1`
  );
  if (bySlug && bySlug.length > 0) return bySlug[0];

  const id = extractUuidFromParam(param);
  if (id) {
    const byId = await sbFetch(
      "flashcard_sets",
      `select=${cols}&id=eq.${encodeURIComponent(id)}&published=eq.true&deleted_at=is.null&limit=1`
    );
    if (byId && byId.length > 0) return byId[0];
  }

  const candidates = await sbFetch(
    "flashcard_sets",
    `select=id,title,slug&published=eq.true&deleted_at=is.null&limit=1000`
  );
  const wanted = decoded.toLowerCase();
  const match = (candidates || []).find((row: Record<string, string>) =>
    cleanPublicSlug(row.slug, row.title, "flashcards") === wanted ||
    slugify(row.title || "") === wanted ||
    String(row.slug || "").toLowerCase() === wanted
  );
  if (!match?.id) return null;
  const byClean = await sbFetch(
    "flashcard_sets",
    `select=${cols}&id=eq.${encodeURIComponent(match.id)}&published=eq.true&deleted_at=is.null&limit=1`
  );
  return byClean && byClean.length > 0 ? byClean[0] : null;
}

/**
 * Resolve the one true public path for a legacy detail URL (UUID or
 * UUID-prefixed slug). Returns null when nothing matches.
 */
async function resolveCanonicalDetailPath(section: string, param: string): Promise<string | null> {
  try {
    if (section === "blog") {
      const article = await fetchArticleBySlug(param);
      return article ? `/blog/${cleanPublicSlug(article.slug, article.title, "article")}` : "/blog";
    }
    if (section === "mcqs") {
      const mcq = await fetchMcqSetBySlugOrId(param);
      return mcq ? `/mcqs/${cleanPublicSlug(mcq.slug, mcq.title, "quiz")}` : "/mcqs";
    }
    if (section === "flashcards") {
      const set = await fetchFlashcardSetBySlugOrId(param);
      return set ? `/flashcards/${cleanPublicSlug(set.slug, set.title, "flashcards")}` : "/flashcards";
    }
    if (section === "essays") {
      const essay = await fetchEssayBySlugOrId(param);
      return essay ? `/essays/${cleanPublicSlug(essay.slug, essay.title, "essay")}` : "/essays";
    }
  } catch {
    return null;
  }
  return null;
}

async function buildLiveIndexLinks(section: string, year?: string): Promise<string> {
  const yearPrefix = year && /^[1-6]$/.test(year) ? `Year ${year}:` : "";
  const filterYear = (row: Record<string, string>) => !yearPrefix || String(row.category || "").startsWith(yearPrefix);
  const link = (href: string, label: string, category?: string) =>
    `<li><a href="${htmlEscape(href)}">${htmlEscape(label)}</a>${category ? ` <small>${htmlEscape(category.replace(/^Year\s*\d+:\s*/i, ""))}</small>` : ""}</li>`;

  if (section === "blog" || section === "year") {
    const rows = (await sbFetch("articles", "select=id,title,slug,category,published,deleted_at,password_protected,scheduled_at&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=1000")) || [];
    const links = rows.filter(isPublicScheduled).filter(filterYear).map((row: Record<string, string>) => link(`/blog/${cleanPublicSlug(row.slug, row.title, "article")}`, row.title, row.category));
    return links.length ? `<section><h2>Live study notes</h2><ul>${links.join("\n")}</ul></section>` : "";
  }
  if (section === "mcqs") {
    const rows = (await sbFetch("mcq_sets", "select=id,title,slug,category&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=1000")) || [];
    const links = rows.filter(filterYear).map((row: Record<string, string>) => link(`/mcqs/${cleanPublicSlug(row.slug, row.title, "quiz")}`, row.title, row.category));
    return links.length ? `<section><h2>Live MCQ quizzes</h2><ul>${links.join("\n")}</ul></section>` : "";
  }
  if (section === "flashcards") {
    const rows = (await sbFetch("flashcard_sets", "select=id,title,slug,category&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=1000")) || [];
    const links = rows.filter(filterYear).map((row: Record<string, string>) => link(`/flashcards/${cleanPublicSlug(row.slug, row.title, "flashcards")}`, row.title, row.category));
    return links.length ? `<section><h2>Live flashcards</h2><ul>${links.join("\n")}</ul></section>` : "";
  }
  if (section === "stories") {
    const rows = (await sbFetch("stories", "select=id,title,slug,category,published,deleted_at,password_protected,scheduled_at&published=eq.true&deleted_at=is.null&order=created_at.desc&limit=1000")) || [];
    const links = rows.filter(isPublicScheduled).map((row: Record<string, string>) => link(`/stories/${row.id}-${cleanPublicSlug(row.slug, row.title, "story")}`, row.title, row.category));
    return links.length ? `<section><h2>Live stories</h2><ul>${links.join("\n")}</ul></section>` : "";
  }
  return "";
}

async function fetchEssayByIdOrSlug(param: string) {
  const cols = "id,slug,title,category,created_at";
  const decoded = decodeURIComponent(param).trim();

  const bySlug = await sbFetch(
    "essays",
    `select=${cols}&slug=eq.${encodeURIComponent(decoded)}&published=eq.true&deleted_at=is.null&limit=1`
  );
  if (bySlug && bySlug.length > 0) return bySlug[0];

  const byId = await sbFetch(
    "essays",
    `select=${cols}&id=eq.${encodeURIComponent(decoded)}&published=eq.true&deleted_at=is.null&limit=1`
  );
  return byId && byId.length > 0 ? byId[0] : null;
}


async function fetchEssayBySlugOrId(param: string) {
  const decoded = decodeURIComponent(param).trim();
  const cols = "id,title,slug,category,short_answer_questions,long_answer_questions,article_id,created_at,updated_at";

  // UUID-based legacy links identify one exact record.
  const id = extractUuidFromParam(param);
  if (id) {
    const byId = await sbFetch("essays",
      `select=${cols}&id=eq.${encodeURIComponent(id)}&published=eq.true&deleted_at=is.null&limit=1`
    );
    if (byId && byId.length > 0) return byId[0];
  }

  // A clean public slug can represent several records (e.g. the same essay
  // title imported for more than one unit/year). Resolve all of them in a
  // stable order and combine their questions instead of silently choosing
  // an arbitrary duplicate record.
  const candidates = await sbFetch(
    "essays",
    "select=id,title,slug&published=eq.true&deleted_at=is.null&order=created_at.asc&limit=1500"
  );
  const wanted = decoded.toLowerCase();
  const matches = (candidates || []).filter((row: Record<string, string>) =>
    cleanPublicSlug(row.slug, row.title, "essay") === wanted ||
    slugify(row.title || "") === wanted ||
    String(row.slug || "").toLowerCase() === wanted
  );
  if (!matches.length) return null;

  const ids = matches.map((row: Record<string, string>) => row.id).filter(Boolean);
  const rows = await sbFetch(
    "essays",
    `select=${cols}&id=in.(${ids.join(",")})&published=eq.true&deleted_at=is.null&order=created_at.asc`
  );
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];

  const mergeQuestions = (field: "short_answer_questions" | "long_answer_questions") => {
    const seen = new Set<string>();
    const merged: unknown[] = [];
    for (const row of rows) {
      const questions = Array.isArray(row[field]) ? row[field] : [];
      for (const question of questions) {
        if (!question || typeof question !== "object") continue;
        const item = question as Record<string, unknown>;
        const stem = String(item.question || "").replace(/\s+/g, " ").trim();
        if (!stem) continue;
        const answer = String(item.answer || "").replace(/\s+/g, " ").trim();
        const key = `${stem.toLowerCase()}|${answer.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(question);
      }
    }
    return merged;
  };
  const categories = [...new Set(rows.map((row: Record<string, string>) => String(row.category || "").trim()).filter(Boolean))];
  return {
    ...rows[0],
    category: categories.join(" · "),
    short_answer_questions: mergeQuestions("short_answer_questions"),
    long_answer_questions: mergeQuestions("long_answer_questions"),
    source_count: rows.length,
  };
}

function publicStoryImage(...values: unknown[]): string {
  const hosts = new Set(["cdn.ompathstudy.com", "ompathstudy.com", "www.ompathstudy.com", "strfwaqvxvkhjbqrwmla.supabase.co"]);
  for (const value of values) {
    try {
      const image = new URL(String(value || ""));
      if (image.protocol !== "https:" || !hosts.has(image.hostname)) continue;
      if (!/\\.(?:jpe?g|png)$/i.test(image.pathname)) continue;
      return image.toString();
    } catch {
      // Ignore malformed or non-public image URLs.
    }
  }
  return "";
}

async function fetchStoryByParam(param: string) {
  const storyId = extractUuidFromParam(param);
  const cols = "id,title,slug,content,category,cover_image_url,og_image_url,meta_title,meta_description,created_at,tags,published,deleted_at,password_protected,scheduled_at";
  const rows = await sbFetch(
    "stories",
    `select=${cols}&${storyId ? `id=eq.${encodeURIComponent(storyId)}` : `slug=eq.${encodeURIComponent(param)}`}&published=eq.true&deleted_at=is.null&limit=1`
  );
  return rows && rows.length > 0 && isPublicScheduled(rows[0]) ? rows[0] : null;
}

interface ParsedQuestion {
  stem: string;
  options: string[];
  correctText: string;
  explanation: string;
}

function parseQuestion(q: unknown): ParsedQuestion | null {
  if (!q || typeof q !== "object") return null;
  const obj = q as Record<string, unknown>;

  const rawStem =
    (typeof obj.question === "string" ? obj.question : "") ||
    (typeof obj.stem === "string" ? obj.stem : "") ||
    (typeof obj.text === "string" ? obj.text : "") ||
    (typeof obj.q === "string" ? obj.q : "");
  const stem = cleanQuestionStem(rawStem);
  if (!stem) return null;

  const rawExplanation =
    typeof obj.explanation === "string" ? obj.explanation.trim() : "";
  const explanationPrefix = rawExplanation.slice(0, 30).toLowerCase();

  const options: string[] = [];
  if (Array.isArray(obj.options)) {
    for (const o of obj.options) {
      let raw = "";
      if (typeof o === "string") raw = o;
      else if (o && typeof o === "object") {
        const oo = o as Record<string, unknown>;
        raw =
          (typeof oo.text === "string" ? oo.text : "") ||
          (typeof oo.label === "string" ? oo.label : "");
      }
      if (!raw) continue;
      if (explanationPrefix && raw.trim().toLowerCase().startsWith(explanationPrefix)) continue;
      const cleaned = cleanOption(raw);
      if (!cleaned || cleaned.length < 3) continue;
      options.push(cleaned);
    }
  }

  const correctIdx =
    typeof obj.correct_answer === "number"
      ? obj.correct_answer
      : typeof obj.correct === "number"
      ? obj.correct
      : typeof obj.correctIndex === "number"
      ? obj.correctIndex
      : typeof obj.answer === "number"
      ? obj.answer
      : -1;

  const correctText =
    typeof obj.correctAnswer === "string"
      ? cleanOption(obj.correctAnswer)
      : correctIdx >= 0 && options[correctIdx]
      ? options[correctIdx]
      : options[0] || "";

  const explanation =
    typeof obj.explanation === "string"
      ? cleanForMetaSnippet(obj.explanation)
      : "";

  return { stem, options, correctText, explanation };
}

function getCardFront(c: unknown): string {
  if (!c || typeof c !== "object") return "";
  const obj = c as Record<string, unknown>;
  const raw =
    (typeof obj.front === "string" ? obj.front : "") ||
    (typeof obj.question === "string" ? obj.question : "") ||
    (typeof obj.term === "string" ? obj.term : "") ||
    (typeof obj.q === "string" ? obj.q : "");
  return cleanForMetaSnippet(raw);
}

function getCardBack(c: unknown): string {
  if (!c || typeof c !== "object") return "";
  const obj = c as Record<string, unknown>;
  const raw =
    (typeof obj.back === "string" ? obj.back : "") ||
    (typeof obj.answer === "string" ? obj.answer : "") ||
    (typeof obj.definition === "string" ? obj.definition : "") ||
    (typeof obj.a === "string" ? obj.a : "");
  return cleanForMetaSnippet(raw);
}

const NOINDEX_PATH_PREFIXES = [
  "/admin", "/login", "/account", "/auth/", "/my-revision",
  "/revision-planner", "/source-library", "/submit-story", "/search", "/zone/",
];

function isNoindexPath(path: string): boolean {
  const clean = (path || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (NOINDEX_PATH_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(prefix))) return true;
  const parts = clean.split("/").filter(Boolean);
  // Clinical simulator sessions are interactive learning tools, not stable public articles.
  // Keep individual case-runner URLs out of the index while leaving /clinical discoverable.
  if (parts[0] === "clinical" && parts[1] === "case") return true;
  if (parts[0] === "exams" && parts.length >= 3 && parts[2] === "start") return true;
  if (parts[0] === "contests" && parts.length >= 2 && ["register", "lobby", "progress", "certificate"].includes(parts[1])) return true;
  if (parts[0] === "contests" && parts.length >= 3 && parts[2] === "round") return true;
  return false;
}

function buildHtml(opts: {
  title: string;
  description: string;
  url: string;
  ogImage: string;
  ogImageType?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  keywords?: string;
  type?: string;
  schemaJson?: string;
  bodyExtra?: string;
}) {
  const title = htmlEscape(opts.title);
  const desc = htmlEscape(opts.description);
  const url = htmlEscape(opts.url);
  const img = htmlEscape(opts.ogImage);
  const keywords = opts.keywords ? htmlEscape(opts.keywords) : "";
  const type = opts.type || "website";
  // buildHtml receives absolute canonical URLs; extract the pathname before testing noindex rules.
  // Otherwise /search and other utility routes can miss the HTML robots meta tag even when
  // their response header is correctly marked noindex.
  let robotsPath = opts.url;
  try { robotsPath = new URL(opts.url, "https://www.ompathstudy.com").pathname; } catch { /* retain the supplied path */ }

  const bodyExtra = opts.bodyExtra ? opts.bodyExtra.slice(0, 900000) : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${desc}" />
    ${isNoindexPath(robotsPath) ? '<meta name="robots" content="noindex,follow" />' : ""}
    ${keywords ? `<meta name="keywords" content="${keywords}" />` : ""}
    <link rel="canonical" href="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:secure_url" content="${img}" />
    ${opts.ogImageType ? `<meta property="og:image:type" content="${htmlEscape(opts.ogImageType)}" />` : ""}
    ${(opts.ogImageWidth && opts.ogImageHeight) ? `<meta property="og:image:width" content="${opts.ogImageWidth}" /><meta property="og:image:height" content="${opts.ogImageHeight}" />` : (opts.ogImage.includes("/api/note-card?") ? '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />' : "")}
    <meta property="og:image:alt" content="${title}" />
    <meta property="og:site_name" content="${opts.url.startsWith("https://stories.ompathstudy.com") ? "Stories" : "OmpathStudy"}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${img}" />
    ${opts.schemaJson ? `<script type="application/ld+json">${opts.schemaJson}</script>` : ""}
  </head>
  <body>
    <h1>${title}</h1>
    <p>${desc}</p>
    ${bodyExtra}
    <nav aria-label="Site links"><a href="/">Home</a> <a href="/blog">Study notes</a> <a href="/mcqs">MCQs</a> <a href="/flashcards">Flashcards</a> <a href="/exams">Exams</a> <a href="/stories">Stories</a></nav>
    <a href="${url}">View on OmpathStudy</a>
  </body>
</html>`;
}

const FALLBACK_CONTEST = (slug: string) => ({ slug, title: "Inter-University Medical Contest", subtitle: "Medical students from universities across Kenya compete on one board. Briefing, rules and dates are published here.", share_image_url: null as string | null, starts_at: null as string | null, ends_at: null as string | null, subjects: [] as string[], eligible_years: [] as number[], competition_format: "" });

function permanentRedirect(path: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      location: `https://www.ompathstudy.com${path}`,
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

const ZONE_GAMES: Record<string, string> = { quiz: "Quiz", lightning: "Lightning Round", flash: "Flashcard Race", pairs: "Match the meaning", hangman: "Hangman", scramble: "Word Scramble", odd: "Odd One Out", sequence: "Sequence Sort", image: "Image Spot", case: "Case Showdown", drug: "Drug Duel", nameit: "Who am I?", mixed: "Mixed Bag" };

/** A Friend Zone room link: "Davis invites you to play Thyroid", with a game card and the room code. Crawlers only; people get the app. */
async function zoneInviteHtml(path: string, who = ""): Promise<string> {
  const code = (path.split("?")[0].split("/").filter(Boolean)[1] || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
  let room: { host?: string; title?: string; game?: string; mode?: string; n?: number; players?: number; perQ?: number; live?: boolean; status?: string } | null = null;
  try {
    const { data, error } = await neon.rpc("zone_peek", { p_code: code });
    if (!error && data) room = (Array.isArray(data) ? data[0] : data) as typeof room;
  } catch { /* fall back to a general invitation */ }
  // a shared result (?n=Name): the card says what that player did, read from the finished game, never from the link
  if (who) {
    try {
      const { data, error } = await neon.rpc("zone_peek_player", { p_code: code, p_nick: who });
      const pl = !error && data ? (Array.isArray(data) ? data[0] : data) as { nick: string; title: string; score: number; rank: number; players: number; correct: number; answered: number } | null : null;
      if (pl) {
        const won = pl.rank === 1 && pl.players > 1;
        const q = new URLSearchParams({ won: "1", name: pl.nick, title: pl.title, score: String(pl.score), rank: String(pl.rank), of: String(pl.players), acc: pl.answered ? pl.correct + "/" + pl.answered : "", kind: "Friend Zone" });
        return buildHtml({
          title: won ? pl.nick + " won " + pl.title + " on Friend Zone" : pl.nick + " scored " + pl.score + " in " + pl.title + " on Friend Zone",
          description: (won ? pl.nick + " won with " : pl.nick + " scored ") + pl.score + " points (" + pl.correct + " of " + pl.answered + " correct). Think you can beat that? Play on Ompath Study.",
          url: "https://www.ompathstudy.com/zone/" + code,
          ogImage: "https://www.ompathstudy.com/api/note-card?" + q.toString(),
        });
      }
    } catch { /* fall back to the invitation */ }
  }
  const host = room?.host || "A friend";
  const title = room?.title || "a study game";
  const game = ZONE_GAMES[room?.game || "quiz"] || "Quiz";
  const facts = [game, room?.n ? `${room.n} questions` : "", room?.live ? "Play together" : room?.mode === "marathon" ? "Marathon" : "", room?.perQ && room.mode !== "marathon" ? `${room.perQ}s each` : ""].filter(Boolean);
  const p = new URLSearchParams({ title, host, code, facts: facts.join("|"), kind: "Friend Zone" });
  return buildHtml({
    title: `${host} invites you to play ${title} | Friend Zone`,
    description: `${game}${room?.n ? `, ${room.n} questions` : ""}. Tap the link, enter a name and play against ${host} on Ompath Study. Room code ${code}.`,
    url: `https://www.ompathstudy.com/zone/${code}`,
    ogImage: `https://www.ompathstudy.com/api/note-card?${p.toString()}`,
  });
}

export default async function handler(req: Request): Promise<Response> {
  const ua = req.headers.get("user-agent");
  const url = new URL(req.url);
  const originalPath = url.searchParams.get("path") || "/";
  // Canonicalise trailing-slash variants for crawler requests before rendering metadata.
  // Query parameters are deliberately preserved for app behaviour and excluded from canonical URLs.
  const requestedPath = originalPath.split("?")[0];
  const normalizedPath = requestedPath.length > 1 ? requestedPath.replace(/\/+$/, "") : "/";
  const requestHost = String(req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (requestHost !== "stories.ompathstudy.com" && (normalizedPath === "/stories" || normalizedPath.startsWith("/stories/") || normalizedPath === "/share-your-story" || normalizedPath.startsWith("/share-your-story/") || normalizedPath === "/finalists")) {
    return Response.redirect(new URL(originalPath, "https://stories.ompathstudy.com").toString(), 301);
  }
  if (isCrawler(ua) && requestedPath !== normalizedPath) {
    return permanentRedirect(normalizedPath);
  }
  if (/^\/zone\/[A-Za-z0-9-]+\/?$/.test(originalPath.split("?")[0])) {
    if (!isCrawler(ua)) return Response.redirect(new URL(originalPath, url.origin).toString(), 307);
    return new Response(await zoneInviteHtml(originalPath, (url.searchParams.get("n") || "").slice(0, 24)), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, follow", "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120" } });
  }
  if (isNoindexPath(originalPath)) {
    // Real visitors must get the SPA shell (the stub below has no app bundle),
    // still marked noindex. Only crawlers receive the stub.
    if (!isCrawler(ua)) {
      try {
        const shell = await fetch(new URL("/index.html", url.origin).toString());
        if (shell.ok) {
          return new Response(await shell.text(), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, follow", "cache-control": "public, max-age=0, must-revalidate" } });
        }
      } catch { /* fall through to the stub */ }
    }
    const noindexHtml = buildHtml({ title: "OmpathStudy", description: "OmpathStudy medical education resource.", url: `https://www.ompathstudy.com${originalPath.split("?")[0]}`, ogImage: OG_FALLBACK_IMAGE });
    return new Response(noindexHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, follow", "cache-control": "public, max-age=300, stale-while-revalidate=60" } });
  }

  if (!isCrawler(ua)) {
    // Legacy UUID / UUID-prefixed detail URLs must collapse to the single
    // canonical slug path for EVERY client, not just crawlers. A client-side
    // replaceState in the SPA is invisible to Google, so those URLs used to
    // stay in the index as duplicates.
    const legacyParts = originalPath.split("?")[0].split("/").filter(Boolean);
    const legacySection = legacyParts[0] || "";
    const legacyParam = legacyParts[1] || "";
    const legacyFallback =
      legacySection === "mcqs" ? "quiz" :
      legacySection === "flashcards" ? "flashcards" :
      legacySection === "essays" ? "essay" : "article";
    const normalizedLegacyParam = cleanPublicSlug(legacyParam, "", legacyFallback);
    const isLegacyDetailVariant =
      ["blog", "mcqs", "flashcards", "essays"].includes(legacySection) &&
      (
        !!extractUuidFromParam(legacyParam) ||
        normalizedLegacyParam !== legacyParam.toLowerCase()
      );
    if (isLegacyDetailVariant) {
      const target = await resolveCanonicalDetailPath(legacySection, legacyParam);
      if (target && target !== `/${legacySection}/${legacyParam}`) {
        return permanentRedirect(target);
      }
      // Never fall through to the 307 below for a legacy UUID URL — that
      // would bounce back into this same handler and loop.
      return permanentRedirect(`/${legacySection}`);
    }
    return Response.redirect(new URL(originalPath, url.origin).toString(), 307);
  }

  try {
    const requestHost = String(req.headers.get("host") || "").split(":")[0].toLowerCase();
    const isStoriesHost = requestHost === "stories.ompathstudy.com";
    const origin = isStoriesHost ? "https://stories.ompathstudy.com" : "https://www.ompathstudy.com";
    const absoluteUrl = `${origin}${originalPath.split("?")[0]}`;
    const parts = originalPath.split("?")[0].split("/").filter(Boolean);
    const section = parts[0] || "";
    const param = parts[1] || "";
    const questionNumber = parts[2] === "question" ? Number(parts[3]) : null;

    let title = "OmpathStudy | Medical Notes, MCQs & Exams";
    let description =
      "OmpathStudy helps medical and health students study smarter with notes, flashcards, MCQs and exams by year and unit.";
    let ogImage = OG_FALLBACK_IMAGE;
    let ogImageType = "";
    let ogImageWidth = 0;
    let ogImageHeight = 0;
    let keywords =
      "OmpathStudy, medical students Kenya, nursing students Kenya, clinical notes, MCQs, flashcards, exam preparation, medical education Kenya";
    let type = "website";
    let schemaJson = "";
    let bodyExtra = "";

    if (STATIC_PAGE_META[originalPath.split("?")[0]] || (isStoriesHost && ["/", "/stories"].includes(originalPath.split("?")[0]))) {
      const pathKey = originalPath.split("?")[0];
      const page = isStoriesHost && ["/", "/stories"].includes(pathKey) ? {
        title: "Stories | Read and Publish Original Stories",
        description: "Personal experiences, ideas, knowledge and reflections from writers around the world. Read, discover and publish stories on every subject.",
        image: "",
        links: ["/stories", "/share-your-story"],
      } : STATIC_PAGE_META[pathKey];
      title = page.title;
      description = page.description;
      if (page.image) ogImage = page.image;
      keywords = `OmpathStudy, medical notes Kenya, MCQs, flashcards, exams, MBChB revision`;
      type = "website";
      schemaJson = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: absoluteUrl, isPartOf: { "@type": "WebSite", name: isStoriesHost ? "Stories" : "OmpathStudy", url: origin }, publisher: { "@type": "Organization", name: isStoriesHost ? "Stories" : "OmpathStudy", url: origin } });
      bodyExtra = `<section><h2>Study resources</h2><p>OmpathStudy provides structured medical learning resources for MBChB and health students worldwide. The public study library includes concise clinical notes, pathology guides, pharmacology revision, anatomy summaries, physiology explanations, microbiology material, active-recall flashcards, practice MCQs and timed exam-style revision. Content is organised by academic year and unit so students can move directly from a year hub to the relevant articles, question banks, flashcards and exam practice.</p><p>Use these links to navigate to live indexable pages without redirects.</p><nav aria-label="Core pages">${page.links.map((path) => `<a href="${path}">${path === "/" ? "Home" : path.replace(/^\//, "")}</a>`).join(" ")}</nav></section>`;
    } else if (!param && ["blog", "mcqs", "flashcards", "stories", "exams"].includes(section)) {
      const pages: Record<string, { title: string; description: string; keywords: string }> = {
        blog: {
          title: "Medical Study Notes | Ompath Study",
          description: "Browse free medical study notes in pathology, pharmacology, anatomy, physiology, microbiology and biochemistry for students worldwide.",
          keywords: "OmpathStudy, medical notes Kenya, MBChB notes, pathology notes, pharmacology notes, anatomy notes",
        },
        mcqs: {
          title: "Medical MCQs with Answers | Ompath Study",
          description: "Practice medical MCQs with answers and explanations by year and unit. Built for medical students worldwide.",
          keywords: "OmpathStudy, MCQs Kenya, medical quizzes, MBChB questions, exam practice",
        },
        flashcards: {
          title: "Medical Flashcards | Ompath Study",
          description: "Study active-recall medical flashcards by year and unit for fast exam revision across pathology, pharmacology, anatomy and more.",
          keywords: "OmpathStudy, flashcards Kenya, medical flashcards, active recall, exam revision",
        },
        stories: {
          title: "Stories | Read and Publish Original Stories",
          description: "Read personal experiences, ideas, knowledge and reflections from writers around the world. Publish your own story.",
          keywords: "Stories, personal stories, articles, experiences, ideas, community writing",
        },
        exams: {
          title: "Timed Medical Exams | Ompath Study",
          description: "Take timed medical exams and past-paper style MCQ practice for MBChB revision by year and unit.",
          keywords: "OmpathStudy, medical exams Kenya, timed exams, MBChB past papers, exam practice",
        },
      };
      title = pages[section].title;
      description = pages[section].description;
      keywords = pages[section].keywords;
      bodyExtra = await buildLiveIndexLinks(section);
      schemaJson = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: absoluteUrl, isPartOf: { "@type": "WebSite", name: "OmpathStudy", url: origin }, publisher: { "@type": "Organization", name: "OmpathStudy", url: origin } });
    } else if (section === "contests" && param && ["briefing", "leaderboard", "register"].includes(parts[2])) {
      const rows = await sbFetch("contests", `select=slug,title,subtitle,share_image_url,starts_at,ends_at,subjects,eligible_years,competition_format&slug=eq.${encodeURIComponent(param)}&published=eq.true&limit=1`).catch(() => []);
      const contest = rows?.[0] ?? FALLBACK_CONTEST(param);
      title = `${contest.title} | ${parts[2] === "leaderboard" ? "Leaderboard" : parts[2] === "register" ? "Register" : "Contest Briefing"} | OmpathStudy`;
      description = toMetaDescription(contest.subtitle || "Read the published OmpathStudy medical knowledge contest briefing.", "Read the published OmpathStudy medical knowledge contest briefing for medical students worldwide.");
      ogImage = contest.share_image_url || cardUrl(contest.title, "", "Contest");
      keywords = `OmpathStudy, medical contest Kenya, ${contest.title}, contest briefing, medical students Kenya`;
      type = "article";
      bodyExtra = `<section><h2>Contest briefing</h2><p>${htmlEscape(contest.subtitle || "Published contest briefing.")}</p><p><strong>Subjects:</strong> ${htmlEscape(Array.isArray(contest.subjects) ? contest.subjects.join(", ") : "")}</p><p><strong>Eligible years:</strong> ${htmlEscape(Array.isArray(contest.eligible_years) ? contest.eligible_years.map((y: unknown) => `Year ${y}`).join(", ") : "")}</p><p><strong>Format:</strong> ${htmlEscape(String(contest.competition_format || ""))}</p></section>`;
      schemaJson = JSON.stringify({ "@context": "https://schema.org", "@type": "Event", name: contest.title, description, url: absoluteUrl, startDate: contest.starts_at, endDate: contest.ends_at, organizer: { "@type": "Organization", name: "OmpathStudy" } });
    } else if (section === "contests" && param) {
      const rows = await sbFetch("contests", `select=slug,title,subtitle,share_image_url,starts_at&slug=eq.${encodeURIComponent(param)}&published=eq.true&limit=1`).catch(() => []);
      const contest = rows?.[0] ?? FALLBACK_CONTEST(param);
      title = `${contest.title} | OmpathStudy`;
      description = toMetaDescription(contest.subtitle || "Register for this live medical knowledge contest.", "Register for this OmpathStudy live medical knowledge contest.");
      ogImage = contest.share_image_url || cardUrl(contest.title, "", "Contest");
      keywords = `OmpathStudy, medical contest Kenya, ${contest.title}, live exam competition`;
      type = "website";
    } else if (section === "topic" && param) {
      const topicSlug = decodeURIComponent(param).trim().toLowerCase();
      let topicData: Record<string, any> | null = null;
      // TopicPage reads these generated JSON files directly. Crawler metadata
      // must use the same source; checking only topic_pages in Supabase wrongly
      // noindexed many valid generated topic pages.
      const topicRes = await fetch(`${origin}/topics/${encodeURIComponent(topicSlug)}.json`, {
        headers: { accept: "application/json" },
      });
      if (topicRes.ok) {
        const candidate = await topicRes.json() as Record<string, any>;
        if (candidate?.s === topicSlug && candidate?.n) topicData = candidate;
      } else if (topicRes.status !== 404) {
        // A temporary asset/CDN failure is not proof that the topic is missing.
        // Let the outer handler return a retryable 503 rather than accidental noindex.
        throw new Error(`Topic metadata source unavailable: HTTP ${topicRes.status}`);
      }

      let row: Record<string, any> | null = null;
      if (!topicData) {
        const rows = await sbFetch(
          "topic_pages",
          `select=slug,name,category,content&slug=eq.${encodeURIComponent(topicSlug)}&status=eq.published&limit=1`
        ).catch(() => []);
        row = rows?.[0] ?? null;
      }

      if (topicData || row) {
        const name = String(topicData?.n || row?.name || "Medical topic");
        const category = String(topicData?.c || row?.category || "Medicine");
        const content = topicData?.ai || row?.content || {};
        const summary = String(content.summary || topicData?.lead?.t || `Study notes and clinical revision on ${name}.`);
        title = topicTitle(name, category);
        description = toMetaDescription(summary, `Medical study notes, key concepts and practice questions on ${name}.`);
        ogImage = cardUrl(name, category, "Topic", summary);
        keywords = `${name}, ${category}, medical students, Ompath Study, clinical study notes, revision questions`;
        type = "article";
        schemaJson = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "MedicalWebPage",
          name: title,
          url: absoluteUrl,
          description,
          image: ogImage,
          about: { "@type": "Thing", name },
          isPartOf: { "@type": "WebSite", name: "Ompath Study", url: origin },
        });

        const sections = Array.isArray(content.sections) && content.sections.length
          ? content.sections
          : (Array.isArray(topicData?.sec) ? topicData.sec : []);
        const sectionHtml = sections.slice(0, 14).map((x: { h?: string; p?: string; b?: string[]; t?: { a?: string; b?: string }[] }) =>
          `<section><h2>${htmlEscape(x.h || "")}</h2>${x.p ? `<p>${htmlEscape(x.p)}</p>` : ""}${Array.isArray(x.b) && x.b.length ? `<ul>${x.b.slice(0, 10).map((t) => `<li>${htmlEscape(t)}</li>`).join("")}</ul>` : ""}${Array.isArray(x.t) && x.t.length ? `<dl>${x.t.slice(0, 12).map((t) => `<div><dt><strong>${htmlEscape(t.a || "")}</strong></dt><dd>${htmlEscape(t.b || "")}</dd></div>`).join("")}</dl>` : ""}</section>`
        ).join("");
        const sources = Array.isArray(topicData?.src) ? topicData.src.filter((x: { u?: string }) => String(x.u || "").startsWith("/")).slice(0, 8) : [];
        const sourceHtml = sources.length
          ? `<section><h2>Related study resources</h2><ul>${sources.map((x: { u?: string; t?: string }) => `<li><a href="${htmlEscape(x.u || "#")}">${htmlEscape(x.t || "Related study notes")}</a></li>`).join("")}</ul></section>`
          : "";
        const fallbackSections = !sectionHtml && Array.isArray(topicData?.snip)
          ? `<ul>${topicData.snip.slice(0, 8).map((x: { t?: string }) => `<li>${htmlEscape(x.t || "")}</li>`).join("")}</ul>`
          : "";
        bodyExtra = `<article><h1>${htmlEscape(name)}</h1><p>${htmlEscape(summary)}</p>${sectionHtml || fallbackSections}${sourceHtml}</article>`;
      } else {
        // Only genuinely missing topic pages are excluded; generated public JSON
        // pages are recognised above even when they are not in topic_pages.
        return new Response(buildHtml({ title: "Topic | OmpathStudy", description: "This topic page has no written overview yet.", url: absoluteUrl, ogImage: OG_FALLBACK_IMAGE }).replace("</title>", '</title><meta name="robots" content="noindex,follow" />'), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, follow", "cache-control": "public, max-age=300, stale-while-revalidate=60" } });
      }
    } else if (section === "blog" && param) {
      const article = await fetchArticleBySlug(param);
      if (!article) {
        return redirectOrGone(await verifiedLegacyRedirect(`/blog/${param}`, "articles", param, "/blog", "article"), "/blog", `/blog/${param}`);
      }
      // The requested param may be a stale/UUID/near-match variant of this
      // article's slug. Always 301 to the article's own true canonical path
      // instead of declaring the requested URL canonical — otherwise every
      // variant self-canonicalizes and Google has to guess which one is real.
      const canonicalBlogPath = `/blog/${cleanPublicSlug(article.slug, article.title, "article")}`;
      if (canonicalBlogPath !== `/blog/${param}`) {
        return permanentRedirect(canonicalBlogPath);
      }
      const cleanDesc = articleDescription(article);

      title = articleMetaTitle(article);
      description = cleanDesc;
      // always the branded card (it carries "OMPATH STUDY"); the page's own picture goes on it when it is a good one, never a scanned page
      ogImage = cardUrl(article.title, article.category, "Notes", "", goodShareImage(article.title, article.og_image_url, (String(article.content || "").match(/!\[[^\]]*\]\(([^)\s]+)/) || [])[1]));
      keywords = `OmpathStudy, study notes Kenya, medical notes, ${article.title || ""}, ${article.category || ""}, clinical revision, exam prep, ${GEO_KEYWORDS}`;
      type = "article";
      schemaJson = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        image: ogImage,
        url: absoluteUrl,
        datePublished: article.created_at,
        dateModified: article.updated_at || article.created_at,
        author: { "@type": "Organization", name: "OmpathStudy" },
        publisher: { "@type": "Organization", name: "OmpathStudy", logo: { "@type": "ImageObject", url: OG_FALLBACK_IMAGE } },
      });
      if (article.content) {
        // the tidied text, when there is one, is what readers see: crawlers should see the same
        let shown = article.content;
        try { const r = await fetch(`${origin}/blog-fixes/${article.id}.md`); if (r.ok && !(r.headers.get("content-type") || "").includes("html")) { const t = await r.text(); if (t.length > 300) shown = t; } } catch { /* the stored text is used */ }
        bodyExtra = `<div>${htmlEscape(cleanForMetaSnippet(shown).slice(0, 5000))}</div>`;
      }

    } else if (section === "mcqs" && param) {
      const mcq = await fetchMcqSetBySlugOrId(param);
      if (!mcq) {
        return redirectOrGone(await verifiedLegacyRedirect(`/mcqs/${param}`, "mcq_sets", param, "/mcqs", "quiz"), "/mcqs", `/mcqs/${param}`);
      }
      const canonicalMcqPath = `/mcqs/${cleanPublicSlug(mcq.slug, mcq.title, "quiz")}`;
      if (canonicalMcqPath !== `/mcqs/${param}`) {
        return permanentRedirect(questionNumber ? `${canonicalMcqPath}/question/${questionNumber}` : canonicalMcqPath);
      }
      const rawQuestions: unknown[] = Array.isArray(mcq.questions) ? mcq.questions : [];
      const parsed = rawQuestions.map(parseQuestion).filter((p): p is ParsedQuestion => p !== null);
      const qCount = rawQuestions.length;

      const mcqTitleBase = cleanResourceBaseTitle(mcq.meta_title || mcq.title);
      title = resourceMetaTitle(mcqTitleBase, mcq.slug || param, mcq.category, "MCQs");
      description = toMetaDescription(
        mcq.meta_description || `Practice ${qCount > 0 ? qCount + " " : ""}MCQs on ${mcqTitleBase}. Review answers, explanations and exam-focused clinical concepts.`,
        `Practice ${qCount > 0 ? qCount + " " : ""}MCQs on ${mcqTitleBase}. Review answers, explanations and exam-focused clinical concepts.`
      );
      // an exam is shared with its own card ("Weekly Year 4: Internal Medicine Exam · 30 MCQs · timed"), so the picture itself invites people to try it
      ogImage = /^Weekly Exam/i.test(String(mcq.category || ""))
        ? cardUrl(`${String(mcq.title || "").replace(/\s*\(Section A:[^)]*\)\s*/i, "").replace(/^Weekly\s+/i, "")} · ${qCount || 30} MCQs`, String(mcq.category).replace(/^Weekly Exam:\s*/i, ""), "Exam")
        : mcq.og_image_url || cardUrl(mcq.title, mcq.category, "MCQs");
      keywords = `OmpathStudy, MCQs Kenya, ${mcqTitleBase || ""}, ${mcq.category || ""}, oncology MCQs, pathology MCQs, medical quizzes, exam practice, ${GEO_KEYWORDS}`;
      type = "article";

      const crawlAccess = await getMcqCrawlerAccess(String(mcq.id), String(mcq.slug || ""));
      const publicQuestions = crawlAccess.locked
        ? parsed.slice(0, Math.ceil(parsed.length * crawlAccess.ratio))
        : parsed;

      if (publicQuestions.length > 0) {
        const items = publicQuestions.map((p, i) => {
          const optionsList = p.options.length > 0
            ? `<ul>${p.options.map(o => `<li>${htmlEscape(o)}</li>`).join("")}</ul>`
            : "";
          const answerLine = p.correctText
            ? `<p><strong>Answer:</strong> ${htmlEscape(p.correctText)}</p>`
            : "";
          const explanationLine = p.explanation
            ? `<p><strong>Explanation:</strong> ${htmlEscape(p.explanation)}</p>`
            : "";
          return `<li id="question-${i + 1}">
<h2><a href="${canonicalMcqPath}/question/${i + 1}">Question ${i + 1}: ${htmlEscape(p.stem)}</a></h2>
${optionsList}
${answerLine}
${explanationLine}
</li>`;
        });
        const premiumIntro = crawlAccess.locked
          ? `<p>This is a premium OmpathStudy medical MCQ bank containing ${parsed.length} questions, with answer options, correct answers and explanations. Student access to the complete bank requires unlocking the package.</p>`
          : "";
        const questionContent = `${premiumIntro}<h2>Questions, Answers &amp; Explanations</h2>\n<ol>\n${items.join("\n")}\n</ol>`;
        bodyExtra = crawlAccess.locked
          ? `<section class="paywall">${questionContent}</section>`
          : questionContent;
      } else if (crawlAccess.locked) {
        bodyExtra = '<section class="paywall"><p>This premium question bank requires unlocking to access its questions, answers and explanations.</p></section>';
      }

      if (crawlAccess.locked && questionNumber === null) {
        schemaJson = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: title,
          description,
          url: absoluteUrl,
          isAccessibleForFree: false,
          hasPart: {
            "@type": "WebPageElement",
            isAccessibleForFree: false,
            cssSelector: ".paywall"
          },
          isPartOf: { "@type": "WebSite", name: "OmpathStudy", url: origin },
        });
      }

      if (questionNumber !== null) {
        if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > publicQuestions.length) {
          return new Response(
            "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>Question unavailable | OmpathStudy</title></head><body><h1>Question unavailable</h1><p>This question is not part of the public preview.</p></body></html>",
            { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
          );
        }
        const question = publicQuestions[questionNumber - 1];
        title = `${question.stem} | MCQ Answer & Explanation | OmpathStudy`;
        description = toMetaDescription(
          `${question.stem} Correct answer: ${question.correctText}. ${question.explanation}`,
          `Medical multiple-choice question with answer and explanation from ${mcqTitleBase} on OmpathStudy.`
        );
        const options = question.options.map((option, index) =>
          `<li><strong>${String.fromCharCode(65 + index)}.</strong> ${htmlEscape(option)}</li>`
        ).join("");
        const questionArticle = `<article><h1>${htmlEscape(question.stem)}</h1><h2>Options</h2><ol>${options}</ol><p><strong>Correct answer:</strong> ${htmlEscape(question.correctText)}</p>${question.explanation ? `<p><strong>Explanation:</strong> ${htmlEscape(question.explanation)}</p>` : ""}<p>Part of <a href="${canonicalMcqPath}">${htmlEscape(mcq.title)} — full MCQ question bank</a>.</p></article>`;
        bodyExtra = crawlAccess.locked
          ? `<section class="paywall">${questionArticle}</section>`
          : questionArticle;
        schemaJson = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: title,
          description,
          url: absoluteUrl,
          ...(crawlAccess.locked ? {
            isAccessibleForFree: false,
            hasPart: {
              "@type": "WebPageElement",
              isAccessibleForFree: false,
              cssSelector: ".paywall"
            }
          } : {}),
          about: { "@type": "Question", name: question.stem },
          isPartOf: { "@type": "WebPage", url: `${origin}${canonicalMcqPath}`, name: mcq.title },
        });
      }

      // Ordinary MCQs are deliberately not labelled as flashcards or QAPage.
      // Google only supports the Education Q&A carousel for genuine flashcards.

    } else if (section === "flashcards" && param) {
      const set = await fetchFlashcardSetBySlugOrId(param);
      if (!set) {
        return redirectOrGone(await verifiedLegacyRedirect(`/flashcards/${param}`, "flashcard_sets", param, "/flashcards", "flashcards"), "/flashcards", `/flashcards/${param}`);
      }
      const canonicalFlashcardPath = `/flashcards/${cleanPublicSlug(set.slug, set.title, "flashcards")}`;
      if (canonicalFlashcardPath !== `/flashcards/${param}`) {
        return permanentRedirect(canonicalFlashcardPath);
      }
      const cards: unknown[] = Array.isArray(set.cards) ? set.cards : [];
      const cardCount = cards.length;

      const flashcardTitleBase = cleanResourceBaseTitle(set.title);
      title = resourceMetaTitle(flashcardTitleBase, set.slug || param, set.category, "Flashcards");
      description = to160(
        `Study ${cardCount > 0 ? cardCount + " " : ""}flashcards on ${flashcardTitleBase} with OmpathStudy. Quick, focused revision for medical and health students, by unit and year.`
      );
      ogImage = cardUrl(flashcardTitleBase, set.category, "Flashcards");
      keywords = `OmpathStudy, flashcards Kenya, ${set.category || ""}, medical revision, nursing revision, exam prep, medical education Kenya`;
      type = "article";

      const cardItems = cards.map((c, i) => {
        const front = getCardFront(c);
        const back = getCardBack(c);
        if (!front) return "";
        const backLine = back ? `<p><strong>Answer:</strong> ${htmlEscape(back)}</p>` : "";
        return `<li><p><strong>Q${i + 1}.</strong> ${htmlEscape(front)}</p>${backLine}</li>`;
      }).filter(Boolean);

      if (cardItems.length > 0) {
        bodyExtra = `<h2>Flashcards</h2>\n<ol>\n${cardItems.join("\n")}\n</ol>`;
        // Google's "Education Q&A" markup: a quiz whose questions are the card fronts and whose answers are the card backs
        const qa = cards.slice(0, 30).map((c) => ({ front: getCardFront(c), back: getCardBack(c) })).filter((x) => x.front && x.back);
        if (qa.length) schemaJson = JSON.stringify({ "@context": "https://schema.org", "@type": "Quiz", name: title, description, url: absoluteUrl, about: { "@type": "Thing", name: title.replace(/\s*[|–-].*$/, "") }, educationalLevel: "University", provider: { "@type": "Organization", name: "OmpathStudy" }, hasPart: qa.map((x) => ({ "@type": "Question", eduQuestionType: "Flashcard", text: x.front, acceptedAnswer: { "@type": "Answer", text: x.back } })) });
      }

    } else if (section === "exams" && param) {
      const examId = param.replace(/\/start$/, "");
      const exam = await fetchMcqSetBySlugOrId(examId);
      if (exam) {
        const qCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
        title = `${exam.title} | Timed Exam | Ompath Study`;
        description = `Take a timed ${qCount}-question MCQ exam on ${exam.title} with OmpathStudy. Built for medical and health students worldwide.`;
        keywords = `OmpathStudy, timed exam Kenya, MCQ exam, ${exam.category || ""}, medical exams Kenya, exam preparation`;
        schemaJson = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Quiz",
          name: title,
          description,
          url: absoluteUrl,
          provider: { "@type": "Organization", name: "OmpathStudy" },
        });
        bodyExtra = `<p>Timed exam with ${qCount} MCQs. Unit: ${exam.category || "General"}. Free to take on Ompath Study.</p>`;
      }

    } else if (section === "essays" && param) {
      const essay = await fetchEssayBySlugOrId(param);
      if (!essay) return redirectOrGone(await verifiedLegacyRedirect(`/essays/${param}`, "essays", param, "/essays", "essay"), "/essays", `/essays/${param}`);
      const canonicalEssayPath = `/essays/${cleanPublicSlug(essay.slug, essay.title, "essay")}`;
      if (canonicalEssayPath !== `/essays/${param}`) return permanentRedirect(canonicalEssayPath);
      const saq = Array.isArray(essay.short_answer_questions) ? essay.short_answer_questions : [];
      const laq = Array.isArray(essay.long_answer_questions) ? essay.long_answer_questions : [];
      title = `${essay.title} | Essay Questions | Ompath Study`;
      description = to160(`Practice ${saq.length + laq.length} structured short- and long-answer medical questions on ${essay.title}. Review model answers for exam revision.`);
      keywords = `OmpathStudy, essay questions Kenya, SAQ, LAQ, ${essay.category || ""}, medical exams Kenya`;
      type = "article";
      const items = [...saq, ...laq].map((q: any, i: number) => q?.question ? `<li><strong>Q${i + 1}.</strong> ${htmlEscape(String(q.question))}${q.answer ? `<p><strong>Answer:</strong> ${htmlEscape(String(q.answer))}</p>` : ""}</li>` : "").filter(Boolean);
      bodyExtra = items.length ? `<h2>Essay Questions and Answers</h2><ol>${items.join("")}</ol>` : "";
      schemaJson = JSON.stringify({
        "@context": "https://schema.org", "@type": "LearningResource", name: title,
        description, url: absoluteUrl, datePublished: essay.created_at,
        dateModified: essay.updated_at || essay.created_at,
        learningResourceType: "Exam preparation", provider: { "@type": "Organization", name: "OmpathStudy" }
      });

    } else if (section === "stories" && param) {
      const story = await fetchStoryByParam(param);
      if (!story) {
        return new Response(
          "<html><body><h1>Page not found</h1><p>This story does not exist.</p></body></html>",
          { status: 404, headers: { "content-type": "text/html" } }
        );
      }
      const canonicalStoryPath = story.slug ? "/stories/" + story.slug : "/stories/" + story.id + "-" + (slugify(story.title) || "story");
      if (canonicalStoryPath !== "/stories/" + param) {
        return permanentRedirect(canonicalStoryPath);
      }
      const rawStory = String(story.content || "").replace(/^\s*<p><em>By [^<]*<\/em><\/p>/i, "");
      const plainStory = storyPlainText(rawStory);
      title = toMetaTitle(String(story.meta_title || ""), story.title + (isStoriesHost ? " | Stories" : " | Story | Ompath Study"));
      description = toMetaDescription(
        String(story.meta_description || plainStory),
        isStoriesHost ? "Read an original story on Stories, a publication for personal experiences, ideas and knowledge." : "Read a medical story on OmpathStudy — built for medical and health students to learn, reflect, and grow."
      );
      bodyExtra = "<article>" + storyBodyHtml(rawStory) + "</article>";
      const by = String(story.content || "").match(/^\s*<p><em>By\s+([^<]{1,80}?)\s*(?:·|&middot;|&#183;)\s*([^<]{1,20})<\/em><\/p>/i);
      const who = by && !/^a (?:medical student|community writer)$/i.test(by[1]) ? by[1].trim() : "";
      const lvl = /^Year\s*(\d)$/i.exec(by ? by[2].trim() : "");
      const photoTag = ((story as { tags?: string[] }).tags || []).find((t) => t.startsWith("photo:"));
      let photo = ""; try { photo = photoTag ? decodeURIComponent(photoTag.slice(6)) : ""; } catch { photo = ""; }
      // WhatsApp and other messaging crawlers are more reliable with the original
      // public story image than with a generated API URL. Prefer the actual cover.
      const own = publicStoryImage(story.cover_image_url, story.og_image_url, photo);
      if (own) {
        ogImage = own;
        ogImageType = /\.png$/i.test(new URL(own).pathname) ? "image/png" : "image/jpeg";
        const dimensions = new URL(own).pathname.match(/(?:^|[-_])(\\d{3,5})x(\\d{3,5})(?:[-_.])/i);
        if (dimensions) {
          ogImageWidth = Number(dimensions[1]);
          ogImageHeight = Number(dimensions[2]);
        }
      } else {
        ogImage = cardUrl(story.title, lvl ? "Year " + lvl[1] + ": " + (who || "Student story") : who || (by ? by[2].trim() : ""), "Student story", "", photo);
      }
      keywords = (isStoriesHost ? "Stories, articles, personal stories, " : "OmpathStudy, medical stories, reflective practice, ") + (story.category || "") + (isStoriesHost ? ", community writing" : ", medical students Kenya");
      type = "article";
      schemaJson = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        articleBody: plainStory.slice(0, 12000),
        image: ogImage,
        datePublished: story.created_at,
        author: { "@type": "Person", name: who || (isStoriesHost ? "Community writer" : "Medical student") },
        publisher: { "@type": "Organization", name: isStoriesHost ? "Stories" : "Ompath Study" },
        mainEntityOfPage: absoluteUrl,
      });
    } else if (section === "year" && param) {
      const yr = param.replace(/[^0-9]/g, "");
      title = `Year ${yr} Study Materials | Ompath Study`;
      description = `Browse Year ${yr} medical study notes, flashcards, MCQs, and exams on Ompath Study.`;
      keywords = `OmpathStudy, Year ${yr} medical, Kenya medical students, clinical notes Year ${yr}`;
      bodyExtra = `<section><h2>Year ${yr} resources</h2><p>Year ${yr} on OmpathStudy brings together medical notes, MCQs, flashcards and timed exam practice for students revising by academic year and unit. The page links directly to study notes, practice questions, active-recall cards and exams so crawlers and students can discover the relevant live sections without passing through redirects.</p><nav aria-label="Year ${yr} sections"><a href="/blog?year=Year%20${yr}">Year ${yr} notes</a> <a href="/mcqs?year=Year%20${yr}">Year ${yr} MCQs</a> <a href="/flashcards?year=Year%20${yr}">Year ${yr} flashcards</a> <a href="/exams?year=Year%20${yr}">Year ${yr} exams</a></nav></section>${await buildLiveIndexLinks("year", yr)}`;
    }

    // a page with no picture of its own gets a share card made for it (its name, its year and unit, and a picture of the subject), never the homepage image
    if (/\/og-default\.(png|jpg)$/.test(ogImage) && originalPath.split("?")[0] !== "/") {
      const qs = new URLSearchParams(originalPath.split("?")[1] || url.search);
      const yr = (qs.get("year") || "").match(/(\d)/)?.[1] || (parts[0] === "year" ? parts[1]?.match(/(\d)/)?.[1] : "") || (parts[0] === "year" ? originalPath.match(/year\/(\d)/)?.[1] : "") || "";
      const unit = qs.get("unit") || "";
      const subject = SUBJECT_PICS.find(([re]) => re.test(`${unit} ${qs.get("q") || ""} ${title}`))?.[1];
      const kinds: Record<string, string> = { year: "Year hub", papers: "Past papers", blog: "Study notes", mcqs: "MCQs", flashcards: "Flashcards", exams: "Exams", stories: "Student stories", clinical: "Clinical", "course-outlines": "Course outline", books: "Books", revision: "Revision", "revision-pack": "Revision pack", challenge: "Challenge" };
      const kind = kinds[section] || "Ompath Study";
      const base = title.replace(/\s*\|\s*Ompath ?Study.*$/i, "");
      const name = section === "year" && yr ? `Year ${yr}` : section === "papers" && yr ? `Year ${yr} past papers and CATs` : section === "blog" && yr ? `Year ${yr} study notes${unit ? `: ${unit.replace(/^Year\s*\d\s*:\s*/i, "")}` : ""}` : base || title.replace(/\s*\|\s*Ompath ?Study.*$/i, "");
      ogImage = cardUrl(name, yr ? `Year ${yr}${unit ? `: ${unit.replace(/^Year\s*\d\s*:\s*/i, "")}` : ""}` : "", kind, "", subject ? `https://www.ompathstudy.com/unit-img/${subject}.jpg` : "");
    }

    const html = buildHtml({
      title,
      description,
      url: absoluteUrl,
      ogImage,
      ogImageType,
      ogImageWidth,
      ogImageHeight,
      keywords,
      type,
      schemaJson,
      bodyExtra,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    // A temporary database/network failure is not evidence that a public page has moved.
    // Never issue a permanent redirect to a section hub here: Google can cache that 301
    // and replace a valid article's canonical URL with the hub. Return a retryable 503.
    console.error("og-meta temporary failure:", err instanceof Error ? err.message : String(err));
    return new Response(
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Temporarily unavailable | OmpathStudy</title></head><body><h1>Temporarily unavailable</h1><p>Please retry this page shortly.</p></body></html>",
      {
        status: 503,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "300",
        },
      },
    );
  }
}
