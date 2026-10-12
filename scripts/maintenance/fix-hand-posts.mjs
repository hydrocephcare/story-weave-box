// Rebuilds the five posts that the general cleaner cannot fix, from their own text (nothing is invented):
//   18a1328c  Medical Physiology CAT 2, 2014: the same questions were pasted several times
//   b1acf3c7  Entomology tables: the answers are fine but raw web-page code was pasted after them
//   1b37fa08  Immunology quiz: answer options were glued together on one line
//   c69a56b6  Endocrine MCQs: bullet-list format and the whole set pasted twice
//   32d6141b  Blood transfusion note: no title
//
//   node scripts/maintenance/fix-hand-posts.mjs            dry run, shows a before/after summary
//   node scripts/maintenance/fix-hand-posts.mjs --apply    writes them (old text saved to a backup file first)
import fs from "fs";
import { sb } from "./db.mjs";

const apply = process.argv.includes("--apply");
const squash = (t) => t.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim() + "\n";

/** Same question pasted again: keep the first copy, keep the original numbers. */
function dedupeNumbered(text) {
  const parts = text.split(/\n(?=\d+\.\s)/);
  const seen = new Set();
  const keep = parts.filter((p, i) => {
    if (i === 0) return true;
    const key = p.replace(/^\d+\.\s*\**/, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 160);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return squash(keep.join("\n"));
}

/** Keeps the exam answers, drops pasted CSS/JS, and turns the loose table rows into proper tables with headings. */
function entomology(text) {
  const cut = text.indexOf("Parasitology Tables");
  const head = squash((cut > 0 ? text.slice(0, cut) : text).replace(/^# ## /, "# BMM 3101: Parasitology and Entomology CAT 1\n\n## "));
  const rows = (cut > 0 ? text.slice(cut) : "").split("\n").filter((l) => /^\s*\|/.test(l)).map((l) => l.trim());
  const groups = [];
  for (const r of rows) {
    const cells = r.split("|").slice(1, -1).map((c) => c.trim());
    const isHeader = /^(insecticide|feature|pathogen|sn)$/i.test(cells[0].replace(/\*/g, ""));
    if (isHeader || !groups.length) groups.push({ head: cells, body: [] }); else groups[groups.length - 1].body.push(cells);
  }
  const titles = { insecticide: "Insecticides and their sites of action", feature: "Anopheles, Culex and Aedes compared", pathogen: "Pathogens, vectors, diseases and control", sn: "Parasites and agents, their vectors and diseases" };
  const tables = groups.map((g) => {
    const t = titles[g.head[0].replace(/\*/g, "").toLowerCase()] ?? "Table";
    const line = (c) => `| ${c.join(" | ")} |`;
    return `## ${t}\n\n${line(g.head)}\n|${g.head.map(() => "---").join("|")}|\n${g.body.map(line).join("\n")}\n`;
  });
  return squash(`${head}\n---\n\n# Must-know entomology tables\n\n${tables.join("\n")}`);
}

/** "A. text" + glued "b) text c) text ..." on one line becomes one option per line. */
function immunology(text) {
  return squash(text.split("\n").map((line) => {
    const m = line.match(/^A\.\s*(.*)$/);
    if (!m) return line;
    let rest = m[1];
    const opts = [];
    const letters = ["b", "c", "d", "e", "f"];
    let cur = "A";
    for (const l of letters) {
      const hit = rest.match(new RegExp(`\\s*${l}\\)\\s+|(?<=\\S)${l}\\)\\s*`));
      if (!hit) break;
      opts.push([cur, rest.slice(0, hit.index).trim()]);
      rest = rest.slice(hit.index + hit[0].length).trim();
      cur = l.toUpperCase();
    }
    opts.push([cur, rest.trim()]);
    return opts.map(([k, v]) => `${k}. ${v}`).join("\n");
  }).join("\n"));
}

/** "- **stem:**A) x / - B) y / - **Answer:** C) z" repeated, becomes numbered questions with lettered options, without repeats. */
function endocrine(text) {
  const intro = text.split("\n").find((l) => /multiple-choice questions/i.test(l)) ?? "";
  const blocks = text.split(/\n(?=- \*\*(?!Answer))/).filter((b) => /^- \*\*/.test(b));
  const seen = new Set();
  const out = [];
  for (const b of blocks) {
    const stemM = b.match(/^- \*\*(.+?)\*\*\s*(A\).*)?$/m);
    if (!stemM) continue;
    const stem = stemM[1].replace(/:$/, "").trim() + (/[?]$/.test(stemM[1]) ? "" : ":");
    const key = stem.toLowerCase();
    if (seen.has(key)) continue;
    const opts = [];
    if (stemM[2]) opts.push(stemM[2]);
    for (const l of b.split("\n").slice(1)) { const o = l.match(/^- ([B-F]\).*)$/); if (o) opts.push(o[1]); }
    const ans = b.match(/^- \*\*Answer:\*\*\s*([A-F])\)\s*(.*)$/m);
    if (opts.length < 2 || !ans) continue;
    seen.add(key);
    out.push({ stem, opts, ans });
  }
  const body = out.map((q, i) => `**${i + 1}. ${q.stem}**\n\n${q.opts.map((o) => o.replace(/^([A-F])\)\s*/, "$1. ")).join("\n")}\n\n**Answer: ${q.ans[1]}.** ${q.ans[2]}\n`).join("\n");
  return squash(`# Endocrine and Metabolic Pathology MCQs\n\n${intro.trim()}\n\n${body}`);
}

const JOBS = {
  "18a1328c": { fn: dedupeNumbered },
  "b1acf3c7": { fn: entomology, title: "Entomology Tables and CAT 1: Must-Know Answers" },
  "1b37fa08": { fn: immunology },
  "c69a56b6": { fn: endocrine },
  "32d6141b": { fn: (t) => t, title: "Haematology and Blood Transfusion: Blood Groups, Compatibility Testing and Transfusion Reactions" },
};

const idRows = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await sb.from("articles").select("id").order("id").range(from, from + 499);
  if (error) throw error;
  idRows.push(...data);
  if (data.length < 500) break;
}
const rows = [];
for (const p of Object.keys(JOBS)) {
  const id = idRows.find((r) => r.id.startsWith(p))?.id;
  if (!id) continue;
  const { data, error } = await sb.from("articles").select("id,title,content").eq("id", id).single();
  if (error) throw error;
  rows.push(data);
}
const backup = {};
const file = `articles-backup-hand-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
for (const [p, job] of Object.entries(JOBS)) {
  const x = rows.find((r) => r.id.startsWith(p));
  if (!x) { console.log(p, "not found"); continue; }
  const next = job.fn(x.content);
  console.log(p, x.title.slice(0, 50), "|", x.content.length, "->", next.length, "chars,", (next.match(/^\*\*\d|^\d+\.\s/gm) || []).length, "numbered items", job.title ? "| new title" : "");
  if (!apply) { fs.writeFileSync(`preview-${p}.md`, next); continue; }
  backup[x.id] = x.content;
  fs.writeFileSync(file, JSON.stringify(backup));
  const upd = { content: next, ...(job.title ? { title: job.title } : {}) };
  const { data, error: e } = await sb.from("articles").update(upd).eq("id", x.id).select("id");
  console.log("   ", e ? `ERR ${e.message}` : data?.length ? "updated" : "NOT updated (blocked)");
}
if (apply) console.log(`Old text saved to ${file}.`);
else console.log("Dry run: previews written as preview-<id>.md. Run again with --apply to write them.");
