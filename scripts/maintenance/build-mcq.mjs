// Rebuilds a multiple-choice paper in the site's standard layout and adds the answers from a small key file.
//
//   node scripts/maintenance/build-mcq.mjs <id-prefix> <key-file> [--out dir]
//
// The key file has one answer per line, "<question number> <letter>", for example:   1 D   or   12 b
// Lines starting with # are comments. A question with no entry stays without an answer (it is listed so nothing is hidden).
// The script writes <dir>/<id-prefix>.md (default: content-fixes/). apply-fixes.mjs then writes those files to the database.
import fs from "fs";
import path from "path";
import { sb } from "./db.mjs";

export function parseKey(text) {
  // "[Set 2]" on its own line starts a section: the numbers after it belong to the part of the paper whose heading contains that text
  const key = new Map();
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const sec = line.match(/^\s*\[(.+)\]\s*$/);
    if (sec) { section = sec[1].toLowerCase(); continue; }
    const m = line.match(/^\s*(\d+)\s*[-.:)\s]\s*([A-Ea-e])\b/);
    if (m) key.set(`${section}|${Number(m[1])}`, m[2].toUpperCase());
  }
  return key;
}

function lookup(key, heading, n) {
  const sections = [...new Set([...key.keys()].map((k) => k.split("|")[0]))].filter(Boolean);
  const hit = sections.find((sec) => heading.includes(sec));
  return key.get(`${hit ?? ""}|${n}`) ?? (hit ? undefined : key.get(`|${n}`));
}

const OPT = /^\s*\(?([A-Ea-e])[.)]\s+(.+?)\s*$/;
const STEM = /^\s*(?:\*\*)?(?:Q(?:uestion)?\s*)?(\d+)\s*[.)]?(?:\*\*)?\s*[.)]?\s+(\S.*?)\s*$/i;

/** Walks the post; every numbered stem followed by lettered options becomes a formatted question. Everything else is kept as it was. */
const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
export function unLatex(t) {
  return t
    .replace(/\$([^$\n]+)\$/g, (m, inner) => inner)
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\rightarrow|\\to\b/g, "→")
    .replace(/\\([a-z]+)\b/gi, "$1")
    .replace(/_\{?(\d)\}?/g, (m, d) => SUB[d])
    .replace(/\^\{?\+\}?/g, "⁺")
    .replace(/\^\{?-\}?/g, "⁻");
}

export function buildMcq(text, key) {
  const lines = unLatex(text).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const stats = { questions: 0, answered: 0, missing: [] };
  let i = 0;
  let mcqMode = true;
  let heading = "";
  while (i < lines.length) {
    if (/^(#{1,4}\s|\*{0,2}section\s+[a-d]\b)/i.test(lines[i])) { heading = lines[i].toLowerCase(); if (/attempt any|\d+\s*marks/i.test(lines[i]) && !/multiple|mcq/i.test(lines[i])) mcqMode = false; else if (/multiple|mcq|section a\b/i.test(lines[i])) mcqMode = true; else if (/short answer|essay|saq|laq|section [b-d]\b/i.test(lines[i])) mcqMode = false; }
    const sm = lines[i].match(STEM);
    if (mcqMode && sm && !OPT.test(lines[i])) {
      // look ahead: skip blanks, collect options
      let j = i + 1;
      const stemParts = [sm[2].replace(/\*+$/g, "").trim()];
      while (j < lines.length && lines[j].trim() && !OPT.test(lines[j])) { stemParts.push(lines[j].trim()); j++; }
      while (j < lines.length && !lines[j].trim()) j++;
      const opts = [];
      while (j < lines.length) {
        const om = lines[j].match(OPT);
        if (om && om[1].toUpperCase() === "ABCDE"[opts.length]) { opts.push(om[2]); j++; while (j < lines.length && !lines[j].trim() && j + 1 < lines.length && OPT.test(lines[j + 1] ?? "")) j++; }
        else break;
      }
      const written = opts.some((o) => /\(\s*\d+\s*marks?\s*\)/i.test(o)) || /\(\s*\d+\s*marks?\s*\)/i.test(stemParts.join(" "));
      if (opts.length >= 2 && !written) {
        const n = Number(sm[1]);
        stats.questions++;
        const letter = lookup(key, heading, n);
        out.push(`**${n}. ${stemParts.join(" ")}**`, "", ...opts.map((o, k) => `${"ABCDE"[k]}. ${o}`), "");
        if (letter && "ABCDE".indexOf(letter) < opts.length) { out.push(`**Answer: ${letter}.** ${opts["ABCDE".indexOf(letter)]}`, ""); stats.answered++; }
        else stats.missing.push(n);
        i = j;
        continue;
      }
    }
    out.push(lines[i]);
    i++;
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", stats };
}

if (process.argv[1].endsWith("build-mcq.mjs") && process.argv[2] && process.argv[3]) {
  const prefix = process.argv[2];
  const outDir = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "content-fixes";
  const key = parseKey(fs.readFileSync(process.argv[3], "utf8"));
  const { data: ids } = await sb.from("articles").select("id").order("id").range(0, 2000);
  const id = ids.find((r) => r.id.startsWith(prefix))?.id;
  const { data: x } = await sb.from("articles").select("id,title,content").eq("id", id).single();
  const r = buildMcq(x.content, key);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${prefix}.md`), r.text);
  console.log(x.title, "|", r.stats.questions, "questions,", r.stats.answered, "answered; no answer for:", r.stats.missing.join(",") || "none");
}
