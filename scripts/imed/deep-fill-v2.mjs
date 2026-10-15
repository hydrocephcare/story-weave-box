// One-off: the daily job also rewrites first-version deep notes (no viva list) and can be pointed at one topic with --slug=.
import fs from "node:fs";
const f = "scripts/topics/deep-fill.mjs";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 70)); s = s.replace(x, y); };
swap("p.medical !== false && Array.isArray(p.sections) && p.sections.length >= 3 && !p.deep;", "p.medical !== false && Array.isArray(p.sections) && p.sections.length >= 3 && (!p.deep || !p.deep.vivas);");
swap("const COUNT = Number(process.argv.find((a) => /^\\d+$/.test(a)) || 10);", "const COUNT = Number(process.argv.find((a) => /^\\d+$/.test(a)) || 10);\nconst ONLY = (process.argv.find((a) => a.startsWith(\"--slug=\")) || \"\").split(\"=\")[1];");
swap(".filter((slug) => { try {", ".filter((slug) => !ONLY || slug === ONLY)\n  .filter((slug) => { try {");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("deep-fill updated");
