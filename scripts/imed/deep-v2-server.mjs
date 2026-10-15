// One-off: deep exam notes v2. Three focused writes run in parallel (clinical, management, exam questions), so the notes are long and structured:
// bedside steps, how to read each test, a management ladder, numbers to memorise, mnemonics, 15+ viva questions with answers, MCQs, two cases and
// common mistakes. Questions asked in past papers (given to the writer) are marked. The code itself is in deep-v2-block.txt.
import fs from "node:fs";
const f = "supabase/functions/_shared/topicAi.js";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const a = s.indexOf("/** The second layer:");
const b = s.indexOf("export const slugOf =");
if (a < 0 || b < 0) throw new Error("deep block not found");
const block = fs.readFileSync("scripts/imed/deep-v2-block.txt", "utf8").replace(/\r\n/g, "\n");
s = s.slice(0, a) + block + s.slice(b);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);

// the topic writer API passes the past-paper questions through
const g = "api/_lib/topicWrite.js";
let t = fs.readFileSync(g, "utf8");
const c2 = t.includes("\r\n");
t = t.replace(/\r\n/g, "\n");
if (!t.includes("const past")) {
  const x = 'const deep = await generateDeepWithFallback({ name, category: String(body.category ?? "").slice(0, 60), base }, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: keys });';
  if (!t.includes(x)) throw new Error("topicWrite not patched");
  t = t.replace(x, 'const past = (Array.isArray(body.past) ? body.past : []).map((x) => String(x).slice(0, 240)).slice(0, 12);\n      const deep = await generateDeepWithFallback({ name, category: String(body.category ?? "").slice(0, 60), base, past }, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: keys });');
  fs.writeFileSync(g, c2 ? t.replace(/\n/g, "\r\n") : t);
}
console.log("deep v2 server side written");
