// Spreads the correct answers of the practice MCQs in the study notes across A to E, so the key never repeats the same letter twice running
// and is not always the longest or the last option. Questions whose options refer to each other ("all of the above", "A and C") are left alone.
//   node scripts/maintenance/balance-note-mcqs.mjs          report what would change
//   node scripts/maintenance/balance-note-mcqs.mjs --write  rewrite the notes
// Format handled: a bold stem line "**1.** ...", an options line "A. x · B. **y** · C. z", then "*Answer: B. why*".
import fs from "node:fs";
import path from "node:path";

const DIR = "src/content/notes";
const WRITE = process.argv.includes("--write");
const POSITIONAL = /\b(all|none|neither|both)\b.*\b(above|of the)\b|\b[A-E]\s*(and|&|,)\s*[A-E]\b/i;

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function processFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length - 2; i++) {
    const opt = lines[i + 1], ans = lines[i + 2];
    if (!/^\*\*\d+\.\*\*|^\*\*\d+\./.test(lines[i]) && !/^\*\*\d+\./.test(lines[i])) { /* stems may also be plain */ }
    if (!/^\s*\*?\*?A\.\s/.test(opt) || !/ · /.test(opt) || !/^\*Answer:\s*([A-E])\b/.test(ans)) continue;
    const parts = opt.split(" · ").map((p) => p.trim());
    if (parts.length < 3 || parts.length > 5) continue;
    const parsed = parts.map((p) => { const bold = /\*\*/.test(p); const m = p.replace(/\*\*/g, "").match(/^([A-E])\.\s*(.*)$/); return m ? { letter: m[1], text: m[2].trim(), bold } : null; });
    if (parsed.some((x) => !x)) continue;
    const letters = parsed.map((x) => x.letter).join("");
    if (letters !== "ABCDE".slice(0, parsed.length)) continue;
    const key = ans.match(/^\*Answer:\s*([A-E])\b/)[1];
    const keyIdx = key.charCodeAt(0) - 65;
    if (keyIdx >= parsed.length) continue;
    if (parsed.some((x) => POSITIONAL.test(x.text))) continue;
    if (/\b(option|choice)s?\s+[A-E]\b|\b[A-E]\s+is\s+(correct|wrong)\b/i.test(ans)) continue;
    blocks.push({ at: i + 1, ans: i + 2, parsed, keyIdx });
    i += 2;
  }
  if (!blocks.length) return null;
  const counts = new Array(5).fill(0);
  let prev = -1; let changed = 0;
  blocks.forEach((b, n) => {
    const size = b.parsed.length;
    const candidates = [...Array(size).keys()].filter((p) => p !== prev);
    const min = Math.min(...candidates.map((p) => counts[p]));
    const best = candidates.filter((p) => counts[p] === min);
    const target = best[hash(`${file}:${n}`) % best.length];
    counts[target]++; prev = target;
    if (target === b.keyIdx) return;
    const correct = b.parsed[b.keyIdx];
    const others = b.parsed.filter((_, i) => i !== b.keyIdx);
    const order = []; let o = 0;
    for (let p = 0; p < size; p++) order.push(p === target ? correct : others[o++]);
    lines[b.at] = order.map((x, p) => (x === correct ? `**${String.fromCharCode(65 + p)}. ${x.text}**` : `${String.fromCharCode(65 + p)}. ${x.text}`)).join(" · ");
    lines[b.ans] = lines[b.ans].replace(/^\*Answer:\s*[A-E]\b/, `*Answer: ${String.fromCharCode(65 + target)}`);
    changed++;
  });
  const out = lines.join("\n");
  if (WRITE && changed) fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
  return { questions: blocks.length, changed, spread: counts.slice(0, 5).join("/") };
}

let total = 0, moved = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
  const r = processFile(path.join(DIR, f));
  if (r) { total += r.questions; moved += r.changed; console.log(f.padEnd(70), `${r.questions} questions, ${r.changed} moved, answers A..E = ${r.spread}`); }
}
console.log(`${total} questions found, ${moved} ${WRITE ? "rewritten" : "would move"}.`);
