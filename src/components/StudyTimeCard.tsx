import { useMemo } from "react";
import { Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { lastSevenDays } from "@/lib/studyTime";

/** "Time studied": seven bars, one per day, from the time spent actively on notes, topics and blogs on this device. */
export default function StudyTimeCard() {
  const { user } = useAuth();
  const days = useMemo(() => lastSevenDays(user?.id), [user?.id]);
  const total = days.reduce((n, d) => n + d.mins, 0);
  const max = Math.max(30, ...days.map((d) => d.mins));
  const hrs = total >= 60 ? `${Math.floor(total / 60)} h ${total % 60} min` : `${total} min`;
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4" aria-label="Time studied this week">
      <h2 className="flex items-center gap-2 font-serif text-xl font-bold"><Clock className="h-5 w-5 text-primary" aria-hidden /> Time studied</h2>
      <p className="mt-1 text-sm text-muted-foreground">{total ? `${hrs} in the last 7 days.` : "Nothing counted yet. Time counts while you read and scroll."} Only time you are really reading is counted, and it stays on this device.</p>
      <div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label={days.map((d) => `${d.label} ${d.mins} minutes`).join(", ")}>
        {days.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] font-semibold text-muted-foreground">{d.mins || ""}</span>
            <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${Math.max(d.mins ? 6 : 2, (d.mins / max) * 80)}px`, opacity: d.mins ? 1 : 0.25 }} />
            <span className="text-[11px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
