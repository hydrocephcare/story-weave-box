// Removes personal details that were copied into notes from scanned scripts or handouts: a student's name and registration number,
// and the private phone numbers or email addresses of individuals. It writes the cleaned posts to content-fixes/ (it never touches the database
// itself); apply-fixes.mjs then writes them. Run it first, because it starts from the live text.
//
//   node scripts/maintenance/redact-private.mjs
import fs from "fs";
import { sb } from "./db.mjs";

const PATTERNS = [
  // "Surname: **X** Other names **Y**" and "Reg. No. ..." header lines of a student's script
  [/^.*\bSurname\b[:\s*]+(?!_{2,}).*$/gim, ""],
  [/^.*\bOther names\b[:\s*]+(?!_{2,}).*$/gim, ""],
  [/^\W*\**Reg(istration)?\.? ?No\.?\**\W*[A-Z]{1,4}\/?\d{2,4}\/[\d.]{2,6}(\/\d{4})?.*$/gim, ""],
  [/\bReg(istration)?\.? ?No\.?\**:?\**\s*BMS\/\d{4}\/[\d.]+/gi, ""],
  // private contacts
  [/\b[\w.+-]+@(?:[\w-]+\.)*mku\.ac\.ke\b/gi, "(email removed)"],
  [/(?<![\d/])(?:\+?254|0)7\d{8}\b/g, "(number removed)"],
];

export function redact(text) {
  let t = text;
  for (const [re, to] of PATTERNS) t = t.replace(re, to);
  return t === text ? text : t.replace(/\n{3,}/g, "\n\n");
}

const out = [];
for (let from = 0; ; from += 100) {
  const { data, error } = await sb.from("articles").select("id,title,content,category").order("created_at", { ascending: false }).range(from, from + 99);
  if (error) throw error;
  out.push(...data);
  if (data.length < 100) break;
}
fs.mkdirSync("content-fixes", { recursive: true });
let n = 0;
for (const x of out) {
  const next = redact(x.content || "");
  if (next === x.content) continue;
  // if a post already has a finished version waiting in content-fixes, redact that one instead
  const file = `content-fixes/${x.id.slice(0, 8)}.md`;
  const base = fs.existsSync(file) ? redact(fs.readFileSync(file, "utf8")) : next;
  fs.writeFileSync(file, base);
  n++;
  console.log(x.id.slice(0, 8), x.category?.slice(0, 18), "|", x.title.slice(0, 50));
}
console.log(n, "posts cleaned of personal details; written to content-fixes/");
