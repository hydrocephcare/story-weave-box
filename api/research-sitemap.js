const BASE = "https://www.ompathstudy.com";
const PATHS = [
  "/research",
  "/research/services",
  "/research/topics",
  "/research/resources",
  "/research/pricing",
  "/research/process",
  "/research/faq",
  "/research/request-support",
  "/research/academic-integrity",
  "/research/services/research-topic-consultation",
  "/research/services/proposal-review",
  "/research/services/methodology-support",
  "/research/services/questionnaire-development",
  "/research/services/data-analysis-support",
  "/research/services/spss-support",
  "/research/services/academic-editing",
  "/research/services/research-defence-preparation",
  "/research/guides/research-problem-statement",
  "/research/guides/research-objectives-questions-hypotheses",
  "/research/guides/quantitative-qualitative-mixed-methods",
  "/research/guides/cross-sectional-cohort-case-control-studies",
  "/research/guides/sampling-methods-and-sample-size",
  "/research/guides/research-ethics-informed-consent",
  "/research/guides/questionnaire-design-validity-reliability",
  "/research/guides/descriptive-statistics-and-data-analysis",
  "/research/guides/writing-results-and-discussion"
];

export default function handler(req, res) {
  const urls = PATHS.map((path) => {
    const priority = path === "/research" ? "0.9" : path.includes("/guides/") ? "0.7" : "0.6";
    const frequency = path === "/research" ? "weekly" : "monthly";
    return `  <url><loc>${BASE}${path}</loc><changefreq>${frequency}</changefreq><priority>${priority}</priority></url>`;
  }).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}
