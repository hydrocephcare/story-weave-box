import { useState } from "react";
import { Target } from "lucide-react";
import { useStudyLog } from "@/lib/studyLog";

const KEY = "ompath_weekly_goal";
const OPTIONS = [3, 5, 7];
const readGoal = () => { try { const n = Number(localStorage.getItem(KEY)); return OPTIONS.includes(n) ? n : 5; } catch { return 5; } };

/** Days studied in the last seven against a weekly target you choose, drawn as a ring. */
export default function WeeklyGoal() {
  const { week, streak } = useStudyLog();
  const [goal, setGoal] = useState(readGoal);
  const days = week.filter((d) => d.minutes > 0).length;
  const pct = Math.min(1, days / goal);
  const R = 26, C = 2 * Math.PI * R;
  const pick = (g: number) => { setGoal(g); try { localStorage.setItem(KEY, String(g)); } catch { /* storage blocked */ } };
  const letter = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "narrow" });

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Target className="h-3.5 w-3.5 text-primary" /> Weekly goal</h3>
      <div className="flex items-center gap-3">
        <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${days} of ${goal} study days this week`} className="shrink-0">
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 32 32)" className={pct >= 1 ? "stroke-emerald-500" : "stroke-primary"} />
          <text x="32" y="37" textAnchor="middle" className="fill-foreground text-[15px] font-bold">{days}/{goal}</text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{pct >= 1 ? "Goal met this week 🎉" : `${goal - days} more study day${goal - days === 1 ? "" : "s"} to hit your goal`}</p>
          <p className="text-[11px] text-muted-foreground">{streak}-day streak</p>
          <div className="mt-1.5 flex gap-1" role="group" aria-label="Weekly target">
            {OPTIONS.map((g) => <button key={g} type="button" onClick={() => pick(g)} aria-pressed={goal === g} className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${goal === g ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}>{g} days</button>)}
          </div>
        </div>
      </div>
      <ol className="mt-2 flex gap-1" aria-label="Last 7 days">
        {week.map((d) => <li key={d.day} className="flex flex-1 flex-col items-center gap-0.5"><span className={`h-2 w-full rounded-full ${d.minutes > 0 ? "bg-primary" : "bg-muted"}`} /><span className="text-[9px] font-bold text-muted-foreground">{letter(d.day)}</span></li>)}
      </ol>
    </section>
  );
}
