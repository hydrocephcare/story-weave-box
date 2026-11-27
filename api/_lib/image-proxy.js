export default async function handler(req, res) {
  try {
    const raw = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    const url = new URL(String(raw || ""));
    if (url.protocol !== "https:" || url.hostname !== "cdn.ompathstudy.com" || !url.pathname.startsWith("/uploads/")) {
      return res.status(400).json({ error: "Invalid image URL" });
    }
    const upstream = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!upstream.ok) return res.status(upstream.status).json({ error: "Image fetch failed" });
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) return res.status(415).json({ error: "Not an image" });
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, s-maxage=31536000, immutable");
    return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Proxy failed" });
  }
}
