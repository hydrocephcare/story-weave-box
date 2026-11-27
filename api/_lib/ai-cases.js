import { neon } from "@neondatabase/serverless";

// /api/ai-cases: published clinical cases from the Neon database.
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";

export default async function handler(req, res) {
  try {
    if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
    const sql = neon(databaseUrl);
    const rows = await sql.query("SELECT def FROM public.ai_cases WHERE status = 'published' ORDER BY created_at DESC LIMIT 500");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    return res.status(200).send(JSON.stringify(rows.map((row) => row.def).filter((def) => def && def.id && def.vignette)));
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "Clinical cases are temporarily unavailable." });
  }
}
