import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getProgress } from "@/lib/study";
import { lastDays } from "@/lib/deckStats";

/** "Your week": cards revised, notes opened and practice scores over the last seven days, from this account's own activity. */
export default function WeeklyReport({ className = "" }: { className?: string }) {
  const { user, loading } = useAuth();
  const [notes, setNotes] = useState<number | null>(null);
  useEffect(() => {
    if (loading) return;
    let on = true;
    void getProgress(user?.id ?? null).then((rows) => {
      const since = Date.now() - 7 * 86_400_000;
      if (on) setNotes(rows.filter((r) => r.resource_type === "article" && new Date(r.last_opened_at).getTime() >= since).length);
    }).catch(() => { if (on) setNotes(0); });
    return () => { on = false; };
  }, [user?.id, loading]);

  const days = lastDays(7);
  const cards = days.reduce((n, d) => n + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;
  // practice scores kept from the last seven days (MCQ banks you finished)
  let score = 0, total = 0, banks = 0;
  try {
    const since = Date.now() - 7 * 86_400_000;
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("mcq_practice_")) continue;
      const j = JSON.parse(localStorage.getItem(k) || "null");
      if (j && Number(j.total) && Number(j.at) >= since) { score += Number(j.score); total += Number(j.total); banks++; }
    }
  } catch { /* storage blocked */ }
  if (!cards && !notes && !banks) return null;
  const stat = (v: string | number, l: string) => <div><p className="font-serif text-3xl font-bold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>;
  return (
    <section className={className} aria-label="Your week">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Your week</p>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {stat(cards, "cards revised")}
        {stat(`${active}/7`, "days studied")}
        {stat(notes ?? "—", "notes opened")}
        {stat(total ? `${Math.round((score / total) * 100)}%` : "—", banks ? `MCQ score, ${banks} bank${banks === 1 ? "" : "s"}` : "MCQ score")}
      </div>
    </section>
  );
}
