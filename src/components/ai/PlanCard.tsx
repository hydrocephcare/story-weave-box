import { useState } from "react";
import { BellPlus, Bookmark, CalendarPlus, Check, ChevronDown } from "lucide-react";
import UpgradeCard from "@/components/ai/UpgradeCard";
import { addReminder, downloadIcs, reminderIcs } from "@/lib/reminders";
import { planToEvents, savePlan, type Plan } from "@/lib/studyPlan";

/** A study plan, day by day. Anyone can read it; saving it, putting it in a calendar and daily reminders are Pro features (the admin can change that). */
export default function PlanCard({ plan, canSave, canRemind }: { plan: Plan; canSave: boolean; canRemind: boolean }) {
  const [openDay, setOpenDay] = useState<string | null>(plan.days[0]?.date ?? null);
  const [saved, setSaved] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [locked, setLocked] = useState(false);

  const needPro = () => setLocked(true);
  return (
    <section className="space-y-2.5" aria-label="Study plan">
      <div className="rounded-2xl border border-border bg-card p-3.5">
        <p className="font-serif text-base font-bold leading-snug">{plan.title}</p>
        <div className="mt-3 space-y-1.5">
          {plan.days.map((d) => {
            const open = openDay === d.date;
            const minutes = d.blocks.reduce((s, b) => s + b.minutes, 0);
            return (
              <div key={d.date} className="overflow-hidden rounded-xl border border-border bg-background">
                <button type="button" onClick={() => setOpenDay(open ? null : d.date)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                  <span className="min-w-0"><span className="block text-sm font-bold">{d.label}</span><span className="block truncate text-xs text-muted-foreground">{d.note ?? d.blocks.map((b) => b.unit).filter((u, i, a) => a.indexOf(u) === i).slice(0, 2).join(" · ")}</span></span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">{minutes} min<ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></span>
                </button>
                {open && (
                  <ul className="space-y-1.5 border-t border-border px-3 py-2.5">
                    {d.blocks.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${b.weak ? "bg-amber-500" : "bg-primary"}`} /><span className="min-w-0 flex-1">{b.task}{b.weak && <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">weak spot</span>}</span><span className="shrink-0 text-xs text-muted-foreground">{b.minutes} min</span></li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { if (!canSave) return needPro(); savePlan(plan); setSaved(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">{saved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}{saved ? "Saved to Review" : "Save this plan"}</button>
          <button type="button" onClick={() => { if (!canSave) return needPro(); downloadIcs("ompath-study-plan", reminderIcs(planToEvents(plan))); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary"><CalendarPlus className="h-3.5 w-3.5" /> Add to calendar</button>
          <button type="button" onClick={() => { if (!canRemind) return needPro(); planToEvents(plan).filter((e) => e.at > Date.now()).forEach((e) => addReminder(e.text, e.at)); setReminded(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary">{reminded ? <Check className="h-3.5 w-3.5" /> : <BellPlus className="h-3.5 w-3.5" />}{reminded ? "Reminders set for 7 pm" : "Remind me each evening"}</button>
        </div>
      </div>
      {locked && <UpgradeCard kind="feature" title="Saving plans is for Pro" why="Everyone can read a plan. Pro can save it, add it to a phone calendar and get a reminder each evening." />}
    </section>
  );
}
