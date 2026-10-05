// Builds the two link tables that connect study notes to the pharmacology section. Runs before `vite build`.
//   src/data/drugIndex.json      every drug: id, name and the words a note might use for it
//   src/data/noteDrugLinks.json  which notes mention which drugs, in both directions
// Drugs are read from the TypeScript sources with a pattern, so this needs no build step of its own.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drugTerms, linkDrugs } from "../../src/lib/noteLinks.js";
import { mdToHtml } from "../../src/lib/miniMarkdown.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

try {
  const found = [];
  for (const m of read("src/clinical/extras/drugs.ts").matchAll(/^\s*d\("([^"]+)", "([^"]+)"/gm)) found.push([m[1], m[2]]);
  for (const f of ["src/pharm/drugsCommon.ts", "src/pharm/drugsOnc.ts", "src/pharm/drugsMore.ts"]) {
    for (const m of read(f).matchAll(/^\s*p\(\w+, "([^"]+)", "([^"]+)"/gm)) found.push([m[1], m[2]]);
  }
  const seen = new Set();
  const drugs = found.filter(([id]) => !seen.has(id) && seen.add(id)).map(([id, name]) => ({ id, name, terms: drugTerms(id, name) })).filter((d) => d.terms.length);
  // A combined entry ("Benzylpenicillin / amoxicillin") gives way to a drug that has that name to itself.
  const alone = new Map(drugs.filter((d) => !/[\/+]/.test(d.name)).map((d) => [d.name.replace(/\s*\(.*\)/, "").toLowerCase(), d.id]));
  for (const d of drugs) if (/[\/+]/.test(d.name)) d.terms = d.terms.filter((t) => !(alone.has(t) && alone.get(t) !== d.id));
  const usable = drugs.filter((d) => d.terms.length);
  fs.writeFileSync(path.join(root, "src/data/drugIndex.json"), JSON.stringify(usable));

  const notes = JSON.parse(read("src/data/staticNotes.json"));
  const byDrug = {}, byNote = {};
  for (const n of notes) {
    const { html } = mdToHtml(read(n.file), { skipTitle: true });
    const { ids } = linkDrugs(html, usable);
    byNote[n.slug] = ids;
    for (const id of ids) (byDrug[id] ??= []).push(n.slug);
  }
  fs.writeFileSync(path.join(root, "src/data/noteDrugLinks.json"), JSON.stringify({ byDrug, byNote }));
  console.log(`note links: ${drugs.length} drugs, ${notes.length} notes, ${Object.keys(byDrug).length} drugs mentioned`);
} catch (err) {
  console.warn("[build-note-links] skipped:", err instanceof Error ? err.message : err);
}
