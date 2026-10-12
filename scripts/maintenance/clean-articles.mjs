// Cleans OCR and scan residue out of the live notes (the `articles` table): "source page" lines, broken ligatures, odd bullets, scanned page
// footers and hard line wraps. It only touches posts that the scanner flags, saves the old text to a backup file first, and does nothing
// unless you pass --apply.
//
//   node scripts/maintenance/clean-articles.mjs                dry run: lists what would change
//   node scripts/maintenance/clean-articles.mjs --apply        writes the cleaned text
//   node scripts/maintenance/clean-articles.mjs --restore FILE puts the saved text back from a backup file
import fs from "fs";
import { sb } from "./db.mjs";
import { clean } from "./clean.mjs";
import { score } from "./ocr-scan.mjs";

const apply = process.argv.includes("--apply");
const restore = process.argv.indexOf("--restore");

// Posts that need a person, not a cleaner: duplicated questions, raw HTML, MCQ options glued on one line.
const HAND = new Set(["18a1328c", "b1acf3c7", "1b37fa08", "c69a56b6", "32d6141b"]);

async function all() {
  const out = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await sb.from("articles").select("id,title,content").order("created_at", { ascending: false }).range(from, from + 99);
    if (error) throw error;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

if (restore > 0) {
  const bk = JSON.parse(fs.readFileSync(process.argv[restore + 1], "utf8"));
  for (const [id, content] of Object.entries(bk)) {
    const { data, error } = await sb.from("articles").update({ content }).eq("id", id).select("id");
    console.log(id.slice(0, 8), error ? `ERR ${error.message}` : data?.length ? "restored" : "not restored");
  }
  process.exit(0);
}

const rows = await all();
const backup = {};
const file = `articles-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
let changed = 0;
for (const x of rows) {
  const text = x.content || "";
  const before = score(text).total;
  const residue = /Visual or intentionally blank|transcription of (all|the) \d+ source pages|source pages were processed|[ﬁﬂﬀﬃﬄ▪]/i.test(text);
  if (before < 12 && !residue) continue;
  if (HAND.has(x.id.slice(0, 8))) { console.log(x.id.slice(0, 8), "needs hand work:", x.title); continue; }
  const next = clean(text);
  if (next === text) continue;
  changed++;
  console.log(x.id.slice(0, 8), `score ${before} -> ${score(next).total}`, x.title.slice(0, 60));
  if (!apply) continue;
  backup[x.id] = text;
  fs.writeFileSync(file, JSON.stringify(backup));
  const { data, error } = await sb.from("articles").update({ content: next }).eq("id", x.id).select("id");
  console.log("   ", error ? `ERR ${error.message}` : data?.length ? "updated" : "NOT updated (blocked)");
}
if (apply && changed) {
  console.log(`Old text saved to ${file}. To undo: node scripts/maintenance/clean-articles.mjs --restore ${file}`);
}
console.log(apply ? `${changed} posts cleaned.` : `${changed} posts would change. Run again with --apply to write them.`);
