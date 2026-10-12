// Builds the topic pages from everything the site already teaches. Run it again whenever notes change (the daily workflow does).
//
//   node scripts/topics/build-topics.mjs [--fresh]      --fresh re-reads the database; otherwise the cached copy in .cache/ is used
//
// What it does, in plain words:
//   1. It finds topics (diseases, structures, processes) from note titles, headings, abbreviations and a seed list.
//   2. It counts where each topic is mentioned across notes, MCQ sets and essays, and keeps the ones the site really covers.
//   3. For each topic it collects: the notes about it, the sentences that define it, images, practice questions with answers, related topics.
//   4. It writes public/topics/<slug>.json (one per topic), public/topics/index.json and public/topics/aliases.json.
import fs from "fs";
import path from "path";
import { loadCorpus } from "./corpus.mjs";
import { SEED_LIST, SEED_TOPICS, GENERIC_TOKENS, DOMAINS, SEED_DOMAIN_OF } from "./seeds.mjs";

const OUT = "public/topics";
const MAX_TOPICS = Number(process.env.MAX_TOPICS || 1800);

// ------------------------------------------------------------------ helpers
const slugify = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normTok = (t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") && !/(is|us)$/.test(t) ? t.slice(0, -1) : t);
const tokens = (s) => (s.toLowerCase().replace(/[’']s\b/g, "").replace(/[-\/]/g, " ").match(/[a-z][a-z0-9]*/g) || []).map(normTok);
const key = (s) => tokens(s).join(" ");
const stripMd = (s) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`>#|]/g, " ").replace(/\s+/g, " ").trim();
const clean = (s) => stripMd(s).replace(/^[\p{Extended_Pictographic}\s\d.)(-]+/u, "").replace(/\s+/g, " ").trim();
const STRIP_TITLE = /\b(mcqs?|questions?|past papers?|cats?|exams?|examination|quiz|answers?|study guide|study notes?|notes?|comprehensive|overview|introduction to|complete|bank|revision|weekly|practice|test your knowledge|section [a-d]|key points?|summary|guide|review|essentials?|explained|made easy|high[- ]yield)\b/gi;

function unitOf(category = "") {
  const m = category.match(/Year\s*(\d)/i);
  const unit = category.replace(/^.*Year\s*\d\s*:?\s*/i, "").replace(/^Weekly Exam:\s*/i, "").trim();
  return { year: m ? Number(m[1]) : null, unit };
}
function voteDomain(votes, k) {
  const tally = new Map();
  for (const v of votes) { const d = domainOf(v.text.toLowerCase()); tally.set(d, (tally.get(d) || 0) + v.w); }
  const hint = domainOf(k);
  if (hint !== "Medicine") tally.set(hint, (tally.get(hint) || 0) + 3);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Medicine";
}
function domainOf(text) {
  const t = text.toLowerCase();
  for (const [name, re] of DOMAINS) if (re.test(t)) return name;
  return "Medicine";
}

// ------------------------------------------------------------------ documents
const corpus = process.argv.includes("--fresh") || !fs.existsSync(".cache/topics-corpus.json")
  ? await (async () => { const c = await loadCorpus(); fs.mkdirSync(".cache", { recursive: true }); fs.writeFileSync(".cache/topics-corpus.json", JSON.stringify(c)); return c; })()
  : JSON.parse(fs.readFileSync(".cache/topics-corpus.json", "utf8"));

if (corpus.articles.length < 100 && !process.env.ALLOW_SMALL) {
  console.error("corpus too small (" + corpus.articles.length + " articles): keeping the existing topic files");
  process.exit(1);
}
const docs = [];
const LF = (s) => String(s || "").replace(/\r\n?/g, "\n");
for (const n of corpus.notes) docs.push({ id: `n:${n.slug}`, kind: "note", title: n.title, url: `/notes/${n.slug}`, year: n.year, unit: n.unit, text: LF(n.text), updated: n.updated });
for (const a of corpus.articles) { const u = unitOf(a.category); docs.push({ id: `a:${a.id}`, kind: "article", title: a.title, url: `/blog/${a.slug || a.id}`, year: u.year, unit: u.unit, text: LF(a.content), updated: (a.updated_at || a.created_at || "").slice(0, 10) }); }
for (const m of corpus.mcqs) { const u = unitOf(m.category); docs.push({ id: `m:${m.id}`, kind: "mcq", title: m.title, url: `/mcqs/${m.slug || m.id}`, year: u.year, unit: u.unit, text: (m.questions || []).map((q) => q.question).join("\n"), questions: m.questions || [] }); }
for (const e of corpus.essays) { const u = unitOf(e.category); const qs = [...(e.short_answer_questions || []), ...(e.long_answer_questions || [])]; docs.push({ id: `e:${e.id}`, kind: "essay", title: e.title, url: `/essays/${e.slug || e.id}`, year: u.year, unit: u.unit, text: qs.map((q) => q.question).join("\n"), essayQs: qs }); }
console.log("documents:", docs.length);

// ------------------------------------------------------------------ candidates
const cand = new Map(); // normalised key -> { name, aliases:Set, titleDocs:Set, headDocs:Set, seed:boolean, acronyms:Set }
const SUFFIX = /(itis|osis|oma|emia|aemia|uria|pathy|plasia|plasm|cyte|virus|coccus|mycin|ectomy|ostomy|otomy|algia|trophy|penia|cytosis|rrhea|rrhoea|megaly|sclerosis|stenosis|fibrillation|infarction)$/;
const MULTI_SUFFIX = /(itis|osis|oma|emia|aemia|uria|pathy|plasia|virus|coccus|syndrome|disorder|disease|deficiency|failure|infarction|fibrillation|stenosis|sclerosis)$/;
const LEAD = /^(describes?|explain|discuss|outline|identify|list|define|types? of|causes? of|classification of|management of|diagnosis of|treatment of|clinical features? of|signs? of|its|several|key|common|normal|medical)\s+/i;
const ALLOW_DIGIT = /^(b\d+|hiv\d?|covid19|il\d+|h\d|tnf|p53|type|ii|iii|iv)$/;
const isGenericOnly = (toks) => toks.every((t) => GENERIC_TOKENS.has(t));
function addCand(raw, docId, where, extra = {}) {
  let name = extra.seed ? raw.trim() : clean(raw).replace(STRIP_TITLE, " ").replace(/\s+/g, " ").replace(/^[-—–:;,.&\s]+|[-—–:;,.&\s]+$/g, "").trim();
  if (!extra.seed) for (let i = 0; i < 2; i++) name = name.replace(LEAD, "");
  if (!extra.seed) name = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!extra.seed && /^(he|she|they|their|them|bind|binds|has|have|is|are|was|were|it|this|that|these|those|how|what|why|when|which|who|from|between|during|after|before|using|use|with|without|white|black|red tall|due to|design|year|junior|dynamic|sem)\b/i.test(name)) return;
  if (!name || name.length < 4 || name.length > 60 || /[,;]/.test(name)) return;
  if (name === name.toUpperCase() && name.length > 8 && !extra.seed && !/\([A-Z]{2,6}\)/.test(name)) { name = titleCase(name.toLowerCase()); }
  if (tokens(name).some((t) => /\d/.test(t) && !ALLOW_DIGIT.test(t))) return;
  const toks = tokens(name);
  if (toks.length === 0 || toks.length > 5 || (isGenericOnly(toks) && !extra.seed)) return;
  if (toks.length === 1 && !(SUFFIX.test(toks[0]) || SEED_TOPICS.has(toks[0]) || extra.seed)) return;
  if (/^(the|a|an|of|and|or|for|to|in|on|with)\b/i.test(name)) return;
  const k = toks.join(" ");
  let c = cand.get(k);
  if (!c) { c = { name, aliases: new Set(), titleDocs: new Set(), headDocs: new Set(), seed: Boolean(extra.seed), acronyms: new Set() }; cand.set(k, c); }
  if (where === "title") c.titleDocs.add(docId);
  if (where === "head") c.headDocs.add(docId);
  if (extra.seed) c.seed = true;
  if (name.length < c.name.length && where === "title") c.name = name;
}
function titleCase(s) { return s.replace(/\b([b-hj-z])\b/g, (m) => m.toUpperCase()).replace(/\b([a-z])([a-z]{2,})/g, (m, a, b) => a.toUpperCase() + b).replace(/\b(And|Of|The|In|On|For|To|With|Vs)\b/g, (w) => w.toLowerCase()); }

for (const s of SEED_LIST) addCand(s, "seed", "seed", { seed: true });
const acronymPairs = []; // [expansion, ACRONYM]
for (const d of docs) {
  const title = clean(d.title).replace(STRIP_TITLE, " ");
  for (const part of title.split(/\s*[:—–|]\s*|\s+-\s+|\s+&\s+|\s+and\s+/i)) addCand(part.replace(/\([^)]*\)/g, " "), d.id, "title");
  for (const m of d.title.matchAll(/([A-Za-z][A-Za-z /-]{5,70})\(([A-Z]{2,6})\)/g)) acronymPairs.push([m[1].trim(), m[2]]);
  if (d.kind === "note" || d.kind === "article") {
    for (const line of d.text.split("\n")) {
      if (!/^#{1,4}\s/.test(line)) continue;
      const h = clean(line.replace(/^#+\s*/, "")).replace(/^(definition|overview|causes?|types?|clinical features?|management|treatment|diagnosis|pathophysiology|classification|complications?)\s+of\s+/i, "");
      addCand(h, d.id, "head");
      for (const m of line.matchAll(/([A-Za-z][A-Za-z /-]{5,70})\(([A-Z]{2,6})\)/g)) acronymPairs.push([m[1].trim(), m[2]]);
    }
  }
  // "Oppositional defiant disorder (ODD)" inside running text
  if (d.kind === "note" || d.kind === "article") for (const m of d.text.matchAll(/\b([A-Z][a-z]+(?: [a-z]+){1,5})\s+\(([A-Z]{2,6})\)/g)) acronymPairs.push([m[1].trim(), m[2]]);
}
for (const [exp, ac] of acronymPairs) {
  const k = key(exp.replace(/^(the|a|an)\s+/i, ""));
  const c = cand.get(k);
  if (c) c.acronyms.add(ac);
  else { addCand(exp, "acr", "title"); const c2 = cand.get(k); if (c2) c2.acronyms.add(ac); }
}
console.log("candidates:", cand.size);

// ------------------------------------------------------------------ count mentions
const byKey = cand; // key -> candidate
const hits = new Map(); // key -> Map(docIdx -> {n, inTitle})
const acHits = new Map(); // ACRONYM -> key
for (const [k, c] of cand) for (const ac of c.acronyms) if (ac.length >= 3 && !acHits.has(ac)) acHits.set(ac, k);
const MAXN = 5;
function gramsOf(toks, cb) {
  for (let i = 0; i < toks.length; i++) {
    let g = "";
    for (let n = 1; n <= MAXN && i + n <= toks.length; n++) { g = n === 1 ? toks[i] : `${g} ${toks[i + n - 1]}`; cb(g, i); }
  }
}
docs.forEach((d, idx) => {
  const titleToks = tokens(clean(d.title));
  const titleGrams = new Set();
  gramsOf(titleToks, (g) => titleGrams.add(g));
  const toks = tokens(stripMd(d.text));
  gramsOf(toks, (g) => {
    if (!byKey.has(g)) return;
    let m = hits.get(g); if (!m) hits.set(g, (m = new Map()));
    const e = m.get(idx) || { n: 0, inTitle: titleGrams.has(g) };
    e.n++; m.set(idx, e);
  });
  for (const g of titleGrams) if (byKey.has(g)) { let m = hits.get(g); if (!m) hits.set(g, (m = new Map())); const e = m.get(idx) || { n: 0, inTitle: true }; e.inTitle = true; m.set(idx, e); }
  // acronyms (case sensitive)
  for (const a of stripMd(d.text).match(/\b[A-Z]{3,6}\b/g) || []) {
    const k = acHits.get(a); if (!k) continue;
    const m = hits.get(k);
    if (!m || !m.has(idx)) continue;
    m.get(idx).n++;
  }
});

// ------------------------------------------------------------------ choose topics
const total = docs.length;
const chosen = [];
for (const [k, c] of cand) {
  const m = hits.get(k); if (!m) continue;
  const nd = m.size;
  // a subject the curated study notes are written about needs only that one note; anything else needs three pages
  const curated = c.seed || [...c.titleDocs].some((x) => x.startsWith("n:")) || ([...c.headDocs].some((x) => x.startsWith("n:")) && k.split(" ").length >= 2);
  if (nd < (curated ? 1 : 3) || nd > total * 0.5) continue;
  const toks = k.split(" ");
  const strong = c.titleDocs.size >= 1 || c.seed || (c.headDocs.size >= 2 && toks.length > 1 && MULTI_SUFFIX.test(toks[toks.length - 1]));
  if (!strong) continue;
  const inTitle = [...m.values()].filter((e) => e.inTitle).length;
  const score = nd + inTitle * 3 + c.titleDocs.size * 2 + (c.seed ? 6 : 0) + Math.min(10, c.headDocs.size);
  chosen.push({ k, c, m, nd, score });
}
chosen.sort((a, b) => b.score - a.score);
const kept = chosen.slice(0, MAX_TOPICS);
// drop a short topic whose every document is also a document of a longer topic that contains it ("hepatitis" is kept, "hepatitis b" too)
console.log("topics kept:", kept.length, "of", chosen.length);

const slugs = new Map();
const topics = kept.map((t) => {
  let name = titleCase(t.c.name.length <= 6 && t.c.name === t.c.name.toUpperCase() ? t.c.name : t.c.name);
  let slug = slugify(name) || slugify(t.k);
  if (slugs.has(slug)) slug = `${slug}-${slugs.size}`;
  slugs.set(slug, true);
  return { ...t, name, slug };
});
const topicByKey = new Map(topics.map((t) => [t.k, t]));
const seedDomain = new Map(SEED_DOMAIN_OF);

// ------------------------------------------------------------------ gather material
const SENT = /(?<=[.!?])\s+(?=[A-Z0-9])|\n+/;
const snippets = new Map(topics.map((t) => [t.slug, []]));
const sections = new Map(topics.map((t) => [t.slug, []]));
const images = new Map(topics.map((t) => [t.slug, []]));
const questions = new Map(topics.map((t) => [t.slug, []]));
const essays = new Map(topics.map((t) => [t.slug, []]));
const KIND_RANK = { note: 0, article: 1, essay: 2, mcq: 3 };
const defRe = /\b(is|are|refers to|means|defined as|characteri[sz]ed by|results from|caused by|occurs when)\b/i;

docs.forEach((d, idx) => {
  if (d.kind === "mcq" || d.kind === "essay") return;
  const seenPerTopic = new Map();
  for (const raw of stripMdKeepLines(d.text).split(SENT)) {
    const s = raw.trim();
    if (s.length < 55 || s.length > 280 || /^[#|>\-*\d]/.test(s) && s.length < 80) continue;
    if (/\?\s*$/.test(s) || /^(answer|explanation|question|a\.|b\.|c\.|d\.|e\.)/i.test(s)) continue;
    const found = new Set();
    gramsOf(tokens(s), (g) => { const t = topicByKey.get(g); if (t && hits.get(g)?.has(idx)) found.add(t.slug); });
    for (const slug of found) {
      const list = snippets.get(slug);
      const c = seenPerTopic.get(slug) || 0;
      if (c >= 2 || list.length >= 14) continue;
      list.push({ t: s, d: idx, def: defRe.test(s) ? 1 : 0, rank: KIND_RANK[d.kind] });
      seenPerTopic.set(slug, c + 1);
    }
  }
  // sections: "### Oppositional defiant disorder (ODD)" followed by its text
  if (d.kind === "note" || d.kind === "article") {
    const lines = d.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const hm = lines[i].match(/^(#{2,4})\s+(.*)$/);
      if (!hm) continue;
      const headText = clean(hm[2]).replace(/\([^)]*\)/g, " ").replace(/^(definition|overview|introduction)( and| of)?\s+/i, "").replace(/\s+/g, " ").trim();
      const t = topicByKey.get(key(headText));
      if (!t) continue;
      const body = [];
      for (let j = i + 1; j < lines.length && body.length < 5; j++) {
        if (/^#{1,4}\s/.test(lines[j])) break;
        const l = clean(lines[j]);
        if (l.length < 25 || /^(answer|explanation|question)\b/i.test(l) || /^\|/.test(lines[j].trim())) continue;
        body.push(l.slice(0, 240));
      }
      const list = sections.get(t.slug);
      if (body.length && list.length < 5) list.push({ h: hm[2].replace(/[*_`]/g, "").replace(/^[\d.\s]+/, "").trim(), b: body, u: d.url + "#" + slugify(clean(hm[2])), s: d.title.slice(0, 80), d: idx, rank: KIND_RANK[d.kind], len: body.join(" ").length });
    }
  }
  // images
  for (const m of d.text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const alt = m[1].replace(/\s+/g, " ").trim();
    if (!alt || /^(page \d+|image|figure|img)\b/i.test(alt) || /logo|icon|avatar/i.test(m[2])) continue;
    const ctx = `${alt} ${stripMd(d.text.slice(m.index + m[0].length, m.index + m[0].length + 240))}`;
    const found = new Set();
    gramsOf(tokens(ctx), (g) => { const t = topicByKey.get(g); if (t) found.add(t.slug); });
    for (const slug of found) { const list = images.get(slug); if (list.length < 8 && !list.some((x) => x.u === m[2])) list.push({ u: m[2], a: alt.slice(0, 140), d: idx }); }
  }
});
function stripMdKeepLines(s) { return s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`/g, "").replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "").replace(/[ \t]+/g, " "); }

docs.forEach((d, idx) => {
  if (d.kind === "mcq") {
    for (const q of d.questions) {
      if (!q.question || !Array.isArray(q.options) || q.options.length < 2 || typeof q.correct_answer !== "number") continue;
      const found = new Set();
      gramsOf(tokens(q.question), (g) => { const t = topicByKey.get(g); if (t) found.add(t.slug); });
      for (const slug of found) {
        const list = questions.get(slug);
        if (list.length >= 40) continue;
        list.push({ q: q.question.slice(0, 400), o: q.options.map((o) => String(o).slice(0, 160)), a: q.correct_answer, e: (q.explanation || "").slice(0, 420), d: idx, h: q.explanation ? 1 : 0 });
      }
    }
  } else if (d.kind === "essay") {
    for (const q of d.essayQs) {
      if (!q.question || !q.model_answer) continue;
      const found = new Set();
      gramsOf(tokens(q.question), (g) => { const t = topicByKey.get(g); if (t) found.add(t.slug); });
      for (const slug of found) { const list = essays.get(slug); if (list.length < 10) list.push({ q: q.question.slice(0, 300), m: String(q.model_answer).slice(0, 700), marks: q.marks || null, d: idx }); }
    }
  }
});

// ------------------------------------------------------------------ conditions in the pharmacology guide
const condText = fs.existsSync("src/pharm/conditions.ts") ? fs.readFileSync("src/pharm/conditions.ts", "utf8") : "";
const conditions = [...condText.matchAll(/^\s*c\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[((?:"[^"]*",?\s*)+)\]/gm)].map((m) => ({ id: m[1], name: m[2], first: [...m[4].matchAll(/"([^"]*)"/g)].map((x) => x[1]) }));

// ------------------------------------------------------------------ related topics (documents in common)
const docSets = topics.map((t) => new Set(t.m.keys()));
function related(i) {
  const out = [];
  for (let j = 0; j < topics.length; j++) {
    if (j === i) continue;
    let shared = 0;
    const small = docSets[i].size < docSets[j].size ? docSets[i] : docSets[j];
    const big = small === docSets[i] ? docSets[j] : docSets[i];
    for (const x of small) if (big.has(x)) shared++;
    if (shared >= 2 && !/marking scheme|assessment test|past paper|supplementary|sem \d/i.test(topics[j].name)) out.push({ j, s: shared / Math.sqrt(docSets[i].size * docSets[j].size) + (seedDomain.get(topics[i].k) && seedDomain.get(topics[i].k) === seedDomain.get(topics[j].k) ? 0.1 : 0) });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 10).map((x) => topics[x.j]);
}

// ------------------------------------------------------------------ write
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const aiDir = "src/data/topicAi";
const index = [];
const aliasMap = {};
const SCORE_NOTE = (e) => (e.inTitle ? 100 : 0) + e.n;
topics.forEach((t, i) => {
  const dlist = [...t.m.entries()].map(([idx, e]) => ({ idx, e, d: docs[idx] })).sort((a, b) => SCORE_NOTE(b.e) - SCORE_NOTE(a.e) || KIND_RANK[a.d.kind] - KIND_RANK[b.d.kind]);
  const relevant = (x) => x.e.inTitle || x.e.n >= 3;
  const sources = dlist.filter((x) => (x.d.kind === "note" || x.d.kind === "article") && relevant(x)).slice(0, 10).map((x) => ({ t: x.d.title.replace(/\s+—\s+Past Paper.*$/i, ""), u: x.d.url, k: x.d.kind, y: x.d.year, n: x.d.unit, m: x.e.inTitle ? 1 : 0 }));
  const sets = dlist.filter((x) => (x.d.kind === "mcq" || x.d.kind === "essay") && (x.e.inTitle || x.e.n >= 2)).slice(0, 6).map((x) => ({ t: x.d.title, u: x.d.url, k: x.d.kind, y: x.d.year, n: x.d.unit }));
  const snip = snippets.get(t.slug).sort((a, b) => b.def - a.def || a.rank - b.rank).filter((s, ix, arr) => arr.findIndex((o) => o.t === s.t) === ix).slice(0, 8).map((s) => ({ t: s.t, u: docs[s.d].url, s: docs[s.d].title.slice(0, 80) }));
  const qs = questions.get(t.slug).sort((a, b) => b.h - a.h).slice(0, 8).map((q) => ({ q: q.q, o: q.o, a: q.a, e: q.e, u: docs[q.d].url, s: docs[q.d].title.slice(0, 80) }));
  const es = essays.get(t.slug).slice(0, 4).map((q) => ({ q: q.q, m: q.m, k: q.marks, u: docs[q.d].url, s: docs[q.d].title.slice(0, 80) }));
  const imgs = images.get(t.slug).slice(0, 8).map((im) => ({ u: im.u, a: im.a, p: docs[im.d].url, s: docs[im.d].title.slice(0, 80) }));
  const years = [...new Set(dlist.map((x) => x.d.year).filter(Boolean))].sort();
  const domain = seedDomain.get(t.k) || voteDomain(dlist.slice(0, 40).map((x) => ({ text: `${x.d.unit}`, w: 1 + (x.e.inTitle ? 2 : 0) })), t.k);
  const rel = related(i).map((r) => ({ s: r.slug, n: r.name }));
  const cond = conditions.find((c) => key(c.name.replace(/\([^)]*\)/g, "")) === t.k || key(c.name).startsWith(t.k + " ") || t.k.startsWith(key(c.name) + " "));
  const aiFile = path.join(aiDir, `${t.slug}.json`);
  const ai = fs.existsSync(aiFile) ? JSON.parse(fs.readFileSync(aiFile, "utf8")) : null;
  const acr = [...t.c.acronyms];
  const body = {
    s: t.slug, n: t.name, c: domain, y: years, a: acr, docs: t.nd,
    lead: snip.find((x) => defRe.test(x.t)) || snip[0] || null,
    sec: sections.get(t.slug).sort((a, b) => a.rank - b.rank || b.len - a.len).slice(0, 4).map((x) => ({ h: x.h, b: x.b, u: x.u, s: x.s })),
    src: sources, sets, snip, imgs, qs, es, rel,
    rx: cond ? { id: cond.id, name: cond.name, first: cond.first.slice(0, 3) } : null,
    ai: ai ? { ...ai, reviewed: Boolean(ai.reviewed) } : null,
  };
  fs.writeFileSync(path.join(OUT, `${t.slug}.json`), JSON.stringify(body));
  index.push({ s: t.slug, n: t.name, c: domain, y: years, d: t.nd, q: qs.length + es.length, i: imgs.length, a: acr, ai: ai ? 1 : 0 });
  for (const a of acr) aliasMap[a.toLowerCase()] = t.slug;
  aliasMap[slugify(t.name)] = t.slug;
});
index.sort((a, b) => b.d - a.d);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
fs.writeFileSync(path.join(OUT, "aliases.json"), JSON.stringify(aliasMap));
console.log(`wrote ${topics.length} topic pages to ${OUT}/ (${(fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0) / 1e6).toFixed(1)} MB)`);
