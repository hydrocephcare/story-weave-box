/** A model answer: lines starting with "- " become bullets, **bold** is kept. */
export default function DentalAnswer({ text, label = "Model answer" }: { text: string; label?: string }) {
  const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") ? <strong key={i}>{x.slice(2, -2)}</strong> : x));
  const bullet = /^\s*[-•*]\s+/;
  return (
    <div className="mt-2 space-y-1.5 border-l-2 border-emerald-500/60 pl-4 text-[15.5px] leading-relaxed">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">{label}</p>
      {text.replace(/\\n/g, "\n").split("\n").filter((l) => l.trim()).map((l, i) => (bullet.test(l) ? <p key={i} className="flex gap-2"><span className="text-primary">•</span><span>{bold(l.replace(bullet, ""))}</span></p> : <p key={i} className="font-semibold">{bold(l)}</p>))}
    </div>
  );
}
