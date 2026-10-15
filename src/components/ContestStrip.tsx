import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Trophy, X } from "lucide-react";
import { loadContestPlatform, type ContestRecord } from "@/lib/contest-store";

const seenKey = (c: ContestRecord) => `ompath_contest_strip_${c.slug}_${c.stage}`;

/** Slim site-wide banner for a contest that is open for registration or running now. Hidden on contest pages and once dismissed. */
export default function ContestStrip() {
  const { pathname } = useLocation();
  const [contest, setContest] = useState<ContestRecord | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    let alive = true;
    loadContestPlatform().then(({ contests }) => {
      if (!alive) return;
      setContest(contests.find((c) => c.stage === "live") ?? contests.find((c) => c.stage === "registration") ?? null);
    }).catch(() => { /* no contests yet */ });
    return () => { alive = false; };
  }, []);
  if (!contest || pathname.startsWith("/contests") || pathname.startsWith("/admin")) return null;
  try { if (localStorage.getItem(seenKey(contest)) === "1") return null; } catch { /* storage blocked */ }
  const live = contest.stage === "live";
  const to = `/contests/${contest.slug}/${live ? "lobby" : "register"}`;
  return (
    <div className="relative z-40 bg-[#0b1d20] text-white" role="status">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs sm:text-sm">
        <Trophy className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
        <Link to={to} className="min-w-0 flex-1 truncate font-semibold">
          <span className="rounded bg-teal-300 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#071315]">{live ? "Live now" : "Registration open"}</span>
          <span className="ml-2">{contest.title}</span>
          <span className="ml-1.5 text-teal-300 underline underline-offset-2">{live ? "Enter lobby →" : "Pick your university →"}</span>
        </Link>
        <button type="button" aria-label="Dismiss contest banner" onClick={() => { try { localStorage.setItem(seenKey(contest), "1"); } catch { /* storage blocked */ } force((n) => n + 1); }} className="shrink-0 rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
