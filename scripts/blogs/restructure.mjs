// Gives the blogs a clear structure: headings, short paragraphs, lists, without changing a single fact. Year 3 first, then Year 2, then Year 1.
// The original stays in the database untouched. The tidied text is saved as public/blog-fixes/<id>.md and the site shows it in its place
// (src/lib/blogFix.ts), so removing a file puts the original back.
//   node scripts/blogs/restructure.mjs [count] [--force]      (does nothing before BLOG_FIX_START, default 2026-11-01, unless --force)
import fs from "node:fs";
import path from "node:path";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const DIR = "public/blog-fixes";
const START = process.env.BLOG_FIX_START || "2026-11-01";
const yi = process.argv.indexOf("--year");
const ONLY_YEAR = yi >= 0 ? Number(process.argv[yi + 1]) : 0; // --year 2: only that year's notes
const COUNT = Number(process.argv.find((a, i) => /^\d+$/.test(a) && i !== yi + 1) || 12);
const FORCE = process.argv.includes("--force");
if (!FORCE && new Date() < new Date(START)) { console.log(`Blog tidy-up starts on ${START}. Nothing to do yet.`); process.exit(0); }

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GROQ_API_KEYS: [process.env.GROQ_API_KEYS, read(".groq-keys.local")].filter(Boolean).join(","), GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, read(".gemini-keys.local")].filter(Boolean).join(",") };
if (!env.GROQ_API_KEYS && !env.GEMINI_API_KEYS) { console.log("No AI keys: nothing to do."); process.exit(0); }
const SB = "https://lkgfzjwhmfjvntzphbsh.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZ2Z6andobWZqdm50enBoYnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Nzk5MjIsImV4cCI6MjA4NzM1NTkyMn0.a2QY6TxzKNM2AhuuoDkgdKifI3XhSGhYRlhpqZpvAwo";

fs.mkdirSync(DIR, { recursive: true });
const indexFile = path.join(DIR, "index.json");
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : {};
const skippedFile = path.join(DIR, "_skipped.json");
const skipped = fs.existsSync(skippedFile) ? JSON.parse(fs.readFileSync(skippedFile, "utf8")) : {};

// everything published for the years, in the order they are tidied
const all = [];
for (let from = 0; from < 3000; from += 200) {
  const r = await fetch(`${SB}/rest/v1/articles?select=id,slug,title,category,content&published=eq.true&deleted_at=is.null&order=created_at.asc&offset=${from}&limit=200`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) break;
  const rows = await r.json(); all.push(...rows);
  if (rows.length < 200) break;
}
const yearOf = (c) => Number(String(c || "").match(/^Year\s*(\d)/i)?.[1] ?? 0);
const isBank = (a) => (a.content.match(/^(?:#{1,4}\s*)?\**Question\s+\d+/gim) ?? []).length >= 5 || /past paper|questions? (&|and) answers?|\bmcqs?\b|\bsaqs?\b|\bcat\b|\bexam\b|\bquiz\b/i.test(a.title);
const text = (c) => c.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const queue = all
  .filter((a) => (ONLY_YEAR ? yearOf(a.category) === ONLY_YEAR : [3, 2, 1].includes(yearOf(a.category))) && !index[a.id] && !skipped[a.id])
  .sort((a, b) => [0, 3, 2, 1].indexOf(yearOf(a.category)) - [0, 3, 2, 1].indexOf(yearOf(b.category)));
console.log(`${queue.length} blogs still to tidy (Year 3, then 2, then 1); doing up to ${COUNT}.`);

const PROMPT = (a) => `You are tidying the layout of a medical study note. Change ONLY the structure and wording flow, never the medicine.
Title: "${a.title}" (${a.category}).

Rules:
1. Copy the text word for word. Do not reword, shorten, summarise, merge or drop any sentence, fact, number, unit, drug name or abbreviation, and keep every picture line (a line starting with ![ ) exactly. Do not add anything new. Only the layout changes: headings, line breaks, lists.
2. Split the text into clear sections with "## " headings (a short, plain heading for each; 3 to 9 of them). Use "### " only for a real sub-section.
3. Paragraphs of at most three sentences. Turn lists and sequences into bullet lists ("- ") or numbered lists. Put a comparison into a table only if the original already compared things.
4. Bold ("**") only the few key terms a student must remember, never more than two in a paragraph.
5. Remove only chat leftovers ("Got it, here are the notes"), page markers and stray symbols. Keep everything else, even if a line repeats.
6. Output ONLY the finished markdown, no commentary, no code fences.

NOTE:
"""
${a.content}
"""`;

// the tidied text must still say what the original said
function sound(original, out) {
  const nums = [...new Set((text(original).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.length >= 2))];
  const keptNums = nums.filter((n) => out.includes(n)).length;
  if (nums.length >= 5 && keptNums / nums.length < 0.92) return `numbers lost (${keptNums}/${nums.length})`;
  const words = [...new Set(text(original).toLowerCase().match(/[a-z]{7,}/g) ?? [])];
  const o = out.toLowerCase();
  const kept = words.filter((w) => o.includes(w)).length;
  if (words.length >= 20 && kept / words.length < 0.88) return `words lost (${kept}/${words.length})`;
  const ratio = text(out).length / Math.max(1, text(original).length);
  if (ratio < 0.7 || ratio > 1.3) return `length changed (${ratio.toFixed(2)})`;
  if ((out.match(/^##\s/gm) ?? []).length < 2) return "no headings";
  const pics = (original.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
  if (pics && (out.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length < pics) return "pictures lost";
  return "";
}

async function ask(prompt) {
  if (env.GROQ_API_KEYS) { try { return await askModel(prompt, { env: { GROQ_API_KEYS: env.GROQ_API_KEYS }, timeoutMs: 60000, maxTokens: 7000, plain: true }); } catch { /* try Gemini */ } }
  return askModel(prompt, { env, timeoutMs: 60000, maxTokens: 7000, plain: true });
}

let done = 0, rejected = 0, tried = 0;
for (const a of queue) {
  if (tried >= COUNT) break;
  if (isBank(a)) { skipped[a.id] = "question bank or paper: keeps its own format"; continue; }
  if (text(a.content).length < 700) { skipped[a.id] = "too short"; continue; }
  if (a.content.length > 15000) { skipped[a.id] = "too long to tidy in one go"; continue; }
  if ((a.content.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length >= 3 && text(a.content).length < 1200) { skipped[a.id] = "mostly pictures"; continue; }
  tried++;
  try {
    const { text: out0 } = await ask(PROMPT(a));
    const out = out0.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
    const why = sound(a.content, out);
    if (why) { rejected++; console.log(`kept as it was: ${a.title.slice(0, 60)} (${why})`); skipped[a.id] = `tidy rejected: ${why}`; continue; }
    fs.writeFileSync(path.join(DIR, `${a.id}.md`), out + "\n");
    index[a.id] = new Date().toISOString().slice(0, 10);
    done++;
    console.log(`tidied: ${a.title.slice(0, 70)}`);
  } catch (e) { console.log(`failed: ${a.title.slice(0, 60)} (${String(e.message).slice(0, 60)})`); }
}
fs.writeFileSync(indexFile, JSON.stringify(index));
fs.writeFileSync(skippedFile, JSON.stringify(skipped, null, 1));
console.log(`finished: ${done} tidied, ${rejected} left as they were, ${Object.keys(index).length} done in total.`);
