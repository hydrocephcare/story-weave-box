// Writes src/data/contentMarks.json: the notes that carry the "AI cross-checked" mark. A note keeps its mark only while its text is exactly the text
// that was checked (the hash), so editing a note removes the mark until the next check. Runs before every build and after every check.
import fs from "node:fs";
import crypto from "node:crypto";

const checks = fs.existsSync("src/data/contentChecks.json") ? JSON.parse(fs.readFileSync("src/data/contentChecks.json", "utf8")) : { notes: {} };
const registry = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
const list = Array.isArray(registry) ? registry : registry.notes ?? Object.values(registry);
const marks = {};
for (const n of list) {
  const c = checks.notes?.[n.slug];
  if (!c?.validated || !n.file || !fs.existsSync(n.file)) continue;
  // the same hash on Windows (CRLF files) and on the server (LF files)
  const h = crypto.createHash("sha1").update(fs.readFileSync(n.file, "utf8").split("\r").join("")).digest("hex").slice(0, 12);
  if (h === c.hash) marks[n.slug] = c.at;
}
const out = JSON.stringify({ notes: marks }, null, 1) + "\n";
if (!fs.existsSync("src/data/contentMarks.json") || fs.readFileSync("src/data/contentMarks.json", "utf8") !== out) fs.writeFileSync("src/data/contentMarks.json", out);
console.log(`${Object.keys(marks).length} note(s) carry the AI cross-checked mark.`);
