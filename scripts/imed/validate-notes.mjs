// Automatically check, correct and re-check flagged study notes. Unresolved notes remain queued for the next run.
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const OUT = "src/data/contentChecks.json";
const COUNT = Math.max(1, Math.min(40, Number(process.argv.find((a) => /^\d+$/.test(a)) || 12)));
const only = (process.argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1];
const force = process.argv.includes("--force");
const local = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "";
const env = {
  GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, local(".gemini-keys.local")].filter(Boolean).join(","),
  GROQ_API_KEYS: [process.env.GROQ_API_KEYS, local(".groq-keys.local")].filter(Boolean).join(","),
};
if (!env.GEMINI_API_KEYS || !env.GROQ_API_KEYS) throw new Error("Both Groq writer and Gemini reviewer keys are required.");

const registry = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
const list = (Array.isArray(registry) ? registry : (registry.notes || Object.values(registry))).filter((n) => n.file && fs.existsSync(n.file));
const db = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { notes: {}, topics: {} };
db.notes = db.notes || {}; db.topics = db.topics || {};
const hash = (t) => crypto.createHash("sha1").update(t.split("\r").join("")).digest("hex").slice(0, 12);
const splitFrontmatter = (text) => {
  const m = String(text).match(/^(---[\s\S]*?---\r?\n?)/);
  return { frontmatter: m ? m[1] : "", body: m ? String(text).slice(m[1].length) : String(text) };
};
const cleanMarkdown = (s) => String(s || "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();

const todo = list.filter((n) => !only || n.slug === only).map((n) => {
  const text = fs.readFileSync(n.file, "utf8"), prior = db.notes[n.slug] || {};
  return { n, text, h: hash(text), prior };
}).filter((x) => force || only || x.prior.hash !== x.h || !x.prior.validated || Number(x.prior.medium || 0) > 0 || (x.prior.issues || []).length > 0)
  .sort((a, b) => new Date(a.prior.lastAttempt || 0).getTime() - new Date(b.prior.lastAttempt || 0).getTime())
  .slice(0, COUNT);
console.log(todo.length + " note(s) queued for automatic checking and correction.");

const repairPrompt = (n, body, issues) => [
  "You are the medical editor correcting a medical-school learning note for OmpathStudy.",
  "Correct every factual or clinical issue listed below. Preserve every correct original fact, number, unit, drug name, warning, table, diagram, image markdown and link. Do not shorten the note or remove valid teaching content.",
  "Add missing explanations where needed to make the note accurate and understandable. For a thin note, expand it into at least 8 substantive topic-specific sections, with useful explanations rather than short one-line bullets. Explain relevant physiology, mechanisms, types/classification, clinical features, investigations and interpretation, management, pharmacology, complications and prevention when appropriate to this topic. Adapt the structure; do not force irrelevant disease headings.",
  "Use standard accepted medical knowledge only. Never invent statistics, references, local guideline claims or drug doses. If uncertain, qualify or omit. Use British spelling and define specialist terms at first use.",
  "Do not claim a clinician has reviewed the note. Output only the complete corrected Markdown body, without YAML frontmatter or code fences.",
  "NOTE: " + n.title,
  "ISSUES:",
  issues.map((x, i) => (i + 1) + ". [" + x.severity + "] " + x.where + ": " + x.problem + " | Correction: " + x.fix).join("\n"),
  "ORIGINAL NOTE:",
  body,
].join("\n\n");

let misses = 0, done = 0, repaired = 0, held = 0;
for (const item of todo) {
  const n = item.n, prior = item.prior;
  try {
    const parts = splitFrontmatter(item.text);
    const first = await checkContent({ title: n.title, kind: "study note", text: parts.body, env });
    const isThin = (text) => text.trim().split(/\s+/).filter(Boolean).length < 750 || (text.match(/^#{1,3}\s+/gm) || []).length < 8;
    if (isThin(parts.body)) { first.validated = false; first.medium = Number(first.medium || 0) + 1; first.issues = [...(first.issues || []), { severity: "medium", where: "overall structure", problem: "This study note is too thin for the comprehensive library standard.", fix: "Expand to at least 8 substantive sections with topic-specific physiology, types, mechanisms, clinical relevance, investigations, management and pharmacology where relevant." }]; }
    let final = first, repairStatus = "clean", newText = item.text;
    let attempts = Number(prior.repairAttempts || 0);
    if (!first.validated) {
      attempts++;
      if (parts.body.length <= 18000) {
        const draft = await askModel(repairPrompt(n, parts.body, first.issues || []), {
          env: { GROQ_API_KEYS: env.GROQ_API_KEYS }, timeoutMs: 65000, maxTokens: 10000, plain: true,
        });
        let fixed = cleanMarkdown(draft.text);
        fixed = splitFrontmatter(fixed).body;
        if (fixed && fixed.length >= Math.min(500, parts.body.length * 0.65)) {
          const second = await checkContent({ title: n.title, kind: "study note", text: fixed, env });
          if (isThin(fixed)) { second.validated = false; second.medium = Number(second.medium || 0) + 1; second.issues = [...(second.issues || []), { severity: "medium", where: "overall structure", problem: "The corrected note is still too thin.", fix: "Add substantive topic-specific teaching sections before marking it complete." }]; }
          final = second;
          if (second.validated) {
            newText = parts.frontmatter + fixed + "\n";
            fs.writeFileSync(n.file, newText);
            repairStatus = "auto-repaired";
            repaired++;
          } else {
            repairStatus = "held";
            held++;
          }
        } else {
          repairStatus = "held";
          held++;
        }
      } else {
        repairStatus = "held-too-long";
        held++;
      }
    }
    db.notes[n.slug] = {
      hash: hash(newText), ...final, repairStatus, repairAttempts: attempts,
      lastAttempt: new Date().toISOString(),
    };
    fs.writeFileSync(OUT, JSON.stringify(db, null, 1) + "\n");
    done++; misses = 0;
    console.log((final.validated ? (repairStatus === "auto-repaired" ? "AUTO-REPAIRED" : "checked clean") : "HELD FOR AUTOMATIC RETRY") + " " + n.slug + " (high " + final.high + ", medium " + final.medium + ")");
  } catch (e) {
    console.error("failed " + n.slug + ": " + String(e && e.message ? e.message : e).slice(0, 240));
    misses++;
    if (misses >= 3) { console.error("Three provider failures in a row; stopping so the next scheduled run can retry."); break; }
  }
}
console.log(done + " note(s) processed; " + repaired + " automatically repaired; " + held + " held for another automatic pass.");
execSync("node scripts/imed/sync-check-marks.mjs", { stdio: "inherit" });
if (misses >= 3) process.exitCode = 1;
