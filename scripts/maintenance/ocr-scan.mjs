// Scores text for OCR / copy-paste mess. Usage: node ocr-scan.mjs <fresh.json | notesdir> [min]
import fs from "fs";
import path from "path";

export function score(text) {
  const t = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/https?:\/\/\S+/g, "");
  const lines = t.split(/\r?\n/);
  const body = lines.filter((l) => l.trim());
  const reasons = {};
  const add = (k, n) => { if (n > 0) reasons[k] = n; };
  add("garbage-chars", (t.match(/[�■□▪◼¬¦]|ﬁ|ﬂ|­/g) || []).length);
  add("digit-in-word", (t.match(/\b[a-z]{3,}[0-9][a-z]{3,}\b/g) || []).length);
  add("hyphen-wrap", (t.match(/[a-z]-\r?\n[a-z]/g) || []).length);
  add("source-page", (t.match(/^\s*(source page|page \d+( of \d+)?|slide \d+|scanned|camscanner|cam ?scanner|www\.[a-z0-9.-]+)\b.*$/gim) || []).length);
  // hard-wrapped prose: line ends without punctuation and next line starts lowercase
  let wrap = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i].trim(), b = lines[i + 1].trim();
    if (a.length > 30 && a.length < 110 && /[a-z,]$/.test(a) && /^[a-z]/.test(b) && !/^[a-e][.)]\s/i.test(b) && !/^[-*#>|]/.test(a) && !/^[a-e][.)]\s/i.test(a)) wrap++;
  }
  add("hard-wrap", wrap > 5 ? wrap : 0);
  const short = body.filter((l) => l.trim().length <= 3 && !/^[-*#>|A-E.\d)]+$/i.test(l.trim())).length;
  add("tiny-lines", short > 6 ? short : 0);
  add("odd-spacing", (t.match(/\b[a-z] [a-z] [a-z] [a-z]\b/g) || []).length);
  add("spaced-punct", (t.match(/ [,.;:] [a-z]/g) || []).length > 8 ? (t.match(/ [,.;:] [a-z]/g) || []).length : 0);
  add("ai-chat", (t.match(/^(got it|sure|certainly|here (is|are)|of course)\b.*$/gim) || []).length);
  add("latex", (t.match(/\\\(|\\\[|\\frac|\$\$/g) || []).length);
  add("dup-lines", (() => { const m = new Map(); for (const l of body) { const k = l.trim(); if (k.length > 40) m.set(k, (m.get(k) || 0) + 1); } return [...m.values()].filter((n) => n > 2).length; })());
  const total = Object.values(reasons).reduce((a, b) => a + b, 0);
  return { total, reasons };
}

if (process.argv[1].endsWith("ocr-scan.mjs")) {
  const src = process.argv[2];
  const min = Number(process.argv[3] || 8);
  let items = [];
  if (fs.statSync(src).isDirectory()) {
    for (const f of fs.readdirSync(src)) if (f.endsWith(".md")) items.push({ id: f, title: f, text: fs.readFileSync(path.join(src, f), "utf8") });
  } else {
    items = JSON.parse(fs.readFileSync(src, "utf8")).map((a) => ({ id: a.id.slice(0, 8), title: `${a.category} | ${a.title}`, text: a.content || "" }));
  }
  const res = items.map((i) => ({ ...i, ...score(i.text) })).filter((r) => r.total >= min).sort((a, b) => b.total - a.total);
  console.log(`${items.length} scanned, ${res.length} at or over ${min}`);
  for (const r of res.slice(0, 80)) console.log(r.total, r.id, r.title.slice(0, 80), JSON.stringify(r.reasons));
}
