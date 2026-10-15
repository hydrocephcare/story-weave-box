// Reads the IMED curriculum (src/data/imed.ts) and plans a note for every topic that has none, in the order a clinical student needs them.
// After a note is written, linkNote() puts its slug on the topic so the hub and the "How this connects" block pick it up.
import fs from "node:fs";

const FILE = "src/data/imed.ts";
export const GROUP = { respiratory: "Respiratory", cardiovascular: "Cardiovascular", renal: "Renal", infectious: "Infectious disease", gastro: "Gastroenterology and hepatology", haematology: "Haematology", neurology: "Neurology", endocrine: "Endocrinology", rheumatology: "Rheumatology", general: "General internal medicine" };
export const ORDER = ["cardiovascular", "infectious", "renal", "gastro", "haematology", "endocrine", "neurology", "rheumatology", "general"];

export function missingTopics() {
  const src = fs.readFileSync(FILE, "utf8");
  const out = [];
  for (const chunk of src.split(/\n  \{ id: "/).slice(1)) {
    const sys = chunk.slice(0, chunk.indexOf('"'));
    for (const m of chunk.matchAll(/t\("([a-z0-9-]+)", "([^"]+)"\)/g)) out.push({ sys, id: m[1], name: m[2] });
  }
  return out.sort((a, b) => ORDER.indexOf(a.sys) - ORDER.indexOf(b.sys));
}

export const planFor = (t) => ({
  group: GROUP[t.sys] ?? "Internal Medicine",
  title: t.name,
  focus: `the complete clinical approach to ${t.name}: definition; causes and risk factors in our setting (including HIV, TB, malaria, rheumatic, sickle cell and other tropical causes where they matter); how it presents and the examination findings with the reason for each; the investigations and how to read them; diagnosis and severity; immediate and definitive management with monitoring and safety; complications. Never any dose in mg.`,
  traps: `the look-alike conditions, the commonest wrong first steps, and what an examiner asks a student standing at the bedside about ${t.name}`,
});

/** Puts the note's slug on its topic: t("id", "Name") becomes t("id", "Name", "slug"). */
export function linkNote(id, slug) {
  const src = fs.readFileSync(FILE, "utf8");
  const next = src.replace(new RegExp(`t\\("${id}", "([^"]+)"\\)`), `t("${id}", "$1", "${slug}")`);
  if (next !== src) fs.writeFileSync(FILE, next);
}
