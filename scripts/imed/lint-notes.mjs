// Checks every note for the faults found in the Ascites note, and (with --fix) repairs the ones that are safe to repair by machine.
//   node scripts/imed/lint-notes.mjs            report only
//   node scripts/imed/lint-notes.mjs --fix      also rewrite the files
// Checked: the title line matches the note's title; tables are used only for differentials, investigations and comparisons (everything else
// becomes bullets) and none is longer than 9 rows; stray ** marks; practice answers that do not match their option; a ">" and a "≥" for the same
// threshold; an IMED note without "Tricky questions examiners ask".
import fs from "node:fs";
import path from "node:path";
import { mdToHtml } from "../../src/lib/miniMarkdown.js";

const FIX = process.argv.includes("--fix");
const registry = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
const list = Array.isArray(registry) ? registry : registry.notes ?? Object.values(registry);
const byFile = new Map(list.filter((n) => n.file).map((n) => [path.normalize(n.file), n]));

const TABLE_OK = /differential|investigation|compar|versus|\bvs\b|classification|staging|grading|criteria|score/i;
const MAX_ROWS = 12;
const problems = [];
const note = (file, msg) => problems.push(`${path.basename(file)}: ${msg}`);

/** A markdown table turned into bullets: first column in bold, the rest joined with a dash. */
function tableToBullets(rows) {
  const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  return rows.slice(2).map(cells).filter((r) => r.some(Boolean)).map((r) => {
    const [first, ...rest] = r;
    const body = rest.filter(Boolean).join(" — ");
    const label = first.replace(/\*\*/g, "").trim();
    return label ? `- **${label}**${body ? `: ${body}` : ""}` : `- ${body}`;
  });
}

let files = 0, fixedTables = 0, fixedTitles = 0;
for (const file of fs.readdirSync("src/content/notes").filter((f) => f.endsWith(".md")).map((f) => path.join("src/content/notes", f))) {
  files++;
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const entry = byFile.get(path.normalize(file));
  let changed = false;

  // 1. the title line
  const t = lines.findIndex((l) => l.trim());
  if (entry && t >= 0 && /^#\s/.test(lines[t]) && lines[t].replace(/^#\s+/, "").trim() !== entry.title) {
    note(file, `title line "${lines[t].replace(/^#\s+/, "").trim()}" is not "${entry.title}"`);
    if (FIX) { lines[t] = `# ${entry.title}`; changed = true; fixedTitles++; }
  }

  // 2. tables
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{2,4}\s+(.*)$/);
    if (h) heading = h[1];
    if (/^\s*\|/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      let j = i;
      while (j < lines.length && /^\s*\|/.test(lines[j])) j++;
      const rows = lines.slice(i, j);
      const body = rows.length - 2;
      if (!TABLE_OK.test(heading) || body > MAX_ROWS) {
        note(file, `table under "${heading}" (${body} rows) ${body > MAX_ROWS ? "is too long" : "is not a differential/investigation/comparison"}`);
        if (FIX) { const bullets = tableToBullets(rows); lines.splice(i, j - i, ...bullets); changed = true; fixedTables++; i += bullets.length - 1; continue; }
      }
      i = j - 1;
    }
  }

  // 2a. an empty bold label left by a table with a blank first cell
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[-*]\s+\*{4}:?\s*/.test(lines[i])) { note(file, `line ${i + 1} starts with an empty bold label`); if (FIX) { lines[i] = lines[i].replace(/^(\s*[-*]\s+)\*{4}:?\s*/, "$1"); changed = true; } }
  }

  // 2b. a "<br>" inside a line (left over from a table cell) becomes a nested bullet list
  for (let i = 0; i < lines.length; i++) {
    if (!/<br\s*\/?>/i.test(lines[i]) || /^\s*\|/.test(lines[i])) continue;
    note(file, `line ${i + 1} has a <br> inside it`);
    if (!FIX) continue;
    const m = lines[i].match(/^(\s*)([-*]\s+)(\*\*[^*]+\*\*:?)?\s*(.*)$/);
    const parts = (m ? m[4] : lines[i]).split(/<br\s*\/?>/i).map((p) => p.replace(/^\s*[•·]\s*/, "").trim()).filter(Boolean);
    const indent = m ? m[1] : "";
    const out = m && m[3] ? [`${indent}- ${m[3].replace(/:$/, "")}`, ...parts.map((p) => `${indent}  - ${p}`)] : parts.map((p) => `${indent}- ${p}`);
    lines.splice(i, 1, ...out); i += out.length - 1; changed = true;
  }

  const text = lines.join("\n");
  // 3. raw ** left in the rendered note
  const html = mdToHtml(text, { skipTitle: true, questions: true }).html;
  const stray = html.replace(/<[^>]+>/g, " ").match(/\*\*/g);
  if (stray) note(file, `${stray.length} stray ** mark(s) after rendering`);

  // 4. practice answers that do not match their option text
  const practice = text.split(/^##\s+Practice questions/im)[1] ?? "";
  const qs = practice.split(/^###\s+Question\s+\d+/im).slice(1);
  qs.forEach((q, n) => {
    const opts = Object.fromEntries([...q.matchAll(/^\s*([A-E])\.\s+(.+?)\s*$/gm)].map((m) => [m[1], m[2].replace(/\*\*/g, "").trim()]));
    const a = q.match(/\*{0,2}Answer\*{0,2}\s*:?\s*\*{0,2}\s*([A-E])\.?\s*(.*)/i);
    if (a && Object.keys(opts).length && !opts[a[1]]) note(file, `Question ${n + 1}: answer ${a[1]} is not one of the options`);
    if (!a && Object.keys(opts).length) note(file, `Question ${n + 1}: no answer line`);
  });

  // 4b. a figure that an earlier dose filter wiped out
  if (/the protocol dose\s*\/\s*g|the protocol dose\s*\/\s*dl|<\s*the protocol dose|>\s*the protocol dose/i.test(text)) note(file, "a lab threshold was replaced by 'the protocol dose'");

  // 5. one threshold written two ways
  const gt = /PMN\s*(?:count\s*)?>\s*250/i.test(text), ge = /PMN\s*(?:count\s*)?(?:≥|>=)\s*250/i.test(text);
  if (gt && ge) note(file, "the PMN threshold is written both as > 250 and ≥ 250");

  // 6. the Year 4 notes carry the examiner questions
  if (entry && /year\s*4|imed/i.test(`${entry.year ?? ""} ${entry.series ?? ""} ${entry.unit ?? ""}`) && !/^##\s+Tricky questions examiners ask/im.test(text) && !/^##\s+Practice questions/im.test(text)) note(file, "no 'Tricky questions examiners ask' section");

  if (FIX && changed) fs.writeFileSync(file, crlf ? lines.join("\n").replace(/\n/g, "\r\n") : lines.join("\n"));
}
console.log(problems.join("\n"));
console.log(`\n${files} notes checked, ${problems.length} problem(s)${FIX ? `; fixed ${fixedTables} table(s) and ${fixedTitles} title line(s)` : ""}.`);
