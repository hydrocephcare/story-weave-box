// Writes topic pages ahead of time with Ompath AI (the same assistant the site uses), so readers and search engines find the text already there.
// Pages go to src/data/topicAi/<slug>.json and are folded into the static pages by build-topics.mjs.
//   node scripts/topics/bulk-fill.mjs [count] [--parallel=4]
import fs from "node:fs";
import path from "node:path";
import { buildPartPrompts, mergeParts, parseJsonReply } from "../../supabase/functions/_shared/topicParts.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo";
const DIR = "src/data/topicAi";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 1000);
const PAR = Number((process.argv.find((a) => a.startsWith("--parallel=")) || "--parallel=4").split("=")[1]);
fs.mkdirSync(DIR, { recursive: true });

async function ask(question, snippet, name, category) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ompath-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ question, history: [], sources: snippet ? [{ kind: "site", title: name, subtitle: category, snippet: snippet.slice(0, 2600) }] : [] }),
  });
  if (!res.ok) throw new Error(`ai ${res.status}`);
  const txt = await res.text();
  let out = "";
  for (const l of txt.split("\n")) {
    const d = l.trim();
    if (!d.startsWith("data:")) continue;
    const p = d.slice(5).trim();
    if (p === "[DONE]") continue;
    try { out += JSON.parse(p)?.choices?.[0]?.delta?.content ?? ""; } catch { /* partial */ }
  }
  return out;
}
const tryAsk = async (...a) => { for (let i = 0; i < 2; i++) { try { const r = parseJsonReply(await ask(...a)); if (r) return r; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 1500)); } return null; };

const index = JSON.parse(fs.readFileSync("public/topics/index.json", "utf8"));
const todo = index.filter((t) => !fs.existsSync(path.join(DIR, `${t.s}.json`)) && !t.ai).sort((a, b) => (b.d + b.q * 2 + b.i) - (a.d + a.q * 2 + a.i)).slice(0, COUNT);
console.log(`${todo.length} topics to write, ${PAR} at a time`);
const contextOf = (t) => [t.lead?.t, ...(t.sec ?? []).flatMap((s) => [s.h, ...s.b]), ...(t.snip ?? []).map((s) => s.t)].filter(Boolean).join("\n");

let done = 0, skipped = 0, failed = 0, next = 0;
async function worker() {
  while (next < todo.length) {
    const it = todo[next++];
    try {
      const t = JSON.parse(fs.readFileSync(path.join("public/topics", `${it.s}.json`), "utf8"));
      const prompts = buildPartPrompts({ name: t.n, category: t.c });
      let page = null, notMedical = false;
      for (let attempt = 0; attempt < 3 && !page && !notMedical; attempt++) {
        const first = await tryAsk(prompts[0], attempt === 0 ? contextOf(t) : "", t.n, t.c);
        if (!first) continue;
        if (first.medical === false) { notMedical = true; break; }
        const later = await Promise.all(prompts.slice(1).map((p) => tryAsk(p, "", t.n, t.c)));
        try { page = mergeParts([first, ...later], { name: t.n, category: t.c, model: "gemini" }); } catch { page = null; }
        if (page && (!page.sections || page.sections.length < 3)) page = null;
      }
      if (notMedical) { skipped++; console.log("not medical", t.n); continue; }
      if (!page) { failed++; console.log("failed", t.n); continue; }
      if (page.medical === false) { skipped++; continue; }
      if (!page.sections || page.sections.length < 3 || (page.summary || "").length < 40) { failed++; console.log("thin", t.n); continue; }
      fs.writeFileSync(path.join(DIR, `${it.s}.json`), JSON.stringify({ ...page, reviewed: false }, null, 1) + "\n");
      done++;
      if (done % 10 === 0) console.log(`done ${done}/${todo.length} (skipped ${skipped}, failed ${failed})`);
    } catch (e) { failed++; console.log("error", it.n, e.message); }
  }
}
await Promise.all(Array.from({ length: PAR }, worker));
console.log(`finished: ${done} written, ${skipped} not medical, ${failed} failed`);
