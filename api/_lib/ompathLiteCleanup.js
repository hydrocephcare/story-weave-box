import { timingSafeEqual } from "node:crypto";
import { deleteExpiredHealthData } from "./ompathLiteHealth.js";
import { processPendingHealthGuideSms } from "./ompathLiteSms.js";

function authorized(req) {
  const expected = process.env.CRON_SECRET || "";
  const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized." });
  try {
    const [retention, guideDelivery] = await Promise.all([
      deleteExpiredHealthData(),
      processPendingHealthGuideSms(10),
    ]);
    return res.status(200).json({ ok: true, retention, guideDelivery });
  } catch {
    console.error("Lite health-data retention job failed.");
    return res.status(500).json({ error: "Retention cleanup failed." });
  }
}
