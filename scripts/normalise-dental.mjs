// Tidies every dental paper file in place (safe to run again): question numbers that run on in order, a clean date and title, canonical programme names,
// and the subject category the unit belongs to. Called by build-dental-index.mjs before the index is made.
import fs from "node:fs";
import path from "node:path";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthNo = (w) => MONTHS.findIndex((m) => m.startsWith(String(w).toLowerCase().slice(0, 3)));

/** "Wed 30th March, 2021 8.00am" -> { iso: "2021-03-30", label: "30 March 2021" }; "November 2017" -> { iso: "2017-11", label: "November 2017" } */
export function parseDate(raw) {
  const s = String(raw || "");
  let m = s.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s*(20\d\d)/);
  if (m && monthNo(m[2]) >= 0) { const mo = monthNo(m[2]); return { iso: `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`, label: `${Number(m[1])} ${MONTHS[mo][0].toUpperCase()}${MONTHS[mo].slice(1)} ${m[3]}` }; }
  m = s.match(/([A-Za-z]{3,9})\.?,?\s+(20\d\d)/);
  if (m && monthNo(m[1]) >= 0) { const mo = monthNo(m[1]); return { iso: `${m[2]}-${String(mo + 1).padStart(2, "0")}`, label: `${MONTHS[mo][0].toUpperCase()}${MONTHS[mo].slice(1)} ${m[2]}` }; }
  m = s.match(/20\d\d/);
  return m ? { iso: m[0], label: m[0] } : { iso: "", label: s.trim() };
}

/** The programmes a paper was set for, one canonical name each. */
export function programmesOf(raw) {
  const s = String(raw || ""); const out = new Set();
  const cert = /certificate/i.test(s) && !/diploma/i.test(s), both = /diploma\s*\/\s*certificate/i.test(s);
  const add = (name) => { if (both) { out.add(`Diploma in ${name}`); out.add(`Certificate in ${name}`); } else out.add(`${cert ? "Certificate" : "Diploma"} in ${name}`); };
  if (/oral|dcoh|dental health/i.test(s)) add("Community Oral Health");
  if (/dental technology|ddt/i.test(s)) add("Dental Technology");
  if (/health record|hrit|recognition and information/i.test(s)) add("Health Records and Information Technology");
  if (/hiv/i.test(s)) add("Community Health and HIV Management");
  else if (/community health|dch/i.test(s)) add("Community Health");
  if (/community development/i.test(s)) add("Community Development");
  if (/clinical medicine/i.test(s)) add("Clinical Medicine");
  if (/animal|annual health/i.test(s)) add("Animal Health");
  return out.size ? [...out] : s.trim() ? [s.trim()] : [];
}

export const CATEGORIES = [
  { slug: "basic-dental-sciences", name: "Basic Dental Sciences", blurb: "Anatomy, physiology, oral biology and oral pathology for dental students.", match: /anatomy|physiology|oral biology|oral pathology|oral medicine|dental materials|histology|embryology/i },
  { slug: "community-and-public-health", name: "Community and Public Health", blurb: "Community health, health education and promotion, epidemiology and primary health care.", match: /community health|health education|health promotion|epidemiolog|public health|primary health|environmental|nutrition/i },
  { slug: "biostatistics-and-research", name: "Biostatistics and Research", blurb: "Biostatistics, research methods and data analysis for health students.", match: /biostat|statistic|research|informatics/i },
];
export const categoryOf = (unitTitle) => CATEGORIES.find((c) => c.match.test(unitTitle)) ?? { slug: "other-units", name: "Other Units", blurb: "More units from the same colleges." };

export const slugify = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function normalisePaper(p) {
  const d = parseDate(p.date);
  p.dateISO = d.iso; p.dateLabel = d.label;
  p.title = `${p.unitTitle}: ${p.sitting || "Exam"}${d.label ? `, ${d.label}` : ""}`;
  p.programmes = programmesOf(p.programme);
  const cat = categoryOf(p.unitTitle); p.categorySlug = cat.slug; p.category = cat.name; p.unitSlug = slugify(p.unitTitle);
  // question numbers must run on within a section (the scan sometimes repeats or restarts them)
  let last = null;
  for (const it of p.pages.flatMap((pg) => pg.items)) {
    if (it.t === "h") { last = null; continue; }
    if (it.t !== "q") continue;
    const n = parseInt(it.n, 10);
    if (!Number.isFinite(n) || (last !== null && n <= last)) it.n = String(last === null ? 1 : last + 1);
    last = parseInt(it.n, 10);
  }
  return p;
}

if (process.argv[1]?.endsWith("normalise-dental.mjs")) {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../src/content/dental");
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) { const p = normalisePaper(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); fs.writeFileSync(path.join(dir, f), JSON.stringify(p, null, 1) + "\n"); n++; }
  console.log("normalised", n);
}
