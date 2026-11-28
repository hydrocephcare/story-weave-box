// Consolidated utility endpoints. Public URLs remain unchanged through vercel.json rewrites.
import aiCases from "./_lib/ai-cases.js";
import imageProxy from "./_lib/image-proxy.js";
import driveNotes from "./_lib/drive-notes.js";
import studentData from "./_lib/student-data.js";
import noteCard from "./_lib/note-card.js";
import sitemapIndex from "./_lib/sitemap-index.js";

const handlers = {
  "ai-cases": aiCases,
  "image-proxy": imageProxy,
  "drive-notes": driveNotes,
  "student-data": studentData,
  "note-card": noteCard,
  "sitemap-index": sitemapIndex,
};

export default async function handler(req, res) {
  const task = String(Array.isArray(req.query?.task) ? req.query.task[0] : req.query?.task || "");
  const fn = handlers[task];
  if (!fn) return res.status(404).json({ error: "Unknown utility endpoint" });
  return fn(req, res);
}
