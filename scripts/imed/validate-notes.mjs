// A second AI cross-checks the notes and records the result in src/data/contentChecks.json. A note whose check finds nothing serious gets the
// "AI cross-checked" mark on its page; the others are listed for the admin (Admin > Content checks) with what is wrong and the suggested fix.
//   node scripts/imed/validate-notes.mjs [count] [--slug=ascites-sbp] [--force]
// Notes are checked again whenever their text changes. Unchecked and changed notes come first. Stops by itself after 3 failures in a row (out of credits).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";

const OUT = "src/data/contentChecks.json";
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 6);
const only = (process.argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1];
const force = process.argv.includes("--force");
const local = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, local(".gemini-keys.local")].filter(Boolean).join(","), GROQ_API_KEYS: [process.env.GROQ_API_KEYS, local(".groq-keys.local")].filter(Boolean).join(",") };
if (!env.GEMINI_API_KEYS && !env.GROQ_API_KEYS) { console.log("No AI keys set: nothing to do."); process.exit(0); }

const registry = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
const list = (Array.isArray(registry) ? registry : registry.notes ?? Object.values(registry)).filter((n) => n.file && fs.existsSync(n.file));
const db = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { notes: {}, topics: {} };
db.notes ??= {}; db.topics ??= {};
const hash = (t) => crypto.createHash("sha1").update(t).digest("hex").slice(0, 12);

const todo = list.filter((n) => !only || n.slug === only)
  .map((n) => { const text = fs.readFileSync(n.file, "utf8"); return { n, text, h: hash(text) }; })
  .filter((x) => force || only || db.notes[x.n.slug]?.hash !== x.h)
  .sort((a, b) => Number(Boolean(db.notes[a.n.slug])) - Number(Boolean(db.notes[b.n.slug])))
  .slice(0, COUNT);
console.log(`${todo.length} note(s) to check.`);

let misses = 0, done = 0;
for (const { n, text, h } of todo) {
  try {
    const r = await checkContent({ title: n.title, kind: "study note", text: text.replace(/^---[\s\S]*?---\n/, ""), env });
    db.notes[n.slug] = { hash: h, ...r };
    fs.writeFileSync(OUT, JSON.stringify(db, null, 1) + "\n");
    done++; misses = 0;
    console.log(`${r.validated ? "checked, no serious issue" : "ISSUES"}  ${n.slug}  (high ${r.high}, medium ${r.medium})`);
  } catch (e) {
    console.log(`failed ${n.slug}: ${e.message}`);
    if (++misses >= 3) { console.log("Three failures in a row: the AI keys are probably out of credits. Stopping."); break; }
  }
}
console.log(`${done} note(s) checked.`);

execSync("node scripts/imed/sync-check-marks.mjs", { stdio: "inherit" });
