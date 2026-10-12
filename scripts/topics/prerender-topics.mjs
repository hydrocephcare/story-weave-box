// Writes a plain HTML copy of every topic page at build time, so Google reads the full text and WhatsApp shows the right preview
// (neither runs the app). Called from scripts/library/prerender.mjs; the app takes over in the browser.
export function prerenderTopics({ fs, path, root, esc, shell, crumbs, write, render }) {
  const dir = path.join(root, "public/topics");
  if (!fs.existsSync(path.join(dir, "index.json"))) return 0;
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  const li = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const link = (u, t) => `<a href="${esc(u)}">${esc(t)}</a>`;
  let n = 0;
  for (const it of index) {
    const file = path.join(dir, `${it.s}.json`);
    if (!fs.existsSync(file)) continue;
    const t = JSON.parse(fs.readFileSync(file, "utf8"));
    const title = `${t.n}: notes, images and practice questions | Ompath Study`;
    const description = (t.ai?.overview || t.lead?.t || `Everything on ${t.n} from Ompath Study: notes, images, practice questions and related topics.`).slice(0, 155);
    const path1 = `/topic/${t.s}`;
    const parts = [
      crumbs([["Home", "/"], ["Topics", "/topics"], [t.n, null]]),
      `<h1>${esc(t.n)}</h1>`,
      t.a?.length ? `<p>Also written as ${t.a.map(esc).join(", ")}.</p>` : "",
      t.lead ? `<p>${esc(t.lead.t)}</p>` : "",
      t.ai ? `<h2>Overview</h2><p>${esc(t.ai.overview)}</p>${t.ai.key?.length ? li(t.ai.key.map(esc)) : ""}` : "",
      t.rx ? `<h2>Treatment at a glance</h2>${li(t.rx.first.map(esc))}` : "",
      ...(t.sec ?? []).map((s) => `<h2>${esc(s.h)}</h2>${li(s.b.map(esc))}<p>${link(s.u, `Read this in ${s.s}`)}</p>`),
      t.snip?.length ? `<h2>What our notes say</h2>${li(t.snip.slice(0, 6).map((s) => `${esc(s.t)} (${link(s.u, s.s)})`))}` : "",
      t.src?.length || t.sets?.length ? `<h2>Study material on ${esc(t.n)}</h2>${li([...t.src, ...t.sets].map((s) => link(s.u, s.t)))}` : "",
      t.imgs?.length ? `<h2>Images</h2>${t.imgs.map((i) => `<figure><img src="${esc(i.u)}" alt="${esc(i.a)}" width="320" loading="lazy"><figcaption>${esc(i.a)}</figcaption></figure>`).join("")}` : "",
      t.qs?.length ? `<h2>Practice questions on ${esc(t.n)}</h2>${t.qs.slice(0, 6).map((q) => `<h3>${esc(q.q)}</h3>${li(q.o.map(esc))}<p><strong>Answer: ${"ABCDE"[q.a]}.</strong> ${esc(q.e || "")}</p>`).join("")}` : "",
      t.rel?.length ? `<h2>Related topics</h2>${li(t.rel.map((r) => link(`/topic/${r.s}`, r.n)))}` : "",
    ].filter(Boolean);
    const faq = (t.qs ?? []).filter((q) => q.e).slice(0, 5).map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: `${q.o[q.a]}. ${q.e}` } }));
    const jsonLd = [
      { "@context": "https://schema.org", "@type": "WebPage", name: title, url: `https://www.ompathstudy.com${path1}`, about: { "@type": "MedicalEntity", name: t.n }, isPartOf: { "@type": "WebSite", name: "Ompath Study", url: "https://www.ompathstudy.com" } },
      ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq }] : []),
    ];
    write(path1, render({ title, description, path: path1, image: "/og-default.jpg", keywords: [t.n, ...(t.a ?? []), `${t.n} notes`, `${t.n} MCQs`, `${t.n} medical students`], body: shell(parts.join("")), jsonLd }), today);
    n++;
  }
  // the A to Z page
  const byDomain = new Map();
  for (const it of index) { if (!byDomain.has(it.c)) byDomain.set(it.c, []); byDomain.get(it.c).push(it); }
  const body = shell(
    crumbs([["Home", "/"], ["Topics", null]]) + `<h1>Every topic, one page</h1><p>One page for every subject in the library: notes, images and practice questions on diseases, anatomy, physiology, pathology, microbiology and pharmacology.</p>` +
    [...byDomain.entries()].map(([d, items]) => `<h2>${esc(d)}</h2>${li(items.slice().sort((a, b) => a.n.localeCompare(b.n)).map((i) => link(`/topic/${i.s}`, i.n)))}`).join(""),
  );
  write("/topics", render({ title: "Medical topics A to Z: diseases, anatomy, physiology and more | Ompath Study", description: "One page for every subject in the library: notes, images and practice questions on diseases, anatomy, physiology, pathology, microbiology and pharmacology for medical students.", path: "/topics", image: "/og-default.jpg", keywords: ["medical topics", "diseases A-Z", "anatomy", "physiology", "pathology", "medical students"], body, jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Medical topics A to Z", url: "https://www.ompathstudy.com/topics" } }), today);
  return n + 1;
}
