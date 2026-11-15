import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const meta = read("api/og-meta.ts");
const vercel = JSON.parse(read("vercel.json"));
const sitemap = read("api/sitemap.js");
const robots = read("public/robots.txt");
const essayPage = read("src/pages/EssayStudy.tsx");
const css = read("src/index.css");
const vercel = JSON.parse(read("vercel.json"));
const auditScript = read("scripts/seo/audit-production.mjs");
const libraryMeta = read("src/lib/libraryMeta.js");
const libraryPrerender = read("scripts/library/prerender.mjs");
const htmlTemplate = read("index.html");
const seoLib = read("src/lib/seo.ts");
const staticNotePage = read("src/pages/StaticNote.tsx");

const checks = [
  ["temporary crawler failures use retryable 503 responses", /status:\s*503/.test(meta) && /"retry-after":\s*"300"/.test(meta)],
  ["only allowlisted legacy URLs can use high-confidence redirects", meta.includes("LEGACY_REDIRECT_PATHS") && meta.includes("score >= 0.72") && meta.includes("2 * overlap") && meta.includes("verifiedLegacyRedirect")],
  ["temporary crawler failures do not permanently redirect to a section hub", !meta.includes("return permanentRedirect(safeSection)") && !meta.includes("const safeSection")],
  ["interactive clinical cases are excluded from the sitemap", sitemap.includes("clinical") && sitemap.includes("case")],
  ["exam start routes are excluded from the sitemap", sitemap.includes("exams") && sitemap.includes("start")],
  ["sitemap filters known removed URLs", sitemap.includes("REMOVED_404") && sitemap.includes("weekly-pathology-exam-april-3-2026-sections-b-and-c")],
  ["metadata API recognises both SEO audit user agents as crawlers", meta.includes('ua.includes("openseo-audit")') && meta.includes('ua.includes("ompathstudymonitor")')],
  ["topic crawlers use the rich static topic prerender instead of thin API metadata", !vercel.rewrites.some((r) => r.source === "/topic/:slug" && r.destination === "/api/og-meta?path=/topic/:slug")],
  ["story crawler metadata includes sanitised article body content", meta.includes("function storyPlainText") && meta.includes("function storyBodyHtml") && meta.includes("bodyExtra = \"<article>\" + storyBodyHtml(rawStory) + \"</article>\"") && meta.includes("articleBody: plainStory.slice(0, 12000)")],
  ["crawler metadata reads generated topic JSON pages", meta.includes("/topics/") && meta.includes("topicSlug") && meta.includes("topicRes.status !== 404")],
  ["essay crawler metadata combines duplicate slug records", meta.includes("source_count: rows.length") && meta.includes('mergeQuestions("short_answer_questions")')],
  ["browser essay lookup uses the same six-to-twelve character ID suffix rule", essayPage.includes("replace(/-[0-9a-f]{6,12}$/i")],
  ["shelf-rise keyframes use valid top-level CSS syntax", css.includes("@keyframes shelf-rise") && !css.includes(".paper-body@keyframes shelf-rise")],
  ["all crawler rewrites include the audit and production-monitor user agents", (() => {
    const rules = (vercel.rewrites || []).filter((r) => (r.has || []).some((h) => h.type === "header" && h.key.toLowerCase() === "user-agent"));
    return rules.length > 0 && rules.every((r) => {
      const ua = r.has.find((h) => h.type === "header" && h.key.toLowerCase() === "user-agent").value;
      return ua.includes("OpenSEO-Audit") && ua.includes("OmpathStudySEOMonitor");
    });
  })()],
  ["production SEO monitor uses the crawler-specific route and rejects generic page titles", auditScript.includes('const UA = "OpenSEO-Audit/1.0 OmpathStudySEOMonitor/1.0"') && auditScript.includes("generic app-shell title") && auditScript.includes("missing a primary H1 heading") && auditScript.includes("hidden from crawlers")],
  ["static note metadata is length-limited and the AUB page uses concise O&G metadata", seoLib.includes("buildStaticNoteMeta") && staticNotePage.includes("buildStaticNoteMeta(note)") && seoLib.includes("candidate.length <= 60") && seoLib.includes("plain.length > 160")],
  ["prerendered content is visible before JavaScript loads", htmlTemplate.includes(".prerendered{position:relative") && !htmlTemplate.includes("clip:rect(0 0 0 0)") && libraryPrerender.includes('<div id="root"><div class="prerendered">') && !libraryPrerender.includes('class="boot-loader" aria-hidden="true"></div><div class="prerendered"')],
  ["library metadata is capped at search snippet lengths", libraryMeta.includes("boundedTitle") && libraryMeta.includes("boundedDescription") && libraryMeta.includes("value.length <= 60") && libraryMeta.includes("text.length <= 160")],
  ["thin deep library folders are noindexed and omitted from the sitemap", libraryMeta.includes("chain.length <= 1 || totalFiles >= 3") && libraryPrerender.includes("noindex: !indexable") && libraryPrerender.includes("data.updated, indexable")],
  ["homepage is prerendered with substantive content for crawlers", libraryPrerender.includes('write("/", render({') && libraryPrerender.includes("Free medical notes, MCQs and exam resources for MBChB students") && libraryPrerender.includes("Practise and revise")],
  ["library pages expose selected descendant resources to crawlers", libraryPrerender.includes("Selected resources in this section") && libraryPrerender.includes("collectDescendants")],
  ["library metadata is capped at search snippet lengths", libraryMeta.includes("boundedTitle") && libraryMeta.includes("boundedDescription") && libraryMeta.includes("value.length <= 60") && libraryMeta.includes("text.length <= 160")],
  ["thin deep library folders are noindexed and omitted from the sitemap", libraryMeta.includes("chain.length <= 1 || totalFiles >= 3") && libraryPrerender.includes("noindex: !indexable") && libraryPrerender.includes("data.updated, indexable")],
  ["library pages expose selected descendant resources to crawlers", libraryPrerender.includes("Selected resources in this section") && libraryPrerender.includes("collectDescendants")],
  ["robots.txt publishes the primary sitemap", /Sitemap:\s*https:\/\/www\.ompathstudy\.com\/sitemap\.xml/i.test(robots)],
  ["robots.txt permits public crawling by default", /User-agent:\s*\*\s*\nAllow:\s*\//i.test(robots)],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
