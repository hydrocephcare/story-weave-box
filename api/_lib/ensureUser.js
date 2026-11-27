import { neon } from "@neondatabase/serverless";
import { verifyNeonToken } from "./neonAdmin.js";

const db = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  const identity = await verifyNeonToken(req.headers.authorization || "");
  if (!identity) return res.status(401).json({ error: "A verified Neon Auth session is required." });
  try {
    const rows = await db().query("SELECT public.ensure_neon_user($1,$2) AS result", [identity.id, identity.email]);
    return res.status(200).json({ success: true, ...(rows[0]?.result || {}) });
  } catch (error) {
    console.error("[ensure-user]", error instanceof Error ? error.message : String(error));
    return res.status(503).json({ error: "Your account data could not be prepared. Please retry shortly." });
  }
}
