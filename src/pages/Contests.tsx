import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, Check, Copy, MessageCircle, ShieldCheck, Trophy, UserCheck, UserPlus, Zap } from "lucide-react";
import { CONTEST_RULES } from "@/lib/contest";
import { updateMetaTags } from "@/lib/seo";
import { loadContestLeaderboard, loadContestPlatform, sortContests, type ContestRecord, type ContestUniversity, type ContestUniversityResult } from "@/lib/contest-store";
import ContestCountdown from "@/components/ContestCountdown";
import ContestPoster from "@/components/ContestPoster";
import ContestBanner, { UniBadge } from "@/components/ContestBanner";

const STAGE: Record<string, { label: string; tone: string }> = {
  live: { label: "Live now", tone: "bg-red-400 text-[#071315]" },
  registration: { label: "Registration open", tone: "bg-teal-300 text-[#071315]" },
  concept: { label: "Coming soon", tone: "bg-white/15 text-white" },
  completed: { label: "Finished", tone: "bg-white/15 text-white" },
  cancelled: { label: "Cancelled", tone: "bg-white/10 text-white/60" },
};

const STEPS = [
  { icon: UserPlus, title: "Pick your university", copy: "Register with your university and year. One account, one university." },
  { icon: UserCheck, title: "Get confirmed", copy: "You are notified on the site as soon as your entry is confirmed." },
  { icon: Zap, title: "Sit the round", copy: "Enter the lobby at the start time. Timed MCQs, scored automatically." },
  { icon: Trophy, title: "Climb the table", copy: "Your score counts for your university on the public leaderboard." },
];

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(iso)) : "");

export default function Contests() {
  const [contests, setContests] = useState<ContestRecord[]>([]);
  const [universities, setUniversities] = useState<ContestUniversity[]>([]);
  const [board, setBoard] = useState<ContestUniversityResult[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allUnis, setAllUnis] = useState(false);

  useEffect(() => {
    updateMetaTags({
      title: "Inter-University Medical Contest | OmpathStudy",
      description: "Medical students from universities across Kenya compete on one leaderboard. Register with your university, sit timed MCQ rounds and climb the table.",
    });
    loadContestPlatform().then(({ contests: rows, universities: unis }) => {
      const sorted = sortContests(rows);
      setContests(sorted); setUniversities(unis);
      if (sorted[0]) loadContestLeaderboard(sorted[0].id).then((r) => setBoard(r.slice(0, 5))).catch(() => { /* no results yet */ });
    }).catch(() => { /* contests not reachable */ }).finally(() => setLoaded(true));
  }, []);

  const featured = contests[0] ?? null;
  const others = contests.slice(1);
  const stage = STAGE[featured?.stage ?? "concept"] ?? STAGE.concept;
  const slug = featured?.slug ?? "";
  const shareUrl = `https://www.ompathstudy.com/contests/${slug}`;
  const shareText = `${featured?.title ?? "Inter-University Medical Contest"} on Ompath Study. Represent your university: ${shareUrl}`;
  const primary = featured?.stage === "live" ? { to: `/contests/${slug}/lobby`, label: "Enter the lobby" } : featured?.stage === "registration" ? { to: `/contests/${slug}/register`, label: "Register now" } : { to: `/contests/${slug}/briefing`, label: "Read the briefing" };
  const copy = () => navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => { /* clipboard blocked */ });
  const eligible = featured?.universityIds.length ? universities.filter((u) => featured.universityIds.includes(u.id)) : universities;
  const shownUnis = allUnis ? eligible : eligible.slice(0, 12);

  return (
    <div className="min-h-dvh bg-[#071315] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(39,196,180,0.18),transparent_38%),radial-gradient(circle_at_20%_70%,rgba(249,115,82,0.10),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:py-16 lg:grid-cols-[1.1fr,1fr] lg:items-center">
          <div>
            {featured ? <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${stage.tone}`}>{stage.label}</span>
              : <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em]">Contests</span>}
            <h1 className="mt-5 font-serif text-4xl font-bold leading-[1.05] sm:text-5xl">{featured?.title ?? "Inter-University Medical Contest"}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">{featured?.subtitle || "Medical students from universities across Kenya compete on one leaderboard."}</p>
            {featured && (
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/60">
                {featured.startsAt && <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> {when(featured.startsAt)} EAT</span>}
                {featured.subjects.length > 0 && <span>{featured.subjects.join(" · ")}</span>}
                {featured.years.length > 0 && <span>{featured.years.map((y) => `Year ${y}`).join(", ")}</span>}
              </p>
            )}
            {featured?.startsAt && new Date(featured.startsAt).getTime() > Date.now() && <ContestCountdown startsAt={featured.startsAt} className="mt-6 max-w-md" />}
            {featured && (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to={primary.to} className="inline-flex items-center gap-2 rounded-lg bg-teal-300 px-5 py-3 text-sm font-bold text-[#071315] transition hover:bg-teal-200">{primary.label} <ArrowRight className="h-4 w-4" /></Link>
                <Link to={`/contests/${slug}/leaderboard`} className="rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-white/80 transition hover:bg-white/5">Leaderboard</Link>
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-bold text-white/80 hover:bg-white/5"><MessageCircle className="h-4 w-4" /> Share</a>
                <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-3 text-sm font-bold text-white/80 hover:bg-white/5">{copied ? <Check className="h-4 w-4 text-teal-300" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}</button>
                <ContestPoster contest={featured} universities={universities} />
              </div>
            )}
          </div>
          {featured && <div className="overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/40"><ContestBanner contest={featured} universities={universities} /></div>}
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-14 px-5 py-12 sm:py-16">
        {others.length > 0 && (
          <section aria-labelledby="all">
            <h2 id="all" className="font-serif text-2xl font-bold sm:text-3xl">More contests</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {others.map((item) => {
                const st = STAGE[item.stage] ?? STAGE.concept;
                return (
                  <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                    <Link to={`/contests/${item.slug}`} className="relative block"><ContestBanner contest={item} universities={universities} /><span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${st.tone}`}>{st.label}</span></Link>
                    <div className="p-5">
                      <h3 className="text-lg font-bold">{item.title}</h3>
                      {item.startsAt && <p className="mt-1 text-sm text-white/55">{when(item.startsAt)} EAT</p>}
                      <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold">
                        <Link to={`/contests/${item.slug}`} className="text-teal-300 hover:text-teal-200">Details →</Link>
                        {item.stage === "registration" && <Link to={`/contests/${item.slug}/register`} className="text-white/70 hover:text-white">Register</Link>}
                        {item.stage === "live" && <Link to={`/contests/${item.slug}/lobby`} className="text-white/70 hover:text-white">Enter lobby</Link>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {featured && eligible.length > 0 && (
          <section aria-labelledby="unis">
            <div className="flex flex-wrap items-end justify-between gap-3"><h2 id="unis" className="font-serif text-2xl font-bold sm:text-3xl">{featured.universityIds.length ? "Competing universities" : "Represent your university"}</h2><span className="text-sm text-white/45">{eligible.length} universities</span></div>
            <p className="mt-2 text-sm text-white/55">Tap yours to register.{featured.universityIds.length ? "" : " Not listed? You can add it on the registration form."}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {shownUnis.map((u) => (
                <li key={u.id}>
                  <Link to={`/contests/${slug}/register?university=${u.slug}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-teal-300/40 hover:bg-white/[0.07]">
                    <UniBadge u={u} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{u.abbreviation || u.name}</span><span className="block truncate text-xs text-white/50">{u.name}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            {eligible.length > 12 && <button type="button" onClick={() => setAllUnis((v) => !v)} className="mt-4 text-sm font-bold text-teal-300 hover:text-teal-200">{allUnis ? "Show fewer" : `Show all ${eligible.length}`}</button>}
          </section>
        )}

        <section aria-labelledby="how">
          <h2 id="how" className="font-serif text-2xl font-bold sm:text-3xl">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, copy: text }, i) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-300/15 text-sm font-black text-teal-200">{i + 1}</span><Icon className="h-5 w-5 text-teal-300" aria-hidden /></div>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {featured && (
          <section aria-labelledby="table" className="rounded-2xl border border-white/10 bg-[#0b1d20] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3"><h2 id="table" className="flex items-center gap-2 font-serif text-2xl font-bold"><Trophy className="h-5 w-5 text-amber-300" aria-hidden /> University table</h2><Link to={`/contests/${slug}/leaderboard`} className="text-sm font-bold text-teal-300 hover:text-teal-200">Full leaderboard →</Link></div>
            {board.length ? (
              <ol className="mt-5 space-y-2">
                {board.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-bold">{r.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.contest_universities?.name ?? "University"}</span>
                    <span className="text-sm font-bold text-teal-300">{Number(r.average_score).toFixed(1)}%</span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-4 text-sm text-white/55">Scores appear here once the first round is closed and published.</p>}
          </section>
        )}

        {loaded && !contests.length && <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/55"><CalendarClock className="mx-auto mb-2 h-5 w-5" aria-hidden /> No contest is published right now. Check back soon.</p>}

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-teal-300" aria-hidden /><h2 className="font-serif text-2xl font-bold">Fair play</h2></div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {CONTEST_RULES.map((rule, index) => <p key={rule} className="flex gap-3 text-sm leading-relaxed text-white/60"><span className="text-teal-300">{String(index + 1).padStart(2, "0")}</span>{rule}</p>)}
          </div>
        </section>
      </main>
    </div>
  );
}
