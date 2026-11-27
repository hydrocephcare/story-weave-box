import { neon } from "@neondatabase/serverless";
// the simulator cases that ship with the site (the AI-written ones are read from the database below)
const BUILTIN_CASES = ["med-acs","med-aki","med-dka","med-gibleed","med-hf","med-malaria","med-mening","med-pe","med-stroke","med-tb","ob-aph","ob-ectopic","ob-labour","ob-pe","ob-pid","ob-pph","pd-asthma","pd-dehyd","pd-malaria","pd-neo","pd-pneu","pd-sam","pd-scd","ps-adhd","ps-delirium","ps-depr","ps-dts","ps-mania","ps-panic","ps-schiz","sg-appy","sg-breast","sg-burn","sg-foot","sg-obstruct","sg-trauma"];

const REMOVED_404 = [
  // Confirmed dead URLs and obsolete URLs without published content from GSC exports (15 Nov 2026).
  // Keep these stale addresses out of generated sitemaps until their content is restored
  // or a verified replacement URL is available.
  "/mcqs/37a7a71a-e03e-4ae7-b119-91b05fafcc50",
  "/mcqs/general-pathology",
  "/mcqs/medical-bacteriology-and-parasitology-end-year-20242025",
  "/flashcards/inhibitors-of-transcription-flashcards",
  "/essays/biliary-tract-disease-essay-questions",
  "/blog/9ef3c5cd-004e-4b7d-af80-899f384ec14a-pathology-mcqs-cell-injury-cell-death-and-adaptations",
  "/mcqs/mycology-mcqs-review-be10adc6",
  "/mcqs/microbiology-mcq-bank-fb9e1a91",
  "/mcqs/mcq-ba7772df",
  "/blog/year-4-internal-medicine-ecg-made-easy-1",
  "/blog/year-4-internal-medicine-acs-presentation",
  "/blog/year-4-paediatrics-paeds-4-kudra",
  "/blog/year-4-paediatrics-instructions",
  // Confirmed HTTP 410 legacy Year 1 resources; do not advertise dead pages in sitemaps.
  "/blog/year-1-anatomy-topnotch-thorax-anatomy-mcqs-saqs",
  "/blog/year-1-oral-biology-4-maxillary-premolars",
  "/blog/year-1-anatomy-abdomen-spot",
  "/blog/year-1-anatomy-histology-flashcards",
  "/blog/year-1-physiology-151021-lecture-1-cell",
  "/blog/year-1-anatomy-pat-2021",
  "/blog/year-1-anatomy-pat-14-with-ans-3",
  // Legacy weekly-exam slugs that no longer have a published essay record.
  "/essays/weekly-pathology-exam-april-3-2026-sections-b-and-c",
  "/essays/weekly-year-2-git-physiology-exam-april-10-2026-sections-b-and-c",
  "/essays/weekly-year-2-git-physiology-exam-april-17-2026-sections-b-and-c",
];

const REDIRECTED = ["/blog/amebiasis-pathogenic-free-living-amebae-guide","/blog/entamoeba-histolytica-amoebiasis","/blog/liver-tumors-benign-and-malignant-overview","/blog/lymphoma-overview-classification","/blog/liver-tumors-summary-notes","/blog/non-hodgkin-lymphoma","/blog/pleural-effusion-lights-criteria-y4","/blog/pneumothorax-clinical-management-y4","/blog/bronchial-asthma-internal-medicine-y4","/mcqs/medical-bacteriology-mcqs","/mcqs/fundamentals-of-tb-mcqs","/mcqs/chemical-pathology-mcqs","/mcqs/cardiovascular-pathology-mcqs","/mcqs/respiratory-pathology-mcqs","/mcqs/glomerular-diseases-mcqs","/mcqs/sickle-cell-anaemia-mcqs","/mcqs/infective-endocarditis-mcqs","/mcqs/biliary-tract-disease-mcqs","/mcqs/rheumatic-heart-disease-mcqs","/mcqs/paed-2021-mcqs","/mcqs/congenital-heart-disease-mcqs","/mcqs/gout-mcqs","/mcqs/pneumonia-mcqs","/mcqs/osteoarthritis-presentation-mcqs","/mcqs/fibromyalgia-presentation-mcqs","/mcqs/crystal-arthropathies-mcqs","/mcqs/sepsis-mcqs","/mcqs/hepatic-amoebiasis-mcqs","/mcqs/blood-transfusion-mcqs","/essays/congenital-heart-disease-essay-questions"];

async function extraSitemap(req, res, mode, env = {}) {
  const SITE = "https://www.ompathstudy.com";
  if (mode === "stories") {
    const STORY_SITE = "https://stories.ompathstudy.com";
    const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).send('<?xml version="1.0" encoding="UTF-8"?><error>Stories sitemap database is not configured</error>');
    }
    let rows;
    try {
      rows = await neon(databaseUrl)`SELECT id,title,slug,created_at,cover_image_url
        FROM public.stories
        WHERE published = true AND deleted_at IS NULL AND password_protected = false
          AND (scheduled_at IS NULL OR scheduled_at <= now())
        ORDER BY created_at DESC LIMIT 10000`;
    } catch (error) {
      console.error("[stories-sitemap] Neon lookup failed:", error instanceof Error ? error.message : String(error));
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).send('<?xml version="1.0" encoding="UTF-8"?><error>Stories sitemap temporarily unavailable</error>');
    }
    const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const slug = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/&/g," and ").replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
    const urls = [{loc:STORY_SITE+"/"},{loc:STORY_SITE+"/stories"},{loc:STORY_SITE+"/share-your-story"}];
    for (const row of rows) {
      const path = "/stories/" + (row.slug || (row.id + "-" + (slug(row.title) || "story")));
      urls.push({loc:STORY_SITE+path,lastmod:row.updated_at||row.created_at,image:row.cover_image_url||"",alt:row.title||""});
    }
    const body = urls.map(x => "<url><loc>"+esc(x.loc)+"</loc>"+(x.lastmod?"<lastmod>"+esc(new Date(x.lastmod).toISOString())+"</lastmod>":"")+(x.image?"<image:image><image:loc>"+esc(x.image)+"</image:loc><image:title>"+esc(x.alt)+"</image:title></image:image>":"")+"<changefreq>"+(x.lastmod?"monthly":"weekly")+"</changefreq><priority>"+(x.loc===STORY_SITE+"/"?"1.0":x.loc===STORY_SITE+"/stories"?"0.9":"0.7")+"</priority></url>").join("");
    res.setHeader("Content-Type","application/xml; charset=utf-8");
    res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=86400");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'+body+"</urlset>");
  }
  if (mode === "research") {
    const paths = ["/research","/research/services","/research/topics","/research/resources","/research/pricing","/research/process","/research/faq","/research/request-support","/research/academic-integrity","/research/universities","/research/universities/mku","/research/universities/university-of-nairobi","/research/universities/jkuat","/research/universities/kenyatta-university","/research/universities/moi-university","/research/universities/maseno-university","/research/universities/aga-khan-university","/research/universities/other-universities","/research/services/research-topic-consultation","/research/services/proposal-review","/research/services/methodology-support","/research/services/questionnaire-development","/research/services/data-analysis-support","/research/services/spss-support","/research/services/academic-editing","/research/services/research-defence-preparation","/research/guides/research-problem-statement","/research/guides/research-objectives-questions-hypotheses","/research/guides/quantitative-qualitative-mixed-methods","/research/guides/cross-sectional-cohort-case-control-studies","/research/guides/sampling-methods-and-sample-size","/research/guides/research-ethics-informed-consent","/research/guides/questionnaire-design-validity-reliability","/research/guides/descriptive-statistics-and-data-analysis","/research/guides/writing-results-and-discussion","/research/guides/sample-size-calculation-prevalence-studies","/research/guides/pico-framework-clinical-research-questions","/research/guides/literature-review-search-strategy","/research/guides/confounding-and-bias-clinical-research","/research/guides/odds-ratios-risk-ratios-confidence-intervals","/research/guides/chi-square-t-tests-logistic-regression","/research/guides/data-cleaning-spss","/research/guides/vancouver-referencing-medical-research","/research/guides/writing-research-abstract","/research/guides/research-defence-presentation-preparation"];
    const urls=paths.map(p=>`<url><loc>${SITE}${p}</loc><changefreq>${p==="/research"?"weekly":"monthly"}</changefreq><priority>${p==="/research"?"0.9":p.includes("/guides/")?"0.7":"0.6"}</priority></url>`).join("");
    res.setHeader("Content-Type","application/xml; charset=utf-8");
    res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  }
  if (mode === "topics") {
    const entries = [{ slug: null, updated_at: null }];
    let databaseReady = false;
    try {
      const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
      if (connectionString) {
        const db = neon(connectionString);
        const rows = await db`SELECT slug, updated_at FROM public.topic_pages
          WHERE status = 'published' AND ai_review_status = 'passed'
          ORDER BY updated_at DESC LIMIT 5000`;
        databaseReady = true;
        for (const row of rows) {
          if (typeof row.slug === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug)) entries.push(row);
        }
      }
    } catch (error) {
      // Keep the hub URL available if the database is temporarily unreachable.
      console.error("[topics-sitemap] Neon lookup failed:", error instanceof Error ? error.message : String(error));
    }
    const xmlEscape = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const urls = entries.map((entry) => {
      const loc = entry.slug ? `${SITE}/topic/${entry.slug}` : `${SITE}/topics`;
      const lastmod = entry.updated_at ? `<lastmod>${xmlEscape(new Date(entry.updated_at).toISOString().slice(0, 10))}</lastmod>` : "";
      return `<url><loc>${xmlEscape(loc)}</loc>${lastmod}<changefreq>${entry.slug ? "monthly" : "daily"}</changefreq><priority>${entry.slug ? "0.6" : "0.7"}</priority></url>`;
    }).join("");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    if (databaseReady) res.setHeader("X-Ompath-Topics-Sitemap", "neon-v1");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  }
  // The topics branch above lists Neon pages only after independent Gemini review; static pages remain in library-sitemap.xml.
  res.setHeader("Content-Type","application/xml; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=86400");
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + SITE + '/topics</loc><changefreq>daily</changefreq><priority>0.7</priority></url></urlset>');
}
export default async function handler(req, res, env = {}) {
  const mode = typeof req.query?.mode === "string" ? req.query.mode : "";
  if (mode === "research" || mode === "topics" || mode === "stories") return extraSitemap(req, res, mode, env);
  try {
    const file = typeof req.query?.file === "string" ? req.query.file : "all.xml";
    const sitemapUrl = new URL(`/api/generate-sitemap?file=${encodeURIComponent(file)}`, `https://${req.headers.host || "www.ompathstudy.com"}`);
    const upstream = await fetch(sitemapUrl, {
      method: "GET",
      headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
    });

    const rawXml = await upstream.text();
    const excluded = [
      "https://www.ompathstudy.com/sitemap.xml",
      "https://www.ompathstudy.com/sitemap-dynamic.xml",
      "https://www.ompathstudy.com/blog/victory-school-club-membership-system-project-guide",
      // addresses that answer with a redirect (old copies of a page): a sitemap must list only the final, indexable address
      ...REDIRECTED.map((p) => "https://www.ompathstudy.com" + p),
      // confirmed 404s from Search Console: do not advertise dead URLs in any sitemap
      ...REMOVED_404.map((p) => "https://www.ompathstudy.com" + p),
    ];
    let xml = excluded.reduce((body, loc) => {
      const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return body.replace(new RegExp(`\\s*<url>\\s*<loc>${escaped}<\\/loc>[\\s\\S]*?<\\/url>`, "g"), "");
    }, rawXml);

    // Story publishing now lives on stories.ompathstudy.com. Do not list the old OmpathStudy URLs here.
    // Research pages are served by their dedicated research-sitemap.xml only.
    // Do not repeat them in all.xml, which robots.txt also discovers independently.

    // All story landing and article URLs are listed in the Stories subdomain sitemap, not here.
    xml = xml.replace(/\s*<url>\s*<loc>https:\/\/www\.ompathstudy\.com\/(?:stories(?:\/[^<]*)?|share-your-story(?:\/[^<]*)?|finalists)<\/loc>[\s\S]*?<\/url>/g, "");
    // exams are taken at /exams/<slug>/start, a noindex page: the exam list (/exams) is the page for search, so single exams are not listed
    xml = xml.replace(/\s*<url>\s*<loc>https:\/\/www\.ompathstudy\.com\/exams\/[^<]+<\/loc>[\s\S]*?<\/url>/g, "");
    // Individual clinical simulator cases are interactive/noindex; keep only the public /clinical hub.
    xml = xml.replace(/\s*<url>\s*<loc>https:\/\/www\.ompathstudy\.com\/clinical\/case\/[^<]+<\/loc>[\s\S]*?<\/url>/g, "");
    // Interactive clinical case runners are deliberately noindex (see api/og-meta.ts).
    // Do not advertise them in the XML sitemap; the public /clinical hub remains discoverable.
    const isSectionFile = file !== "all.xml";

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    if (!upstream.ok || (!isSectionFile && !xml.includes("<url>"))) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Sitemap source unavailable</error>");
    }
    return res.status(200).send(xml);
  } catch {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Sitemap source unavailable</error>");
  }
}
