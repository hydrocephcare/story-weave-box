// Sometimes the first request of a note ran on into the sections the second request writes again (clinical features, investigations, management...),
// so those sections appear twice. This keeps the first request's four sections and the second request's full version, and drops the early repeat.
//   node scripts/imed/fix-overrun.mjs file.md ...
import fs from "node:fs";

const FIRST = /^(definition|anatomy|causes|pathophysiology)/i;
for (const f of process.argv.slice(2)) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  const heads = lines.map((l, i) => (/^## /.test(l) ? { i, t: l.replace(/^##\s+/, "").trim() } : null)).filter(Boolean);
  const second = heads.find((h) => /^clinical features/i.test(h.t));
  if (!second) continue;
  const stray = heads.find((h) => h.i < second.i && !FIRST.test(h.t));
  if (!stray) continue;
  const kept = [...lines.slice(0, stray.i), ...lines.slice(second.i)];
  fs.writeFileSync(f, kept.join("\n"));
  console.log(`${f}: removed lines ${stray.i + 1}-${second.i} (${heads.filter((h) => h.i >= stray.i && h.i < second.i).length} repeated sections)`);
}
