// Records how big each book is (in MB), so the Books page can say so. Reads the Content-Length Google Drive
// sends for the download link, writes it into public/data/books.json as "sizes": { driveId: MB }.
// Re-run after adding books:  node scripts/library/book-sizes.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = path.join(root, "public/data/books.json");
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);
const sizes = { ...(data.sizes ?? {}) };
const ids = [...new Set(data.books.map((b) => b[0]))].filter((id) => sizes[id] === undefined);
console.log(`${ids.length} books to measure`);

let done = 0, failed = 0;
async function measure(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, { method: "HEAD", signal: AbortSignal.timeout(25000) });
      const len = Number(r.headers.get("content-length"));
      if (r.ok && len > 0) { sizes[id] = Math.round((len / 1048576) * 10) / 10; return; }
      if (r.status === 404) break;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
  failed++;
}
const queue = [...ids];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) { await measure(queue.shift()); if (++done % 50 === 0) console.log(done, "of", ids.length); } }));

data.sizes = sizes;
fs.writeFileSync(file, JSON.stringify(data) + (raw.endsWith("\n") ? "\n" : ""));
console.log(`measured ${Object.keys(sizes).length}, could not measure ${failed}`);
