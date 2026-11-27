import topicMaintenance from "./_lib/topicMaintenance.js";
import generateSitemap from "./generate-sitemap";
import paystackHandler from "./paystack.js";
import sendNotification from "./_lib/sendNotification.js";
import generateExam from "./_lib/generateExam.js";
import transcribe from "./_lib/transcribe.js";
import aiCases from "./_lib/ai-cases.js";
import { initiate as oneKittyInitiate, callback as oneKittyCallback } from "./_lib/onekitty.js";
import blogPolishBatch from "./_lib/blogPolishBatch.js";

/** Neon-backed function dispatcher for Cloudflare Pages and crawler requests. */
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  const name = String(req.query?.name || "").trim();
  if (!/^[a-z0-9-]+$/i.test(name)) {
    return res.status(400).json({ error: "Invalid function name" });
  }

  if (name === "topic-maintenance") return topicMaintenance(req, res);
  if (name === "send-notification") return sendNotification(req, res);
  if (name === "generate-exam") return generateExam(req, res);
  if (name === "transcribe") return transcribe(req, res);
  if (name === "ai-cases") return aiCases(req, res);
  if (name === "onekitty-initiate") return oneKittyInitiate(req, res);
  if (name === "onekitty-callback") return oneKittyCallback(req, res);
  if (name === "blog-polish-batch") return blogPolishBatch(req, res);

  // api/sitemap.js fetches this endpoint with GET; browser-side function calls use POST.
  if (["initiate-paystack", "check-payment", "access-code"].includes(name)) {
    return paystackHandler(req, res, name);
  }

  if (name === "generate-sitemap") {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ error: "Method not allowed" });
    }
    req.query = {
      ...(req.query || {}),
      file: req.body?.file || req.query?.file || "all.xml",
    };
    return generateSitemap(req, res);
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(501).json({
    error: `The ${name} function has not yet been ported to Neon.`,
  });
}
