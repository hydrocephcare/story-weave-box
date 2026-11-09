// the simulator cases that ship with the site (the AI-written ones are read from the database below)
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
const BUILTIN_CASES = ["med-acs","med-aki","med-dka","med-gibleed","med-hf","med-malaria","med-mening","med-pe","med-stroke","med-tb","ob-aph","ob-ectopic","ob-labour","ob-pe","ob-pid","ob-pph","pd-asthma","pd-dehyd","pd-malaria","pd-neo","pd-pneu","pd-sam","pd-scd","ps-adhd","ps-delirium","ps-depr","ps-dts","ps-mania","ps-panic","ps-schiz","sg-appy","sg-breast","sg-burn","sg-foot","sg-obstruct","sg-trauma"];

const REDIRECTED = ["/blog/amebiasis-pathogenic-free-living-amebae-guide","/blog/entamoeba-histolytica-amoebiasis","/blog/liver-tumors-benign-and-malignant-overview","/blog/lymphoma-overview-classification","/blog/liver-tumors-summary-notes","/blog/non-hodgkin-lymphoma","/blog/pleural-effusion-lights-criteria-y4","/blog/pneumothorax-clinical-management-y4","/blog/bronchial-asthma-internal-medicine-y4","/mcqs/medical-bacteriology-mcqs","/mcqs/chemical-pathology-mcqs","/mcqs/cardiovascular-pathology-mcqs","/mcqs/respiratory-pathology-mcqs","/mcqs/glomerular-diseases-mcqs","/mcqs/sickle-cell-anaemia-mcqs","/mcqs/infective-endocarditis-mcqs","/mcqs/biliary-tract-disease-mcqs","/mcqs/rheumatic-heart-disease-mcqs","/mcqs/paed-2021-mcqs","/mcqs/congenital-heart-disease-mcqs","/mcqs/gout-mcqs","/mcqs/pneumonia-mcqs","/mcqs/osteoarthritis-presentation-mcqs","/mcqs/fibromyalgia-presentation-mcqs","/mcqs/crystal-arthropathies-mcqs","/mcqs/sepsis-mcqs","/mcqs/hepatic-amoebiasis-mcqs","/mcqs/blood-transfusion-mcqs","/essays/congenital-heart-disease-essay-questions"];

async function extraSitemap(req, res, mode) {
  const SITE = "https://www.ompathstudy.com";
  if (mode === "research") {
    const paths = ["/research","/research/services","/research/topics","/research/resources","/research/pricing","/research/process","/research/faq","/research/request-support","/research/academic-integrity","/research/universities","/research/universities/mku","/research/universities/university-of-nairobi","/research/universities/jkuat","/research/universities/kenyatta-university","/research/universities/moi-university","/research/universities/maseno-university","/research/universities/aga-khan-university","/research/universities/other-universities","/research/services/research-topic-consultation","/research/services/proposal-review","/research/services/methodology-support","/research/services/questionnaire-development","/research/services/data-analysis-support","/research/services/spss-support","/research/services/academic-editing","/research/services/research-defence-preparation","/research/guides/research-problem-statement","/research/guides/research-objectives-questions-hypotheses","/research/guides/quantitative-qualitative-mixed-methods","/research/guides/cross-sectional-cohort-case-control-studies","/research/guides/sampling-methods-and-sample-size","/research/guides/research-ethics-informed-consent","/research/guides/questionnaire-design-validity-reliability","/research/guides/descriptive-statistics-and-data-analysis","/research/guides/writing-results-and-discussion","/research/guides/sample-size-calculation-prevalence-studies","/research/guides/pico-framework-clinical-research-questions","/research/guides/literature-review-search-strategy","/research/guides/confounding-and-bias-clinical-research","/research/guides/odds-ratios-risk-ratios-confidence-intervals","/research/guides/chi-square-t-tests-logistic-regression","/research/guides/data-cleaning-spss","/research/guides/vancouver-referencing-medical-research","/research/guides/writing-research-abstract","/research/guides/research-defence-presentation-preparation"];
    const urls=paths.map(p=>`<url><loc>${SITE}${p}</loc><changefreq>${p==="/research"?"weekly":"monthly"}</changefreq><priority>${p==="/research"?"0.9":p.includes("/guides/")?"0.7":"0.6"}</priority></url>`).join("");
    res.setHeader("Content-Type","application/xml; charset=utf-8");
    res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  }
  const DB="https://strfwaqvxvkhjbqrwmla.supabase.co";
  const KEY=process.env.SUPABASE_ANON_KEY||ANON;
  res.setHeader("Content-Type","application/xml; charset=utf-8");
  try {
    const [rr,ir]=await Promise.all([
      fetch(`${DB}/rest/v1/topic_pages?select=slug,updated_at&status=eq.published&order=updated_at.desc&limit=2000`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}}),
      fetch(`${SITE}/topics/index.json`)
    ]);
    const rows=rr.ok?await rr.json():[];
    const indexed=new Set(ir.ok&&(ir.headers.get("content-type")||"").includes("json")?(await ir.json()).map(t=>t.s):[]);
    const fresh=rows.filter(x=>x.slug&&!indexed.has(x.slug));
    const urls=[`<url><loc>${SITE}/topics</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,...fresh.map(x=>`<url><loc>${SITE}/topic/${encodeURIComponent(x.slug)}</loc><lastmod>${String(x.updated_at).slice(0,10)}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`)].join("");
    res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=86400");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  } catch {
    res.setHeader("Cache-Control","no-store");
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/topics</loc></url></urlset>`);
  }
}
export default async function handler(req, res) {
  const mode = typeof req.query?.mode === "string" ? req.query.mode : "";
  if (mode === "research" || mode === "topics") return extraSitemap(req, res, mode);
  try {
    const file = typeof req.query?.file === "string" ? req.query.file : "all.xml";
    const upstream = await fetch(`https://strfwaqvxvkhjbqrwmla.supabase.co/functions/v1/generate-sitemap?file=${encodeURIComponent(file)}`, {
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
    ];
    let xml = excluded.reduce((body, loc) => {
      const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return body.replace(new RegExp(`\\s*<url>\\s*<loc>${escaped}<\\/loc>[\\s\\S]*?<\\/url>`, "g"), "");
    }, rawXml);

    // pages added after the sitemap function was last deployed
    if (/^(pages|all)\.xml$/.test(file) && !xml.includes("/share-your-story") && xml.includes("</urlset>")) {
      xml = xml.replace("</urlset>", "  <url><loc>https://www.ompathstudy.com/finalists</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n</urlset>");
      xml = xml.replace("</urlset>", "  <url><loc>https://www.ompathstudy.com/share-your-story</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>");
    }
    // OmpathStudy Research Hub: public, substantive pages only. University directory pages
    // remain noindex until institution-specific requirements have been independently verified.
    if (/^(pages|all)\.xml$/.test(file) && xml.includes("</urlset>")) {
      const researchPages = [
        ["/research", "weekly", "0.9"],
        ["/research/services", "monthly", "0.8"],
        ["/research/topics", "weekly", "0.8"],
        ["/research/resources", "weekly", "0.8"],
        ["/research/pricing", "monthly", "0.7"],
        ["/research/process", "monthly", "0.7"],
        ["/research/faq", "monthly", "0.6"],
        ["/research/request-support", "monthly", "0.6"],
        ["/research/academic-integrity", "yearly", "0.6"],
        ["/research/universities", "monthly", "0.7"],
        ["/research/universities/mku", "monthly", "0.7"],
        ["/research/universities/university-of-nairobi", "monthly", "0.7"],
        ["/research/universities/jkuat", "monthly", "0.7"],
        ["/research/universities/kenyatta-university", "monthly", "0.7"],
        ["/research/universities/moi-university", "monthly", "0.7"],
        ["/research/universities/maseno-university", "monthly", "0.7"],
        ["/research/universities/aga-khan-university", "monthly", "0.7"],
        ["/research/universities/other-universities", "monthly", "0.7"],
        ["/research/services/research-topic-consultation", "monthly", "0.7"],
        ["/research/services/proposal-review", "monthly", "0.7"],
        ["/research/services/methodology-support", "monthly", "0.7"],
        ["/research/services/questionnaire-development", "monthly", "0.7"],
        ["/research/services/data-analysis-support", "monthly", "0.7"],
        ["/research/services/spss-support", "monthly", "0.7"],
        ["/research/services/academic-editing", "monthly", "0.7"],
        ["/research/services/research-defence-preparation", "monthly", "0.7"],
        ["/research/guides/research-problem-statement", "yearly", "0.7"],
        ["/research/guides/research-objectives-questions-hypotheses", "yearly", "0.7"],
        ["/research/guides/quantitative-qualitative-mixed-methods", "yearly", "0.7"],
        ["/research/guides/cross-sectional-cohort-case-control-studies", "yearly", "0.7"],
        ["/research/guides/sampling-methods-and-sample-size", "yearly", "0.7"],
        ["/research/guides/research-ethics-informed-consent", "yearly", "0.7"],
        ["/research/guides/questionnaire-design-validity-reliability", "yearly", "0.7"],
        ["/research/guides/descriptive-statistics-and-data-analysis", "yearly", "0.7"],
        ["/research/guides/writing-results-and-discussion", "yearly", "0.7"],
        ["/research/guides/sample-size-calculation-prevalence-studies", "yearly", "0.7"],
        ["/research/guides/pico-framework-clinical-research-questions", "yearly", "0.7"],
        ["/research/guides/literature-review-search-strategy", "yearly", "0.7"],
        ["/research/guides/confounding-and-bias-clinical-research", "yearly", "0.7"],
        ["/research/guides/odds-ratios-risk-ratios-confidence-intervals", "yearly", "0.7"],
        ["/research/guides/chi-square-t-tests-logistic-regression", "yearly", "0.7"],
        ["/research/guides/data-cleaning-spss", "yearly", "0.7"],
        ["/research/guides/vancouver-referencing-medical-research", "yearly", "0.7"],
        ["/research/guides/writing-research-abstract", "yearly", "0.7"],
        ["/research/guides/research-defence-presentation-preparation", "yearly", "0.7"],
      ];
      const additions = researchPages
        .filter(([path]) => !xml.includes(`https://www.ompathstudy.com${path}</loc>`))
        .map(([path, frequency, priority]) => `  <url><loc>https://www.ompathstudy.com${path}</loc><changefreq>${frequency}</changefreq><priority>${priority}</priority></url>`)
        .join("\n");
      if (additions) xml = xml.replace("</urlset>", additions + "\n</urlset>");
    }

    // stories live at /stories/<title-slug>: the function still lists the older id-first form
    if (/(^|\W)(stories|all)\.xml$/.test(file) && xml.includes("/stories/")) {
      try {
        const r = await fetch("https://strfwaqvxvkhjbqrwmla.supabase.co/rest/v1/stories?select=id,slug&published=eq.true&deleted_at=is.null&limit=1000", { headers: { apikey: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE", Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE"}` } });
        const rows = r.ok ? await r.json() : [];
        const slugOf = new Map(rows.filter((x) => x.slug).map((x) => [x.id, x.slug]));
        xml = xml.replace(/<loc>https:\/\/www\.ompathstudy\.com\/stories\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-[^<]*)?<\/loc>/g, (m, id) => (slugOf.has(id) ? `<loc>https://www.ompathstudy.com/stories/${slugOf.get(id)}</loc>` : m));
      } catch { /* keep the listed addresses */ }
    }
    // exams are taken at /exams/<slug>/start, a noindex page: the exam list (/exams) is the page for search, so single exams are not listed
    xml = xml.replace(/\s*<url>\s*<loc>https:\/\/www\.ompathstudy\.com\/exams\/[^<]+<\/loc>[\s\S]*?<\/url>/g, "");
    // clinical simulator cases: built-in ones plus every case the AI has written so far, so a new case is listed the day it is made
    if (/^(pages|all)\.xml$/.test(file) && xml.includes("</urlset>")) {
      let written = [];
      try {
        const k = process.env.SUPABASE_ANON_KEY || ANON;
        const r = await fetch("https://strfwaqvxvkhjbqrwmla.supabase.co/rest/v1/ai_cases?select=id,created_at&status=eq.published&order=created_at.desc&limit=1000", { headers: { apikey: k, Authorization: "Bearer " + k } });
        if (r.ok) written = await r.json();
      } catch { /* the built-in cases are still listed */ }
      const have = new Set();
      const rows = [...BUILTIN_CASES.map((id) => ({ id })), ...written]
        .filter((c) => !have.has(c.id) && have.add(c.id))
        .map((c) => `  <url><loc>https://www.ompathstudy.com/clinical/case/${c.id}</loc>${c.created_at ? `<lastmod>${String(c.created_at).slice(0, 10)}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.5</priority></url>`)
        .join("\n");
      if (!xml.includes("/clinical/case/")) xml = xml.replace("</urlset>", rows + "\n</urlset>");
    }
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
