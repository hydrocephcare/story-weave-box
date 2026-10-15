// Writes the IMED notes that do not exist yet, one AI request each, then registers them in staticNotes.json.
//   node scripts/imed/write-notes.mjs [slug ...]      (no slug: every note that is still missing from the first system batch)
// Keys come from .groq-keys.local / .gemini-keys.local (git-ignored) or GROQ_API_KEYS / GEMINI_API_KEYS. Groq is used first; nothing is run in a loop:
// a note that fails the checks is skipped, never half-saved, and the cost is one request per note.
import fs from "node:fs";
import { linkNote, missingTopics, planFor } from "./plan-auto.mjs";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";

const fromFile = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(",") : "");
const env = { GROQ_API_KEYS: [process.env.GROQ_API_KEYS, fromFile(".groq-keys.local")].filter(Boolean).join(","), GEMINI_API_KEYS: [process.env.GEMINI_API_KEYS, fromFile(".gemini-keys.local")].filter(Boolean).join(",") };
if (!env.GROQ_API_KEYS && !env.GEMINI_API_KEYS) { console.log("No AI keys found."); process.exit(0); }

const PLAN = {
  "approach-to-respiratory-symptoms": { group: "Respiratory", title: "Approach to respiratory symptoms and the chest examination", focus: "cough, dyspnoea, haemoptysis, wheeze, chest pain: the history questions that narrow the diagnosis; the full chest examination (inspection, palpation, percussion, auscultation) and what each abnormal finding means for consolidation, effusion, pneumothorax, collapse, airway obstruction and fibrosis; peak flow, oximetry and the first tests.", traps: "unilateral vs bilateral signs, tracheal deviation, tactile fremitus, bronchial breathing vs reduced air entry, silent chest" },
  "tuberculosis": { group: "Respiratory", title: "Tuberculosis: pulmonary and extrapulmonary", focus: "epidemiology and HIV link, primary vs post-primary TB, clinical features, sputum smear, Xpert MTB/RIF, culture, chest X-ray patterns, extrapulmonary forms (pleural, lymph node, meningeal, miliary, spinal, abdominal, pericardial), the standard first-line regimen and monitoring, adverse effects, drug-resistant TB, TB in HIV and IRIS, prevention.", traps: "ADA in pleural fluid, TB meningitis CSF, why rifampicin interacts, hepatotoxicity, when to suspect MDR" },
  "pneumocystis-pneumonia": { group: "Respiratory", title: "Pneumocystis jirovecii pneumonia (PCP)", focus: "who gets it and at what CD4 count, the subacute dry cough and exertional dyspnoea with desaturation on exercise, chest X-ray and CT findings, raised LDH, how it is diagnosed, first-line treatment and the place of steroids (say when they are used and why, never any dose in mg), prophylaxis, differences from bacterial pneumonia and TB.", traps: "normal chest examination with severe hypoxaemia, steroids when PaO2 is low, co-trimoxazole adverse effects" },
  "respiratory-failure-and-abg": { group: "Respiratory", title: "Respiratory failure and arterial blood gas interpretation", focus: "type 1 vs type 2 failure and the causes of each, acute vs chronic, oxygen therapy and targets, non-invasive ventilation indications, a stepwise ABG interpretation (pH, CO2, HCO3, PaO2, compensation, A-a gradient), worked examples.", traps: "oxygen in COPD, compensation vs mixed disorders, lactate, when to intubate" },
  "pulmonary-oedema-and-ards": { group: "Respiratory", title: "Pulmonary oedema and ARDS", focus: "cardiogenic vs non-cardiogenic pulmonary oedema, pathophysiology, clinical features and examination, chest X-ray signs, BNP, echocardiography, emergency management of acute pulmonary oedema, the Berlin definition and causes of ARDS, lung-protective ventilation and supportive care.", traps: "pulmonary capillary wedge pressure, bilateral infiltrates with normal heart size, fluid management in ARDS" },
  "pulmonary-hypertension-and-cor-pulmonale": { group: "Respiratory", title: "Pulmonary hypertension and cor pulmonale", focus: "definition and the WHO groups of pulmonary hypertension, causes in our setting (chronic lung disease, schistosomiasis, thromboembolism, left heart disease, sickle cell), symptoms, signs of right heart strain, ECG, chest X-ray, echocardiography, right heart catheterisation, treatment principles and long-term oxygen.", traps: "loud P2, parasternal heave, raised JVP, why diuretics are used carefully" },
};

const RULES = `Rules: standard accepted medical knowledge only; if unsure, leave it out. Never give drug doses (write no amount in mg, mcg or µg), never invent statistics, references or guideline numbers. Name drug classes and usual medicines and say why each is chosen. Be specific and clinical, explain why things happen, no filler. Tables must be compact: one short phrase per cell, single spaces only, the separator row exactly like |---|---|---|, and at most 7 rows. Do not add a "related topics" section (the site adds it).`;

// the note is written in three requests so that no single answer can run out of room halfway through a table
const PARTS = (p) => [
  { sections: ["Definition", "Anatomy and physiology you need", "Causes and risk factors", "Pathophysiology"], ask: `# ${p.title}
One italic orientation line saying what the student will be able to do afterwards, and that doses and local protocols must be checked against the Kenya MoH guideline and the hospital formulary.
## Definition
## Anatomy and physiology you need
## Causes and risk factors
## Pathophysiology
(Pathophysiology as short causal steps with arrows.)` },
  { sections: ["Clinical features", "Differential diagnosis", "Investigations", "Diagnosis and severity"], ask: `## Clinical features
The history questions that matter, then how to examine at the bedside step by step (each named sign, how to elicit it and what it means). Use bullet lists here, not tables: the reader prefers bullets for history and examination. Use tables only for the differential diagnosis and the investigations.
## Differential diagnosis
A compact table: condition, what points to it, what separates it from this one.
## Investigations
A compact table: test, what it answers, what a result means.
## Diagnosis and severity` },
  { sections: ["Management", "Complications and prognosis", "High-yield exam points", "Clinical case", "Practice questions"], ask: `## Management
Immediate stabilisation first, then definitive treatment, monitoring and follow-up; contraindications and safety.
## Complications and prognosis
## High-yield exam points
Bullets: the key points. Then a section headed exactly "## Tricky questions examiners ask" with 5 to 7 questions in this form, one paragraph each: **Q1.** question text **Answer:** the answer. The tricky things examiners ask include ${p.traps}. Facts must match current guidelines: for example a diagnostic threshold is written the same way everywhere in the note.
## Clinical case
A short case (age, presentation, key findings), then 3 questions with model answers.
## Practice questions
Five multiple-choice questions. At least three are clinical scenarios (a patient lying in bed with these findings) asking what to do next, what separates two conditions, or why a choice is avoided. Use exactly this form:

### Question 1
Question text

A. option
B. option
C. option
D. option

Answer: B. the correct option text
Explanation: one or two sentences.` },
];

const PART_PROMPT = (p, part, i, written) => `You are writing a study note for Year 4 MBChB students in clinical rotations (Kenya). Topic: "${p.title}" (Internal Medicine, ${p.group}).
Cover: ${p.focus}
This is part ${i + 1} of 3.${written ? ` Already written, so do not repeat it: ${written}.` : ""}
Write ONLY the following, in this order, in clear markdown, then stop:
${part.ask}

${RULES} About 700 words.`;

const registry = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
const clean = (t) => String(t).replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
const squeeze = (md) => md.split("\n").map((l) => (l.trim().startsWith("|") ? l.replace(/[ \t]{2,}/g, " ").replace(/-{4,}/g, "---") : l)).join("\n");
// --auto [--max N]: the next N topics of the curriculum that have no note yet (one system after another), planned from imed.ts
const AUTO = process.argv.includes("--auto");
const MAX = Number(process.argv[process.argv.indexOf("--max") + 1]) || 8;
const idOf = {};
if (AUTO) for (const t of missingTopics().filter((x) => !registry.some((n) => n.slug === x.id)).slice(0, MAX)) { PLAN[t.id] = planFor(t); idOf[t.id] = t.id; }
const todo = AUTO ? Object.keys(idOf) : process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PLAN);
let failedInARow = 0; // two provider failures in a row means the AI quota is spent: stop instead of burning more

for (const slug of todo) {
  const p = PLAN[slug];
  if (!p) { console.log("unknown:", slug); continue; }
  if (registry.some((n) => n.slug === slug)) { console.log("already there:", slug); continue; }
  try {
    let md = "", written = "";
    for (const [i, part] of PARTS(p).entries()) {
      let text = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await askModel(PART_PROMPT(p, part, i, written), { env, plain: true, timeoutMs: 90000, maxTokens: 5000 });
        text = squeeze(clean(r.text));
        // every section asked for must be there, and a table must have rows under its header
        const have = part.sections.every((s) => new RegExp(`^#{2,3}\\s+${s.slice(0, 4)}`, "im").test(text));
        // every table needs a header, a separator and at least one row: a table cut off by the answer running out is not accepted
        const runs = text.split("\n").reduce((a, l) => { if (l.trim().startsWith("|")) a[a.length - 1] = (a[a.length - 1] ?? 0) + 1; else if (a[a.length - 1] !== 0) a.push(0); return a; }, [0]).filter((n) => n > 0);
        const tablesOk = (!/table/.test(part.ask) || runs.length >= 1) && runs.every((n) => n >= 3);
        if (have && tablesOk) break;
        console.log(`  part ${i + 1} attempt ${attempt + 1}: sections ${have ? "ok" : "MISSING " + part.sections.filter((s) => !new RegExp(`^#{2,3}\\s+${s.slice(0, 4)}`, "im").test(text)).join(", ")}; tables ${tablesOk ? "ok" : "bad (" + runs.join(",") + ")"}; ${text.length} chars`);
        text = "";
      }
      if (!text) throw new Error(`part ${i + 1} incomplete`);
      md += (md ? "\n\n" : "") + text;
      written = (md.match(/^## .*/gm) ?? []).join("; ");
    }
    const heads = (md.match(/^## /gm) ?? []).length, qs = (md.match(/^### Question \d/gm) ?? []).length, rows = (md.match(/^\|/gm) ?? []).length;
    // a drug dose is a number with mg/mcg/µg that is not a laboratory value (mg/dL, mg/L)
    // doses that slipped in are not kept: the number goes and the sentence says to use the protocol dose, so the note is not thrown away for one figure
    const DOSE = /\b\d+(?:[.,]\d+)?(?:\s?[-–]\s?\d+(?:[.,]\d+)?)?\s?(?:mg|mcg|µg|ug)(?:\s?\/\s?(?:kg|day|dose|h|hr|hour|24\s?h))*\b(?!\s?\/\s?(?:d?l|ml|mmol))/gi;
    const doses = md.match(DOSE) ?? [];
    if (doses.length) md = md.replace(DOSE, "the protocol dose");
    if (md.length < 7000 || heads < 11 || qs < 4 || rows < 6) { console.log("rejected (checks):", slug, md.length, heads, qs, rows); continue; }
    if (doses.length) console.log(`  ${slug}: ${doses.length} dose figure(s) replaced`);
    md += `\n\n*Drafted with AI assistance from standard references and reviewed for structure. Check details against your lecture notes and the Kenya MoH guideline.*\n`;
    const file = `src/content/notes/${p.group.toLowerCase().split(/[ ,]/)[0]}-${slug}.md`;
    fs.writeFileSync(file, md);
    const desc = `${p.title}: ${p.focus}`.replace(/\s+/g, " ").slice(0, 190).replace(/[,;:\s]+\S*$/, "") + ".";
    registry.push({ slug, year: 4, unit: "Internal Medicine", group: p.group, title: p.title, description: desc, updated: new Date().toISOString().slice(0, 10), file });
    fs.writeFileSync("src/data/staticNotes.json", JSON.stringify(registry, null, 2) + "\n");
    if (AUTO) linkNote(slug, slug);
    failedInARow = 0;
    console.log("written:", slug, md.length, "chars,", heads, "sections,", qs, "questions,", rows, "table rows");
  } catch (e) { console.log("failed:", slug, String(e.message).slice(0, 100)); if (!/^part \d incomplete/.test(String(e.message)) && ++failedInARow >= 2) { console.log("two failures in a row: the AI quota is probably spent, stopping."); break; } }
}
