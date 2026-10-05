// Runs after `vite build`. Writes a real HTML page for every library folder and course outline, so that
//   * Google can index every folder and file title (the app itself is a single-page app), and
//   * WhatsApp / Telegram / Facebook show the right title, description and thumbnail when a link is shared
//     (they do not run JavaScript).
// Output: dist/library/<year>/<folder>/.../index.html, dist/course-outlines/..., dist/library-sitemap.xml
// This step never fails the build: if anything goes wrong the site still deploys, just without the extra pages.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countFiles, fileBlurb, folderMeta, libraryPath, outlineMeta, prettyTitle, timetableMeta } from "../../src/lib/libraryMeta.js";
import { mdToHtml } from "../../src/lib/miniMarkdown.js";
import { splitPaper } from "../../src/lib/paperAnswers.js";
import { linkDrugs } from "../../src/lib/noteLinks.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");

try {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "src/data/libraries.json"), "utf8"));
  const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  const outlines = JSON.parse(fs.readFileSync(path.join(root, "src/data/courseOutlines.json"), "utf8"));
  const site = registry.siteUrl;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const setTag = (html, re, tag) => (re.test(html) ? html.replace(re, tag) : html.replace("</head>", `    ${tag}\n  </head>`));

  function render({ title, description, path: pagePath, image, keywords, body, jsonLd }) {
    const url = `${site}${pagePath}`;
    const img = `${site}${image}`;
    let html = template;
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
    html = setTag(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`);
    html = setTag(html, /<meta name="keywords"[^>]*>/, `<meta name="keywords" content="${esc(keywords.join(", "))}">`);
    html = setTag(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
    html = setTag(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
    html = setTag(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`);
    html = setTag(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" />`);
    html = setTag(html, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${img}">`);
    html = setTag(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}" />`);
    html = setTag(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(description)}" />`);
    html = setTag(html, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${img}">`);
    const extra = [
      `<meta property="og:site_name" content="${esc(registry.brand)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${esc(title)}" />`,
      `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`,
    ].join("\n    ");
    html = html.replace("</head>", `    ${extra}\n  </head>`);
    html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    return html;
  }

  const shell = (inner) =>
    `<main style="max-width:960px;margin:0 auto;padding:24px 20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;color:#14302b">${inner}</main>`;
  const crumbs = (items) => `<nav aria-label="Breadcrumb" style="font-size:14px;margin-bottom:12px">${items.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : esc(label))).join(" › ")}</nav>`;
  const credit = `<p style="margin-top:28px;font-size:14px"><strong>${esc((registry.seoCredit ?? registry.credit))}</strong> · ${esc(registry.brand)} · shared for ${esc(registry.audience)}.</p>`;

  const written = [];
  // Only the books are for verified MKU students: they are not written out as public pages and are not in the sitemap.
  // Timetables are listed for Google, but the app asks for the student sign-in before showing them.
  const MKU_ONLY = /^\/books(\/|$)/;
  const write = (urlPath, html, lastmod) => {
    if (MKU_ONLY.test(urlPath)) return;
    const dir = path.join(dist, urlPath.replace(/^\//, ""));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
    written.push({ urlPath, lastmod });
  };

  // ---------------- library folders ----------------
  for (const def of registry.libraries) {
    const data = JSON.parse(fs.readFileSync(path.join(root, "public/data", def.dataFile), "utf8"));
    const total = data.d.reduce((s, n) => s + countFiles(n), 0);

    const visit = (nodes, chain) => {
      const meta = folderMeta(registry, def, chain, total);
      const slugs = chain.map((n) => n.s);
      const trail = [["Home", "/"], [def.label, `/year/${def.year}`], [def.title, libraryPath(def)]];
      chain.forEach((n, i) => trail.push([n.n, i === chain.length - 1 ? null : libraryPath(def, slugs.slice(0, i + 1))]));
      const folders = nodes.map((n) => `<li><a href="${libraryPath(def, [...slugs, n.s])}">${esc(n.n)}</a> — ${countFiles(n).toLocaleString("en")} files</li>`).join("");
      const here = chain.length ? chain[chain.length - 1] : null;
      const trailNames = [def.label, ...chain.map((n) => n.n)];
      const files = (here?.f ?? []).map((f) => `<li>${esc(prettyTitle(f[1]))} — ${esc(fileBlurb(f[2], trailNames))}</li>`).join("");
      const body = shell(
        crumbs(trail) +
        `<h1>${esc(meta.h1)}</h1><p>${esc(meta.description)}</p>` +
        (folders ? `<h2>Folders</h2><ul>${folders}</ul>` : "") +
        (files ? `<h2>Files in this folder</h2><ul>${files}</ul>` : "") +
        credit,
      );
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: meta.h1,
        description: meta.description,
        url: `${site}${meta.path}`,
        isPartOf: { "@type": "WebSite", name: registry.brand, url: site },
        author: { "@type": "Person", name: "Abongo Davis" },
        educationalLevel: `${def.label} MBChB`,
        audience: { "@type": "EducationalAudience", educationalRole: "student" },
        inLanguage: "en",
        ...(here?.f?.length ? { hasPart: here.f.slice(0, 150).map((f) => ({ "@type": "CreativeWork", name: prettyTitle(f[1]), description: `${fileBlurb(f[2], trailNames)}. ${(registry.seoCredit ?? registry.credit)}.`, educationalLevel: `${def.label} MBChB`, author: { "@type": "Person", name: "Abongo Davis" } })) } : {}),
      };
      write(meta.path, render({ title: meta.title, description: meta.description, path: meta.path, image: meta.ogImage, keywords: meta.keywords, body, jsonLd }), data.updated);
      for (const n of nodes) visit(n.d ?? [], [...chain, n]);
    };
    // root page, then every folder below it
    const walk = (nodes, chain) => {
      visit(nodes, chain);
    };
    walk(data.d, []);
  }

  // ---------------- course outlines ----------------
  const idx = registry.outlines.map((o) => `<li><a href="/course-outlines/${o.slug}">${esc(o.title)}</a> — ${esc(o.tagline)}</li>`).join("");
  const allMeta = {
    title: `Course Outlines & Progress Tracker, Years 1–4 | ${registry.brand}`,
    description: `MBChB course outlines for Years 3 and 4 (Pathology, Pharmacology, Virology, Psychiatry, Internal Medicine, Obstetrics & Gynaecology) plus lecture checklists for every year, with a tick-off tracker. For ${registry.audience}. ${(registry.seoCredit ?? registry.credit)}.`,
    path: "/course-outlines",
    image: "/og/library/outline-all.jpg",
    keywords: ["MBChB course outline", "MKU course outline", "Year 3 pathology course outline", "Year 4 psychiatry course outline", "internal medicine course outline", "pharmacology course outline"],
  };
  write(allMeta.path, render({ ...allMeta, body: shell(crumbs([["Home", "/"], ["Course outlines", null]]) + `<h1>MBChB course outlines &amp; progress tracker</h1><p>${esc(allMeta.description)}</p><ul>${idx}</ul>${credit}`), jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: allMeta.title, url: `${site}${allMeta.path}`, author: { "@type": "Person", name: "Abongo Davis" } } }), undefined);

  for (const reg of registry.outlines) {
    const meta = outlineMeta(registry, reg);
    const outline = outlines.find((o) => o.id === reg.slug);
    if (!outline) continue;
    const sections = outline.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.note ? `<p>${esc(s.note)}</p>` : ""}<ul>${s.items.map((i) => `<li>${i.week ? `<strong>${esc(i.week)}</strong> ` : ""}${esc(i.title)}${i.detail ? ` — ${esc(i.detail)}` : ""}</li>`).join("")}</ul>`).join("");
    const info = (outline.info ?? []).map((b) => `<h2>${esc(b.heading)}</h2><ul>${b.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("");
    const assess = outline.assessment ? `<p><strong>Assessment:</strong> ${esc(outline.assessment)}</p>` : "";
    const body = shell(crumbs([["Home", "/"], [`Year ${reg.year}`, `/year/${reg.year}`], ["Course outlines", "/course-outlines"], [reg.department, null]]) + `<h1>${esc(outline.title)}</h1><p>${esc(outline.summary)}</p>${assess}${info}${sections}${credit}`);
    write(meta.path, render({ title: meta.title, description: meta.description, path: meta.path, image: meta.ogImage, keywords: [`${reg.department} course outline`, `Year ${reg.year} MBChB`, "MKU course outline"], body, jsonLd: { "@context": "https://schema.org", "@type": "Course", name: outline.title, description: meta.description, provider: { "@type": "CollegeOrUniversity", name: "Mount Kenya University" }, author: { "@type": "Person", name: "Abongo Davis" }, url: `${site}${meta.path}` } }), undefined);
  }




  // ---------------- notes that ship with the site ----------------
  try {
    const notes = JSON.parse(fs.readFileSync(path.join(root, "src/data/staticNotes.json"), "utf8"));
    const drugs = JSON.parse(fs.readFileSync(path.join(root, "src/data/drugIndex.json"), "utf8"));
    for (const n of notes) {
      const md = fs.readFileSync(path.join(root, n.file), "utf8");
      // A past paper is published as questions only: the answers are for subscribers, so they stay out of the crawlable page too.
      const shown = n.paper ? splitPaper(md).filter((p) => !p.hidden).map((p) => p.text).join("\n\n") : md;
      const { html: rawHtml } = mdToHtml(shown, { skipTitle: true });
      const noteHtml = linkDrugs(rawHtml, drugs).html;
      const pharmHtml = n.condition ? `<p><a href="/pharmacology?tab=conditions&amp;c=${esc(n.condition)}">Drug guide for this condition in Pharmacology</a></p>` : "";
      const notePath = `/notes/${n.slug}`;
      const sibs = notes.filter((o) => o.unit === n.unit && o.group === n.group && o.slug !== n.slug);
      const sibHtml = sibs.length ? `<h2>More in ${esc(n.group ?? n.unit)}</h2><ul>${sibs.map((o) => `<li><a href="/notes/${o.slug}">${esc(o.title)}</a></li>`).join("")}</ul><p><a href="/notes">All study notes</a></p>` : "";
      const title = `${n.title} — Year ${n.year} ${n.unit} Notes | ${registry.brand}`;
      write(notePath, render({
        title, description: n.description, path: notePath, image: "/og-default.jpg",
        keywords: [n.title, `${n.unit} notes`, `Year ${n.year} MBChB`, "MKU psychiatry notes", "medical student notes Kenya"],
        body: shell(crumbs([["Home", "/"], [`Year ${n.year}`, `/year/${n.year}`], [n.unit, null]]) + `<h1>${esc(n.title)}</h1><p>${esc(n.description)}</p>${pharmHtml}<article>${noteHtml}</article>${n.paper ? "<p><em>Model answers are on the page for subscribers.</em></p>" : ""}${sibHtml}` + credit),
        jsonLd: { "@context": "https://schema.org", "@type": "LearningResource", name: n.title, description: n.description, url: `${site}${notePath}`, dateModified: n.updated, inLanguage: "en", educationalLevel: `Year ${n.year} MBChB`, teaches: n.unit, author: { "@type": "Person", name: "Abongo Davis" }, isPartOf: { "@type": "WebSite", name: registry.brand, url: site } },
      }), n.updated);
    }

    const byYear = [...new Set(notes.map((n) => n.year))].sort();
    const idxBody = byYear.map((y) => {
      const units = [...new Set(notes.filter((n) => n.year === y).map((n) => n.unit))];
      return `<h2>Year ${y}</h2>` + units.map((u) => `<h3>${esc(u)}</h3><ul>${notes.filter((n) => n.year === y && n.unit === u).map((n) => `<li><a href="/notes/${n.slug}">${esc(n.title)}</a>${n.group ? ` — ${esc(n.group)}` : ""}</li>`).join("")}</ul>`).join("");
    }).join("");
    const idxDesc = `${notes.length} study notes by year and unit: psychiatry (classification, psychopathology, formulation, bipolar disorder) and respiratory medicine (pneumonia, asthma, COPD, lung cancer and more), each with practice questions.`;
    write("/notes", render({
      title: `Study Notes by Year and Unit: Psychiatry and Respiratory Medicine | ${registry.brand}`, description: idxDesc, path: "/notes", image: "/og-default.jpg",
      keywords: ["Year 4 notes", "psychiatry notes", "respiratory medicine notes", "MBChB study notes", "MKU notes"],
      body: shell(crumbs([["Home", "/"], ["Notes", null]]) + `<h1>Study notes</h1><p>${esc(idxDesc)}</p>${idxBody}` + credit),
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Study notes", description: idxDesc, url: `${site}/notes`, isPartOf: { "@type": "WebSite", name: registry.brand, url: site } },
    }), notes[0]?.updated);

    // past papers: one crawlable page listing every paper by trimester, newest sitting first
    const papers = notes.filter((n) => n.paper);
    if (papers.length) {
      const TRIM = { 1: "Trimester 1 (September to December)", 2: "Trimester 2 (January to April)", 3: "Trimester 3 (May to August)" };
      const bySit = (a, b) => (b.paper.sat ?? "").localeCompare(a.paper.sat ?? "");
      const pBody = [1, 2, 3].map((t) => {
        const list = papers.filter((n) => n.paper.trimester === t).sort(bySit);
        return list.length ? `<h2>${TRIM[t]}</h2><ul>${list.map((n) => `<li><a href="/notes/${n.slug}">${esc(n.title)}</a> — ${esc(n.paper.satLabel)}, ${esc(n.unit)}</li>`).join("")}</ul>` : "";
      }).join("") + (papers.some((n) => !n.paper.trimester) ? `<h2>Undated papers</h2><ul>${papers.filter((n) => !n.paper.trimester).map((n) => `<li><a href="/notes/${n.slug}">${esc(n.title)}</a></li>`).join("")}</ul>` : "");
      const pDesc = `${papers.length} Mount Kenya University MBChB past papers (CATs and end-of-year exams) sorted by trimester and month, each with model answers for subscribers, plus the topics each unit's papers have asked from the course outline.`;
      write("/papers", render({
        title: `MKU MBChB Past Papers by Trimester with Answers | ${registry.brand}`, description: pDesc, path: "/papers", image: "/og-default.jpg",
        keywords: ["MKU past papers", "MBChB past papers", "Obstetrics and Gynaecology CAT", "Year 4 CAT with answers", "Mount Kenya University exams"],
        body: shell(crumbs([["Home", "/"], ["Past papers", null]]) + `<h1>Past papers</h1><p>${esc(pDesc)}</p>${pBody}` + credit),
        jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Past papers", description: pDesc, url: `${site}/papers`, isPartOf: { "@type": "WebSite", name: registry.brand, url: site } },
      }), papers.map((n) => n.updated).sort().pop());
    }
  } catch (err) {
    console.warn("[prerender-library] notes skipped:", err instanceof Error ? err.message : err);
  }

  // ---------------- books ----------------
  try {
    const books = JSON.parse(fs.readFileSync(path.join(root, "public/data/books.json"), "utf8"));
    const slugOf = (t) => t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const image = "/og-default.jpg";
    const unique = (ids) => new Set(ids).size;
    const topDesc = `${books.books.length} medical textbooks, handbooks, atlases and question banks shelved by MBChB year, subject and book type, following the Mount Kenya University timetable.`;
    const shelfList = books.shelves.map((sh) => `<li><a href="/books/${sh.key}">${esc(sh.label)}</a> — ${esc(sh.blurb)} (${unique(sh.subjects.flatMap((x) => x.b))} books)</li>`).join("");
    write("/books", render({
      title: `Medical Books by Year and Subject, MBChB Years 1–6 | ${registry.brand}`, description: topDesc, path: "/books", image,
      keywords: ["medical books", "MBChB textbooks", "medical student books Kenya", "anatomy atlas", "Kumar and Clark", "Nelson paediatrics", "MKU reference books"],
      body: shell(crumbs([["Home", "/"], ["Books", null]]) + `<h1>Medical books by year and subject</h1><p>${esc(topDesc)}</p><ul>${shelfList}</ul>` + credit),
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Medical books by year and subject", description: topDesc, url: `${site}/books`, isPartOf: { "@type": "WebSite", name: registry.brand, url: site } },
    }), books.updated);

    for (const sh of books.shelves) {
      const shDesc = `${sh.label} medical books: ${sh.blurb}. ${unique(sh.subjects.flatMap((x) => x.b))} titles shelved by subject.`;
      const subjectList = sh.subjects.map((sub) => `<li><a href="/books/${sh.key}/${slugOf(sub.name)}">${esc(sub.name)}</a> — ${sub.b.length} books${sub.units.length ? ` · timetable units ${esc(sub.units.join(", "))}` : ""}</li>`).join("");
      write(`/books/${sh.key}`, render({
        title: `${sh.label} Medical Books: Textbooks, Handbooks & Atlases | ${registry.brand}`, description: shDesc, path: `/books/${sh.key}`, image,
        keywords: [`${sh.label} MBChB books`, "medical textbooks", ...sh.subjects.slice(0, 6).map((x) => `${x.name} books`)],
        body: shell(crumbs([["Home", "/"], ["Books", "/books"], [sh.label, null]]) + `<h1>${esc(sh.label)} books</h1><p>${esc(shDesc)}</p><ul>${subjectList}</ul>` + credit),
        jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${sh.label} medical books`, description: shDesc, url: `${site}/books/${sh.key}`, isPartOf: { "@type": "WebSite", name: registry.brand, url: site } },
      }), books.updated);

      for (const sub of sh.subjects) {
        const subPath = `/books/${sh.key}/${slugOf(sub.name)}`;
        const subDesc = `${sub.name} books for ${sh.label}: ${sub.b.length} textbooks, handbooks, question banks and atlases${sub.units.length ? `, matched to timetable units ${sub.units.slice(0, 4).join(", ")}` : ""}.`;
        const groups = books.types.map((t, ti) => ({ t, rows: sub.b.filter((i) => books.books[i][2] === ti) })).filter((g) => g.rows.length);
        const groupHtml = groups.map((g) => `<h2>${esc(g.t)}</h2><ul>${g.rows.map((i) => `<li>${esc(books.books[i][1])}</li>`).join("")}</ul>`).join("");
        write(subPath, render({
          title: `${sub.name} Books for ${sh.label} MBChB | ${registry.brand}`, description: subDesc, path: subPath, image,
          keywords: [`${sub.name} books`, `${sub.name} textbook`, `${sh.label} MBChB`, ...sub.b.slice(0, 5).map((i) => books.books[i][1])],
          body: shell(crumbs([["Home", "/"], ["Books", "/books"], [sh.label, `/books/${sh.key}`], [sub.name, null]]) + `<h1>${esc(sub.name)} books for ${esc(sh.label)}</h1><p>${esc(subDesc)}</p>${groupHtml}` + credit),
          jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${sub.name} books for ${sh.label}`, description: subDesc, url: `${site}${subPath}`, isPartOf: { "@type": "WebSite", name: registry.brand, url: site }, mainEntity: { "@type": "ItemList", numberOfItems: sub.b.length, itemListElement: sub.b.slice(0, 100).map((i, k) => ({ "@type": "ListItem", position: k + 1, item: { "@type": "Book", name: books.books[i][1] } })) } },
        }), books.updated);
      }
    }
  } catch (err) {
    console.warn("[prerender-library] books skipped:", err instanceof Error ? err.message : err);
  }

  // ---------------- timetables ----------------
  const ttData = JSON.parse(fs.readFileSync(path.join(root, "src/data/timetable2026.json"), "utf8"));
  for (const tt of registry.timetables.years) {
    const meta = timetableMeta(registry, tt);
    const t = registry.timetables;
    const tables = (ttData.schedules[tt.year] ?? []).map((table) =>
      `<h2>${esc(table.label)}</h2><table border="1" cellpadding="6" style="border-collapse:collapse;font-size:14px"><thead><tr><th>Day</th><th>Group</th><th>Sessions</th></tr></thead><tbody>${table.rows.map((r) => `<tr><td>${esc(r.day)}</td><td>${esc(r.group || "All")}</td><td>${r.entries.map(esc).join("; ")}</td></tr>`).join("")}</tbody></table>`).join("");
    const staff = (ttData.staff[tt.year] ?? []).length ? `<h2>Teaching staff</h2><p>${ttData.staff[tt.year].map(esc).join(", ")}</p>` : "";
    const dates = `<ul>${t.dates.map((d) => `<li><strong>${esc(d.label)}:</strong> ${esc(d.value)}</li>`).join("")}</ul>`;
    const body = shell(
      crumbs([["Home", "/"], [`Year ${tt.year}`, `/year/${tt.year}`], ["Timetable", null]]) +
      `<h1>${esc(meta.h1)}</h1><p>${esc(meta.description)}</p>${dates}${tables}${staff}` +
      `<p><a href="/library/year-${tt.year}">Year ${tt.year} notes and past papers</a></p>` + credit,
    );
    write(meta.path, render({ title: meta.title, description: meta.description, path: meta.path, image: meta.ogImage, keywords: meta.keywords, body, jsonLd: { "@context": "https://schema.org", "@type": "Event", name: meta.title, description: meta.description, url: `${site}${meta.path}`, startDate: "2026-09-07", endDate: "2026-12-04", location: { "@type": "Place", name: "Mount Kenya University School of Medicine" }, organizer: { "@type": "Organization", name: "Mount Kenya University" } } }), undefined);
  }

  // ---------------- sitemap ----------------
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${written
    .map((w) => `  <url><loc>${site}${w.urlPath}</loc><lastmod>${w.lastmod ?? today}</lastmod><changefreq>monthly</changefreq><priority>${w.urlPath.split("/").length <= 3 ? "0.8" : "0.6"}</priority></url>`)
    .join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "library-sitemap.xml"), xml);

  console.log(`prerendered ${written.length} pages + library-sitemap.xml`);
} catch (err) {
  console.warn("[prerender-library] skipped:", err instanceof Error ? err.message : err);
}
