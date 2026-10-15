// One-off: a topic page made from what a student typed ("differnece btw lymphoma sisgns") gets a proper title and address.
// The writer is asked for a clean, correctly spelled title; the page is saved under that title's address; the typed address redirects to it, and a page that already exists
// under the clean address is reused instead of being written twice.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };

// 1. the writer returns a clean title
edit("supabase/functions/_shared/topicAi.js", (s) => {
  if (s.includes("clean title")) return s;
  s = swap(s, '{"medical": true, "subject":', '{"medical": true, "title": "the clean title a textbook would give this page: 2 to 8 words, correctly spelled, no typing mistakes and no phrases like \'difference btw\' or \'what is\'; for a comparison write \'A versus B\'", "subject":');
  s = swap(s, "  return { medical: true, subject: clip(raw.subject, 40),", "  const title = clip(raw.title, 80).replace(/[<>]/g, \"\");\n  return { medical: true, ...(/^[A-Za-z][A-Za-z0-9 '’()\\-,./&:]{3,79}$/.test(title) ? { title } : {}), subject: clip(raw.subject, 40),");
  return s;
});

// 2. the browser saves the page under the clean title
edit("src/lib/topicWriter.ts", (s) => {
  if (s.includes("cleanSlug")) return s;
  s = swap(s, "export type WriteResult = { status: \"published\"; page: AiPage & { subject?: string }; saved: boolean }", "export type WriteResult = { status: \"published\"; page: AiPage & { subject?: string }; saved: boolean; slug?: string; name?: string }");
  s = swap(s, "  if (viaApi?.status === \"published\") { countWrite(); const { saved } = await publish(viaApi.page, slug, name, category); return { status: \"published\", page: viaApi.page, saved }; }",
    "  if (viaApi?.status === \"published\") {\n    countWrite();\n    // the page is saved under the clean title the writer chose, not under what was typed\n    const title = String((viaApi.page as { title?: string }).title ?? \"\").trim();\n    const cleanName = validName(title) ? title : name;\n    const cleanSlug = slugOf(cleanName) || slug;\n    const { saved } = await publish(viaApi.page, cleanSlug, cleanName, category);\n    return { status: \"published\", page: viaApi.page, saved, slug: cleanSlug, name: cleanName };\n  }");
  return s;
});

// 3. the page opens at the clean address, and the typed address remembers where it went
edit("src/lib/topics.ts", (s) => {
  if (s.includes("ompath_topic_alias")) return s;
  s = swap(s, 'type Ask = { status: "published"; page: AiPage } |', 'type Ask = { status: "published"; page: AiPage; redirect?: string } |');
  s = swap(s, "  if (r.status === \"published\") { if (!r.saved) writeLocal(slug, r.page); addToTopicIndex({ s: slug, n: name, c: category || (r.page as { subject?: string }).subject }); return { status: \"published\", page: r.page };",
    "  if (r.status === \"published\") {\n    const finalSlug = r.slug || slug;\n    const finalName = r.name || name;\n    if (!r.saved) writeLocal(finalSlug, r.page);\n    addToTopicIndex({ s: finalSlug, n: finalName, c: category || (r.page as { subject?: string }).subject });\n    if (finalSlug !== slug) { try { const m = JSON.parse(localStorage.getItem(\"ompath_topic_alias\") ?? \"{}\") as Record<string, string>; m[slug] = finalSlug; localStorage.setItem(\"ompath_topic_alias\", JSON.stringify(m)); } catch { /* ignore */ } return { status: \"published\", page: r.page, redirect: finalSlug }; }\n    return { status: \"published\", page: r.page };");
  // a typed address that already became a clean page goes straight there
  s = swap(s, "    void (async () => {\n      let t = await loadTopic(slug);", "    void (async () => {\n      try { const to = (JSON.parse(localStorage.getItem(\"ompath_topic_alias\") ?? \"{}\") as Record<string, string>)[slug]; if (to && to !== slug) { setRedirectTo(to); return; } } catch { /* ignore */ }\n      let t = await loadTopic(slug);");
  s = swap(s, "        if (res.status === \"published\") { setPage(res.page); setPhase(\"ready\"); setFresh(Boolean(t)); return; }", "        if (res.status === \"published\" && res.redirect) { setRedirectTo(res.redirect); return; }\n        if (res.status === \"published\") { setPage(res.page); setPhase(\"ready\"); setFresh(Boolean(t)); return; }");
  return s;
});
console.log("clean titles applied");
