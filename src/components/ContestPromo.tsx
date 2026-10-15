import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, Trophy } from "lucide-react";
import { loadContestPlatform, sortContests, type ContestRecord, type ContestUniversity } from "@/lib/contest-store";
import ContestBanner from "@/components/ContestBanner";

/** Homepage card for the newest contest that is open for registration or live. Renders nothing when there is none. */
export default function ContestPromo() {
  const [contest, setContest] = useState<ContestRecord | null>(null);
  const [unis, setUnis] = useState<ContestUniversity[]>([]);
  useEffect(() => {
    let alive = true;
    loadContestPlatform().then(({ contests, universities }) => {
      if (!alive) return;
      setContest(sortContests(contests).find((c) => c.stage === "live" || c.stage === "registration") ?? null); setUnis(universities);
    }).catch(() => { /* no contests */ });
    return () => { alive = false; };
  }, []);
  if (!contest) return null;
  const live = contest.stage === "live";
  const when = contest.startsAt ? new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(contest.startsAt)) : "";
  return (
    <section className="mx-auto max-w-6xl px-5 pt-8" aria-label="Contest">
      <Link to={`/contests/${contest.slug}`} className="group grid overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:shadow-md sm:grid-cols-[1.1fr,1fr]">
        <ContestBanner contest={contest} universities={unis} />
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${live ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"}`}><Trophy className="h-3.5 w-3.5" /> {live ? "Live now" : "Registration open"}</span>
          <h2 className="font-serif text-2xl font-bold leading-tight sm:text-3xl">{contest.title}</h2>
          {contest.subtitle && <p className="text-sm text-muted-foreground">{contest.subtitle}</p>}
          {when && <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> {when} · East Africa Time</p>}
          <span className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-primary">{live ? "Enter the lobby" : "Register for your university"} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
        </div>
      </Link>
    </section>
  );
}
