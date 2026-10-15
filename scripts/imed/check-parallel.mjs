// One-off: the pieces of a text are cross-checked in parallel (a web request has about a minute), and the deep-notes response says why a write was held back.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
edit("supabase/functions/_shared/contentCheck.js", (s) => {
  const a = s.indexOf("export async function checkContent(");
  const b = s.indexOf("\n}\n", a) + 3;
  if (a < 0 || b < 3) throw new Error("checkContent not found");
  const fn = [
    "export async function checkContent({ title, kind = \"note\", text, env, fetchImpl = fetch, timeoutMs = 50000 }) {",
    "  let model = \"\";",
    "  const pieces = chunkText(text).filter((p) => p.trim());",
    "  const results = await Promise.all(pieces.map(async (piece) => {",
    "    const r = await askModel(buildCheckPrompt({ title, kind, text: piece }), { env, fetchImpl, timeoutMs, maxTokens: 3500 });",
    "    model = r.model;",
    "    const json = extractJson(r.text);",
    "    if (!json) throw new Error(\"no JSON in the reply\");",
    "    const found = sanitizeCheck(json).issues.filter((x) => x.severity !== \"low\");",
    "    return verifyIssues({ text: piece, issues: found, env, fetchImpl, timeoutMs });",
    "  }));",
    "  return { ...sanitizeCheck({ issues: results.flat() }), model, at: new Date().toISOString().slice(0, 10) };",
    "}",
    "",
  ].join("\n");
  return s.slice(0, a) + fn + s.slice(b);
});
edit("api/_lib/topicWrite.js", (s) => {
  const x = "      return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: /429|503/.test(String(e?.message)) ? \"busy\" : \"failed\" });";
  if (!s.includes(x)) throw new Error("deep catch not found");
  return s.replace(x, "      return res.status(/429|503/.test(String(e?.message)) ? 429 : 502).json({ status: /429|503/.test(String(e?.message)) ? \"busy\" : \"failed\", reason: String(e?.message ?? \"\").slice(0, 240) });");
});
console.log("parallel check + reason");
