// Shared by the app (src/) and the build-time prerender (scripts/library/). Plain JS on purpose:
// no TypeScript syntax and no JSON import, so Node can run it directly.

/** @typedef {{ n: string, s: string, d?: Folder[], f?: [string, string, string][] }} Folder */
/** @typedef {{ year: number, slug: string, label: string, dataFile: string, title: string, tagline: string, rootLabel: string, theme: number }} LibraryDef */

/** @param {Folder} n @returns {number} */
export const countFiles = (n) => (n.f?.length ?? 0) + (n.d ?? []).reduce((s, c) => s + countFiles(c), 0);

/** Follow slug segments down the tree. `chain` holds every folder that resolved; `ok` is false if a segment was unknown. */
export function resolveSlugs(/** @type {Folder[]} */ roots, /** @type {string[]} */ slugs) {
  /** @type {Folder[]} */ const chain = [];
  let level = roots;
  for (const slug of slugs) {
    const next = level.find((x) => x.s === slug);
    if (!next) return { chain, ok: false };
    chain.push(next);
    level = next.d ?? [];
  }
  return { chain, ok: true };
}

export const libraryPath = (/** @type {LibraryDef} */ def, /** @type {string[]} */ slugs = []) => `/library/${def.slug}${slugs.map((s) => `/${s}`).join("")}`;

/** Thumbnail used when this page is shared: one per year and per subject (level-1 folder). */
export const ogImagePath = (/** @type {LibraryDef} */ def, /** @type {string | undefined} */ subjectSlug) =>
  subjectSlug ? `/og/library/${def.slug}-${subjectSlug}.jpg` : `/og/library/${def.slug}.jpg`;

const TYPE_PHRASE = {
  "Textbooks & Reference": "textbooks and reference books",
  "Lecture Slides": "lecture slides",
  "Notes & Handouts": "notes and handouts",
  "Questions, CATs & OSCEs": "past papers, CATs and OSCEs",
  "Past Papers & Questions": "past papers and questions",
  "Practicals & Lab Manuals": "practical and lab manuals",
  "Course Outlines": "course outlines",
  "Videos": "video lectures",
  "Images & Slide Atlas": "slide atlas images",
  "Images & Spot Pictures": "spot pictures",
  "Images & Figures": "figures and images",
};

/**
 * Titles, descriptions and share text for any library page.
 * @param {{ siteUrl: string, brand: string, credit: string, audience: string }} registry
 * @param {LibraryDef} def
 * @param {Folder[]} chain
 */
export function folderMeta(registry, def, chain, totalFiles = 0) {
  const names = chain.map((n) => n.n);
  const subject = names[0];
  const last = names[names.length - 1];
  const files = chain.length ? countFiles(chain[chain.length - 1]) : totalFiles;
  const fileText = files ? `${files.toLocaleString("en")} files` : "files";
  const slugs = chain.map((n) => n.s);
  const path = libraryPath(def, slugs);
  let title, description, h1, keywords;

  if (chain.length === 0) {
    h1 = def.title;
    title = `${def.label} MBChB Notes, Slides & Past Papers | ${registry.brand}`;
    description = `Free ${def.label} MBChB study library: ${def.tagline}. ${fileText} of lecture slides, notes, textbooks and past papers, sorted by ${def.rootLabel} for ${registry.audience}. ${(registry.seoCredit ?? registry.credit)}.`;
    keywords = [`${def.label} MBChB notes`, `${def.label} medicine notes`, "medical school past papers Kenya"];
  } else if (chain.length === 1) {
    h1 = `${def.label} ${subject} Notes`;
    title = `${def.label} ${subject} Notes, Slides & Past Papers | ${registry.brand}`;
    description = `${def.label} MBChB ${subject} notes, lecture slides, textbooks and past papers — ${fileText}, organised by type and topic. ${(registry.seoCredit ?? registry.credit)}.`;
    keywords = [`${def.label} ${subject} notes`, `${subject} MBChB`, `${subject} past papers`, `${subject} lecture slides`];
  } else {
    const phrase = TYPE_PHRASE[names[1]];
    h1 = `${def.label} ${subject} — ${names.slice(1).join(" › ")}`;
    title = `${def.label} ${subject}: ${names.slice(1).join(" › ")} | ${registry.brand}`;
    description = `${def.label} ${subject} ${names.length > 2 ? last + " " : ""}${phrase ?? names[1]} for MBChB students — ${fileText} to view or download. ${(registry.seoCredit ?? registry.credit)}, shared for ${registry.audience}.`;
    keywords = [`${def.label} ${subject} ${last}`, `${subject} ${last}`, `${last} notes`, `${last} MBChB`];
  }
  const shareText = chain.length
    ? `📚 ${def.label} ${subject}${chain.length > 1 ? " – " + names.slice(1).join(" › ") : " notes"}: ${fileText} (slides, past papers & books)\n${(registry.seoCredit ?? registry.credit)} · ${registry.brand}`
    : `📚 ${def.label} MBChB notes library: ${def.tagline}\n${(registry.seoCredit ?? registry.credit)} · ${registry.brand}`;
  return { title, description, h1, keywords, path, shareText, files, ogImage: ogImagePath(def, slugs[0]) };
}

/** Course-outline pages (psychiatry, internal-medicine, pharmacology). */
export function outlineMeta(registry, outline) {
  const path = `/course-outlines/${outline.slug}`;
  return {
    path,
    title: `${outline.title} — Weekly Topics & Progress Tracker | ${registry.brand}`,
    description: `${outline.title} (${outline.tagline}) with a tick-off checklist so you can track what you have revised. For ${registry.audience}. ${(registry.seoCredit ?? registry.credit)}.`,
    shareText: `✅ ${outline.title}: ${outline.tagline}. Tick off topics as you revise.\n${(registry.seoCredit ?? registry.credit)} · ${registry.brand}`,
    ogImage: `/og/library/outline-${outline.slug}.jpg`,
  };
}

/** Per-year teaching timetable pages (/timetable/year-1 …). */
export function timetableMeta(registry, tt) {
  const t = registry.timetables;
  const label = `Year ${tt.year}`;
  const path = `/timetable/${tt.slug}`;
  return {
    path,
    label,
    h1: `${label} MBChB teaching timetable`,
    title: `${label} Teaching Timetable, ${t.period} (${t.term}) | MBChB | ${registry.brand}`,
    description: `${label} MBChB (${tt.intake}) ${t.term} timetable for ${t.period}: weekly schedule, units, venues and lecturers. Teaching ${t.dates[0].value}; CAT ${t.dates[1].value}.`,
    shareText: `📅 ${label} MBChB timetable – ${t.term}, ${t.period}\nUnits, venues & lecturers · ${(registry.seoCredit ?? registry.credit)} · ${registry.brand}`,
    ogImage: `/og/library/timetable-${tt.slug}.jpg`,
    keywords: [`${label} MBChB timetable`, `${label} teaching timetable September December 2026`],
  };
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with", "from"]);
const KIND_WORD = { pdf: "PDF document", ppt: "Slides", doc: "Document", video: "Video lecture", img: "Image", zip: "Archive", file: "File" };

/** Tidy a Drive file name for display: no extension, no "_" or "copy" noise, sensible capitals. */
export function prettyTitle(/** @type {string} */ name) {
  let t = String(name).replace(/\.(pdf|pptx?|pps|docx?|xlsx?|mp4|mkv|mov|avi|zip|rar|jpe?g|png|gif|webp)$/i, "");
  try { t = decodeURIComponent(t); } catch { /* not URL-encoded */ }
  t = t
    .replace(/\s+_\s+/g, " – ")
    .replace(/_+/g, " ")
    .replace(/^copy of\s+/i, "")
    .replace(/^~\$/, "")
    .replace(/^\d{1,2}[.\-]\d{1,2}[.\-]\d{2,4}\s+/, "")
    .replace(/\s*[-–]?\s*copy(?:\s*\(\d+\))?\s*$/i, "")
    .replace(/\s*\(\d\)\s*$/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[\s\-–._]+|[\s\-–._,;:]+$/g, "");
  const letters = t.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length > 3 && t === t.toUpperCase();
  const lower = letters.length > 3 && t === t.toLowerCase();
  if (shouting || lower) {
    t = t.toLowerCase().replace(/[a-z][a-z']*/g, (w, i) => {
      if (shouting && w.length <= 3 && !SMALL_WORDS.has(w) && i > 0) return w.toUpperCase(); // ECG, CNS, GIT
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    });
  }
  return t || String(name);
}

/** One line that says what a file is and where it lives, for rows, thumbnails' alt text and structured data. */
export function fileBlurb(/** @type {string} */ kind, /** @type {string[]} */ trail = []) {
  return [KIND_WORD[kind] ?? "File", trail.filter(Boolean).join(" › ")].filter(Boolean).join(" · ");
}
