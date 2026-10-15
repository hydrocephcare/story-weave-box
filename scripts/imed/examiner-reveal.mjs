// One-off: on topic pages, "Questions an examiner may ask" shows the question first and keeps the answer behind a "Show answer" button.
import fs from "node:fs";
const f = "src/pages/TopicPage.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("function ExaminerQuestion")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

const start = s.indexOf('                <ol className="space-y-4">{page.exam.map(');
need('                <ol className="space-y-4">{page.exam.map(');
const end = s.indexOf("</ol>", start) + "</ol>".length;
s = s.slice(0, start) + '                <ol className="space-y-5">{page.exam.map((q, i) => <ExaminerQuestion key={q} n={i + 1} text={q} />)}</ol>' + s.slice(end);

const comp = `/** One examiner question: the question is shown, the answer ("question? — answer") waits behind a button so the student tries first. */
function ExaminerQuestion({ n, text }: { n: number; text: string }) {
  const [open, setOpen] = useState(false);
  const cut = text.search(/\\s[—–]\\s/);
  const question = cut > 0 ? text.slice(0, cut).trim() : text.trim();
  const answer = cut > 0 ? text.slice(cut).replace(/^\\s[—–]\\s/, "").trim() : "";
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[19px] font-semibold leading-[1.6] text-foreground">{question}</p>
        {answer && (
          <>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300">{open ? "Hide answer" : "Show answer"}</button>
            {open && <p className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-[17px] leading-[1.7] text-foreground/90">{answer}</p>}
          </>
        )}
      </div>
    </li>
  );
}

`;
const at = s.indexOf("/** The \"On this page\" rail");
need("/** The \"On this page\" rail");
s = s.slice(0, at) + comp + s.slice(at);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("examiner answers hidden");
