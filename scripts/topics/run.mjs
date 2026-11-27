// Runs the topic builder as part of `npm run build` and never fails the build: if the database cannot be reached the site still deploys,
// just without refreshed topic pages (the last good copy in public/topics, if any, is used).
// It also writes public/topics-status.json (what happened, and the last lines of the builder's output) so a failed deploy can be diagnosed
// from the live site: https://www.ompathstudy.com/topics-status.json
import fs from "node:fs";
import { spawnSync } from "node:child_process";

// Hosted Vercel and Cloudflare Pages builds must not read the whole library from Neon. The daily workflow commits the corpus;
// this deploy-time merge only attaches complete, Gemini-passed local topic JSON to the static pages.
const hostedStaticBuild = Boolean(process.env.VERCEL || process.env.CF_PAGES || process.env.CF_PAGES_BRANCH);
if (hostedStaticBuild && !process.env.FORCE_TOPICS && fs.existsSync("public/topics/index.json")) {
  const merged = spawnSync(process.execPath, ["scripts/topics/merge-ai.mjs"], { encoding: "utf8", env: { ...process.env }, maxBuffer: 16 * 1024 * 1024 });
  if (merged.stdout) process.stdout.write(merged.stdout);
  if (merged.stderr) process.stderr.write(merged.stderr);
  if (merged.status !== 0) {
    console.error("[topics] could not merge the committed verified AI pages; refusing to build stale topic HTML.");
    process.exit(merged.status || 1);
  }
  process.exit(0);
}

const r = spawnSync(process.execPath, ["scripts/topics/build-topics.mjs", "--fresh"], { encoding: "utf8", env: { ...process.env }, maxBuffer: 64 * 1024 * 1024 });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
const ok = r.status === 0;
if (!ok) console.warn("[topics] skipped: the topic pages could not be refreshed this time (status " + r.status + ").");
try {
  fs.mkdirSync("public", { recursive: true });
  const tail = (s) => String(s || "").split("\n").filter(Boolean).slice(-12);
  fs.writeFileSync("public/topics-status.json", JSON.stringify({ ok, status: r.status, signal: r.signal, error: r.error ? String(r.error) : null, at: new Date().toISOString(), topicFiles: fs.existsSync("public/topics") ? fs.readdirSync("public/topics").length : 0, out: tail(r.stdout), err: tail(r.stderr) }, null, 1));
} catch { /* never fail the build over a status file */ }
process.exit(0);
