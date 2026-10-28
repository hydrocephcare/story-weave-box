// Evens out where the right answers sit in the practice MCQs of the static study notes (src/content/notes), with the same rules as the database banks
// (supabase/functions/_shared/mcqPositions.js): options are moved, the right answer never changes, and questions whose order means something
// ("all of the above", ordered values, an explanation that names a letter) stay as written. Each note is one bank.
//   node scripts/maintenance/balance-note-mcqs.mjs          report what would change (counts only)
//   node scripts/maintenance/balance-note-mcqs.mjs --write  rewrite the notes
// Formats handled: options on one line ("A. x · **B. y** · C. z") or one per line ("A. x", "- A. x"), then an answer line ("*Answer: B.*", "**Answer: B. text**",
// "**Answer**: B. text", "Answer: B"), optionally followed by an explanation.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { auditBank, balanceBank, validateBankChange } from "../../supabase/functions/_shared/mcqPositions.js";

const DIR = "src/content/notes";
const WRITE = process.argv.includes("--write");
const LETTERS = "ABCDE";
const OPTION = /^(\s*(?:[-*]\s+)?\**)([A-E])([.)]\s+)(.*)$/;          // lead (bullet, bold), letter, separator, rest
const ANSWER = /^(\s*\**\(?\s*Answer\**\s*:?\s*\**\s*\(?)([A-Ea-e])(?![A-Za-z])(.*)$/;
const plain = (t) => t.replace(/\*\*/g, "").replace(/\s+$/, "").trim();

/** The questions of one note: where their option lines and answer line are, and the question as data. */
function parseNote(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ANSWER);
    if (!m) continue;
    // options: the nearest option block above the answer line (blank lines allowed in between)
    let j = i - 1;
    while (j >= 0 && !lines[j].trim()) j--;
    let slots = [];
    if (j >= 0 && / · /.test(lines[j]) && OPTION.test(lines[j].split(" · ")[0])) {
      slots = lines[j].split(" · ").map((seg, k) => ({ line: j, seg: k }));
    } else {
      let k = j;
      while (k >= 0 && OPTION.test(lines[k])) k--;
      for (let x = k + 1; x <= j; x++) slots.push({ line: x, seg: -1 });
    }
    if (slots.length < 3 || slots.length > 5) continue;
    const parts = slots.map((s) => (s.seg >= 0 ? lines[s.line].split(" · ")[s.seg] : lines[s.line]).match(OPTION));
    if (parts.some((p) => !p) || parts.map((p) => p[2]).join("") !== LETTERS.slice(0, parts.length)) continue;
    const key = LETTERS.indexOf(m[2].toUpperCase());
    if (key < 0 || key >= parts.length) continue;
    const top = slots[0].line;
    let s = top - 1;
    while (s >= 0 && !lines[s].trim()) s--;
    const stem = s >= 0 ? plain(lines[s]) : "";
    let e = i + 1;
    const explanation = [m[3]];
    while (e < lines.length && lines[e].trim() && !ANSWER.test(lines[e]) && !/^#{1,6}\s|^\*\*\d+\.|^\d+\.\s/.test(lines[e])) explanation.push(lines[e++]);
    found.push({
      slots, answerLine: i,
      q: { question: stem, options: parts.map((p) => plain(p[4])), correct_answer: key, explanation: plain(explanation.join(" ").replace(/^[.:\s]*/, "")) },
    });
  }
  return found;
}

/** Puts the options of one question in the new order: each slot keeps its letter, the option text (and its bold marks) moves. */
function rewrite(lines, item, before, after) {
  const order = after.options.map((t) => before.options.indexOf(t));
  const pieces = item.slots.map((s) => (s.seg >= 0 ? lines[s.line].split(" · ")[s.seg] : lines[s.line]).match(OPTION));
  const moved = item.slots.map((s, k) => { const src = pieces[order[k]]; return `${src[1]}${pieces[k][2]}${src[3]}${src[4]}`; });
  const byLine = new Map();
  item.slots.forEach((s, k) => {
    if (s.seg < 0) { lines[s.line] = moved[k]; return; }
    if (!byLine.has(s.line)) byLine.set(s.line, lines[s.line].split(" · "));
    byLine.get(s.line)[s.seg] = moved[k];
  });
  for (const [ln, segs] of byLine) lines[ln] = segs.join(" · ");
  lines[item.answerLine] = lines[item.answerLine].replace(ANSWER, (_, a, letter, rest) => `${a}${letter === letter.toLowerCase() ? LETTERS[after.correct_answer].toLowerCase() : LETTERS[after.correct_answer]}${rest}`);
}

// A note's "AI cross-checked" mark is tied to a hash of its text (scripts/imed/sync-check-marks.mjs). Moving options changes no fact and every answer is
// re-checked below, so a note whose mark matched its text before the move keeps it: its stored hash is moved on to the new text.
const CHECKS = "src/data/contentChecks.json";
const checks = fs.existsSync(CHECKS) ? JSON.parse(fs.readFileSync(CHECKS, "utf8")) : { notes: {} };
const registry = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
const slugOf = new Map((Array.isArray(registry) ? registry : registry.notes ?? Object.values(registry)).filter((n) => n.file).map((n) => [path.basename(n.file), n.slug]));
const hash = (t) => crypto.createHash("sha1").update(t.split("\r").join("")).digest("hex").slice(0, 12);
let marksKept = 0;

const totals = { before: [0, 0, 0, 0, 0], after: [0, 0, 0, 0, 0] };
let questions = 0, moved = 0, files = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md")).sort()) {
  const file = path.join(DIR, f);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const items = parseNote(lines);
  if (!items.length) continue;
  const qs = items.map((x) => x.q);
  // every note is evened out (the notes as a whole leant heavily on B); with only five or so questions a note, the odd one out goes to a random
  // letter rather than the most used one, so the notes together come out even too
  const { questions: next, moves, before, after } = balanceBank(qs, { seed: f, force: true, spreadExtras: true });
  const problems = validateBankChange(qs, next);
  if (problems.length) { console.error(`${f}: not changed (${problems.join("; ")})`); continue; }
  before.counts.forEach((c, p) => { totals.before[p] += c; });
  after.counts.forEach((c, p) => { totals.after[p] += c; });
  questions += qs.length; moved += moves.length; files++;
  if (moves.length) {
    for (const mv of moves) rewrite(lines, items[mv.index], qs[mv.index], next[mv.index]);
    // read the rewritten note back and check every answer still points at the same option
    const check = parseNote(lines).map((x) => x.q);
    const same = check.length === qs.length && check.every((q, i) => q.options[q.correct_answer] === qs[i].options[qs[i].correct_answer]);
    if (!same) { console.error(`${f}: re-read check failed, not written`); continue; }
    const text = crlf ? lines.join("\n").replace(/\n/g, "\r\n") : lines.join("\n");
    const c = checks.notes?.[slugOf.get(f)];
    if (c?.hash && c.hash === hash(raw)) { c.hash = hash(text); marksKept++; }
    if (WRITE) fs.writeFileSync(file, text);
  }
  console.log(`${f.padEnd(70)} ${String(qs.length).padStart(3)} questions, ${String(moves.length).padStart(2)} ${WRITE ? "moved" : "would move"}, A..E ${before.counts.join("/")} -> ${after.counts.join("/")}${auditBank(next).issues.length ? ` (${auditBank(next).issues.join(", ")})` : ""}`);
}
if (WRITE && marksKept) fs.writeFileSync(CHECKS, JSON.stringify(checks, null, 1) + "\n");
const pct = (arr) => arr.map((c, p) => `${LETTERS[p]} ${Math.round((c / Math.max(1, questions)) * 1000) / 10}%`).join("  ");
console.log(`\n${files} notes, ${questions} questions; ${moved} ${WRITE ? "moved" : "would move"}; ${marksKept} cross-checked mark(s) carried over.\nBefore: ${pct(totals.before)}\nAfter:  ${pct(totals.after)}`);
