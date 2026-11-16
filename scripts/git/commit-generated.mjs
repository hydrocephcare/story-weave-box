import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
const message = process.env.GENERATED_COMMIT_MESSAGE || process.argv[2] || "Automated content update";
const targets = process.argv.slice(3).filter(Boolean);
if (!targets.length) throw new Error("Pass one or more generated paths.");
const root = process.cwd();
const git = (args, allowFailure = false) => {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0 && !allowFailure) throw new Error("git " + args.join(" ") + " failed: " + (r.stderr || r.stdout));
  return r;
};
const status = git(["status", "--porcelain", "-z", "--", ...targets]).stdout;
const records = status.split("\0").filter(Boolean).map((line) => ({ code: line.slice(0, 2), rel: line.slice(3) }));
if (!records.length) { console.log("No generated changes to commit."); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ompath-generated-"));
for (const item of records) {
  const src = path.resolve(root, item.rel);
  if (!src.startsWith(root + path.sep)) throw new Error("Unsafe generated path.");
  const dest = path.join(tmp, item.rel);
  if (item.code.includes("D")) { fs.writeFileSync(dest + ".deleted", ""); continue; }
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}
git(["config", "user.name", "ompath-bot"]);
git(["config", "user.email", "ompath-bot@users.noreply.github.com"]);
for (let attempt = 1; attempt <= 5; attempt++) {
  git(["fetch", "origin", "main"]);
  git(["reset", "--hard", "origin/main"]);
  for (const item of records) {
    const dest = path.resolve(root, item.rel), saved = path.join(tmp, item.rel);
    if (item.code.includes("D")) { fs.rmSync(dest, { recursive: true, force: true }); continue; }
    if (!fs.existsSync(saved)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(saved, dest, { recursive: true });
  }
  git(["add", "-A", "--", ...targets]);
  if (git(["diff", "--cached", "--quiet"], true).status === 0) { console.log("Generated content is already current on main."); process.exit(0); }
  git(["commit", "-m", message]);
  if (git(["push", "origin", "HEAD:main"], true).status === 0) { console.log("Generated changes committed to main."); process.exit(0); }
  console.warn("Push attempt " + attempt + " raced with another main update; retrying from latest main.");
}
throw new Error("Could not push generated changes after five retries.");
