import { jsPDF } from "jspdf";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://dekyjrfwvavtoivqivno.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL";

const scanUrls = (article) => [...new Set(`${article.original_notes || ""}\n${article.content || ""}`.replace(/\\\//g, "/").match(/https?:\/\/[^\s)"'<>]+/gi) || [])]
  .map(url => url.replace(/[\],.;:!?]+$/, "").replace(/^https:\/\/(?:www\.)?ompathstudy\.com\/uploads\//i, "https://cdn.ompathstudy.com/uploads/"))
  .filter(url => url.startsWith("https://cdn.ompathstudy.com/uploads/"));

const fileName = (value) => `${String(value || "source-pages").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80)}.pdf`;

export default async function handler(req, res) {
  try {
    let article;
    let urls;
    if (req.method === "POST" && req.body?.urls) {
      const parsed = JSON.parse(String(req.body.urls));
      urls = Array.isArray(parsed) ? parsed.filter(url => typeof url === "string" && url.startsWith("https://cdn.ompathstudy.com/uploads/")) : [];
      article = { title: String(req.body.title || "source-pages") };
    } else {
      const slug = String(Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug || "").trim();
      if (!slug) return res.status(400).json({ error: "slug required" });
      if (!SUPABASE_KEY) return res.status(500).json({ error: "Server configuration missing" });
      const filter = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug) ? `id=eq.${encodeURIComponent(slug)}` : `slug=eq.${encodeURIComponent(slug)}`;
      const query = `${SUPABASE_URL}/rest/v1/articles?${filter}&select=title,content,original_notes&limit=1`;
      const articleResponse = await fetch(query, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      if (!articleResponse.ok) throw new Error(`Article lookup failed (${articleResponse.status})`);
      article = (await articleResponse.json())[0];
      if (!article) return res.status(404).json({ error: "Source not found" });
      urls = scanUrls(article);
    }
    if (!urls.length) return res.status(404).json({ error: "No source pages" });
    const images = [];
    for (let start = 0; start < urls.length; start += 6) {
      const batch = await Promise.all(urls.slice(start, start + 6).map(async (url, offset) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Page ${start + offset + 1} failed (${response.status})`);
        return new Uint8Array(await response.arrayBuffer());
      }));
      images.push(...batch);
    }
    let pdf = null;
    for (const image of images) {
      const properties = new jsPDF().getImageProperties(image);
      const orientation = properties.width > properties.height ? "landscape" : "portrait";
      if (!pdf) pdf = new jsPDF({ orientation, unit: "pt", format: "a4", compress: true }); else pdf.addPage("a4", orientation);
      const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight(), ratio = Math.min(width / properties.width, height / properties.height), imageWidth = properties.width * ratio, imageHeight = properties.height * ratio;
      pdf.addImage(image, "JPEG", (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight, undefined, "FAST");
    }
    pdf.addPage("a4", "portrait");
    const finalWidth = pdf.internal.pageSize.getWidth();
    pdf.setTextColor(15, 118, 110);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.text("Continue revising with Ompath Study", finalWidth / 2, 330, { align: "center" });
    pdf.setTextColor(55, 65, 81);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(14);
    pdf.text("For more study files, kindly visit our site.", finalWidth / 2, 375, { align: "center" });
    pdf.setTextColor(15, 118, 110);
    pdf.setFont("helvetica", "bold");
    pdf.text("www.ompathstudy.com", finalWidth / 2, 402, { align: "center" });
    const output = Buffer.from(pdf.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName(article.title)}"`);
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    return res.status(200).send(output);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "PDF generation failed" });
  }
}
