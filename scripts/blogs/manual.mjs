// Tidying without AI keys.
//   node scripts/blogs/manual.mjs clean [--year N]          tidy notes by rule (tidy-rules.mjs), checked against the original, saved as public/blog-fixes/<id>.md
//   node scripts/blogs/manual.mjs next 3 --year 3 [outDir]  writes the next notes to outDir/<id>.src.md so they can be tidied by hand
//   node scripts/blogs/manual.mjs accept <id> <file>        checks <file> against the original and saves it
//   node scripts/blogs/manual.mjs skip <id> "reason"        leaves a note as it is, for good
import fs from "node:fs";
import path from "node:path";
import { tidy } from "./tidy-rules.mjs";

const DIR = "public/blog-fixes";
const SB = "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const ANON = fs.readFileSync("scripts/blogs/restructure.mjs", "utf8").match(/ANON = "([^"]+)"/)[1];
const indexFile = path.join(DIR, "index.json"), skippedFile = path.join(DIR, "_skipped.json");
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : {};
const skipped = fs.existsSync(skippedFile) ? JSON.parse(fs.readFileSync(skippedFile, "utf8")) : {};
const yearOf = (c) => Number(String(c || "").match(/^Year\s*(\d)/i)?.[1] ?? 0);
const text = (c) => c.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const isBank = (a) => (a.content.match(/^(?:#{1,4}\s*)?\**Question\s+\d+/gim) ?? []).length >= 5 || /past paper|questions? (&|and) answers?|\bmcqs?\b|\bsaqs?\b|\bcat\b|\bexam\b|\bquiz\b/i.test(a.title);
// reasons that only the AI job had, or that the old rule check gave, are tried again by the rule cleaner
const retry = (why) => /^(rule tidy rejected|too long|tidy rejected)/.test(why ?? "");
const yi = process.argv.indexOf("--year"), year = yi >= 0 ? Number(process.argv[yi + 1]) : 0;
const inYears = (a) => (year ? yearOf(a.category) === year : [3, 2, 1].includes(yearOf(a.category)));

async function rows(filter) {
  const all = [];
  for (let from = 0; from < 3000; from += 200) {
    const r = await fetch(`${SB}/rest/v1/articles?select=id,slug,title,category,content&published=eq.true&deleted_at=is.null&order=created_at.asc&offset=${from}&limit=200${filter}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!r.ok) break;
    const x = await r.json(); all.push(...x); if (x.length < 200) break;
  }
  return all;
}

// the same safety test the automatic job uses
function sound(original, out) {
  const nums = [...new Set((text(original).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.length >= 2))];
  const keptNums = nums.filter((n) => out.includes(n)).length;
  if (nums.length >= 5 && keptNums / nums.length < 0.92) return `numbers lost (${keptNums}/${nums.length})`;
  const words = [...new Set(text(original).toLowerCase().match(/[a-z]{7,}/g) ?? [])];
  const o = out.toLowerCase();
  const lost = words.filter((w) => !o.includes(w));
  if (words.length >= 20 && (words.length - lost.length) / words.length < 0.88) return `words lost (${words.length - lost.length}/${words.length}): ${lost.slice(0, 8).join(", ")}`;
  const ratio = text(out).length / Math.max(1, text(original).length);
  if (ratio < 0.7 || ratio > 1.3) return `length changed (${ratio.toFixed(2)})`;
  if ((out.match(/^##\s/gm) ?? []).length < 2) return "no headings";
  const pics = (original.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
  if (pics && (out.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length < pics) return "pictures lost";
  return "";
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === "clean") {
  const all = await rows("");
  let ok = 0, bad = 0, ign = 0;
  for (const a of all) {
    if (!inYears(a) || index[a.id]) continue;
    if (skipped[a.id] && !retry(skipped[a.id])) continue;
    if (isBank(a) || text(a.content).length < 700) { ign++; continue; }
    const out = tidy(a.content), why = sound(a.content, out);
    if (why) { bad++; skipped[a.id] = "rule tidy rejected: " + why; continue; }
    delete skipped[a.id];
    fs.writeFileSync(path.join(DIR, a.id + ".md"), out); index[a.id] = new Date().toISOString().slice(0, 10); ok++;
  }
  fs.writeFileSync(indexFile, JSON.stringify(index)); fs.writeFileSync(skippedFile, JSON.stringify(skipped, null, 1));
  console.log(`tidied ${ok}, rejected ${bad}, ignored (papers, banks, short) ${ign}`);
} else if (cmd === "next") {
  const outDir = process.argv.filter((x, i) => !x.startsWith("--") && i > 4 && i !== yi + 1).pop() || ".";
  const n = Number(a1 || 3);
  const all = await rows("");
  let got = 0;
  for (const a of all) {
    if (got >= n) break;
    if (!inYears(a) || index[a.id] || skipped[a.id]) continue;
    if (isBank(a) || text(a.content).length < 700) continue;
    fs.writeFileSync(path.join(outDir, `${a.id}.src.md`), a.content);
    console.log(`${a.id} | ${a.title} | ${a.content.length} chars`); got++;
  }
} else if (cmd === "accept") {
  const [row] = await rows(`&id=eq.${a1}`);
  if (!row) { console.log("no such note"); process.exit(1); }
  const out = fs.readFileSync(a2, "utf8").trim();
  const why = sound(row.content, out);
  if (why) { console.log(`REJECTED ${row.title}: ${why}`); process.exit(2); }
  fs.writeFileSync(path.join(DIR, `${a1}.md`), out + "\n");
  index[a1] = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(indexFile, JSON.stringify(index));
  console.log(`saved ${row.title}`);
} else if (cmd === "skip") {
  skipped[a1] = a2 || "left as it is";
  fs.writeFileSync(skippedFile, JSON.stringify(skipped, null, 1));
  console.log("skipped");
} else console.log("use: clean | next | accept | skip");
