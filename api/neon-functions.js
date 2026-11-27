/** Transitional dispatcher: individual Supabase Edge Functions are ported here incrementally. */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const name = String(req.query?.name || "").trim();
  if (!/^[a-z0-9-]+$/i.test(name)) return res.status(400).json({ error: "Invalid function name" });
  return res.status(501).json({ error: `The ${name} function has not yet been ported to Neon/Vercel.` });
}
