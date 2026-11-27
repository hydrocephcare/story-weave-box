// Automatically check, correct and re-check flagged study notes. Unresolved notes remain queued for the next run.
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { maintenanceRequest } from "../topics/maintenance-client.mjs";

const OUT = "src/data/contentChecks.json";
const COUNT = Math.max(1, Math.min(40, Number(process.argv.find((a) => /^\d+$/.test(a)) || 12)));
const only = (process.argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1];
const force = process.argv.includes("--force");
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

let misses = 0, done = 0, repaired = 0, held = 0;
for (const item of todo) {
  const n = item.n, prior = item.prior;
  try {
    const parts = splitFrontmatter(item.text);

    const result = await maintenanceRequest("check-note", { title: n.title, text: parts.body });
    const { correctedBody, repairStatus } = result;
    const final = { validated: Boolean(result.validated), high: Number(result.high || 0), medium: Number(result.medium || 0), issues: Array.isArray(result.issues) ? result.issues : [], model: result.model || "", at: result.at || new Date().toISOString().slice(0, 10) };
    let newText = item.text;
    let attempts = Number(prior.repairAttempts || 0);
    if (repairStatus !== "clean") attempts++;
    if (repairStatus === "auto-repaired" && typeof correctedBody === "string") {
      newText = parts.frontmatter + correctedBody + "\\n";
      fs.writeFileSync(n.file, newText);
      repaired++;
    } else if (repairStatus === "held" || repairStatus === "held-too-long") held++;
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
