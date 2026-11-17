import ompathLite from "./_lib/ompathLite.js";
import ompathLiteSms from "./_lib/ompathLiteSms.js";
import ompathLiteAdmin from "./_lib/ompathLiteAdmin.js";
import ompathLiteWeb from "./_lib/ompathLiteWeb.js";

const TASKS = {
  "lite": ompathLite,
  "lite-sms": ompathLiteSms,
  "lite-admin": ompathLiteAdmin,
  "lite-web": ompathLiteWeb,
};

export default async function handler(req, res) {
  const task = String(req.query?.task || "");
  const fn = TASKS[task];
  if (!fn) return res.status(404).json({ error: "Unknown Lite API task." });
  return fn(req, res);
}
