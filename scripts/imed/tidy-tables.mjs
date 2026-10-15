// The AI pads markdown tables with runs of spaces and dashes (a 12 KB note became 140 KB). This squeezes them back, in the notes given.
import fs from "node:fs";
for (const f of process.argv.slice(2)) {
  const before = fs.statSync(f).size;
  const out = fs.readFileSync(f, "utf8").split("\n").map((l) => (l.trim().startsWith("|") ? l.replace(/[ \t]{2,}/g, " ").replace(/-{4,}/g, "---").replace(/:-{2,}/g, ":---") : l)).join("\n");
  fs.writeFileSync(f, out);
  console.log(f, before, "->", fs.statSync(f).size);
}
