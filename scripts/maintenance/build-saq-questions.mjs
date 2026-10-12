// Questions-only SAQ list -> the standard layout: a bold numbered question, sub-parts as a list. Typos are fixed from a small map and
// personal messages (dedications, Bible verses pasted by a compiler) are dropped.
//   node scripts/maintenance/build-saq-questions.mjs <id-prefix>
import fs from "fs";
import { sb } from "./db.mjs";

const TYPOS = [
  [/\btyes\b/g, "types"], [/\bdagram\b/gi, "diagram"], [/\bEplain\b/g, "Explain"], [/\binhibirs\b/g, "inhibits"], [/\bth major\b/g, "the major"],
  [/sympathetic sympathetic/g, "sympathetic"], [/\btittles\b/g, "titles"], [/\bTranscrition\b/g, "Transcription"], [/\bfromation\b/g, "formation"],
  [/\binflaammatory\b/g, "inflammatory"], [/\bAdreanal\b/g, "Adrenal"], [/\bcholestrol\b/g, "cholesterol"], [/\bcomplimentary\b/g, "complementary"],
  [/\bhemestasis\b/g, "haemostasis"], [/\bhomoedynamism\b/g, "homeodynamism"], [/\bhomoeostasis\b/g, "homeostasis"], [/\bhomoeostasis\b/gi, "homeostasis"],
  [/\bsignalling\b/g, "signaling"], [/\bhomoeo/g, "homeo"], [/(\w),(\w)/g, "$1, $2"], [/\bsensory afferent peripheral nerves\.9\(/g, "sensory afferent peripheral nerves? ("],
  [/,\)/g, ")"], [/\bAmp\b/g, "AMP"], [/\bwhile sparing mammalia cell i vivo\b/g, "while sparing mammalian cells in vivo"], [/ mit$/g, " mitosis"],
];

export function build(text, extra = []) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let skipRest = false;
  for (let raw of lines) {
    if (/^## Original scanned pages/.test(raw)) { skipRest = true; }
    if (skipRest) { out.push(raw); continue; }
    if (/GOD|Isaiah|Jacob|Israel|redeemed|conqueror|distinctions|Savior|Cush/i.test(raw) && !/^\s*\d+\./.test(raw)) continue; // dedication and verse
    let l = raw;
    for (const [re, to] of [...TYPOS, ...extra]) l = l.replace(re, to);
    const q = l.match(/^(\d+)\.\s+(.+)$/);
    const part = l.match(/^\(([a-z])\)\s*(.+)$/);
    if (q) out.push("", `**${q[1]}. ${q[2].trim()}**`, "");
    else if (part) out.push(`- (${part[1]}) ${part[2].trim()}`);
    else out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

if (process.argv[1].endsWith("build-saq-questions.mjs") && process.argv[2]) {
  const prefix = process.argv[2];
  const { data: ids } = await sb.from("articles").select("id").order("id").range(0, 2000);
  const id = ids.find((r) => r.id.startsWith(prefix))?.id;
  const { data: x } = await sb.from("articles").select("id,title,content").eq("id", id).single();
  let t = build(x.content);
  fs.mkdirSync("content-fixes", { recursive: true });
  fs.writeFileSync(`content-fixes/${prefix}.md`, t);
  console.log(x.title, "|", (t.match(/^\*\*\d+\./gm) || []).length, "questions");
}
