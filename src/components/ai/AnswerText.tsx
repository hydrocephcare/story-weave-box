import type { ReactNode } from "react";

/** Safe inline Markdown: links are restricted to local paths, anchors and HTTPS. */
function inline(source: string): ReactNode[] {
  const token = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|[\x60][^\x60]+[\x60]|\*[^*]+\*)/g;
  const parts = source.split(token).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const split = part.indexOf("](");
      const label = part.slice(1, split);
      const href = part.slice(split + 2, -1).trim();
      const safe = href.startsWith("/") || href.startsWith("#") || /^https:\/\//i.test(href);
      if (safe) return <a key={index} href={href} className="font-medium text-primary underline underline-offset-2 hover:no-underline" {...(/^https:\/\//i.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{label}</a>;
    }
    return <span key={index}>{part}</span>;
  });
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
const isDivider = (row: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(row) && /-/.test(row);

/** Render model and note Markdown as structured, readable content without executing HTML. */
export function Answer({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd());
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(<hr key={i} className="my-3 border-border" />);
      continue;
    }

    if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      let j = i;
      while (j < lines.length && (lines[j].trim().startsWith("|") || (!lines[j].trim() && (lines[j + 1] ?? "").trim().startsWith("|")))) {
        if (lines[j].trim()) rows.push(lines[j]);
        j++;
      }
      const body = rows.filter((row) => !isDivider(row));
      if (body.length >= 2) {
        const [head, ...rest] = body.map(cells);
        out.push(
          <div key={i} className="my-3 overflow-x-auto rounded-xl border border-border">
            <table className={`w-full border-collapse text-left ${compact ? "text-xs" : "text-sm"}`}>
              <thead className="bg-primary/10"><tr>{head.map((cell, k) => <th key={k} className="px-3 py-2 font-semibold">{inline(cell)}</th>)}</tr></thead>
              <tbody>{rest.map((row, k) => <tr key={k} className="border-t border-border">{row.map((cell, m) => <td key={m} className="px-3 py-2 align-top">{inline(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>,
        );
        i = j - 1;
        continue;
      }
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const cls = level === 1 ? "pt-3 text-lg" : level === 2 ? "pt-3 text-base" : "pt-2 text-sm";
      out.push(<h3 key={i} className={`${cls} font-serif font-bold leading-snug text-foreground`}>{inline(heading[2])}</h3>);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      out.push(<blockquote key={i} className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground">{inline(quote[1])}</blockquote>);
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      out.push(<div key={i} className="flex items-start gap-2 pl-1"><span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><p className="min-w-0 flex-1">{inline(bullet[1])}</p></div>);
      continue;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      out.push(<div key={i} className="flex items-start gap-2 pl-1"><span className="font-semibold tabular-nums text-primary">{numbered[1]}.</span><p className="min-w-0 flex-1">{inline(numbered[2])}</p></div>);
      continue;
    }

    out.push(<p key={i} className="break-words">{inline(line)}</p>);
  }
  return <div className={compact ? "space-y-1.5 text-sm leading-6 text-foreground" : "space-y-2 text-[15px] leading-7 text-foreground"}>{out}</div>;
}
