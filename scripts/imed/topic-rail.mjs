// One-off: the topic page's "On this page" rail becomes its own component that follows the reader (highlighted section, progress bar, back to top).
import fs from "node:fs";
const f = "src/pages/TopicPage.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("function TopicRail")) { console.log("already done"); process.exit(0); }
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

const imp = 'import { useReadLog } from "@/lib/readLog";';
need(imp);
if (!s.includes("useScrollSpy")) s = s.replace(imp, imp + '\nimport { useScrollSpy } from "@/hooks/useScrollSpy";');

const open = '        <aside className="hidden lg:block">';
need(open);
const start = s.indexOf(open);
const end = s.indexOf("        </aside>", start) + "        </aside>".length;
s = s.slice(0, start) + "        <TopicRail toc={toc} />" + s.slice(end);

const comp = `/** The "On this page" rail: the section you are in is highlighted and a bar shows how far down you are. */
function TopicRail({ toc }: { toc: { id: string; t: string }[] }) {
  const spy = useScrollSpy(toc.map((t) => t.id));
  return (
    <aside className="hidden lg:block">
      <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-border text-[15px]">
        <p className="pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>
        <ul className="mt-3 space-y-0.5">{toc.map((t) => <li key={t.id}><a href={\`#\${t.id}\`} aria-current={spy.active === t.id ? "location" : undefined} className={\`-ml-px block border-l-2 py-1.5 pl-4 font-medium transition-colors hover:border-primary hover:text-foreground \${spy.active === t.id ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground"}\`}>{t.t}</a></li>)}</ul>
        <div className="mt-5 pl-4 pr-1">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground"><span>Reading</span><span>{spy.progress}%</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={spy.progress} aria-valuemin={0} aria-valuemax={100} aria-label="How far down this page you are"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: \`\${spy.progress}%\` }} /></div>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="mt-3 block w-full text-left text-xs font-bold text-muted-foreground hover:text-primary">↑ Back to top</button>
        </div>
      </nav>
    </aside>
  );
}

`;
const at = s.indexOf("export default function TopicPage()");
need("export default function TopicPage()");
s = s.slice(0, at) + comp + s.slice(at);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("topic rail done");
