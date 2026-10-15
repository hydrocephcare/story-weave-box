// Adds one real, properly credited Wikimedia picture to each IMED note that has none (a chest X-ray for pneumonia, and so on).
//   node scripts/imed/add-images.mjs [--dry]
// The picture is the lead image of the matching Wikipedia article. It is only used when its licence is public domain or Creative Commons,
// and the caption carries the credit, in the same form as the pictures already in the notes.
import fs from "node:fs";
import crypto from "node:crypto";

const DRY = process.argv.includes("--dry");
const ARTICLE = {
  "pneumonia": "Pneumonia", "asthma": "Asthma", "copd": "Chronic obstructive pulmonary disease", "bronchitis": "Bronchitis", "bronchiectasis": "Bronchiectasis",
  "lung-abscess": "Lung abscess", "pleural-effusion": "Pleural effusion", "pneumothorax": "Pneumothorax", "dvt-vte-pulmonary-embolism": "Pulmonary embolism",
  "lung-cancer": "Lung cancer", "interstitial-lung-disease": "Interstitial lung disease", "occupational-lung-disease": "Pneumoconiosis",
  "tuberculosis": "Tuberculosis", "pneumocystis-pneumonia": "Pneumocystis pneumonia", "respiratory-failure-and-abg": "Respiratory failure",
  "pulmonary-oedema-and-ards": "Acute respiratory distress syndrome", "pulmonary-hypertension-and-cor-pulmonale": "Pulmonary hypertension",
  "acute-kidney-injury": "Acute kidney injury", "approach-to-anaemia": "Anemia", "hypertension": "Hypertension",
  "sepsis-and-septic-shock": "Sepsis", "nephrotic-and-nephritic-syndromes": "Nephrotic syndrome",
  "diabetic-ketoacidosis": "Diabetic ketoacidosis",
  "acs": "Acute coronary syndrome", "endocarditis": "Infective endocarditis", "arrhythmia": "Electrocardiography", "pericardium": "Pericarditis", "cardiomyopathy": "Cardiomyopathy",
  "pvd": "Peripheral artery disease", "hiv": "HIV/AIDS", "malaria": "Malaria", "meningitis": "Meningitis", "enteric": "Typhoid fever", "amr": "Antimicrobial resistance",
};
const OK = /^(public domain|cc0|cc[ -]by|cc[ -]by[ -]sa|pd)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u, tries = 5) => {
  for (let i = 0; i < tries; i++) {
    await sleep(1500); // Wikimedia asks for a gentle pace
    const r = await fetch(u, { headers: { "user-agent": "OmpathStudy/1.0 (study notes; contact via ompathstudy.com)" } });
    if (r.status === 429) { await sleep(8000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${u}`);
    return r.json();
  }
  throw new Error(`429 ${u}`);
};
const notes = JSON.parse(fs.readFileSync("src/data/staticNotes.json", "utf8"));
let added = 0;

for (const n of notes) {
  const title = ARTICLE[n.slug];
  if (!title || n.paper) continue;
  const file = fs.existsSync(n.file) ? n.file : null;
  if (!file) continue;
  let md = fs.readFileSync(file, "utf8");
  if (/!\[/.test(md)) continue; // it already has a picture
  try {
    const sum = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const name = decodeURIComponent(String(sum.originalimage?.source ?? "").split("/").pop()?.split("?")[0] ?? "");
    if (!name || /\.(svg|ogv|webm|gif)$/i.test(name) || /logo|map|flag|diagram of the/i.test(name)) { console.log("skip (no usable picture):", n.slug); continue; }
    const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(name)}&prop=imageinfo&iiprop=extmetadata|size&format=json&origin=*`);
    const page = Object.values(info.query.pages)[0];
    const ii = page.imageinfo?.[0];
    const meta = ii?.extmetadata ?? {};
    const lic = String(meta.LicenseShortName?.value ?? "");
    if (!OK.test(lic)) { console.log("skip (licence", lic || "unknown", "):", n.slug); continue; }
    const artist = String(meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 50);
    const what = String(meta.ImageDescription?.value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/[\[\]()]/g, "").trim().slice(0, 150) || n.title;
    const underscored = name.replace(/ /g, "_");
    const h = crypto.createHash("md5").update(underscored).digest("hex");
    // Wikimedia only serves standard thumbnail widths; use 960 when the original is wider, otherwise the original file itself
    const orig = ii?.width ?? 0;
    const url = orig >= 960
      ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(underscored)}/960px-${encodeURIComponent(underscored)}${/\.tiff?$/i.test(name) ? ".png" : ""}`
      : `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(underscored)}`;
    const safeUrl = url.replace(/\(/g, "%28").replace(/\)/g, "%29"); // brackets would end the markdown link
    const credit = /public domain|pd/i.test(lic) ? "Public domain" : `${artist ? artist + ", " : ""}${lic}`;
    // one clean sentence for the caption: the picture's own description when it is short and complete, otherwise the note's title
    const first = what.split(/(?<=[a-z0-9)])\.\s/)[0].replace(/\.+$/, "").trim();
    const good = first.length >= 12 && first.length <= 110 && !/^figure\b/i.test(first) && !/\b(maj|the|and|of|a|in)$/i.test(first);
    const line = `![${good ? first : n.title}. ${credit}](${safeUrl})`;
    // after the opening lines, before the first section
    const at = md.search(/\n## /);
    if (at < 0) { console.log("skip (no section):", n.slug); continue; }
    md = `${md.slice(0, at)}\n\n${line}\n${md.slice(at)}`;
    if (!DRY) fs.writeFileSync(file, md);
    added++; console.log("picture:", n.slug, "<-", name, `(${lic})`);
  } catch (e) { console.log("failed:", n.slug, String(e.message).slice(0, 80)); }
}
console.log(`${DRY ? "would add" : "added"} ${added} picture(s)`);
