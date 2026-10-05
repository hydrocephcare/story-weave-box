// Serves the book list and the library file lists (Google Drive ids) only to verified MKU students.
// The browser sends its Supabase session token; we ask the database whether that account is a verified
// student (the is_mku_student function), and only then return the file. The files are not in the public
// site folder (the build removes them from dist/data), so there is no public URL for them.
import fs from "node:fs";
import path from "node:path";

const PROJECTS = {
  lkgfzjwhmfjvntzphbsh: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo",
  dekyjrfwvavtoivqivno: "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL",
};
const FILES = /^(books|broken-links|year[1-6]-library)\.json$/;

function projectOf(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const ref = new URL(payload.iss).hostname.split(".")[0];
    return PROJECTS[ref] ? ref : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const file = String(Array.isArray(req.query.file) ? req.query.file[0] : req.query.file || "");
  if (!FILES.test(file)) return res.status(400).json({ error: "Unknown file" });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const ref = token ? projectOf(token) : null;
  if (!ref) return res.status(401).json({ error: "Sign in with your student account" });
  try {
    const check = await fetch(`https://${ref}.supabase.co/rest/v1/rpc/is_mku_student`, {
      method: "POST",
      headers: { apikey: PROJECTS[ref], Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (!check.ok) return res.status(401).json({ error: "Could not verify your account" });
    if ((await check.json()) !== true) return res.status(403).json({ error: "MKU students only" });
    const body = fs.readFileSync(path.join(process.cwd(), "public", "data", file), "utf8");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(body);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Check failed" });
  }
}
