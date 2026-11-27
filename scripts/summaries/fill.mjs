// Writes summaries and key terms for study notes and published articles through the authenticated Neon/Cloudflare AI endpoint.
// Result: src/data/pageSummaries.json  { "n:<note slug>" | "a:<article slug>": { s: "summary", t: ["term", ...] } }
//   node scripts/summaries/fill.mjs [count] [--parallel=3]
import fs from "node:fs";
import { maintenanceRequest } from "../topics/maintenance-client.mjs";

const FILE = "src/data/pageSummaries.json";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 40);
const PAR = Number((process.argv.find((a) => a.startsWith("--parallel=")) || "--parallel=3").split("=")[1]);
const have = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
const plain = (t) => String(t ?? "").replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_#>`|]/g, " ").replace(/\s+/g, " ").trim();

const todo = [];
// the study notes first (they are the newest and the most read), then the blogs of years 2 and 3 that are not past papers
for (const n of JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"))) {
  if (have[`n:${n.slug}`] || n.paper) continue;
  const md = fs.existsSync(n.file) ? fs.readFileSync(n.file, "utf8") : "";
  todo.push({ key: `n:${n.slug}`, title: n.title, where: `Year ${n.year} · ${n.unit}`, text: plain(md) });
}
try {
  for (let from = 0; from < 2000; from += 100) {
    const result = await maintenanceRequest("corpus", { table: "articles", limit: 100, offset: from });
    const rows = result.rows || [];
    for (const a of rows) {
      if (!a.slug || have[`a:${a.slug}`] || /^stories/i.test(a.category || "")) continue;
      const text = plain(a.content);
      if (text.length < 600) continue;
      todo.push({ key: `a:${a.slug}`, title: a.title, where: a.category || "", text, paper: /past paper|questions & answers|exam|cat\b/i.test(a.title) });
    }
    if (rows.length < 100) break;
  }
} catch (e) { console.log("could not read the Neon article library:", e.message); }
todo.sort((a, b) => Number(Boolean(a.paper)) - Number(Boolean(b.paper)));
const batch = todo.slice(0, COUNT);
console.log(`${todo.length} pages still need a summary; writing ${batch.length}.`);

async function ask(page) {
  return maintenanceRequest("summarize", { title: page.title, where: page.where, text: page.text.slice(0, 5000) });
}

let next = 0, done = 0, failed = 0;
async function worker() {
  while (next < batch.length) {
    const p = batch[next++];
    try {
      const j = await ask(p);
      const s = String(j.summary ?? "").replace(/\s+/g, " ").trim();
      const t = (Array.isArray(j.terms) ? j.terms : []).map((x) => String(x).trim()).filter((x) => x.length >= 3 && x.length <= 40).slice(0, 7);
      if (s.length < 40 || s.length > 420 || /\d+\s?(mg|mcg|g)\b/i.test(s)) throw new Error("unusable");
      have[p.key] = { s, t };
      done++;
      if (done % 10 === 0) { fs.writeFileSync(FILE, JSON.stringify(have)); console.log(`done ${done}/${batch.length}`); }
    } catch (e) { failed++; if (failed <= 3) console.log("fail:", p.key, String(e.message).slice(0, 100)); }
  }
}
await Promise.all(Array.from({ length: PAR }, worker));
fs.writeFileSync(FILE, JSON.stringify(have));
console.log(`finished: ${done} written, ${failed} failed, ${Object.keys(have).length} summaries in total.`);
