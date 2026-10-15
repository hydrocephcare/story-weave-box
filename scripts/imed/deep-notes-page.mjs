// One-off: the topic page has two layers: "Revision notes" (default, as before) and "Deep exam notes" (a tab; written once on request, then saved for everyone).
import fs from "node:fs";
const f = "src/pages/TopicPage.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); s = s.replace(x, y); };
const L = (...lines) => lines.join("\n");

// back to one writing flow: no question card
swap('import { aiPaused, looksLikeBot, type TopicChoices } from "@/lib/topicWriter";\nimport { isExamTitle } from "@/lib/examMode";', 'import { aiPaused, looksLikeBot } from "@/lib/topicWriter";');
swap("imageCaption, isDeepPage, rewriteDeeper, ", "imageCaption, writeDeepNotes, type DeepNotes, ");
const ia = s.indexOf("const ANGLE_CHOICES");
const ib = s.indexOf("/** \"Was this page helpful?\"");
if (ia < 0 || ib < 0) throw new Error("intake block");
s = s.slice(0, ia) + s.slice(ib);
swap("retry, writing, intake, startWriting, name } = useTopicPage(slug);", "retry, writing, name } = useTopicPage(slug);");
swap('        {phase === "intake" && <IntakeCard name={name} onStart={startWriting} />}\n', "");
swap("            {intake && !writing && <IntakeCard name={name} onStart={startWriting} />}\n", "");
swap("{!writing && !intake && !page &&", "{!writing && !page &&");
s = s.split("\n").filter((l) => !l.startsWith("              {!isDeepPage(page) && <button")).join("\n");

// the tab markers: Section takes `deep` instead of `keep`
swap('first, keep }: { id: string; title: string; children: ReactNode; first?: boolean; keep?: boolean }) {\n  return (\n    <section id={id} data-keep={keep ? "1" : undefined} className=', 'first, deep }: { id: string; title: string; children: ReactNode; first?: boolean; deep?: boolean }) {\n  return (\n    <section id={id} data-deep={deep ? "1" : undefined} className=');
swap('<Section id="overview" title="Overview" first keep>', '<Section id="overview" title="Overview" first>');
swap(" first={i === 0} keep={isExamTitle(s.h)}>", " first={i === 0}>");
swap('title="Questions an examiner may ask" keep>', 'title="Questions an examiner may ask">');
swap('title="Treatment at a glance" keep>', 'title="Treatment at a glance">');
swap('<section id="seek-help" data-keep="1" className=', '<section id="seek-help" className=');

// state
swap("  const [quick, setQuick] = useState(false);", L(
  '  const [view, setView] = useState<"revision" | "deep">("revision");',
  "  const [deepLocal, setDeepLocal] = useState<DeepNotes | null>(null);",
  "  useEffect(() => { setView(\"revision\"); setDeepLocal(null); }, [slug]);",
  "  const deep = deepLocal ?? page?.deep ?? null;"));

// the toolbar
const ta = s.indexOf('          <div className={cn("mt-6", quick && "quick-mode")}>');
const tb = s.indexOf("            {intro.length > 0 && (");
if (ta < 0 || tb < 0) throw new Error("toolbar");
s = s.slice(0, ta) + L(
  '          <div className={cn("mt-6", view === "deep" && "deep-view")}>',
  "            {page && (",
  '              <div className="no-print mb-6 flex flex-wrap items-center gap-2">',
  '                <div role="tablist" aria-label="Which notes" className="inline-flex rounded-full border border-border bg-muted/40 p-1">',
  '                  <button type="button" role="tab" aria-selected={view === "revision"} onClick={() => setView("revision")} className={cn("rounded-full px-4 py-1.5 text-sm font-bold transition-colors", view === "revision" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-foreground")}>Revision notes</button>',
  '                  <button type="button" role="tab" aria-selected={view === "deep"} onClick={() => setView("deep")} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold transition-colors", view === "deep" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:text-foreground")}><Zap className="h-4 w-4" aria-hidden /> Deep exam notes</button>',
  "                </div>",
  '                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-1.5 text-sm font-bold hover:bg-muted"><Printer className="h-4 w-4" aria-hidden /> Print or save as PDF</button>',
  "              </div>",
  "            )}",
  '            {view === "deep" && page && <DeepView slug={slug} name={name} category={topic?.c ?? ""} page={page} deep={deep} onDone={setDeepLocal} />}',
  "",
  "") + s.slice(tb);

// the deep view component, before the vote component
swap("/** \"Was this page helpful?\"", L(
  "/** The deep exam notes: shown when they exist; otherwise one button writes them once (builds on the revision page) and saves them for everyone. */",
  "function DeepView({ slug, name, category, page, deep, onDone }: { slug: string; name: string; category: string; page: AiPage; deep: DeepNotes | null; onDone: (d: DeepNotes) => void }) {",
  "  const [busy, setBusy] = useState(false);",
  "  const [err, setErr] = useState(\"\");",
  "  const write = async () => {",
  "    setBusy(true); setErr(\"\");",
  "    const r = await writeDeepNotes(slug, name, category, page);",
  "    setBusy(false);",
  "    if (\"deep\" in r) onDone(r.deep); else setErr(r.error === \"busy\" ? \"The writer is busy right now. Try again in a minute.\" : r.error === \"bot\" ? \"Open this page in a normal browser to write the deep notes.\" : \"The deep notes could not be written just now. Try again in a minute.\");",
  "  };",
  "  if (!deep) {",
  "    return (",
  '      <section id="deep-start" data-deep="1" className="rounded-3xl border border-primary/25 bg-primary/5 p-6 sm:p-8">',
  '        <p className="text-xs font-bold uppercase tracking-wider text-primary">Deep exam notes</p>',
  '        <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Go deeper on {name}</h2>',
  '        <p className="mt-2 max-w-[60ch] text-[17px] leading-relaxed text-foreground/80">The revision notes stay short. The deep notes read what the revision page already says, then add what is missing: how to examine at the bedside, how to read each test, complicating factors, step-by-step management, and more examiner questions.</p>',
  '        <button type="button" onClick={() => void write()} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} {busy ? "Writing, about 40 seconds..." : "Write the deep exam notes"}</button>',
  '        <p className="mt-3 text-sm text-muted-foreground">Written once, then saved for everyone. AI-written and not yet reviewed by a doctor.</p>',
  '        {err && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{err}</p>}',
  "      </section>",
  "    );",
  "  }",
  "  return (",
  "    <div>",
  "      {deep.sections.map((x, i) => (",
  '        <Section key={`${x.h}-${i}`} id={`deep-${anchor(x.h)}`} title={x.h} first={i === 0} deep>',
  "          {x.p && <Paras text={x.p} self={slug} />}",
  "          {x.t && x.t.length > 0 && <TestTable rows={x.t} />}",
  "          {x.b && x.b.length > 0 && <Bullets items={x.b} self={slug} />}",
  "        </Section>",
  "      ))}",
  '      <Section id="deep-exam" title="More examiner questions" deep>',
  '        <ol className="space-y-5">{deep.exam.map((q, i) => <ExaminerQuestion key={q} n={i + 1} text={q} />)}</ol>',
  "      </Section>",
  "    </div>",
  "  );",
  "}",
  "",
  "/** \"Was this page helpful?\""));

// the rail lists the deep sections while the deep tab is open
swap("  const toc = [\n", '  const toc = view === "deep" && deep ? [...deep.sections.map((x) => ({ id: `deep-${anchor(x.h)}`, t: x.h })), { id: "deep-exam", t: "More examiner questions" }] : [\n');
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);

// css
const c = "src/index.css";
const rawc = fs.readFileSync(c, "utf8");
const crlfc = rawc.includes("\r\n");
const sc = rawc.replace(/\r\n/g, "\n").replace('/* topic pages: "Quick revision" keeps only the sections marked data-keep; printing hides the site\'s chrome */\n.quick-mode section[id]:not([data-keep]) { display: none; }', '/* topic pages: the "Deep exam notes" tab shows only the sections marked data-deep; printing hides the site\'s chrome */\n.deep-view section[id]:not([data-deep]) { display: none; }');
if (sc.includes("quick-mode")) throw new Error("css");
fs.writeFileSync(c, crlfc ? sc.replace(/\n/g, "\r\n") : sc);
console.log("topic page updated");
