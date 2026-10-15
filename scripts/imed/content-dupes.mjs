// Finds blogs whose TEXT repeats another blog (not only their titles). Reads .arts.json and .content.json made by the audit; reports only.
//   node scripts/imed/content-dupes.mjs
import fs from "node:fs";

const arts = new Map(JSON.parse(fs.readFileSync(".arts.json", "utf8")).map((a) => [a.id, a]));
const content = new Map(JSON.parse(fs.readFileSync(".content.json", "utf8")));
const words = (s) => String(s).toLowerCase().replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const shingles = (w) => { const out = new Set(); for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(" ")); return out; };
const S = [];
for (const [id, text] of content) { const w = words(text); if (w.length >= 120) S.push({ id, n: w.length, sh: shingles(w) }); }

const parent = new Map(S.map((x) => [x.id, x.id]));
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
const pairs = [];
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
  const [small, big] = S[i].sh.size <= S[j].sh.size ? [S[i], S[j]] : [S[j], S[i]];
  if (small.sh.size < 80) continue;
  let hit = 0; for (const x of small.sh) if (big.sh.has(x)) hit++;
  const containment = hit / small.sh.size;
  if (containment >= 0.7) { pairs.push([small.id, big.id, containment]); parent.set(find(small.id), find(big.id)); }
}
const groups = new Map();
for (const x of S) { const r = find(x.id); groups.set(r, [...(groups.get(r) ?? []), x]); }
const real = [...groups.values()].filter((g) => g.length > 1);
console.log(`${real.length} groups of blogs whose text repeats another blog's text (${real.reduce((a, g) => a + g.length - 1, 0)} extra pages)\n`);
const out = [];
for (const g of real) {
  g.sort((a, b) => b.n - a.n);
  console.log("-");
  g.forEach((x, k) => console.log(`   ${k === 0 ? "KEEP" : "dupe"} ${x.id.slice(0, 8)}  ${x.n} words  ${arts.get(x.id)?.category} | ${arts.get(x.id)?.title}`));
  out.push({ keep: g[0].id, hide: g.slice(1).map((x) => x.id) });
}
fs.writeFileSync(".dupe-plan.json", JSON.stringify(out, null, 1));

// the plan the admin page "Repeated pages" shows: each group has the page to keep and the copies that can be hidden with one tap
const info = (x) => ({ id: x.id, words: x.n, title: arts.get(x.id)?.title ?? "", category: arts.get(x.id)?.category ?? "", slug: arts.get(x.id)?.slug ?? "" });
fs.writeFileSync("src/data/dupePlan.json", JSON.stringify({ made: new Date().toISOString().slice(0, 10), groups: real.map((g) => ({ keep: info(g[0]), hide: g.slice(1).map(info) })) }, null, 1));
