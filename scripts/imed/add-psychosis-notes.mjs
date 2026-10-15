// One-off: publishes Dr Kendi's "Understanding Psychosis" class summary and the Year 4 psychiatry group assignments as notes.
import fs from "node:fs";
const g = "src/content/notes/psychiatry-group-assignments-2026.md";
fs.writeFileSync(g, fs.readFileSync(g, "utf8").replace("/notes/psychological-therapies)", "/notes/psychological-therapies-and-non-pharmacological-interventions)"));

const REG = "src/data/staticNotes.json";
const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
const list = Array.isArray(reg) ? reg : reg.notes;
const add = [
  { slug: "understanding-psychosis", year: 4, unit: "Mental Health/Psychiatry", group: "Psychotic disorders", title: "Understanding Psychosis: history, meaning and today's view", description: "Dr Kendi's first class on psychosis: who shaped the idea, what psychosis is and why it is a syndrome, how DSM-5-TR and ICD-11 define it, and why Kenyan families turn to healers.", updated: "2026-10-15", file: "src/content/notes/psychiatry-understanding-psychosis.md" },
  { slug: "psychiatry-group-assignments-2026", year: 4, unit: "Mental Health/Psychiatry", group: "Course information", title: "Year 4 Psychiatry group assignments: presentation on 22 October 2026", description: "Which group presents which topic on Thursday 22 October 2026 (psychopathology and psychotic disorders), with the notes to start from.", updated: "2026-10-15", file: "src/content/notes/psychiatry-group-assignments-2026.md" },
];
for (const n of add) { if (!list.some((x) => x.slug === n.slug)) list.push(n); }
fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + "\n");
console.log("registry now has", list.length, "notes");
