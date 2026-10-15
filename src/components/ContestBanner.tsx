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

/** Which years a contest is for, as small round year badges (Y1, Y2 ...). */
export function YearBadges({ years, className = "" }: { years: number[]; className?: string }) {
  if (!years.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1.5 ${className}`} aria-label={`Years ${years.join(", ")}`}>
      {years.map((y) => <span key={y} className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/15 px-1.5 text-[11px] font-black text-white ring-1 ring-white/25">Y{y}</span>)}
    </span>
  );
}

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(iso)) : "");

/** The picture for a contest: its uploaded poster, or a generated banner with the competing universities, the years, the date and the Ompath Study mark. */
export default function ContestBanner({ contest, universities, className = "" }: { contest: ContestRecord; universities: ContestUniversity[]; className?: string }) {
  if (contest.shareImageUrl) return <img src={contest.shareImageUrl} alt={contest.title} loading="lazy" className={`aspect-[40/21] w-full object-cover ${className}`} />;
  const chosen = contest.universityIds.length ? universities.filter((u) => contest.universityIds.includes(u.id)) : [];
  const h = hue(contest.slug);
  const shown = chosen.slice(0, 3);
  return (
    <div className={`relative flex aspect-[40/21] w-full flex-col items-center justify-center overflow-hidden px-4 ${className}`} style={{ background: `linear-gradient(135deg, hsl(${h} 55% 13%), hsl(${(h + 50) % 360} 60% 22%))` }}>
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-teal-300/15 blur-2xl" />
      <img src="/brand/mark-dark.png" alt="" className="absolute bottom-2 right-3 h-9 w-auto opacity-90" decoding="async" />
      <YearBadges years={contest.years} className="absolute left-3 top-3 max-w-[60%]" />
      {shown.length >= 2 ? (
        <div className="relative mt-4 flex items-center gap-3 sm:gap-5">
          {shown.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3 sm:gap-5">
              {i > 0 && <span className="text-xs font-black uppercase tracking-[0.3em] text-white/50">vs</span>}
              <div className="flex flex-col items-center gap-2"><UniBadge u={u} size={64} /><span className="text-[11px] font-bold uppercase tracking-wider text-white/80">{short(u)}</span></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative mt-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/55">{chosen.length ? "Head to head" : "Open to every university"}</p>
          <p className="mt-2 font-serif text-3xl font-bold leading-tight text-white">{contest.title}</p>
        </div>
      )}
      {contest.startsAt && <p className="absolute bottom-3 left-3 text-[11px] font-semibold text-white/75">{when(contest.startsAt)} EAT</p>}
    </div>
  );
}
