// One-off: an earlier "no doses" filter wrote "the protocol dose" over lab thresholds that are not doses (ACR 30 mg/g, fecal elastase 200 µg/g).
// The right figures go back, and the filter in the note writers no longer touches "mg/g" and "µg/g".
import fs from "node:fs";
import path from "node:path";

const rules = [
  [/<\s?the protocol dose\/g = pancreatic insufficiency/g, "<200 µg/g = pancreatic insufficiency"],
  [/fecal elastase\s?<\s?the protocol dose\/g/g, "fecal elastase <200 µg/g"],
  [/A1 < the protocol dose\/g, A2 30‑the protocol dose\/g, A3 > the protocol dose\/g/g, "A1 < 30 mg/g, A2 30‑300 mg/g, A3 > 300 mg/g"],
  [/30‑the protocol dose\/g = microalbuminuria/g, "30‑300 mg/g = microalbuminuria"],
  [/<\s?the protocol dose\/g = normal/g, "<30 mg/g = normal"],
  [/>\s?the protocol dose\/g = macroalbuminuria/g, ">300 mg/g = macroalbuminuria"],
  [/ACR ≥ the protocol dose\/g = albuminuria; >the protocol dose\/g = overt proteinuria/g, "ACR ≥ 30 mg/g = albuminuria; > 300 mg/g = overt proteinuria"],
  [/Urine ACR the protocol dose\/g \(macro‑albuminuria\)/g, "Urine ACR > 300 mg/g (macro‑albuminuria)"],
  [/proteinuria > the protocol dose —/g, "albuminuria (ACR ≥ 30 mg/g) —"],
  [/(?:albuminuria|ACR)\s?(≥|>)\s?the protocol dose\/g/g, (m, sign) => m.replace(/\s?(≥|>)\s?the protocol dose\/g/, ` ${sign} 30 mg/g`)],
  [/≥\s?the protocol dose\/g/g, "≥ 30 mg/g"],
  [/>\s?the protocol dose\/g/g, "> 30 mg/g"],
  [/(?:ratio of|ratio|ACR) the protocol dose\/g/g, (m) => m.replace(/ the protocol dose\/g/, " 450 mg/g")],
  [/Increase prednisone dose to the protocol dose daily/g, "Increase the prednisone dose"],
];

let total = 0;
for (const f of fs.readdirSync("src/content/notes").filter((x) => x.endsWith(".md"))) {
  const file = path.join("src/content/notes", f);
  const raw = fs.readFileSync(file, "utf8");
  let s = raw;
  for (const [re, to] of rules) s = s.replace(re, to);
  if (s !== raw) { fs.writeFileSync(file, s); total++; console.log("fixed", f); }
}
// the writers: lab thresholds like mg/g are not doses
for (const f of ["scripts/imed/write-notes.mjs", "scripts/imed/extend-notes.mjs"]) {
  const raw = fs.readFileSync(f, "utf8");
  const s = raw.replace("(?!\\s?\\/\\s?(?:d?l|ml|mmol))", "(?!\\s?\\/\\s?(?:d?l|ml|mmol|mol|g\\b|l\\b))");
  if (s !== raw) { fs.writeFileSync(f, s); console.log("writer filter fixed", f); }
}
console.log(`${total} note file(s) corrected.`);
