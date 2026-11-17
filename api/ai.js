// All the site's AI and learning endpoints in one serverless function (Hobby plan function limit).
import chat from "./_lib/aiChat.js";
import topic from "./_lib/topicWrite.js";
import outline from "./_lib/outlineParse.js";
import study from "./_lib/pageStudy.js";
import polish from "./_lib/blogPolish.js";
import { draft, health } from "./_lib/aiDraft.js";
import agent from "./_lib/adminAgent.js";
import seo from "./_lib/adminSeo.js";
import write from "./_lib/adminWrite.js";
import sb from "./_lib/sbCache.js";
import transcribe from "./_lib/transcribe.js";
import assist from "./_lib/storyAssist.js";
import ompathLite from "./_lib/ompathLite.js";
import ompathLiteSms from "./_lib/ompathLiteSms.js";
import ompathLiteAdmin from "./_lib/ompathLiteAdmin.js";
import ompathLiteWeb from "./_lib/ompathLiteWeb.js";

const TASKS = { chat, topic, outline, study, polish, draft, health, agent, seo, write, sb, transcribe, assist, lite: ompathLite, "lite-sms": ompathLiteSms, "lite-admin": ompathLiteAdmin, "lite-web": ompathLiteWeb };

export default async function handler(req, res) {
  const task = String(Array.isArray(req.query?.task) ? req.query.task[0] : req.query?.task ?? "");
  const fn = TASKS[task];
  if (!fn) return res.status(404).json({ error: "unknown task" });
  return fn(req, res);
}
