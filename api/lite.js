import ompathLite from "./_lib/ompathLite.js";
import ompathLiteSms from "./_lib/ompathLiteSms.js";
import ompathLiteAdmin from "./_lib/ompathLiteAdmin.js";
import ompathLiteWeb from "./_lib/ompathLiteWeb.js";
import ompathLiteGuide from "./_lib/ompathLiteGuide.js";
import ompathLiteCleanup from "./_lib/ompathLiteCleanup.js";
import ompathLiteLearning from "./_lib/ompathLiteLearning.js";

const TASKS = {
  "lite": ompathLite,
  "lite-sms": ompathLiteSms,
  "lite-admin": ompathLiteAdmin,
  "lite-web": ompathLiteWeb,
  "lite-learning": ompathLiteLearning,
  "lite-learning-ussd": ompathLiteLearning,
  "lite-learning-sms-inbound": ompathLiteLearning,
  "lite-learning-sms-send": ompathLiteLearning,
  "health-guide": ompathLiteGuide,
  "health-cleanup": ompathLiteCleanup,
};

export default async function handler(req, res) {
  const task = String(req.query?.task || "");
  const fn = TASKS[task];
  if (!fn) return res.status(404).json({ error: "Unknown Lite API task." });
  return fn(req, res);
}
