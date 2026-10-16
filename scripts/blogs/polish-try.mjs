// Tries the polish on a few blogs and writes the results to a folder, without touching the database.
//   node scripts/blogs/polish-try.mjs <outDir> <slug-or-id-part> [more...]   (uses .groq-keys.local / .gemini-keys.local or the environment)
import fs from "node:fs";
import path from "node:path";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { kindOf, plain } from "../../api/_lib/blogPolishCore.js";
import { polishArticle } from "../../api/_lib/blogPolishRun.js";

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GROQ_API_KEYS: [process.env.GROQ_API_KEYS, read(".groq-keys.local")].filter(Boolean).join(","), GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, read(".gemini-keys.local")].filter(Boolean).join(",") };
const [outDir, ...want] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const ANON = fs.readFileSync("scripts/blogs/restructure.mjs", "utf8").match(/ANON = "([^"]+)"/)[1];
const ask = (prompt, timeoutMs, maxTokens) => askModel(prompt, { env, timeoutMs, maxTokens, plain: true }).then((r) => r.text);
for (const w of want) {
  const r = await fetch(`https://dekyjrfwvavtoivqivno.supabase.co/rest/v1/articles?select=id,title,category,content,original_notes&published=eq.true&or=(slug.ilike.*${encodeURIComponent(w)}*,title.ilike.*${encodeURIComponent(w)}*)&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const a = (await r.json())[0];
  if (!a) { console.log(`no blog for "${w}"`); continue; }
  const t0 = Date.now();
  console.log(`\n== ${a.title} | ${a.category} | ${a.content.length} chars | kind ${kindOf(a.content)}`);
  const res = await polishArticle(a, ask, { chunk: true });
  console.log(`   ${((Date.now() - t0) / 1000).toFixed(0)}s | verdict ${res.verdict} | status ${res.status}\n   title: ${res.title}\n   description: ${res.description}\n   reason: ${res.reason}\n   content: ${res.content ? res.content.length + " chars (" + (plain(res.content).length / plain(a.content).length).toFixed(2) + "x)" : "kept as it was"}`);
  fs.writeFileSync(path.join(outDir, `${a.id}.before.md`), a.content);
  if (res.content) fs.writeFileSync(path.join(outDir, `${a.id}.after.md`), res.content);
  else if (res.rejected) fs.writeFileSync(path.join(outDir, `${a.id}.rejected.md`), res.rejected);
}
