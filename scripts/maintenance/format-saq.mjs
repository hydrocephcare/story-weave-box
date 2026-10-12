// Gives short-answer (SAQ) posts the layout the site is built to show: a numbered question in large type, and the answer behind a "Reveal answer" button.
// It also joins sentences that were split across paragraphs and turns pasted bullets into list items. It adds no medical content.
//
//   node scripts/maintenance/format-saq.mjs <id-prefix> [--apply]     one post (dry run unless --apply)
import fs from "fs";
import { FIXES } from "./saq-fixes.mjs";
import { sb } from "./db.mjs";

/** "carrier and\n\ntraverse the cell" -> one paragraph. Only joins when the next paragraph clearly continues the sentence. */
export const i0 = (out) => out.length >= 0;
function joinBroken(text) {
  const paras = text.split(/\n{2,}/);
  const out = [];
  for (const p of paras) {
    const prev = out[out.length - 1];
    const startsLower = /^[a-z(]/.test(p.trim());
    const prevOpen = prev && !/[.?!:;)"”*|]\s*$/.test(prev.trim()) && !/^(#|\||- |•|\*\*\d|---)/.test(prev.trim().split("\n").pop());
    if (prev && startsLower && prevOpen && !/^\s*[-•]/.test(p)) out[out.length - 1] = `${prev.trim()} ${p.trim()}`;
    else out.push(p);
  }
  return out.join("\n\n");
}

export function formatSaq(text) {
  let t = text.replace(/\r\n/g, "\n").replace(/^\s*[•▪]\s+/gm, "- ");
  // pasted indentation would turn into code blocks, and "Term ---- meaning" lines become tidy list items
  t = t.split("\n").map((l) => l.trim()).join("\n");
  t = t.replace(/^([A-Za-z][\w ,'’()/]{1,35}?)\s*-{2,}\s*(\S.*)$/gm, "- **$1:** $2");
  // a sentence broken by a single line break
  const joined = [];
  for (const l of t.split("\n")) {
    const prev = joined[joined.length - 1];
    if (prev && l && /^[a-z(]/.test(l) && !/[.?!:;)*|]$/.test(prev) && prev.length > 20 && !/^(#|\||- |\d+[.)] |\*\*)/.test(prev)) joined[joined.length - 1] = `${prev} ${l}`;
    else joined.push(l);
  }
  t = joined.join("\n");
  t = joinBroken(t);
  // a wrapped bullet: "- text in the\n\nreceptor ..." is handled by joinBroken; now a bullet list should be tight
  t = t.replace(/(^- .+)\n\n(?=- )/gm, "$1\n");
  const lines = t.split("\n");
  const out = [];
  let inAnswer = false;
  let count = 0, noAnswer = 0, last = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bold = line.match(/^\*\*(\d+)\.\*\*\s*(.+)$/) || line.match(/^\*\*(\d+)\.\s+(.+?)\*\*$/);
    // an unbolded "22) text" or "18. text" is a stem only when its number is higher than the last stem (numbered sub-points inside an answer restart at 1)
    const plain = bold ? null : line.match(/^(\d+)[.)]\s+(\S.*)$/);
    const q = bold || (plain && Number(plain[1]) > last ? plain : null);
    const STEM_VERB = /^[.\s]*(describe|discuss|explain|list|state|define|write|compare|distinguish|briefly|outline|with|name|differentiate|give|mention|enumerate|illustrate|identify|in an|what|how|why|using|draw|classify|enumerate|justify|account|critically|evaluate|summari[sz]e|elaborate|comment|differences?)/i;
    if (q && (q[2].replace(/\*/g, "").trim().length >= 55 || /[?:]\**$/.test(q[2].trim()) || STEM_VERB.test(q[2].replace(/\*/g, "")))) {
      last = Number(q[1]);
      count++;
      out.push(`**${q[1]}. ${q[2].trim()}**`, "");
      // find the first non-empty line after the stem
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const hasBody = j < lines.length && !/^(\*\*\d+\.|---|#{1,3} )/.test(lines[j].trim());
      if (hasBody) {
        // the answer opens with a label, on the same line as its first text
        const first = lines[j].trim();
        lines[j] = /^(\*\*)?(model )?answer/i.test(first) ? lines[j] : /^(\||- |\d+[.)] )/.test(first) ? `**Model answer:**\n\n${lines[j]}` : `**Model answer:** ${first}`;
        i = j - 1;
      } else noAnswer++;
      inAnswer = hasBody;
      continue;
    }
    out.push(q ? `${q[1]}. ${q[2].replace(/\*/g, "").trim()}` : line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", count, noAnswer };
}

if (process.argv[1].endsWith("format-saq.mjs") && process.argv[2]) {
  const apply = process.argv.includes("--apply");
  const { data: ids } = await sb.from("articles").select("id").order("id").range(0, 2000);
  for (const prefix of process.argv[2].split(",")) {
  const id = ids.find((r) => r.id.startsWith(prefix))?.id;
  if (!id) { console.log(prefix, "not found"); continue; }
  const { data: x } = await sb.from("articles").select("id,title,content").eq("id", id).single();
  const r = formatSaq(x.content);
  for (const [from, to] of FIXES[x.id.slice(0, 8)] ?? []) { if (typeof from === "string" ? !r.text.includes(from) : !from.test(r.text)) console.log("fix not applied:", String(from).slice(0, 50)); r.text = r.text.replace(from, to); }
  console.log(x.title, "|", r.count, "questions,", r.noAnswer, "without an answer |", x.content.length, "->", r.text.length);
  fs.writeFileSync(`preview-${x.id.slice(0, 8)}.md`, r.text);
  if (apply) {
    fs.writeFileSync(`articles-backup-saq-${x.id.slice(0, 8)}.json`, JSON.stringify({ [x.id]: x.content }));
    const { data, error } = await sb.from("articles").update({ content: r.text }).eq("id", x.id).select("id");
    console.log(error ? `ERR ${error.message}` : data?.length ? "updated" : "NOT updated (blocked)");
  }
  }
}
