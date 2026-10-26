import { cn } from "@/lib/utils";

const PALETTES = [
  ["#0f766e", "#134e4a", "#f5c542"],
  ["#1e3a8a", "#0f172a", "#5eead4"],
  ["#7c2d12", "#1c1917", "#fbbf24"],
  ["#4c1d95", "#1e1b4b", "#a7f3d0"],
  ["#14532d", "#052e16", "#fde68a"],
  ["#831843", "#1f2937", "#fcd34d"],
];
const pick = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PALETTES[h % PALETTES.length]; };

/** The picture for a story that has none of its own: a designed card with the story's title, so a list never shows an empty box. */
export default function StoryCoverArt({ title, label = "Student story", className }: { title: string; label?: string; className?: string }) {
  const [a, b, c] = pick(title || label);
  return (
    <div className={cn("relative isolate flex flex-col justify-between overflow-hidden p-4 text-white", className)} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden>
      <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-25" style={{ background: c }} />
      <span className="absolute -bottom-10 left-6 h-24 w-24 rounded-full opacity-15" style={{ background: c }} />
      <span className="relative text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: c }}>{label}</span>
      <span className="relative line-clamp-3 font-serif text-xl font-bold leading-tight sm:text-2xl">{title}</span>
    </div>
  );
}
