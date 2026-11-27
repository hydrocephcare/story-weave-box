import generateSitemap from "./generate-sitemap";
import paystackHandler from "./paystack.js";

/** Neon/Vercel function dispatcher. Keep sitemap GET requests working for crawlers. */
export default async function handler(req, res) {
  const name = String(req.query?.name || "").trim();
  if (!/^[a-z0-9-]+$/i.test(name)) {
    return res.status(400).json({ error: "Invalid function name" });
  }

  // api/sitemap.js fetches this endpoint with GET; browser-side function calls use POST.
  if (["initiate-paystack", "check-payment", "access-code"].includes(name)) {
    return paystackHandler(req, res, name);
  }

  if (name === "generate-sitemap") {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ error: "Method not allowed" });
    }
    req.query = {
      ...(req.query || {}),
      file: req.body?.file || req.query?.file || "all.xml",
    };
    return generateSitemap(req, res);
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(501).json({
    error: `The ${name} function has not yet been ported to Neon/Vercel.`,
  });
}
