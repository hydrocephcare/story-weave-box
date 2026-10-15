// One-off: deep exam notes are a Pro feature (the admin can flip it in Site manager > Features). Free readers see a teaser and the subscribe pop-up;
// only Pro readers can ask the writer to write them, which saves AI credits and requests. A daily job writes them in the background for the static pages.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };
const L = (...lines) => lines.join("\n");

edit("src/lib/features.ts", (s) => {
  if (s.includes("deepNotes")) return s;
  return swap(s, '  { key: "unlimitedAi",', '  { key: "deepNotes", label: "Deep exam notes", blurb: "On every topic page: bedside examination, how to read each test, confounders, step-by-step management and more examiner questions. Free readers see the first section.", defaultTier: "pro" },\n  { key: "unlimitedAi",');
});

edit("src/pages/TopicPage.tsx", (s) => {
  if (s.includes("canRead")) return s;
  s = swap(s, 'import { aiPaused, looksLikeBot } from "@/lib/topicWriter";', 'import { aiPaused, looksLikeBot } from "@/lib/topicWriter";\nimport { useAccess } from "@/lib/access";\nimport { useFeatures } from "@/lib/features";\nimport { openSubscribePrompt } from "@/lib/subscribe-prompt";');
  s = swap(s, "Sparkles, X, Zap, Printer, ThumbsUp, ThumbsDown }", "Sparkles, X, Zap, Printer, ThumbsUp, ThumbsDown, Lock }");
  // who may read
  s = swap(s, "  const deep = deepLocal ?? page?.deep ?? null;", L(
    "  const deep = deepLocal ?? page?.deep ?? null;",
    "  const access = useAccess();",
    "  const canRead = useFeatures(isAdmin || access.hasPass).can(\"deepNotes\");"));
  s = swap(s, "page={page} deep={deep} onDone={setDeepLocal} />}", "page={page} deep={deep} onDone={setDeepLocal} canRead={canRead} />}");
  s = swap(s, "function DeepView({ slug, name, category, page, deep, onDone }: { slug: string; name: string; category: string; page: AiPage; deep: DeepNotes | null; onDone: (d: DeepNotes) => void }) {", "function DeepView({ slug, name, category, page, deep, onDone, canRead }: { slug: string; name: string; category: string; page: AiPage; deep: DeepNotes | null; onDone: (d: DeepNotes) => void; canRead: boolean }) {");
  // free reader, nothing written yet: the card sells it; no AI is called
  s = swap(s, "  if (!deep) {\n    return (", L(
    "  const unlock = () => openSubscribePrompt(\"Deep exam notes are a Pro feature: bedside examination step by step, how to read every test, complicating factors, management step by step, and 10 or more extra examiner questions on every topic.\");",
    "  if (!deep && !canRead) {",
    "    return (",
    '      <section id="deep-start" data-deep="1" className="rounded-3xl border border-primary/25 bg-primary/5 p-6 sm:p-8">',
    '        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"><Lock className="h-3.5 w-3.5" aria-hidden /> Pro · Deep exam notes</p>',
    '        <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Go deeper on {name}</h2>',
    '        <p className="mt-2 max-w-[60ch] text-[17px] leading-relaxed text-foreground/80">The revision notes stay free. Pro adds the exam-depth layer: how to examine at the bedside, how to read each test, what complicates it, management step by step, and extra examiner questions.</p>',
    '        <button type="button" onClick={unlock} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95"><Sparkles className="h-4 w-4" aria-hidden /> See Pro</button>',
    "      </section>",
    "    );",
    "  }",
    "  if (!deep) {",
    "    return ("));
  // free reader, notes exist: first section free, the rest locked
  s = swap(s, "  return (\n    <div>\n      {deep.sections.map((x, i) => (", L(
    "  const shown = canRead ? deep.sections : deep.sections.slice(0, 1);",
    "  return (",
    "    <div>",
    "      {shown.map((x, i) => ("));
  s = swap(s, '      <Section id="deep-exam" title="More examiner questions" deep>\n        <ol className="space-y-5">{deep.exam.map((q, i) => <ExaminerQuestion key={q} n={i + 1} text={q} />)}</ol>\n      </Section>\n    </div>', L(
    "      {canRead ? (",
    '        <Section id="deep-exam" title="More examiner questions" deep>',
    '          <ol className="space-y-5">{deep.exam.map((q, i) => <ExaminerQuestion key={q} n={i + 1} text={q} />)}</ol>',
    "        </Section>",
    "      ) : (",
    '        <section id="deep-locked" data-deep="1" className="mt-10 rounded-3xl border border-primary/25 bg-primary/5 p-6 sm:p-8">',
    '          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary"><Lock className="h-3.5 w-3.5" aria-hidden /> Pro</p>',
    '          <h2 className="mt-1 font-serif text-2xl font-bold">The rest of the deep notes</h2>',
    '          <ul className="mt-3 space-y-1.5 text-[17px] text-foreground/80">{deep.sections.slice(1).map((x) => <li key={x.h} className="flex items-start gap-2"><Lock className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />{x.h}</li>)}<li className="flex items-start gap-2"><Lock className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />{deep.exam.length} more examiner questions with answers</li></ul>',
    '          <button type="button" onClick={unlock} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95"><Sparkles className="h-4 w-4" aria-hidden /> Unlock with Pro</button>',
    "        </section>",
    "      )}",
    "    </div>"));
  return s;
});
console.log("pro gate applied");
