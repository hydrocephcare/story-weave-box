// Finds pages that repeat each other: blogs whose titles are nearly the same, and blogs that cover a topic that already has an IMED note.
//   node scripts/imed/dupes.mjs articles.json        (articles.json = [{id,title,category,slug}] of the published blogs)
// It only reports; nothing is changed.
import fs from "node:fs";

const arts = JSON.parse(fs.readFileSync(process.argv[2] ?? ".arts.json", "utf8"));
const notes = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8")).filter((n) => !n.paper && n.year === 4);
const NOISE = new Set("the a an of and in on for to with by from notes note study guide revision overview introduction intro year part clinical management complete comprehensive essentials basics high yield summary questions question answers answer mcqs mcq past paper exam cat quiz bank lecture slides pdf".split(" "));
const toks = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !NOISE.has(w) && !/^\d+$/.test(w));
const jac = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };

// 1. near-identical titles among the blogs (same kind: papers are compared with papers)
const kind = (a) => (/past paper|\bcat\b|exam|mcq|question/i.test(a.title) ? "q" : "n");
const T = arts.map((a) => ({ a, t: toks(a.title), k: kind(a) }));
const seen = new Set(), groups = [];
for (let i = 0; i < T.length; i++) {
  if (seen.has(i) || T[i].t.length < 1) continue;
  const g = [i];
  for (let j = i + 1; j < T.length; j++) if (!seen.has(j) && T[j].k === T[i].k && jac(T[i].t, T[j].t) >= 0.75) g.push(j);
  if (g.length > 1) { g.forEach((x) => seen.add(x)); groups.push(g.map((x) => T[x].a)); }
}
console.log(`\n== ${groups.length} groups of blogs with near-identical titles ==`);
for (const g of groups) { console.log("-"); for (const a of g) console.log(`   ${a.id.slice(0, 8)}  ${a.category} | ${a.title}`); }

// 2. blogs about a topic that now has a Year 4 IMED note
console.log("\n== blogs that repeat a Year 4 note ==");
for (const n of notes) {
  const nt = toks(n.title); if (!nt.length) continue;
  const hits = T.filter((x) => x.k === "n" && jac(nt, x.t) >= 0.6 && !/^Year 4/i.test(x.a.category));
  const same4 = T.filter((x) => x.k === "n" && jac(nt, x.t) >= 0.6 && /^Year 4/i.test(x.a.category));
  if (hits.length || same4.length) { console.log(`\n${n.title}  (/notes/${n.slug})`); for (const h of [...same4, ...hits]) console.log(`   ${h.a.id.slice(0, 8)}  ${h.a.category} | ${h.a.title}`); }
}
