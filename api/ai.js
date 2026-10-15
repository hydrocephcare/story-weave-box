// All the site's AI endpoints in one serverless function (the Hobby plan allows twelve functions in total).
// /api/ai-chat, /api/topic-write, /api/outline-parse and /api/page-study and /api/ai-polish are rewritten to /api/ai?task=chat|topic|outline|study|polish (vercel.json).
import chat from "./_lib/aiChat.js";
import topic from "./_lib/topicWrite.js";
import outline from "./_lib/outlineParse.js";
import study from "./_lib/pageStudy.js";
import polish from "./_lib/blogPolish.js";
import { draft, health } from "./_lib/aiDraft.js";
import agent from "./_lib/adminAgent.js";
import seo from "./_lib/adminSeo.js";
import write from "./_lib/adminWrite.js";

const TASKS = { chat, topic, outline, study, polish, draft, health, agent, seo, write };

export default async function handler(req, res) {
  const task = String(Array.isArray(req.query?.task) ? req.query.task[0] : req.query?.task ?? "");
  const fn = TASKS[task];
  if (!fn) return res.status(404).json({ error: "unknown task" });
  return fn(req, res);
}
