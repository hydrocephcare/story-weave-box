// Runs the topic builder as part of `npm run build` and never fails the build: if the database cannot be reached the site still deploys,
// just without refreshed topic pages (the last good copy in public/topics, if any, is used).
import { spawnSync } from "node:child_process";

const r = spawnSync(process.execPath, ["scripts/topics/build-topics.mjs", "--fresh"], { stdio: "inherit", env: { ...process.env } });
if (r.status !== 0) console.warn("[topics] skipped: the topic pages could not be refreshed this time (status " + r.status + ").");
process.exit(0);
