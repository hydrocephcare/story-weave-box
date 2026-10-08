/** Small, safe markdown: headings, bullets, numbered lists, bold. Nothing the model or a note writes is ever run as HTML. */
export function Answer({ text, compact = false }: { text: string; compact?: boolean }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  return (
    <div className={compact ? "space-y-1 text-sm leading-6 text-foreground" : "space-y-1.5 text-[15px] leading-7 text-foreground"}>
      {text.split("\n").map((raw, i) => {
        const l = raw.trimEnd();
        if (!l.trim()) return null;
        const h = l.match(/^#{1,4}\s+(.*)/);
        if (h) return <h3 key={i} className="pt-2 font-serif text-base font-semibold">{inline(h[1])}</h3>;
        const b = l.match(/^\s*[-*•]\s+(.*)/);
        if (b) return <div key={i} className="flex gap-2 pl-1"><span className={`${compact ? "mt-[9px]" : "mt-[11px]"} h-1.5 w-1.5 shrink-0 rounded-full bg-primary`} /><p>{inline(b[1])}</p></div>;
        const n = l.match(/^\s*(\d+)[.)]\s+(.*)/);
        if (n) return <div key={i} className="flex gap-2 pl-1"><span className="font-semibold text-primary">{n[1]}.</span><p>{inline(n[2])}</p></div>;
        return <p key={i}>{inline(l)}</p>;
      })}
    </div>
  );
}
