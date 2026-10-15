// One-off: Saved page + Save on topics, select-to-explain, "read" means time spent AND scrolling, and the search pop-up no longer says "Nothing found" next to its Ask AI / Read more cards.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("src/App.tsx", (s) => {
  if (s.includes("SelectExplain")) return s;
  s = swap(s, 'const TopicsIndex = lazy(() => import("./pages/TopicsIndex"));', 'const TopicsIndex = lazy(() => import("./pages/TopicsIndex"));\nconst SavedPages = lazy(() => import("./pages/SavedPages"));\nimport SelectExplain from "@/components/SelectExplain";');
  s = swap(s, '            <Route path="/topics" element={<TopicsIndex />} />', '            <Route path="/topics" element={<TopicsIndex />} />\n            <Route path="/saved" element={<SavedPages />} />');
  s = swap(s, "            <BackToTopButton />", "            <BackToTopButton />\n            <SelectExplain />");
  return s;
});

edit("src/pages/TopicPage.tsx", (s) => {
  if (s.includes("SaveTopicButton")) return s;
  s = swap(s, 'import { useReadLog } from "@/lib/readLog";', 'import { useReadLog } from "@/lib/readLog";\nimport SaveTopicButton from "@/components/SaveTopicButton";');
  s = swap(s, "{shared || \"Share\"}</button>\n", "{shared || \"Share\"}</button>\n              <SaveTopicButton slug={slug} name={name} />\n");
  return s;
});

edit("src/components/SearchPalette.tsx", (s) => {
  if (s.includes("hasAnswerRow")) return s;
  s = swap(s, "          {q.trim().length < 2 ? null : searched && flat.length === 0 ? (\n            <div className=\"px-4 py-10 text-center\">\n              <p className=\"text-sm font-semibold text-foreground\">Nothing found for “{q}”</p>\n              <p className=\"mt-1 text-xs text-muted-foreground\">Check the spelling, or try a broader word.</p>",
    "          {q.trim().length < 2 ? null : searched && flat.length === 0 ? (\n            <div className=\"px-4 py-6 text-center\">\n              {q.trim().length < 3 && <><p className=\"text-sm font-semibold text-foreground\">Nothing found for “{q}”</p>\n              <p className=\"mt-1 text-xs text-muted-foreground\">Check the spelling, or try a broader word.</p></>}");
  s = s.replace("Nothing found for", "Nothing found for"); // (the ask-AI and read-more cards above already offer a way forward from three letters)
  return s + "\n// hasAnswerRow: from three letters the pop-up always offers Ask Ompath AI and Read more, so an empty list says nothing.\n";
});

edit("src/lib/readLog.ts", (s) => {
  if (s.includes("depth")) return s;
  s = swap(s, "export const READ_SECONDS = 150; // two and a half active minutes", "export const READ_SECONDS = 150; // two and a half active minutes on a long page; a short page needs less (see needSeconds)\nconst MIN_DEPTH = 0.35; // and the student must have scrolled through at least a third of the page");
  s = swap(s, "    let secs = 0, last = Date.now(), logged = false;", "    let secs = 0, last = Date.now(), logged = false, depth = 0;\n    const measure = () => { const h = document.documentElement.scrollHeight - window.innerHeight; depth = Math.max(depth, h > 0 ? window.scrollY / h : 1); };\n    // a short page is read sooner than a long one: about 40% of the time its words need at 200 words a minute, never under a minute, never over READ_SECONDS\n    const needSeconds = () => Math.min(READ_SECONDS, Math.max(60, Math.round(((document.querySelector(\"main\")?.innerText.length ?? 6000) / 6 / 200) * 60 * 0.4)));");
  s = swap(s, "      secs += 5;\n      if (!logged && secs >= READ_SECONDS)", "      secs += 5;\n      measure();\n      if (!logged && secs >= needSeconds() && depth >= MIN_DEPTH)");
  return s;
});
console.log("wired");
