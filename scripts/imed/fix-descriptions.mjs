// One-off: 73 notes had a garbled description ("X: the complete clinical approach to X: definition; causes and risk factors in our setting (including.") that shows on the
// note's header and in Google. Each gets a clean one-sentence description taken from the note's own Definition. Also makes the cross-check hash independent of line endings
// (Windows files have CRLF, the deployed copy has LF, so the mark was lost on the server).
import fs from "node:fs";
import crypto from "node:crypto";

const REG = "src/data/staticNotes.json";
const raw = fs.readFileSync(REG, "utf8");
const reg = JSON.parse(raw);
const list = Array.isArray(reg) ? reg : reg.notes ?? Object.values(reg);
const garbled = (d, title) => /the complete clinical approach to/i.test(d) || /\(including\.?$/.test(d.trim()) || (title && d.split(title).length > 2);
const plain = (s) => s.replace(/\*\*|__|`/g, "").replace(/\*(?=\S)(.+?)\*/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

let fixed = 0;
for (const n of list) {
  if (!n.file || !fs.existsSync(n.file) || !garbled(n.description ?? "", n.title)) continue;
  const lines = fs.readFileSync(n.file, "utf8").replace(/\r\n/g, "\n").split("\n");
  const at = lines.findIndex((l) => /^##\s+(definition|overview|introduction|background)/i.test(l));
  let text = "";
  if (at >= 0) for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) { const t = plain(lines[i].replace(/^\s*[-*]\s+|^\s*\d+\.\s+/, "")); if (t.length > 30) { text = t; break; } }
  if (!text) { const first = lines.find((l) => /^\*.*\*$/.test(l.trim())); text = first ? plain(first) : ""; }
  if (!text) continue;
  if (text.length > 158) { const cut = text.slice(0, 158); const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", ")); text = (stop > 70 ? cut.slice(0, stop) : cut.slice(0, cut.lastIndexOf(" "))).replace(/[,;:\s]+$/, "") + "."; }
  else if (!/[.!?]$/.test(text)) text += ".";
  n.description = text;
  fixed++;
}
fs.writeFileSync(REG, JSON.stringify(reg, null, raw.includes('\n  "') ? 2 : 1) + (raw.endsWith("\n") ? "\n" : ""));
console.log(`${fixed} description(s) rewritten`);

// the cross-check hash ignores line endings
const CHK = "src/data/contentChecks.json";
if (fs.existsSync(CHK)) {
  const db = JSON.parse(fs.readFileSync(CHK, "utf8"));
  let moved = 0;
  for (const n of list) {
    const c = db.notes?.[n.slug];
    if (!c || !n.file || !fs.existsSync(n.file)) continue;
    const text = fs.readFileSync(n.file, "utf8");
    const crlf = crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
    if (c.hash === crlf) { c.hash = crypto.createHash("sha1").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 12); moved++; }
  }
  fs.writeFileSync(CHK, JSON.stringify(db, null, 1) + "\n");
  console.log(`${moved} check hash(es) moved to the line-ending-free form`);
}
