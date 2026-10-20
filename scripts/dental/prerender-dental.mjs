// Writes a real HTML page for every dental page (home, papers list, categories, units, and each paper with its questions and the model answers written so far),
// so Google and link previews get the right title, description, canonical and text without running JavaScript. Called from scripts/library/prerender.mjs.
// These pages are listed in the dental sitemaps, not in library-sitemap.xml. A failed answers lookup never fails the build: the pages are written without answers.
import { answerUnits } from "../../src/lib/dentalKeys.js";

const SB = "https://dekyjrfwvavtoivqivno.supabase.co";
const KEY = "sb_publishable_jOXeiFMWJj1z_M-zShimXA_cG9f2QxL"; // the public (publishable) key, the same one the site ships to browsers

async function rest(table, query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${table}?${query}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(30000) });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function prerenderDental({ fs, path, root, esc, shell, crumbs, write, render }) {
  const dir = path.join(root, "src/content/dental");
  if (!fs.existsSync(dir)) return 0;
  const papers = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const index = JSON.parse(fs.readFileSync(path.join(root, "src/data/dentalPapers.json"), "utf8"));
  const answers = new Map((await rest("paper_answers", "select=slug,qkey,answer&answer=not.is.null&limit=3000")).map((r) => [`${r.slug}|${r.qkey}`, r.answer]));
  const seo = new Map((await rest("paper_seo", "select=*")).map((r) => [r.slug, r]));
  const put = (p, html) => write(p, html, undefined, false);
  const brand = "Ompath Study";
  const image = "/og-default.jpg";
  const ansHtml = (t) => `<div><strong>Model answer</strong><ul>${String(t).replace(/\\n/g, "\n").split("\n").filter((l) => l.trim()).map((l) => `<li>${esc(l.replace(/^\s*[-•*]\s+/, "").replace(/\*\*/g, ""))}</li>`).join("")}</ul></div>`;
  const plain = (t) => String(t).replace(/\\n/g, "\n").replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "").replace(/\s*\n\s*/g, ". ").replace(/\.\.+/g, ".").trim();
  const partsHtml = (parts) => (parts?.length ? `<ol>${parts.map((p) => `<li>${p.l ? esc(p.l) + ") " : ""}${esc(p.text)}${p.marks ? ` (${p.marks} marks)` : ""}${partsHtml(p.parts)}</li>`).join("")}</ol>` : "");
  const list = (rows) => `<ul>${rows.map((p) => `<li><a href="/dental/papers/${p.slug}">${esc(p.unitTitle)}: ${esc(p.sitting || "Exam")}, ${esc(p.date)}</a> — ${p.questions} questions</li>`).join("")}</ul>`;
  const ld = (obj) => ({ "@context": "https://schema.org", ...obj });
  const crumbLd = (items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item: `https://www.ompathstudy.com${item}` })) });
  let n = 0;

  // ---- each paper ----
  for (const p of papers) {
    const meta = index.find((x) => x.slug === p.slug); if (!meta) continue;
    const when = p.dateLabel || p.date;
    const sd = seo.get(p.slug);
    const qs = p.pages.flatMap((pg) => pg.items);
    const qn = qs.filter((i) => i.t === "q").length;
    const desc = (sd?.description || `${p.unitTitle} (${p.unitCode}) ${p.sitting || "exam"} past paper from ${p.university}${when ? `, ${when}` : ""}: ${qn} questions, set out question by question with model answers.`).replace(/\s+/g, " ").slice(0, 300);
    const faq = [];
    const body = qs.map((it) => {
      if (it.t === "h") return `<h2>${esc(it.text)}${it.marks ? ` (${it.marks} marks)` : ""}</h2>`;
      if (it.t === "p") return `<p><em>${esc(it.text)}</em></p>`;
      const us = answerUnits(it);
      const a0 = !it.parts?.length ? answers.get(`${p.slug}|${us[0].key}`) : null;
      if (a0) faq.push({ q: it.text, a: a0 });
      const inner = it.parts?.length ? `<ol>${it.parts.map((pt, j) => { const a = answers.get(`${p.slug}|${us[j]?.key}`); if (a) faq.push({ q: `${it.text} ${pt.l}) ${pt.text}`.trim(), a }); return `<li>${pt.l ? esc(pt.l) + ") " : ""}${esc(pt.text)}${pt.marks ? ` (${pt.marks} marks)` : ""}${partsHtml(pt.parts)}${a ? ansHtml(a) : ""}</li>`; }).join("")}</ol>` : "";
      return `<div><p><strong>${esc(it.n)}.</strong> ${esc(it.text)}${it.marks ? ` (${it.marks} marks)` : ""}</p>${inner}${a0 ? ansHtml(a0) : ""}</div>`;
    }).join("");
    const url = `/dental/papers/${p.slug}`;
    const trail = [["Dental", "/dental"], [p.category || "Past papers", `/dental/category/${p.categorySlug}`], [p.unitTitle, `/dental/units/${p.unitSlug}`], [p.title, url]];
    const graph = [crumbLd(trail), { "@type": "LearningResource", name: p.title, description: desc, educationalLevel: (p.programmes || []).join(", "), inLanguage: "en", learningResourceType: "Exam paper", keywords: (sd?.keywords || []).join(", "), isAccessibleForFree: true, publisher: { "@type": "Organization", name: brand, url: "https://www.ompathstudy.com" }, url: `https://www.ompathstudy.com${url}` }];
    if (faq.length) graph.push({ "@type": "FAQPage", mainEntity: faq.slice(0, 10).map((f) => ({ "@type": "Question", name: f.q.slice(0, 300), acceptedAnswer: { "@type": "Answer", text: plain(f.a).slice(0, 700) } })) });
    put(url, render({
      title: `${p.unitTitle}, ${p.sitting || "Exam"} ${when}: past paper with answers | ${brand}`, description: desc, path: url, image,
      keywords: sd?.keywords?.length ? sd.keywords : [`${p.unitTitle} past paper`, `${p.unitCode}`, "Mount Kenya University past papers", ...(p.programmes || [])],
      body: shell(crumbs([["Dental", "/dental"], [p.category || "Past papers", `/dental/category/${p.categorySlug}`], [p.unitTitle, `/dental/units/${p.unitSlug}`], [p.sitting || "Exam", null]]) +
        `<h1>${esc(p.unitTitle)}: ${esc(p.sitting || "Exam")}, ${esc(when)}</h1><p>${esc(p.university)} · ${esc(p.department || p.school)} · ${esc((p.programmes || []).join(", "))} · ${esc(p.unitCode)}</p><p>${esc(desc)}</p>${p.instructions ? `<p><strong>Instructions:</strong> ${esc(p.instructions)}</p>` : ""}${body}` +
        `<p><a href="/dental/units/${p.unitSlug}">More ${esc(p.unitTitle)} papers</a> · <a href="/dental/papers">All dental past papers</a></p>`),
      jsonLd: { "@context": "https://schema.org", "@graph": graph },
    })); n++;
  }

  // ---- hubs ----
  const cats = [...new Map(index.map((x) => [x.categorySlug, x.group])).entries()];
  const blurb = { "basic-dental-sciences": "Anatomy, physiology, oral biology and oral pathology for dental students.", "community-and-public-health": "Community health, health education and promotion, and primary health care.", "biostatistics-and-research": "Biostatistics, research methods and data analysis for health students.", "other-units": "More units from the same colleges." };
  const unitsOf = (slug) => [...new Map(index.filter((x) => x.categorySlug === slug).map((x) => [x.unitSlug, x.unitTitle])).entries()];
  const hub = (url, title, description, inner, trail, name) => { put(url, render({ title, description, path: url, image, keywords: ["Mount Kenya University past papers", "dental past papers", "community health past papers", name], body: shell(crumbs(trail.map(([a, b], i) => [a, i === trail.length - 1 ? null : b])) + inner), jsonLd: { "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", name, description, url: `https://www.ompathstudy.com${url}`, isPartOf: { "@type": "WebSite", name: brand, url: "https://www.ompathstudy.com" } }, crumbLd(trail)] } })); n++; };
  const homeDesc = "Dental, oral health and community health past papers by subject, unit and year, set out question by question with model answers.";
  hub("/dental", `Dental and Oral Health Past Papers with Answers | ${brand}`, homeDesc, `<h1>Dental Sciences, in one place</h1><p>${esc(homeDesc)}</p>${cats.map(([s, name]) => `<h2><a href="/dental/category/${s}">${esc(name)}</a></h2><ul>${unitsOf(s).map(([us, ut]) => `<li><a href="/dental/units/${us}">${esc(ut)}</a></li>`).join("")}</ul>`).join("")}`, [["Dental", "/dental"]], "Dental past papers");
  hub("/dental/papers", `All Dental and Oral Health Past Papers | ${brand}`, `${index.length} Mount Kenya University dental, oral health and community health past papers by unit and year, with model answers.`, `<h1>Past papers</h1>${cats.map(([s, name]) => `<h2>${esc(name)}</h2>${list(index.filter((x) => x.categorySlug === s))}`).join("")}`, [["Dental", "/dental"], ["Past papers", "/dental/papers"]], "Dental past papers");
  for (const [s, name] of cats) {
    const us = unitsOf(s); const c = index.filter((x) => x.categorySlug === s).length;
    hub(`/dental/category/${s}`, `${name} past papers with answers | ${brand}`, `${name}: ${c} Mount Kenya University past papers across ${us.length} unit${us.length === 1 ? "" : "s"} (${us.map((x) => x[1]).join(", ")}), with model answers. ${blurb[s] || ""}`.trim().slice(0, 300), `<h1>${esc(name)}</h1><p>${esc(blurb[s] || "")}</p>${us.map(([uslug, ut]) => `<h2><a href="/dental/units/${uslug}">${esc(ut)}</a></h2>${list(index.filter((x) => x.unitSlug === uslug))}`).join("")}`, [["Dental", "/dental"], [name, `/dental/category/${s}`]], `${name} past papers`);
  }
  for (const [uslug, ut] of [...new Map(index.map((x) => [x.unitSlug, x.unitTitle])).entries()]) {
    const rows = index.filter((x) => x.unitSlug === uslug); const f = rows[0];
    hub(`/dental/units/${uslug}`, `${ut} past papers with answers | ${brand}`, `${ut} (${f.unitCode}) past papers from ${f.university}: ${rows.length} papers for ${[...new Set(rows.flatMap((r) => r.programmes))].slice(0, 3).join(", ")}, with model answers and the questions that keep coming back.`.slice(0, 300), `<h1>${esc(ut)}</h1>${list(rows)}`, [["Dental", "/dental"], [f.group, `/dental/category/${f.categorySlug}`], [ut, `/dental/units/${uslug}`]], `${ut} past papers`);
  }
  return n;
}
