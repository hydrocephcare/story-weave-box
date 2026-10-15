// Tries the deep-notes writer on one topic with the local keys and prints a summary (nothing is saved).  node scripts/imed/try-deep.mjs pulmonary-tuberculosis
import fs from "node:fs";
import { generateDeepWithFallback } from "../../supabase/functions/_shared/topicAi.js";
const slug = process.argv[2] || "pulmonary-tuberculosis";
const local = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GEMINI_API_KEYS: local(".gemini-keys.local"), GROQ_API_KEYS: local(".groq-keys.local") };
const t = JSON.parse(fs.readFileSync(`public/topics/${slug}.json`, "utf8"));
const past = [...(t.qs ?? []).map((q) => q.q), ...(t.es ?? []).map((q) => q.q)].slice(0, 12);
const t0 = Date.now();
const deep = await generateDeepWithFallback({ name: t.n, category: t.c, base: t.ai, past }, env);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s, model ${deep.model}`);
console.log("sections:", deep.sections.map((s) => `${s.h} (p${(s.p || "").length} b${(s.b || []).length} t${(s.t || []).length})`).join(" | "));
console.log("facts", deep.facts.length, "mnemonics", deep.mnemonics.length, "vivas", deep.vivas.length, "hot", deep.vivas.filter((v) => v.hot).length, "mcqs", deep.mcqs.length, "cases", deep.cases.length, "mistakes", deep.mistakes.length);
console.log("size bytes", JSON.stringify(deep).length);
fs.writeFileSync(".deep-try.json", JSON.stringify(deep, null, 1));
console.log("FACTS:", deep.facts.slice(0, 4));
console.log("VIVA:", deep.vivas.slice(0, 2));
console.log("MCQ:", JSON.stringify(deep.mcqs[0]));
