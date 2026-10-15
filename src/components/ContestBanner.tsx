import type { ContestRecord, ContestUniversity } from "@/lib/contest-store";

const hue = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const short = (u: ContestUniversity) => (u.abbreviation || u.name.split(/\s+/).map((w) => w[0]).join("")).slice(0, 5).toUpperCase();

/** Round badge for a university: its initials on a colour taken from its name. */
export function UniBadge({ u, size = 44 }: { u: ContestUniversity; size?: number }) {
  const h = hue(u.slug);
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-black tracking-tight text-white shadow-inner ring-2 ring-white/15"
      style={{ width: size, height: size, fontSize: size * 0.3, background: `linear-gradient(135deg, hsl(${h} 60% 38%), hsl(${(h + 40) % 360} 65% 28%))` }} aria-hidden>
      {short(u).slice(0, 4)}
    </span>
  );
}

/** The picture for a contest: its uploaded poster, or a generated banner showing the competing universities. */
export default function ContestBanner({ contest, universities, className = "" }: { contest: ContestRecord; universities: ContestUniversity[]; className?: string }) {
  if (contest.shareImageUrl) return <img src={contest.shareImageUrl} alt={contest.title} loading="lazy" className={`aspect-[40/21] w-full object-cover ${className}`} />;
  const chosen = contest.universityIds.length ? universities.filter((u) => contest.universityIds.includes(u.id)) : [];
  const h = hue(contest.slug);
  const shown = chosen.slice(0, 3);
  return (
    <div className={`relative flex aspect-[40/21] w-full items-center justify-center overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, hsl(${h} 55% 14%), hsl(${(h + 50) % 360} 60% 22%))` }}>
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-teal-300/15 blur-2xl" />
      {shown.length >= 2 ? (
        <div className="relative flex items-center gap-3 sm:gap-5">
          {shown.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3 sm:gap-5">
              {i > 0 && <span className="text-xs font-black uppercase tracking-[0.3em] text-white/50">vs</span>}
              <div className="flex flex-col items-center gap-2"><UniBadge u={u} size={64} /><span className="text-[11px] font-bold uppercase tracking-wider text-white/80">{short(u)}</span></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative px-6 pt-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/55">{chosen.length ? "Head to head" : "Open to every university"}</p>
          <p className="mt-2 font-serif text-3xl font-bold leading-tight text-white">{contest.title}</p>
        </div>
      )}
    </div>
  );
}
