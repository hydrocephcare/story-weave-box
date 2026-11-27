// Serves the private library manifests only to verified MKU students.
import { createRemoteJWKSet, jwtVerify } from "jose";
import books from "../../public/data/books.json";
import brokenLinks from "../../public/data/broken-links.json";
import year1 from "../../public/data/year1-library.json";
import year2 from "../../public/data/year2-library.json";
import year3 from "../../public/data/year3-library.json";
import year4 from "../../public/data/year4-library.json";

const DEFAULT_JWKS = "https://ep-dry-haze-benks3ew.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const DEFAULT_DATA_API = "https://ep-dry-haze-benks3ew.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1";
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL || DEFAULT_JWKS));
const FILES = {
  "books.json": books,
  "broken-links.json": brokenLinks,
  "year1-library.json": year1,
  "year2-library.json": year2,
  "year3-library.json": year3,
  "year4-library.json": year4,
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const file = String(Array.isArray(req.query.file) ? req.query.file[0] : req.query.file || "");
  if (!Object.hasOwn(FILES, file)) return res.status(400).json({ error: "Unknown file" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Sign in with your student account." });

  try {
    await jwtVerify(token, jwks);
  } catch {
    return res.status(401).json({ error: "Your session is invalid. Sign in again." });
  }

  try {
    const base = String(process.env.NEON_DATA_API_URL || process.env.VITE_NEON_DATA_API_URL || DEFAULT_DATA_API).replace(/\/+$/, "");
    const check = await fetch(base + "/rpc/is_mku_student", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    if (!check.ok) return res.status(503).json({ error: "Could not verify your student access. Please try again." });
    if ((await check.json()) !== true) return res.status(403).json({ error: "This library is available to verified MKU students only." });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(JSON.stringify(FILES[file]));
  } catch (error) {
    console.error("[student-data]", error instanceof Error ? error.message : String(error));
    return res.status(503).json({ error: "The student library is temporarily unavailable." });
  }
}
