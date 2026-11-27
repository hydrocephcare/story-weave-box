// /api/ai-cases: the clinical cases the AI has written from the notes, for the simulator. Cached at the edge, so visitors do not each read the database.
const DB = "https://strfwaqvxvkhjbqrwmla.supabase.co";
const KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";

export default async function handler(req, res) {
  try {
    const r = await fetch(`${DB}/rest/v1/ai_cases?select=def&status=eq.published&order=created_at.desc&limit=500`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error("source " + r.status);
    const rows = await r.json();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    return res.status(200).send(JSON.stringify(rows.map((x) => x.def).filter((d) => d && d.id && d.vignette)));
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json([]);
  }
}
