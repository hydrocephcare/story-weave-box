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
  if (out.size) return [...out];
  // other programmes (IT, business, hospitality...): the course names as printed, split where several are listed, with timetable words dropped
  const cleaned = s.replace(/\b(weekend|regular|virtual|varsity|evening|grp\s*\d+|group\s*\d+)\b/gi, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean).map((x) => (/^[A-Za-z]{2,6}$/.test(x) ? x.toUpperCase() : x));
  return [...new Set(tokens)].filter((x) => /^[A-Z]{2,6}$/.test(x) || (/^(Bachelor|Diploma|Certificate|BSc|Master)/i.test(x) && x.split(" ").length >= 3));
}

export const CATEGORIES = [
  { slug: "dental-technology", name: "Dental Technology", blurb: "Dental materials, prosthetics, orthodontics, crown and bridge, periodontology and the other dental technology units.", match: /dental materials|prosthe|orthodon|periodon|paedodon|cobalt|crown and bridge|endodon|dental technology|dental laboratory|oral surgery|conservative dent/i },
  { slug: "basic-dental-sciences", name: "Basic Dental Sciences", blurb: "Anatomy, physiology, oral biology and oral pathology for dental students.", match: /anatomy|physiology|oral biology|oral pathology|oral medicine|dental materials|histology|embryology/i },
  { slug: "community-and-public-health", name: "Community and Public Health", blurb: "Community health, health education and promotion, epidemiology and primary health care.", match: /community health|health education|health promotion|epidemiolog|public health|primary health|environmental|nutrition/i },
  { slug: "biostatistics-and-research", name: "Biostatistics and Research", blurb: "Biostatistics, research methods and data analysis for health students.", match: /biostat|research method|informatics/i },
  { slug: "it-and-computing", name: "IT and Computing", blurb: "Programming, databases, networks, systems, software and the other information technology units.", match: /comput|programming|database|network|software|web |information system|information technology|data structure|algorithm|operating system|(^|[^a-z])ict([^a-z]|$)|cyber|e-commerce|multimedia|artificial|machine learning|internet|mobile|java|python|digital|systems analysis|systems design|graphics|cloud|security|telecom|electronics|logic design|e-learning|data communication|object oriented/i },
  { slug: "business-and-economics", name: "Business and Economics", blurb: "Accounting, finance, marketing, management, economics, entrepreneurship and the other business units.", match: /account|financ|marketing|econom|management|business|entrepreneur|human resource|procurement|supply chain|audit|tax|banking|insurance|investment|commerce|strategic|leadership|operations|organi[sz]ation|project|logistic|purchasing|sales/i },
  { slug: "education", name: "Education", blurb: "Teaching, curriculum, guidance and counselling, and the other education units.", match: /education|teaching|curriculum|pedagog|instruction|guidance|counsel|special needs|assessment|classroom/i },
  { slug: "hospitality-and-tourism", name: "Hospitality and Tourism", blurb: "Hospitality, tourism, travel, catering and events units.", match: /hospitality|tourism|travel|hotel|catering|food and beverage|front office|housekeeping|events|restaurant/i },
  { slug: "media-and-communication", name: "Media and Communication", blurb: "Journalism, media studies, public relations, communication and writing units.", match: /media|journalism|communication|broadcast|public relations|film|photograph|advertis|writing|reporting/i },
  { slug: "law-and-social-sciences", name: "Law and Social Sciences", blurb: "Law, sociology, psychology, development studies, governance and the other social science units.", match: /law|legal|constitution|criminolog|sociolog|psycholog|political|international relations|conflict|development|governance|human rights|public administration|gender|peace|social work|anthropolog|philosoph|ethic|religio|theolog|kiswahili|language|literature|critical thinking|community media/i },
  { slug: "health-sciences-and-pharmacy", name: "Health Sciences and Pharmacy", blurb: "Pharmacy, clinical medicine, nursing, pathology, microbiology and other health science units.", match: /pharm|nurs|clinical|patholog|microbio|biochem|medic|surgery|paediatric|obstetric|radiolog|laborator|immunolog|health|therapy|dental/i },
  { slug: "science-and-engineering", name: "Science and Engineering", blurb: "Mathematics, physics, chemistry, biology, engineering and the other science units.", match: /physics|chemistry|biolog|mathemat|calculus|algebra|engineering|surveying|construction|building|electric|mechanic|civil|geolog|agricultur|statistic|quantity|thermodynamic|material|science/i },
];
const BY_CODE = { BIT: "it-and-computing", BBIT: "it-and-computing", BCS: "it-and-computing", BSE: "it-and-computing", BAF: "business-and-economics", BBM: "business-and-economics", BMK: "business-and-economics", BHR: "business-and-economics", BPS: "business-and-economics", BED: "education", BHT: "hospitality-and-tourism", BJM: "media-and-communication", BMM: "media-and-communication", BMC: "media-and-communication", BCL: "law-and-social-sciences", BSS: "law-and-social-sciences", BDS: "dental-technology", BHA: "basic-dental-sciences", PHA: "health-sciences-and-pharmacy", BPH: "health-sciences-and-pharmacy", BNS: "health-sciences-and-pharmacy", BEG: "science-and-engineering", BSC: "science-and-engineering" };
export const categoryOf = (unitTitle, code = "") => CATEGORIES.find((c) => c.match.test(unitTitle)) ?? CATEGORIES.find((c) => c.slug === BY_CODE[String(code).replace(/[^A-Za-z].*$/, "").toUpperCase()]) ?? { slug: "other-units", name: "Other Units", blurb: "More units from the same colleges." };

export const slugify = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function normalisePaper(p) {
  const d = parseDate(p.date);
  p.dateISO = d.iso; p.dateLabel = d.label;
  p.title = `${p.unitTitle}: ${p.sitting || "Exam"}${d.label ? `, ${d.label}` : ""}`;
  p.programmes = programmesOf(p.programme);
  const cat = categoryOf(p.unitTitle, p.unitCode); p.categorySlug = cat.slug; p.category = cat.name; p.unitSlug = slugify(p.unitTitle);
  // "(5 Marks)" typed at the end of a question belongs in the marks, not in the wording
  const stripMarks = (o) => { const m = String(o.text || "").match(/\s*\(\s*(\d+(?:\.\d+)?)\s*marks?\s*\)\s*\.?\s*$/i); if (m) { o.text = o.text.slice(0, m.index).trim(); if (o.marks == null) o.marks = Number(m[1]); } for (const c of o.parts || []) stripMarks(c); };
  for (const it of p.pages.flatMap((pg) => pg.items)) if (it.t === "q") stripMarks(it);
  // ---- typos left by the scanner (exact wording only; safe to run again) ----
  const FIXES = [
    ["State three terms use for", "State three terms used for"], ["Identified priorities for health promotion", "Identify priorities for health promotion"],
    ["Just five High Risk Mothers in Maternal child health", "List five high-risk mothers in maternal child health"], ["of a child*", "of a child."],
    ["blastocyte", "blastocyst"], ["Embryo blast", "Embryoblast"], ["factors that affects the general immunity", "factors that affect the general immunity"],
    ["other factors affects the general immunity", "other factors affect the general immunity"], ["ungroup data", "ungrouped data"], ["Critic on five", "Critique five"],
    ["Discuss types use in probability", "Discuss types used in probability"], ["in Kenya the Kenyan constitution", "in Kenya under the Kenyan constitution"],
    ["As an [illegible]miologist", "As an epidemiologist"], ["control rodents a village community", "control rodents in a village community"], ["Heath belief model", "Health belief model"],
    ["difference between the statistics and research", "difference between statistics and research"], ["The A random sample", "A random sample"], ["Qualifed Judge", "Qualified Judge"],
    ["distributed with M and a standard deviation Ω", "distributed with mean μ and standard deviation σ"], ["(missing entry)", "[not readable in the scan]"], ["conditions/ diseases", "conditions/diseases"],
    ["Opinion leaders plays", "Opinion leaders play"], ["Problem solving techniques is used tackle", "Problem-solving techniques are used to tackle"], ["how to be in credible", "how to be credible"],
    ["(SECTION 40) ANSWER ALL QUESTION", "(40 MARKS) ANSWER ALL QUESTIONS"], ["Describe the Differences between", "Describe the differences between"],
  ];
  const fix = (t) => { let x = String(t ?? ""); for (const [from, to] of FIXES) x = x.split(from).join(to); return x; };
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const sig = (it) => norm(it.text) + (it.parts || []).map((x) => norm(x.text) + (x.parts || []).map((y) => norm(y.text)).join("")).join("");
  const walk = (o, fn) => { fn(o); for (const c of o.parts || []) walk(c, fn); };
  for (const pg of p.pages) for (const it of pg.items) { walk(it, (o) => { o.text = fix(o.text); }); if (it.t === "h") { const h = it.text.trim().toUpperCase(); if (h === "SECTION" || h === "SECTION 1") it.text = "SECTION B"; } }

  // ---- structure: work on one flat list of items, then put it back on the pages ----
  let flat = p.pages.flatMap((pg) => pg.items.map((it) => ({ it, pg })));
  // a section heading that appears twice in a scanned paper means the same page was read twice: keep the later block (typed PDFs are left alone)
  if (p.source !== "mkupaperhub") {
    for (let again = true; again;) {
      again = false; const seen = new Map();
      for (let i = 0; i < flat.length; i++) { const it = flat[i].it; if (it.t !== "h") continue; const k = norm(it.text); if (seen.has(k)) { const from = seen.get(k); flat = flat.filter((_, j) => j < from || j >= i); again = true; break; } seen.set(k, i); }
    }
  }
  // identical questions (the same page read twice)
  { const seen = new Set(); flat = flat.filter(({ it }) => { if (it.t !== "q") return true; const k = sig(it); if (!k || !seen.has(k)) { seen.add(k); return true; } return false; }); }
  // "QUESTION ONE (continued)": its parts belong to the question before it
  for (let i = flat.length - 1; i > 0; i--) { const it = flat[i].it; if (it.t === "q" && /^QUESTION \w+ \(continued\)/i.test(it.text || "")) { const prev = flat.slice(0, i).reverse().find((x) => x.it.t === "q"); if (prev) { prev.it.parts = [...(prev.it.parts || []), ...(it.parts || [])]; flat.splice(i, 1); } } }
  // "QUESTION TWO" as the wording of a question is just its number
  for (const { it } of flat) if (it.t === "q") { const m = /^QUESTION (\w+)$/i.exec(it.text || ""); if (m) { if (WORDS[m[1].toLowerCase()]) it.n = String(WORDS[m[1].toLowerCase()]); it.text = ""; } }
  // consecutive questions with the same opening wording are one question with parts
  for (let i = flat.length - 1; i > 0; i--) { const a2 = flat[i - 1].it, b2 = flat[i].it; if (a2.t === "q" && b2.t === "q" && a2.text && a2.text === b2.text && a2.parts?.length && b2.parts?.length) { a2.parts = [...a2.parts, ...b2.parts]; flat.splice(i, 1); } }
  // "Determine;" on its own after a question that set the data belongs to that question
  for (let i = flat.length - 1; i > 0; i--) { const b2 = flat[i].it, a2 = flat[i - 1].it; if (b2.t === "q" && a2.t === "q" && /^(determine|calculate|find)\s*[;:.]?$/i.test(b2.text || "") && !a2.parts?.length && b2.parts?.length) { a2.parts = [{ l: "", text: b2.text.trim(), parts: b2.parts }]; flat.splice(i, 1); } }
  // lettered parts typed into one block of text: split them out
  for (const { it } of flat) if (it.t === "q" && !it.parts?.length && /\n\s*[a-z]\)\s/.test(it.text || "")) {
    const segs = it.text.split(/\n(?=\s*[a-z]\)\s)/).map((x) => x.trim()).filter(Boolean);
    const lettered = segs.map((x) => /^([a-z])\)\s*([\s\S]*)$/.exec(x));
    const stem = lettered[0] ? "" : segs.shift();
    const parts = (lettered[0] ? segs : segs).map((x) => { const m = /^([a-z])\)\s*([\s\S]*)$/.exec(x); return m ? { l: m[1], text: m[2].trim() } : { l: "", text: x }; });
    if (parts.length > 1) { it.text = stem; it.parts = parts; stripMarks(it); }
  }
  // parts labelled "a i", "a ii": sub-parts of a
  for (const { it } of flat) if (it.t === "q" && it.parts?.some((x) => /^[a-z] [ivx]+$/.test(x.l || ""))) {
    const out = [];
    for (const x of it.parts) { const m = /^([a-z]) ([ivx]+)$/.exec(x.l || ""); if (!m) { out.push(x); continue; } let g = out.find((y) => y.l === m[1] && y._g); if (!g) { g = { l: m[1], text: "", parts: [], _g: true }; out.push(g); } g.parts.push({ ...x, l: m[2] }); }
    it.parts = out.map((x) => { const { _g, ...rest } = x; return rest; });
  }
  // roman numerals (i, ii, iii...) typed straight after a lettered part are that part's sub-parts
  for (const { it } of flat) if (it.t === "q" && it.parts?.length > 2) {
    const ps = it.parts; const out = []; let i = 0;
    while (i < ps.length) {
      const x = ps[i];
      if (x.l === "i" && ps[i + 1]?.l === "ii" && out.length && !out[out.length - 1].parts?.length) { const host = out[out.length - 1]; host.parts = []; while (i < ps.length && /^(i|ii|iii|iv|v|vi|vii|viii)$/.test(ps[i].l || "")) host.parts.push(ps[i++]); continue; }
      out.push(x); i++;
    }
    it.parts = out;
  }
  // a section that ends up with no questions loses its heading
  flat = flat.filter(({ it }, i) => { if (it.t !== "h") return true; const nx = flat[i + 1]; return nx && nx.it.t !== "h"; });
  // numbering runs on within a section (the printed number of the first question is kept); ids are unique inside the paper
  { let last = null; for (const { it } of flat) { if (it.t === "h") { last = null; continue; } if (it.t !== "q") continue; const n = parseInt(it.n, 10); it.n = String(last === null ? (Number.isFinite(n) ? n : 1) : last + 1); last = parseInt(it.n, 10); } }
  { const used = new Set(); let sec = 0; for (const { it } of flat) { if (it.t === "h") { sec++; continue; } if (it.t !== "q") continue; let id = "q" + it.n; if (used.has(id)) id = "s" + sec + "-q" + it.n; used.add(id); it.id = id; } }
  for (const pg of p.pages) pg.items = flat.filter((x) => x.pg === pg).map((x) => x.it);
  // department names written several ways on the scans
  p.department = String(p.department || "").replace(/Communal/g, "Community").replace(/ & /g, " and ").replace(/^Department Community/, "Department of Community").replace(/Dental Science$/, "Dental Sciences").replace(/Community Health Epidemiology/, "Community Health, Epidemiology");
  return p;
}

if (process.argv[1]?.endsWith("normalise-dental.mjs")) {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../src/content/dental");
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) { const p = normalisePaper(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); fs.writeFileSync(path.join(dir, f), JSON.stringify(p, null, 1) + "\n"); n++; }
  console.log("normalised", n);
}
