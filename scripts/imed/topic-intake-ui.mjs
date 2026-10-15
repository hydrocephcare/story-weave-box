// One-off: the "Before I write this" card on topic pages.
import fs from "node:fs";
const f = "src/pages/TopicPage.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("function IntakeCard")) { console.log("already done"); process.exit(0); }
const swap = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 90)); s = s.replace(x, y); };

swap('import { aiPaused, looksLikeBot } from "@/lib/topicWriter";', 'import { aiPaused, looksLikeBot, type TopicChoices } from "@/lib/topicWriter";');
swap("const { topic, page, phase, fresh, redirectTo, retry, writing, name } = useTopicPage(slug);", "const { topic, page, phase, fresh, redirectTo, retry, writing, intake, startWriting, name } = useTopicPage(slug);");
swap('        {phase === "writing" && <Writing name={name} />}', '        {phase === "writing" && <Writing name={name} />}\n        {phase === "intake" && <IntakeCard name={name} onStart={startWriting} />}');
swap("            {writing && <Writing name={name} />}\n", "            {intake && !writing && <IntakeCard name={name} onStart={startWriting} />}\n            {writing && <Writing name={name} />}\n");
swap("{!writing && !page && phase !== \"rejected\" && !aiPaused()", "{!writing && !intake && !page && phase !== \"rejected\" && !aiPaused()");

const card = `const ANGLE_CHOICES: [string, string][] = [["bedside", "Bedside: history and examination"], ["medicine", "Internal medicine"], ["surgery", "Surgery"], ["pathology", "Pathology and mechanism"], ["drugs", "Drugs and management"], ["emergency", "Emergency first steps"]];
const LEVEL_CHOICES: [TopicChoices["level"], string][] = [["year3", "Year 3: the basics"], ["year4", "Year 4: clinical and exams"], ["year5", "Final year: manage the patient"]];

/** Before a page that does not exist yet is written, the student says what they need, so the page is built for that and is not a general summary. */
function IntakeCard({ name, onStart }: { name: string; onStart: (c: TopicChoices) => void }) {
  const [level, setLevel] = useState<TopicChoices["level"]>("year4");
  const [angles, setAngles] = useState<string[]>(ANGLE_CHOICES.map(([k]) => k));
  const [setting, setSetting] = useState<TopicChoices["setting"]>("tropical");
  const [depth, setDepth] = useState<TopicChoices["depth"]>("full");
  const chip = (on: boolean) => \`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors \${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground/80 hover:bg-muted"}\`;
  return (
    <section aria-label="Before this page is written" className="rounded-3xl border border-primary/25 bg-primary/5 p-5 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Before I write this</p>
      <h2 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">What do you need from “{name}”?</h2>
      <p className="mt-1 text-[16px] text-muted-foreground">Four quick taps, so the page is built for you and is not a general summary.</p>
      <div className="mt-5 space-y-5">
        <div><p className="text-sm font-bold">Your level</p><div className="mt-2 flex flex-wrap gap-2">{LEVEL_CHOICES.map(([k, l]) => <button key={k} type="button" aria-pressed={level === k} onClick={() => setLevel(k)} className={chip(level === k)}>{l}</button>)}</div></div>
        <div><p className="text-sm font-bold">What examiners may ask (pick any)</p><div className="mt-2 flex flex-wrap gap-2">{ANGLE_CHOICES.map(([k, l]) => { const on = angles.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => setAngles((a) => (on ? a.filter((x) => x !== k) : [...a, k]))} className={chip(on)}>{l}</button>; })}</div></div>
        <div><p className="text-sm font-bold">Setting</p><div className="mt-2 flex flex-wrap gap-2">{([["tropical", "East Africa and low-resource hospitals"], ["general", "General, international"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={setting === k} onClick={() => setSetting(k)} className={chip(setting === k)}>{l}</button>)}</div></div>
        <div><p className="text-sm font-bold">How deep</p><div className="mt-2 flex flex-wrap gap-2">{([["full", "Full topic: everything an examiner can ask"], ["quick", "Quick revision"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={depth === k} onClick={() => setDepth(k)} className={chip(depth === k)}>{l}</button>)}</div></div>
      </div>
      <button type="button" onClick={() => onStart({ level, angles, setting, depth })} className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm hover:opacity-95"><Sparkles className="h-4 w-4" aria-hidden /> Write my page</button>
      <p className="mt-3 text-sm text-muted-foreground">A full page takes about 30 to 40 seconds. It is saved for everyone once written.</p>
    </section>
  );
}

`;
const at = s.indexOf("function Writing({ name }");
if (at < 0) throw new Error("no Writing");
s = s.slice(0, at) + card + s.slice(at);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("intake card added");
