// Runs after `vite build`. The book list holds the Google Drive ids of the reference textbooks, which are for
// verified MKU students only: it is served by api/student-data.js and must not be left in the public site folder.
// (The library file lists, notes and past papers are open to everyone, so they stay.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = path.join(root, "dist", "data", "books.json");
const removed = fs.existsSync(file);
if (removed) fs.rmSync(file);
console.log(`removed ${removed ? 1 : 0} private data file from dist/data`);
