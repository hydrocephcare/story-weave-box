// Writes a real HTML page for every past-paper page (each section's home, papers list, categories, units, and every paper with its questions and the model
// answers written so far), so Google and link previews (WhatsApp, Telegram, X) get the right title, description, canonical and a share card without running
// JavaScript. Called from scripts/library/prerender.mjs. These pages are listed in the section sitemaps, not in library-sitemap.xml.
// A failed answers lookup never fails the build: the pages are written without answers.
import { answerUnits } from "../../src/lib/dentalKeys.js";

const SB = "https://strfwaqvxvkhjbqrwmla.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE"; // the public (publishable) key, the same one the site ships to browsers
const SITE = "https://www.ompathstudy.com";

async function rest(table, query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${table}?${query}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(30000) });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function prerenderDental({ fs, path, root, esc, shell, crumbs, write, render }) {
  const dir = path.join(root, "src/content/dental");
  if (!fs.existsSync(dir)) return 0;
  const sections = JSON.parse(fs.readFileSync(path.join(root, "src/data/sections.json"), "utf8"));
  const catInfo = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, "src/data/dentalCategories.json"), "utf8")).map((c) => [c.slug, c]));
  const papers = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const index = JSON.parse(fs.readFileSync(path.join(root, "src/data/dentalPapers.json"), "utf8"));
  const answers = new Map((await rest("paper_answers", "select=slug,qkey,answer&answer=not.is.null&limit=10000")).map((r) => [`${r.slug}|${r.qkey}`, r.answer]));
  const seo = new Map((await rest("paper_seo", "select=*&limit=2000")).map((r) => [r.slug, r]));
  const secOf = (slug) => sections.find((s) => s.slug === slug);
  const put = (p, html) => write(p, html, undefined, false);
  const brand = "Ompath Study";
  // a share card per page: the unit or section name on a branded card (the same card service the notes use)
  const card = (title, sub, kind = "Past papers") => `/api/note-card?title=${encodeURIComponent(String(title).slice(0, 80))}&unit=${encodeURIComponent(String(sub || "").slice(0, 80))}&kind=${encodeURIComponent(kind)}`;
  const nl = String.fromCharCode(10), bs = String.fromCharCode(92);
  const fixNl = (t) => String(t).split(bs + "n").join(nl);
  const ansHtml = (t) => `<div><strong>Model answer</strong><ul>${fixNl(t).split(nl).filter((l) => l.trim()).map((l) => `<li>${esc(l.replace(/^\s*[-•*]\s+/, "").replace(/\*\*/g, ""))}</li>`).join("")}</ul></div>`;
  const plain = (t) => fixNl(t).replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "").replace(/\s*\n\s*/g, ". ").replace(/\.\.+/g, ".").trim();
  const partsHtml = (parts) => (parts?.length ? `<ol>${parts.map((p) => `<li>${p.l ? esc(p.l) + ") " : ""}${esc(p.text)}${p.marks ? ` (${p.marks} marks)` : ""}${partsHtml(p.parts)}</li>`).join("")}</ol>` : "");
  const list = (rows) => `<ul>${rows.map((p) => `<li><a href="/${p.section}/papers/${p.slug}">${esc(p.unitTitle)}: ${esc(p.sitting || "Exam")}, ${esc(p.date)}</a> — ${p.questions} questions</li>`).join("")}</ul>`;
  const crumbLd = (items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${item}` })) });
  let n = 0;

  // ---- each paper ----
  for (const p of papers) {
    const meta = index.find((x) => x.slug === p.slug); if (!meta) continue;
    const sec = secOf(meta.section);
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
    const base = `/${sec.slug}`, url = `${base}/papers/${p.slug}`;
    const trail = [[sec.name, base], [p.category || "Past papers", `${base}/category/${p.categorySlug}`], [p.unitTitle, `${base}/units/${p.unitSlug}`], [p.title, url]];
    const graph = [crumbLd(trail), { "@type": "LearningResource", name: p.title, description: desc, educationalLevel: (p.programmes || []).join(", "), inLanguage: "en", learningResourceType: "Exam paper", keywords: (sd?.keywords || []).join(", "), isAccessibleForFree: true, publisher: { "@type": "Organization", name: brand, url: SITE }, url: `${SITE}${url}` }];
    if (faq.length) graph.push({ "@type": "FAQPage", mainEntity: faq.slice(0, 10).map((f) => ({ "@type": "Question", name: f.q.slice(0, 300), acceptedAnswer: { "@type": "Answer", text: plain(f.a).slice(0, 700) } })) });
    put(url, render({
      title: `${p.unitTitle}, ${p.sitting || "Exam"} ${when}: past paper with answers | ${brand}`, description: desc, path: url,
      image: card(p.unitTitle, `${p.sitting || "Exam"} · ${when}`, "Past paper with answers"),
      keywords: sd?.keywords?.length ? sd.keywords : [`${p.unitTitle} past paper`, `${p.unitCode}`, "Mount Kenya University past papers", ...(p.programmes || [])],
      body: shell(crumbs([[sec.name, base], [p.category || "Past papers", `${base}/category/${p.categorySlug}`], [p.unitTitle, `${base}/units/${p.unitSlug}`], [p.sitting || "Exam", null]]) +
        `<h1>${esc(p.unitTitle)}: ${esc(p.sitting || "Exam")}, ${esc(when)}</h1><p>${esc(p.university)} · ${esc(p.department || p.school)} · ${esc((p.programmes || []).join(", "))} · ${esc(p.unitCode)}</p><p>${esc(desc)}</p>${p.instructions ? `<p><strong>Instructions:</strong> ${esc(p.instructions)}</p>` : ""}${body}` +
        `<p><a href="${base}/units/${p.unitSlug}">More ${esc(p.unitTitle)} papers</a> · <a href="${base}/papers">All ${esc(sec.name)} past papers</a></p>`),
      jsonLd: { "@context": "https://schema.org", "@graph": graph },
    })); n++;
  }

  // ---- hubs, per section ----
  const hub = (url, title, description, inner, trail, name, img) => { put(url, render({ title, description, path: url, image: img, keywords: ["Mount Kenya University past papers", name], body: shell(crumbs(trail.map(([a, b], i) => [a, i === trail.length - 1 ? null : b])) + inner), jsonLd: { "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", name, description, url: `${SITE}${url}`, isPartOf: { "@type": "WebSite", name: brand, url: SITE } }, crumbLd(trail)] } })); n++; };
  for (const sec of sections) {
    const rows = index.filter((x) => x.section === sec.slug); if (!rows.length) continue;
    const base = `/${sec.slug}`;
    const cats = [...new Map(rows.map((x) => [x.categorySlug, x.group])).entries()];
    const unitsOf = (slug) => [...new Map(rows.filter((x) => x.categorySlug === slug).map((x) => [x.unitSlug, x.unitTitle])).entries()];
    hub(base, `${sec.title}: past papers with answers | ${brand}`, sec.blurb, `<h1>${esc(sec.title)}</h1><p>${esc(sec.blurb)}</p>${cats.map(([s, name]) => `<h2><a href="${base}/category/${s}">${esc(name)}</a></h2><ul>${unitsOf(s).map(([us, ut]) => `<li><a href="${base}/units/${us}">${esc(ut)}</a></li>`).join("")}</ul>`).join("")}`, [[sec.name, base]], `${sec.name} past papers`, card(sec.title, `${rows.length} past papers with answers`));
    hub(`${base}/papers`, `All ${sec.name} past papers | ${brand}`, `${rows.length} Mount Kenya University ${sec.name} past papers by unit and year, with model answers.`, `<h1>Past papers</h1>${cats.map(([s, name]) => `<h2>${esc(name)}</h2>${list(rows.filter((x) => x.categorySlug === s))}`).join("")}`, [[sec.name, base], ["Past papers", `${base}/papers`]], `${sec.name} past papers`, card(`${sec.name} past papers`, `${rows.length} papers with answers`));
    for (const [s, name] of cats) {
      const us = unitsOf(s); const c = rows.filter((x) => x.categorySlug === s).length;
      hub(`${base}/category/${s}`, `${name} past papers with answers | ${brand}`, `${name}: ${c} Mount Kenya University past papers across ${us.length} unit${us.length === 1 ? "" : "s"} (${us.map((x) => x[1]).slice(0, 8).join(", ")}), with model answers. ${catInfo[s]?.blurb || ""}`.trim().slice(0, 300), `<h1>${esc(name)}</h1><p>${esc(catInfo[s]?.blurb || "")}</p>${us.map(([uslug, ut]) => `<h2><a href="${base}/units/${uslug}">${esc(ut)}</a></h2>${list(rows.filter((x) => x.unitSlug === uslug))}`).join("")}`, [[sec.name, base], [name, `${base}/category/${s}`]], `${name} past papers`, card(name, `${c} past papers with answers`));
    }
    for (const [uslug, ut] of [...new Map(rows.map((x) => [x.unitSlug, x.unitTitle])).entries()]) {
      const r = rows.filter((x) => x.unitSlug === uslug); const f = r[0];
      hub(`${base}/units/${uslug}`, `${ut} past papers with answers | ${brand}`, `${ut} (${f.unitCode}) past papers from ${f.university}: ${r.length} paper${r.length === 1 ? "" : "s"} for ${[...new Set(r.flatMap((x) => x.programmes))].slice(0, 3).join(", ")}, with model answers and the questions that keep coming back.`.slice(0, 300), `<h1>${esc(ut)}</h1>${list(r)}`, [[sec.name, base], [f.group, `${base}/category/${f.categorySlug}`], [ut, `${base}/units/${uslug}`]], `${ut} past papers`, card(ut, `${r.length} past papers · ${f.unitCode}`));
    }
  }
  return n;
}
