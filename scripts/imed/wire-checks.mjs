// One-off: the AI cross-check runs every day in the workflow, deep notes are checked before they are saved, and the writers get stricter accuracy rules.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("scripts/imed/validate-notes.mjs", (s) => {
  if (s.includes("execSync")) return s;
  s = swap(s, 'import crypto from "node:crypto";', 'import crypto from "node:crypto";\nimport { execSync } from "node:child_process";');
  return s + '\nexecSync("node scripts/imed/sync-check-marks.mjs", { stdio: "inherit" });\n';
});

edit(".github/workflows/topics-daily.yml", (s) => {
  if (s.includes("validate-notes")) return s;
  s = swap(s, "      - name: Write today's page summaries", [
    "      - name: Cross-check notes with a second AI (marks the clean ones, lists the rest in Admin > Content checks)",
    "        env:",
    "          GEMINI_API_KEYS: ${{ secrets.GEMINI_API_KEYS }}",
    "          GROQ_API_KEYS: ${{ secrets.GROQ_API_KEYS }}",
    "        run: node scripts/imed/validate-notes.mjs ${{ inputs.check || '8' }}",
    "",
    "      - name: Write today's page summaries",
  ].join("\n"));
  s = swap(s, "git status --porcelain src/data/topicAi src/data/pageSummaries.json", "git status --porcelain src/data/topicAi src/data/pageSummaries.json src/data/contentChecks.json src/data/contentMarks.json");
  s = swap(s, "git add src/data/topicAi src/data/pageSummaries.json", "git add src/data/topicAi src/data/pageSummaries.json src/data/contentChecks.json src/data/contentMarks.json");
  s = swap(s, '      deep:\n        description: "How many topics get deep exam notes this run"\n        required: false\n        default: "12"\n', '      deep:\n        description: "How many topics get deep exam notes this run"\n        required: false\n        default: "12"\n      check:\n        description: "How many notes the second AI cross-checks this run"\n        required: false\n        default: "8"\n');
  return s;
});

edit("scripts/topics/deep-fill.mjs", (s) => {
  if (s.includes("checkContent")) return s;
  s = swap(s, 'import { generateDeepWithFallback } from "../../supabase/functions/_shared/topicAi.js";', 'import { generateDeepWithFallback } from "../../supabase/functions/_shared/topicAi.js";\nimport { checkContent } from "../../supabase/functions/_shared/contentCheck.js";');
  s = swap(s, "    fs.writeFileSync(file, JSON.stringify({ ...page, deep }, null, 1) + \"\\n\");", [
    "    // a second AI reads the deep notes before they are saved: anything with a serious error is not published",
    "    const text = [...deep.sections.map((x) => `## ${x.h}\\n${x.p ?? \"\"}\\n${(x.b ?? []).join(\"\\n\")}\\n${(x.t ?? []).map((r) => `${r.a}: ${r.b}`).join(\"\\n\")}`), `## Examiner questions\\n${deep.exam.join(\"\\n\")}`].join(\"\\n\\n\");",
    "    const check = await checkContent({ title: t?.n ?? slug, kind: \"deep exam notes\", text, env });",
    "    if (!check.validated) { console.log(`held back ${slug}: ${check.issues.filter((i) => i.severity === \"high\").map((i) => i.problem).join(\" | \").slice(0, 300)}`); continue; }",
    "    fs.writeFileSync(file, JSON.stringify({ ...page, deep: { ...deep, checked: check.at } }, null, 1) + \"\\n\");",
  ].join("\n"));
  return s;
});

edit("supabase/functions/_shared/topicAi.js", (s) => {
  if (s.includes("ACCURACY RULES")) return s;
  s = swap(s, "const DEEP_RULES = `", "const ACCURACY_RULES = `\nACCURACY RULES (read before you write): every number, cut-off, drug and sign must match standard current guidelines. Name a sign, score or eponym only if you are certain of the name and of what it shows; otherwise describe it in plain words. Write each threshold the same way every time it appears (for example always \"250 or more\", never \"over 250\" in one place and \"250 or more\" in another). Describe examination signs by what actually happens (for example in shifting dullness the fluid falls to the dependent flank, so that flank is dull and the upper flank is resonant). If you are not sure of a fact, leave it out. Do not invent statistics.`;\n\nconst DEEP_RULES = `");
  s = swap(s, "Output ONLY".replace("Output ONLY", "Reply with ONLY one JSON object: {\"sections\": [{\"h\": \"heading\""), "Reply with ONLY one JSON object: {\"sections\": [{\"h\": \"heading\"");
  return s;
});
console.log("wired");
