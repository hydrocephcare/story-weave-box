const REDIRECTED = ["/blog/amebiasis-pathogenic-free-living-amebae-guide","/blog/entamoeba-histolytica-amoebiasis","/blog/liver-tumors-benign-and-malignant-overview","/blog/lymphoma-overview-classification","/blog/liver-tumors-summary-notes","/blog/non-hodgkin-lymphoma","/blog/pleural-effusion-lights-criteria-y4","/blog/pneumothorax-clinical-management-y4","/blog/bronchial-asthma-internal-medicine-y4","/mcqs/medical-bacteriology-mcqs","/mcqs/chemical-pathology-mcqs","/mcqs/cardiovascular-pathology-mcqs","/mcqs/respiratory-pathology-mcqs","/mcqs/glomerular-diseases-mcqs","/mcqs/sickle-cell-anaemia-mcqs","/mcqs/infective-endocarditis-mcqs","/mcqs/biliary-tract-disease-mcqs","/mcqs/rheumatic-heart-disease-mcqs","/mcqs/paed-2021-mcqs","/mcqs/congenital-heart-disease-mcqs","/mcqs/gout-mcqs","/mcqs/pneumonia-mcqs","/mcqs/osteoarthritis-presentation-mcqs","/mcqs/fibromyalgia-presentation-mcqs","/mcqs/crystal-arthropathies-mcqs","/mcqs/sepsis-mcqs","/mcqs/hepatic-amoebiasis-mcqs","/mcqs/blood-transfusion-mcqs","/essays/congenital-heart-disease-essay-questions"];

export default async function handler(req, res) {
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
