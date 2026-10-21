import type { DentalPaper, PaperItem, PaperPart } from "@/lib/dentalPapers";

const up = (s: string) => s.toUpperCase();

function Marks({ m }: { m?: number }) {
  if (!m) return null;
  return <span className="ml-3 shrink-0 whitespace-nowrap italic text-neutral-600">({m} Marks)</span>;
}

function Parts({ parts }: { parts?: PaperPart[] }) {
  if (!parts?.length) return null;
  return (
    <ol className="mt-1 space-y-1 pl-7">
      {parts.map((p, i) => (
        <li key={i}><div className="flex items-baseline justify-between"><p className="min-w-0 flex-1"><span className="mr-2">{p.l ? `${p.l})` : "•"}</span>{p.text}</p><Marks m={p.marks} /></div><Parts parts={p.parts} /></li>
      ))}
    </ol>
  );
}

function Item({ it }: { it: PaperItem }) {
  if (it.t === "h") return <p className="mt-5 text-[15px] font-bold uppercase tracking-wide text-neutral-900">{it.text}{it.marks ? ` (${it.marks} MARKS)` : ""}</p>;
  if (it.t === "p") return <p className="mt-2 text-[14.5px] leading-relaxed text-neutral-800">{it.text}</p>;
  return (
    <div className="mt-3 text-[14.5px] leading-relaxed text-neutral-900">
      <div className="flex items-baseline justify-between">
        <p className="min-w-0 flex-1 whitespace-pre-line"><span className="mr-2 font-semibold">{it.n ? `${it.n}.` : ""}</span>{it.text}</p>
        {!it.parts?.length && <Marks m={it.marks} />}
      </div>
      <Parts parts={it.parts} />
    </div>
  );
}

/**
 * The paper as it was handed out: letterhead with a crest and the university's name, the examination title, school, department, programme, unit and date block,
 * the instructions, then the questions page by page with the page footer. Everything is typed text, set the way the printed paper is set.
 */
export default function PaperSheet({ paper }: { paper: DentalPaper }) {
  return (
    <div className="space-y-6">
      {paper.pages.map((pg, idx) => (
        <article key={pg.n} className="mx-auto w-full max-w-[44rem] bg-white px-7 py-9 text-neutral-900 shadow-[0_6px_24px_-8px_rgba(0,0,0,0.35)] sm:px-14 sm:py-12" style={{ fontFamily: "'Times New Roman', Times, 'Libre Baskerville', Georgia, serif", minHeight: "min(1100px, 150vw)" }} aria-label={`Page ${pg.n}`}>
          {idx === 0 && (
            <header className="text-center">
              <img src="/dental/letterhead.png" alt={paper.university} width={920} height={165} className="mx-auto h-auto w-full max-w-[34rem]" />
              <p className="mt-6 text-[15px] font-semibold tracking-wide">{up(paper.examTitle)}</p>
              {paper.school && <p className="mt-3 text-[14.5px] font-semibold tracking-wide">{up(paper.school)}</p>}
              {paper.department && <p className="mt-1 text-[14.5px] font-semibold tracking-wide">{up(paper.department)}</p>}
              {paper.programme && <p className="mt-5 text-[14.5px] font-semibold tracking-wide">{up(paper.programme)}</p>}
              <p className="mt-5 text-[14px] font-semibold">
                {paper.unitCode && <span>UNIT CODE: {up(paper.unitCode)}</span>}{paper.unitCode && paper.unitTitle && <span className="mx-3" />}{paper.unitTitle && <span>UNIT TITLE: {up(paper.unitTitle)}</span>}
              </p>
              <div className="mt-3 flex flex-wrap justify-between gap-x-4 border-b border-neutral-300 pb-2 text-[13.5px] font-semibold">
                <span>{paper.date ? `DATE: ${up(paper.date)}` : ""}</span><span>{up(paper.sitting)}</span><span>{paper.duration ? `TIME: ${up(paper.duration)}` : ""}</span>
              </div>
              {paper.instructions && <p className="mt-4 text-left text-[14px] font-semibold uppercase leading-snug">INSTRUCTIONS: {paper.instructions}</p>}
            </header>
          )}
          <div>{pg.items.map((it, k) => <Item key={k} it={it} />)}</div>
          <footer className="mt-10 flex items-center justify-between border-t border-neutral-300 pt-2 text-[12.5px] italic text-neutral-600">
            <span>{pg.footer || paper.paperLabel || ""}</span><span>Page {pg.n}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}
