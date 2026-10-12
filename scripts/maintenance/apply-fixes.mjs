// Writes the finished posts in content-fixes/<id-prefix>.md to the database. The old text is saved to a backup file first.
//
//   node scripts/maintenance/apply-fixes.mjs               dry run: lists what would be written
//   node scripts/maintenance/apply-fixes.mjs --apply       writes them
//   node scripts/maintenance/apply-fixes.mjs --restore FILE   puts the old text back
// It needs the service key (see db.mjs).
import fs from "fs";
import path from "path";
import { sb } from "./db.mjs";

const dir = "content-fixes";
const apply = process.argv.includes("--apply");
const restore = process.argv.indexOf("--restore");

if (restore > 0) {
  const bk = JSON.parse(fs.readFileSync(process.argv[restore + 1], "utf8"));
  for (const [id, content] of Object.entries(bk)) {
    const { data, error } = await sb.from("articles").update({ content }).eq("id", id).select("id");
    console.log(id.slice(0, 8), error ? `ERR ${error.message}` : data?.length ? "restored" : "not restored");
  }
  process.exit(0);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
const ids = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await sb.from("articles").select("id").order("id").range(from, from + 499);
  if (error) throw error;
  ids.push(...data);
  if (data.length < 500) break;
}
const backup = {};
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = `articles-backup-fixes-${stamp}.json`;
let n = 0;
for (const f of files) {
  const prefix = path.basename(f, ".md");
  const id = ids.find((r) => r.id.startsWith(prefix))?.id;
  if (!id) { console.log(prefix, "not found"); continue; }
  const content = fs.readFileSync(path.join(dir, f), "utf8");
  const { data: old, error: e0 } = await sb.from("articles").select("title,content").eq("id", id).single();
  if (e0) { console.log(prefix, "ERR", e0.message); continue; }
  if (old.content === content) { console.log(prefix, "already up to date"); continue; }
  console.log(prefix, old.title.slice(0, 60), "|", old.content.length, "->", content.length);
  n++;
  if (!apply) continue;
  backup[id] = old.content;
  fs.writeFileSync(backupFile, JSON.stringify(backup));
  const { data, error } = await sb.from("articles").update({ content }).eq("id", id).select("id");
  console.log("   ", error ? `ERR ${error.message}` : data?.length ? "updated" : "NOT updated (blocked)");
}
console.log(apply ? `${n} posts written. Old text: ${backupFile}` : `${n} posts would change. Run again with --apply.`);
