// Runs after `vite build`. The book list and the library file lists hold Google Drive ids of reference
// books and notes, so they are for verified MKU students only: they are served by api/student-data.js,
// and must not be left in the public site folder.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, "dist", "data");
let removed = 0;
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir)) {
    if (/^(books|broken-links|year\d+-library)\.json$/.test(f)) { fs.rmSync(path.join(dir, f)); removed++; }
  }
}
console.log(`removed ${removed} private data files from dist/data`);
