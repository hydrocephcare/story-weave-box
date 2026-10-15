// One-off: gives the note page the same structure as the topic page: a full-width hero with the summary and study buttons, then a body with the
// sticky "On this page" rail on the left and the text on the right. Past papers keep their narrow layout. Edits StaticNote.tsx and index.css once.
import fs from "node:fs";
const f = "src/pages/StaticNote.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes("topic-hero")) { console.log("already done"); process.exit(0); }
const rep = (x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); s = s.replace(x, y); };

// 1. outer wrapper: papers keep the narrow padded box, notes go full width
rep('className={`mx-auto w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10 ${note.paper ? "max-w-4xl" : "max-w-[72rem]"}`}>',
    'className={`w-full min-w-0 overflow-x-clip ${note.paper ? "mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10" : "pb-16"}`}>');

// 2. hero: papers keep the old header; notes get the topic-style hero
const a = s.indexOf('      <nav aria-label="Breadcrumb"');
const b = s.indexOf("      </header>", a) + "      </header>".length;
if (a < 0 || b < a) throw new Error("header block not found");
const old = s.slice(a, b);
const hero = `      {note.paper ? (
        <>
${old}
        </>
      ) : (
        <header className="topic-hero relative isolate overflow-hidden border-b border-border/60">
          <HeroAurora about={\`\${note.unit} \${note.title}\`} year={note.year} />
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-8 sm:pb-14 sm:pt-12">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground print:hidden">
              <Link to="/" className="hover:text-primary">Home</Link> ›
              <Link to={\`/year/\${note.year}\`} className="hover:text-primary">Year {note.year}</Link> ›
              <Link to={\`/notes?year=\${note.year}&unit=\${encodeURIComponent(note.unit)}\`} className="text-foreground hover:text-primary">{note.unit}</Link>
            </nav>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Year {note.year} · {note.unit}{note.group ? \` · \${note.group}\` : ""}</p>
            <h1 className="mt-2 max-w-4xl font-serif text-4xl font-bold leading-[1.08] text-foreground sm:text-6xl">{note.title}</h1>
            <p className="mt-3 text-sm font-semibold text-muted-foreground">{text ? \`\${Math.max(1, Math.round(text.split(/\\s+/).length / 210))} min read\` : "Loading"}{parsed && parsed.headings.length ? \` · \${parsed.headings.length} sections\` : ""} · Updated {new Date(note.updated).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
            <p className="mt-5 max-w-3xl text-xl leading-[1.65] text-foreground/85 sm:text-[1.35rem]">{note.description}</p>
            {text && text.length > 400 && <StudyTools className="mt-6 max-w-3xl" title={note.title} path={\`/notes/\${note.slug}\`} text={text} />}
            <button type="button" onClick={() => window.print()} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-primary print:hidden"><Printer className="h-3.5 w-3.5" aria-hidden /> Print or save as PDF</button>
          </div>
        </header>
      )}

      <div className={note.paper ? "" : "mx-auto max-w-6xl px-5 pt-10"}>`;
s = s.slice(0, a) + hero + s.slice(b);

// 3. rail + text column like the topic page
rep('<div className={railOn ? "mt-6 lg:grid lg:grid-cols-[minmax(0,13.75rem)_minmax(0,1fr)] lg:gap-10" : ""}>', '<div className={railOn ? "lg:grid lg:grid-cols-[13.5rem_minmax(0,52rem)] lg:gap-12" : ""}>');
rep('<nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">', '<nav className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-border text-[15px]">');
rep('<p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">On this page</p>', '<p className="pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">On this page</p>');
rep('<ol className="mt-3 space-y-1.5 border-l border-border">', '<ol className="mt-2">');
rep('className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-[13px] font-semibold leading-snug text-muted-foreground hover:border-primary hover:text-primary"', 'className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 leading-snug text-muted-foreground hover:border-primary hover:text-primary"');
rep('<div className="w-full min-w-0 max-w-3xl">', '<div className="w-full min-w-0">');

// 4. the study buttons now live in the hero
rep('      {!note.paper && text && text.length > 400 && <StudyTools className="mt-5" title={note.title} path={`/notes/${note.slug}`} text={text} />}\n', '');

// 5. one more closing div for the body wrapper
rep("        </div>\n      </div>\n    </div>\n  );\n}", "        </div>\n      </div>\n      </div>\n    </div>\n  );\n}");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);

const css = "src/index.css";
const c = fs.readFileSync(css, "utf8");
const add = `
/* note text sized like the topic pages */
.note-body.note-topic { font-size: 1.125rem; line-height: 1.8; color: hsl(var(--foreground) / 0.88); }
@media (min-width: 640px) { .note-body.note-topic { font-size: 1.1875rem; } }
.note-body.note-topic h2 { font-size: 2.25rem; }
.note-body.note-topic strong { color: hsl(var(--foreground)); }
`;
fs.writeFileSync(css, c + (c.includes("\r\n") ? add.replace(/\n/g, "\r\n") : add));
console.log("done");
