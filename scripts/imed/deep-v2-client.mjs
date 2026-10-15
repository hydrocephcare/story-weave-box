// One-off: deep exam notes v2 on the page: underline tabs (no heavy filled pill), numbers and mnemonics, viva questions marked "Most likely" and "Asked in a past paper",
// MCQs, cases, a Drill mode, and the past-paper questions of the topic are sent to the writer.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); return s.replace(x, y); };
const slice = (s, from, to, text) => { const a = s.indexOf(from); const b = s.indexOf(to); if (a < 0 || b < 0 || b < a) throw new Error("block not found: " + from.slice(0, 40)); return s.slice(0, a) + text + s.slice(b); };
const read = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

edit("src/lib/topics.ts", (s) => {
  if (s.includes("vivas?:")) return s;
  s = swap(s, "export interface DeepNotes { sections: { h: string; p?: string; b?: string[]; t?: { a: string; b: string }[] }[]; exam: string[]; model?: string; generatedAt?: string }", [
    "export interface DeepNotes {",
    "  sections: { h: string; p?: string; b?: string[]; t?: { a: string; b: string }[] }[];",
    "  /** the viva questions as \"question — answer\" lines (the first version of the deep notes, and what the database checks) */",
    "  exam: string[];",
    "  facts?: string[]; mnemonics?: { n: string; t: string }[];",
    "  vivas?: { q: string; a: string; hot?: boolean; past?: boolean }[];",
    "  mcqs?: { q: string; o: string[]; a: number; e: string; past?: boolean }[];",
    "  cases?: { v: string; qs: { q: string; a: string }[] }[];",
    "  mistakes?: string[]; model?: string; generatedAt?: string; checked?: string;",
    "}",
  ].join("\n"));
  s = swap(s, "export async function writeDeepNotes(slug: string, name: string, category: string, base: AiPage):", "export async function writeDeepNotes(slug: string, name: string, category: string, base: AiPage, past: string[] = []):");
  s = swap(s, "body: JSON.stringify({ mode: \"deep\", name, category, base: digest }) });", "body: JSON.stringify({ mode: \"deep\", name, category, base: digest, past: past.slice(0, 12) }) });");
  return s;
});

edit("src/pages/TopicPage.tsx", (s) => {
  if (s.includes("function DrillMode")) return s;
  s = slice(s, "/** The deep exam notes: shown when they exist", "/** \"Was this page helpful?\"", read("scripts/imed/deep-v2-view.txt"));
  s = slice(s, "/** One examiner question:", "/** The \"On this page\" rail", read("scripts/imed/deep-v2-viva.txt"));
  // the tabs: an underline, not a filled pill
  s = slice(s, "            {page && (\n              <div className=\"no-print mb-6 flex flex-wrap items-center gap-2\">", "            {view === \"deep\" && page && <DeepView", [
    "            {page && (",
    "              <div className=\"no-print mb-8 flex flex-wrap items-end gap-x-7 gap-y-2 border-b border-border\">",
    "                <div role=\"tablist\" aria-label=\"Which notes\" className=\"flex gap-7\">",
    "                  {([[\"revision\", \"Revision notes\"], [\"deep\", \"Deep exam notes\"]] as const).map(([k, l]) => (",
    "                    <button key={k} type=\"button\" role=\"tab\" aria-selected={view === k} onClick={() => setView(k)} className={cn(\"-mb-px inline-flex items-center gap-1.5 border-b-[3px] pb-2.5 text-[16px] font-bold outline-none transition-colors focus-visible:text-primary\", view === k ? \"border-primary text-foreground\" : \"border-transparent text-muted-foreground hover:text-foreground\")}>{k === \"deep\" && <Zap className=\"h-4 w-4\" aria-hidden />}{l}</button>",
    "                  ))}",
    "                </div>",
    "                <button type=\"button\" onClick={() => window.print()} className=\"mb-2.5 ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary\"><Printer className=\"h-4 w-4\" aria-hidden /> Print or save as PDF</button>",
    "              </div>",
    "            )}",
    "",
  ].join("\n"));
  s = swap(s, "canRead={canRead} />}", "canRead={canRead} past={past} />}");
  s = swap(s, "  const deep = deepLocal ?? page?.deep ?? null;", "  const deep = deepLocal ?? page?.deep ?? null;\n  const past = [...(topic?.qs ?? []).map((x) => x.q), ...(topic?.es ?? []).map((x) => x.q)].slice(0, 12);");
  // an MCQ without a source link (the deep notes' own questions)
  s = swap(s, "          <Link to={q.u} className=\"mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline\">From: {q.s} <ChevronRight className=\"h-3.5 w-3.5\" /></Link>", "          {q.u && <Link to={q.u} className=\"mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline\">From: {q.s} <ChevronRight className=\"h-3.5 w-3.5\" /></Link>}");
  // the contents rail lists the new blocks
  s = swap(s, "{ id: \"deep-exam\", t: \"More examiner questions\" }] : [", "...(deep.facts?.length ? [{ id: \"deep-memorise\", t: \"Numbers to memorise\" }] : []), ...(deep.vivas?.length || deep.exam.length ? [{ id: \"deep-exam\", t: \"Viva questions\" }] : []), ...(deep.mcqs?.length ? [{ id: \"deep-mcqs\", t: \"MCQs\" }] : []), ...(deep.cases?.length ? [{ id: \"deep-cases\", t: \"Cases\" }] : [])] : [");
  return s;
});

edit("supabase/functions/_shared/contentCheck.js", (s) => {
  if (s.includes("deepToText")) return s;
  return s + "\n/** The deep notes as plain text for the cross-check: sections, then viva questions, MCQs, cases, numbers and mistakes. */\nexport function deepToText(deep) {\n  const sec = (deep.sections ?? []).map((x) => `## ${x.h}\\n${x.p ?? \"\"}\\n${(x.b ?? []).join(\"\\n\")}\\n${(x.t ?? []).map((r) => `${r.a}: ${r.b}`).join(\"\\n\")}`);\n  const viva = (deep.vivas ?? []).map((x) => `Q: ${x.q}\\nA: ${x.a}`).join(\"\\n\") || (deep.exam ?? []).join(\"\\n\");\n  const mcq = (deep.mcqs ?? []).map((x) => `MCQ: ${x.q}\\n${x.o.map((o, i) => `${\"ABCD\"[i]}. ${o}`).join(\"\\n\")}\\nMarked answer: ${\"ABCD\"[x.a]}. ${x.e}`).join(\"\\n\");\n  const cases = (deep.cases ?? []).map((c) => `Case: ${c.v}\\n${c.qs.map((x) => `Q: ${x.q}\\nA: ${x.a}`).join(\"\\n\")}`).join(\"\\n\");\n  return [...sec, `## Numbers to memorise\\n${(deep.facts ?? []).join(\"\\n\")}`, `## Viva questions\\n${viva}`, `## MCQs\\n${mcq}`, `## Cases\\n${cases}`, `## Common mistakes\\n${(deep.mistakes ?? []).join(\"\\n\")}`].join(\"\\n\\n\");\n}\n";
});

edit("scripts/topics/deep-fill.mjs", (s) => {
  if (s.includes("deepToText")) return s;
  s = swap(s, 'import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";', 'import { checkContent, deepToText } from "../../supabase/functions/_shared/contentCheck.js";');
  s = swap(s, "    const deep = await generateDeepWithFallback({ name: t?.n ?? page.title ?? slug.replace(/-/g, \" \"), category: t?.c ?? page.subject ?? \"\", base: page }, env);", "    const full = fs.existsSync(path.join(\"public/topics\", `${slug}.json`)) ? JSON.parse(fs.readFileSync(path.join(\"public/topics\", `${slug}.json`), \"utf8\")) : {};\n    const past = [...(full.qs ?? []).map((x) => x.q), ...(full.es ?? []).map((x) => x.q)].slice(0, 12);\n    const deep = await generateDeepWithFallback({ name: t?.n ?? page.title ?? slug.replace(/-/g, \" \"), category: t?.c ?? page.subject ?? \"\", base: page, past }, env);");
  const a = s.indexOf("    const text = [...deep.sections.map");
  const b = s.indexOf("    const check = await checkContent");
  if (a < 0 || b < 0) throw new Error("text builder");
  s = s.slice(0, a) + "    const text = deepToText(deep);\n" + s.slice(b);
  return s;
});
console.log("deep v2 client written");
