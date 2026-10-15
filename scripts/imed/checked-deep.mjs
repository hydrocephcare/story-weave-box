// One-off: deep notes are cross-checked by a second AI BEFORE anyone sees them, and an error the check finds is repaired by a second write
// that is told what was wrong. The same function serves the page (a Pro reader taps) and the daily job.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("supabase/functions/_shared/topicAi.js", (s) => {
  if (s.includes("fixes = []")) return s;
  s = swap(s, "export function buildDeepPrompt({ name, category, base, part = \"clinical\", past = [] }) {", "export function buildDeepPrompt({ name, category, base, part = \"clinical\", past = [], fixes = [] }) {");
  s = swap(s, "YOUR PART: ${P.ask}", "${fixes.length ? `\\nA REVIEWER FOUND THESE ERRORS IN AN EARLIER DRAFT. Do not repeat them: wherever your text touches these facts, state them correctly:\\n- ${fixes.map((x) => clip(x, 260)).join(\"\\n- \")}\\n` : \"\"}\nYOUR PART: ${P.ask}");
  s = swap(s, "export async function generateDeepNotes({ name, category, base, past = [], env, fetchImpl = fetch, timeoutMs }) {", "export async function generateDeepNotes({ name, category, base, past = [], fixes = [], env, fetchImpl = fetch, timeoutMs }) {");
  s = swap(s, "buildDeepPrompt({ name, category, base, part, past })", "buildDeepPrompt({ name, category, base, part, past, fixes })");
  return s;
});

edit("supabase/functions/_shared/contentCheck.js", (s) => {
  if (s.includes("generateCheckedDeep")) return s;
  s = swap(s, 'import { askModel, extractJson } from "./topicAi.js";', 'import { askModel, extractJson, generateDeepWithFallback } from "./topicAi.js";');
  return s + [
    "",
    "/**",
    " * Writes the deep notes, has a second AI check them, and if the check finds a serious error writes them once more with the errors listed.",
    " * Returns the notes with the date they passed. Throws when they still carry a serious error (nothing wrong is ever published).",
    " */",
    "export async function generateCheckedDeep(input, env, fetchImpl = fetch) {",
    "  let fixes = [];",
    "  for (let round = 0; round < 2; round++) {",
    "    const deep = await generateDeepWithFallback({ ...input, fixes }, env);",
    "    const check = await checkContent({ title: input.name, kind: \"deep exam notes\", text: deepToText(deep), env, fetchImpl });",
    "    if (check.validated) return { ...deep, checked: check.at };",
    "    fixes = check.issues.filter((x) => x.severity !== \"low\").map((x) => `${x.problem} Correct: ${x.fix}`);",
    "  }",
    "  throw new Error(`deep notes held back: ${fixes.join(\" | \").slice(0, 300)}`);",
    "}",
    "",
  ].join("\n");
});

edit("api/_lib/topicWrite.js", (s) => {
  if (s.includes("generateCheckedDeep")) return s;
  s = swap(s, "import { generateWithFallback, generateDeepWithFallback, validName } from \"../../supabase/functions/_shared/topicAi.js\";", "import { generateWithFallback, validName } from \"../../supabase/functions/_shared/topicAi.js\";\nimport { generateCheckedDeep } from \"../../supabase/functions/_shared/contentCheck.js\";");
  s = swap(s, "const deep = await generateDeepWithFallback({ name, category: String(body.category ?? \"\").slice(0, 60), base, past }, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: keys });", "const deep = await generateCheckedDeep({ name, category: String(body.category ?? \"\").slice(0, 60), base, past }, { GROQ_API_KEYS: groq, GEMINI_API_KEYS: keys });");
  return s;
});

edit("scripts/topics/deep-fill.mjs", (s) => {
  if (s.includes("generateCheckedDeep")) return s;
  s = swap(s, 'import { generateDeepWithFallback } from "../../supabase/functions/_shared/topicAi.js";\n', "");
  s = swap(s, 'import { checkContent, deepToText } from "../../supabase/functions/_shared/contentCheck.js";', 'import { generateCheckedDeep } from "../../supabase/functions/_shared/contentCheck.js";');
  s = swap(s, "const deep = await generateDeepWithFallback(", "const deep = await generateCheckedDeep(");
  const a = s.indexOf("    // a second AI reads the deep notes before they are saved");
  const b = s.indexOf("    fs.writeFileSync(file, JSON.stringify({ ...page, deep: { ...deep, checked: check.at } }");
  if (a < 0 || b < 0) throw new Error("check block");
  s = s.slice(0, a) + "    // the notes were cross-checked (and repaired once if needed) inside generateCheckedDeep; a serious error left over throws and nothing is saved\n" + s.slice(b).replace("{ ...deep, checked: check.at }", "deep");
  return s;
});
console.log("checked deep wired");
