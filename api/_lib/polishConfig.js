import { randomBytes } from "node:crypto";
import { isAdmin } from "./adminAgent.js";
import { getPolishSql } from "./neonPolishStore.js";

const bearer = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
const aiReady = () => Boolean(
  String(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").trim()
  && String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "").trim()
);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!(await isAdmin(bearer(req)))) return res.status(403).json({ error: "Administrator access required." });

  try {
    const sql = getPolishSql();
    if (req.method === "GET") {
      const rows = await sql.query("SELECT updated_at FROM public.polish_secret WHERE id=1 AND length(secret)>=24 LIMIT 1");
      const configured = rows.length > 0;
      return res.status(200).json({ configured, runtimeReady: configured, aiReady: aiReady(), updatedAt: rows[0]?.updated_at || null });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (body.action !== "rotate") return res.status(400).json({ error: "Unknown polishing configuration action." });
    const key = randomBytes(32).toString("hex");
    await sql.query(
      "INSERT INTO public.polish_secret (id,secret,updated_at) VALUES (1,$1,now()) ON CONFLICT (id) DO UPDATE SET secret=EXCLUDED.secret,updated_at=now()",
      [key],
    );
    return res.status(200).json({ configured: true, runtimeReady: true, aiReady: aiReady(), updatedAt: new Date().toISOString(), key });
  } catch (error) {
    console.error("[polish-config]", error instanceof Error ? error.message : String(error));
    return res.status(503).json({ error: "Could not update the polishing configuration in Neon." });
  }
}
