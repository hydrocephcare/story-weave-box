// One-off: a model sometimes adds text or a second {...} after its JSON, and the greedy "first { to last }" match then fails to parse.
// extractJson reads the FIRST complete object (string-aware), so trailing text is harmless.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("supabase/functions/_shared/topicAi.js", (s) => {
  if (s.includes("export function extractJson")) return s;
  s = swap(s, "export const slugOf =", [
    "/** The first complete JSON object in a model's reply (text before or after it, or a second object, is ignored). Returns null when there is none. */",
    "export function extractJson(text) {",
    "  const t = String(text ?? \"\");",
    "  for (let start = t.indexOf(\"{\"); start >= 0; start = t.indexOf(\"{\", start + 1)) {",
    "    let depth = 0, inStr = false, esc = false;",
    "    for (let i = start; i < t.length; i++) {",
    "      const c = t[i];",
    "      if (inStr) { if (esc) esc = false; else if (c === \"\\\\\") esc = true; else if (c === '\"') inStr = false; continue; }",
    "      if (c === '\"') inStr = true;",
    "      else if (c === \"{\") depth++;",
    "      else if (c === \"}\" && --depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { break; } }",
    "    }",
    "  }",
    "  return null;",
    "}",
    "",
    "export const slugOf =",
  ].join("\n"));
  s = swap(s, "  const page = sanitizePage(JSON.parse(m[0]));", "  const page = sanitizePage(extractJson(text));");
  s = swap(s, "    return { json: JSON.parse(m[0]), model };", "    return { json, model };");
  return s;
});

edit("supabase/functions/_shared/contentCheck.js", (s) => {
  if (s.includes("extractJson")) return s;
  s = swap(s, 'import { askModel } from "./topicAi.js";', 'import { askModel, extractJson } from "./topicAi.js";');
  s = swap(s, "const keep = new Set((JSON.parse(m[0]).real ?? []).map(Number));", "const keep = new Set((json.real ?? []).map(Number));");
  s = swap(s, "const found = sanitizeCheck(JSON.parse(m[0])).issues.filter((x) => x.severity !== \"low\");", "const found = sanitizeCheck(json).issues.filter((x) => x.severity !== \"low\");");
  return s;
});
console.log("patched part 1");
