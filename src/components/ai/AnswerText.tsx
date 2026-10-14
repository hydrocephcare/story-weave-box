import type { ReactNode } from "react";

/** Small, safe markdown: headings, bullets, numbered lists, tables, rules, bold. Nothing the model or a note writes is ever run as HTML. */
const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isDivider = (r: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r) && /-/.test(r);

export function Answer({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.split("\n").map((r) => r.trimEnd());
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push(<hr key={i} className="my-2 border-border" />); continue; }
    // a table: rows that start with "|" (the model sometimes puts blank lines between them, which are skipped)
    if (l.trim().startsWith("|")) {
      const rows: string[] = [];
      let j = i;
      while (j < lines.length && (lines[j].trim().startsWith("|") || (!lines[j].trim() && (lines[j + 1] ?? "").trim().startsWith("|")))) { if (lines[j].trim()) rows.push(lines[j]); j++; }
      const body = rows.filter((r) => !isDivider(r));
      if (body.length >= 2) {
        const [head, ...rest] = body.map(cells);
        out.push(
          <div key={i} className="my-2 overflow-x-auto rounded-lg border border-border">
            <table className={`w-full border-collapse text-left ${compact ? "text-xs" : "text-sm"}`}>
              <thead className="bg-primary/10"><tr>{head.map((c, k) => <th key={k} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">{inline(c)}</th>)}</tr></thead>
              <tbody>{rest.map((r, k) => <tr key={k} className="border-t border-border">{r.map((c, m) => <td key={m} className="px-2.5 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>,
        );
        i = j - 1;
        continue;
      }
    }
    const h = l.match(/^#{1,4}\s+(.*)/);
    if (h) { out.push(<h3 key={i} className="pt-2 font-serif text-base font-semibold">{inline(h[1])}</h3>); continue; }
    const b = l.match(/^\s*[-*•]\s+(.*)/);
    if (b) { out.push(<div key={i} className="flex gap-2 pl-1"><span className={`${compact ? "mt-[9px]" : "mt-[11px]"} h-1.5 w-1.5 shrink-0 rounded-full bg-primary`} /><p>{inline(b[1])}</p></div>); continue; }
    const n = l.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (n) { out.push(<div key={i} className="flex gap-2 pl-1"><span className="font-semibold text-primary">{n[1]}.</span><p>{inline(n[2])}</p></div>); continue; }
    out.push(<p key={i}>{inline(l)}</p>);
  }
  return <div className={compact ? "space-y-1 text-sm leading-6 text-foreground" : "space-y-1.5 text-[15px] leading-7 text-foreground"}>{out}</div>;
}
