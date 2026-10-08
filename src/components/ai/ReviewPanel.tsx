import { useEffect, useState } from "react";
import { Bell, Bookmark, BookOpen, CalendarPlus, Flame, Target, Trash2, TrendingUp } from "lucide-react";
import UpgradeCard from "@/components/ai/UpgradeCard";
import { getRecentArticles } from "@/lib/progress-store";
import { REMINDERS_EVENT, downloadIcs, readReminders, reminderIcs, removeReminder, whenLabel } from "@/lib/reminders";
import { activity, clearEvents, readBookmarks, readEvents, strongTopics, toggleBookmark, weakTopics } from "@/lib/review";
import { deletePlan, planToEvents, readPlans } from "@/lib/studyPlan";
import { buildBlogPath } from "@/lib/store";

const SPOT = /^(Gross anatomy|Histology|Embryology):/;
/** Re-reads everything whenever a quiz is finished, a plan is saved or a reminder changes. */
function useTick() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    for (const e of ["ompath:review", REMINDERS_EVENT, "storage"]) window.addEventListener(e, on);
    return () => { for (const e of ["ompath:review", REMINDERS_EVENT, "storage"]) window.removeEventListener(e, on); };
  }, []);
  return n;
}

const Block = ({ icon: Icon, title, children }: { icon: typeof Bell; title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-border bg-card p-3.5">
    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5 text-primary" /> {title}</h3>
    {children}
  </section>
);

/**
 * Review: what the student has been practising and where they slip, what they saved, what they read, and what to do next.
 * It is all worked out on the device from their own answers, so it costs no credits. For Pro (the admin can change that).
 */
export default function ReviewPanel({ allowed, onAsk, onOpen }: { allowed: boolean; onAsk: (text: string) => void; onOpen: (href: string) => void }) {
  useTick();
  if (!allowed) {
    return (
      <div className="space-y-3">
        <UpgradeCard kind="feature" title="Review is for Pro" why="See which topics you keep missing, get a next step each day, and keep your bookmarks, reminders and plans in one place. It all comes from your own answers." />
        <div className="pointer-events-none select-none space-y-3 opacity-50 blur-[2px]" aria-hidden="true">
          <Block icon={TrendingUp} title="Topics to work on"><p className="text-sm font-semibold">GIT Physiology <span className="text-muted-foreground">· 3 of 8 right</span></p><p className="text-sm font-semibold">Histology: Epithelial Tissue <span className="text-muted-foreground">· 2 of 5 right</span></p></Block>
          <Block icon={Target} title="Do this next"><p className="text-sm font-semibold">A 10-question quiz on GIT Physiology</p></Block>
        </div>
      </div>
    );
  }

  const events = readEvents();
  const act = activity(events);
  const weak = weakTopics(6, events);
  const strong = strongTopics(3, events);
  const reminders = readReminders().filter((r) => !r.fired || r.at > Date.now() - 86_400_000).sort((a, b) => a.at - b.at);
  const plans = readPlans();
  const marks = readBookmarks();
  const recent = getRecentArticles().slice(0, 5);
  const next = weak[0];

  const practise = (topic: string) => onAsk(SPOT.test(topic) ? `${topic.split(":")[0]} questions` : `10 mcqs on ${topic}`);

  return (
    <div className="space-y-3">
      <Block icon={Flame} title="This week">
        {act.total === 0 ? <p className="text-sm text-muted-foreground">Nothing yet. Take a quiz or answer a few spot questions and your review starts building here.</p> : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/60 p-2.5"><p className="font-serif text-2xl font-bold">{act.week}</p><p className="text-[11px] text-muted-foreground">answered</p></div>
            <div className="rounded-xl bg-muted/60 p-2.5"><p className="font-serif text-2xl font-bold">{act.week ? Math.round((act.weekCorrect / act.week) * 100) : 0}%</p><p className="text-[11px] text-muted-foreground">right</p></div>
            <div className="rounded-xl bg-muted/60 p-2.5"><p className="font-serif text-2xl font-bold">{act.streak}</p><p className="text-[11px] text-muted-foreground">day streak</p></div>
          </div>
        )}
      </Block>

      <Block icon={Target} title="Do this next">
        {next ? (
          <button type="button" onClick={() => practise(next.topic)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-primary px-3.5 py-3 text-left text-primary-foreground">
            <span className="min-w-0"><span className="block text-sm font-bold">{SPOT.test(next.topic) ? "Spot questions" : "A 10-question quiz"} on {next.topic.replace(SPOT, "").trim() || next.topic}</span><span className="block text-xs opacity-85">You got {next.correct} of {next.attempts} right</span></span>
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">Start</span>
          </button>
        ) : <p className="text-sm text-muted-foreground">{act.total ? "Nothing is slipping right now. Try a longer quiz on a unit you have not practised." : "Ask for a quiz on a unit from this week, for example “10 mcqs on physiology”."}</p>}
      </Block>

      {weak.length > 0 && (
        <Block icon={TrendingUp} title="Topics to work on">
          <ul className="divide-y divide-border">
            {weak.map((w) => (
              <li key={w.topic} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{w.topic}</span><span className="block text-xs text-muted-foreground">{w.correct} of {w.attempts} right · missed {w.missed}</span></span>
                <button type="button" onClick={() => practise(w.topic)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary">Practise</button>
              </li>
            ))}
          </ul>
          {strong.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Going well: {strong.map((s) => s.topic).join(" · ")}</p>}
        </Block>
      )}

      <Block icon={Bell} title="Reminders">
        {reminders.length === 0 ? <p className="text-sm text-muted-foreground">None. Say “remind me to revise cardiology tomorrow at 6 pm”.</p> : (
          <ul className="divide-y divide-border">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.text}</span><span className="block text-xs text-muted-foreground">{whenLabel(r.at)}{r.fired ? " · done" : ""}</span></span>
                <button type="button" onClick={() => downloadIcs("ompath-reminder", reminderIcs([r]))} aria-label="Add to calendar" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary"><CalendarPlus className="h-4 w-4" /></button>
                <button type="button" onClick={() => removeReminder(r.id)} aria-label="Delete reminder" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {plans.length > 0 && (
        <Block icon={CalendarPlus} title="Saved plans">
          <ul className="divide-y divide-border">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.title}</span>
                <button type="button" onClick={() => downloadIcs("ompath-study-plan", reminderIcs(planToEvents(p)))} aria-label="Add to calendar" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary"><CalendarPlus className="h-4 w-4" /></button>
                <button type="button" onClick={() => deletePlan(p.id)} aria-label="Delete plan" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block icon={Bookmark} title="Bookmarks">
        {marks.length === 0 ? <p className="text-sm text-muted-foreground">Tap the bookmark on any note, paper or file in an answer and it is kept here.</p> : (
          <ul className="divide-y divide-border">
            {marks.map((b) => (
              <li key={b.key} className="flex items-center gap-2 py-2">
                <button type="button" onClick={() => onOpen(b.href)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold hover:text-primary">{b.title}</span><span className="block truncate text-xs text-muted-foreground">{b.subtitle}</span></button>
                <button type="button" onClick={() => toggleBookmark(b)} aria-label="Remove bookmark" className="rounded-lg p-2 text-primary hover:bg-muted"><Bookmark className="h-4 w-4 fill-current" /></button>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {recent.length > 0 && (
        <Block icon={BookOpen} title="Recently read">
          <ul className="divide-y divide-border">{recent.map((a) => <li key={a.id}><button type="button" onClick={() => onOpen(buildBlogPath(a as never))} className="block w-full truncate py-2 text-left text-sm font-semibold hover:text-primary">{a.title}</button></li>)}</ul>
        </Block>
      )}

      {act.total > 0 && <button type="button" onClick={() => { if (window.confirm("Clear your practice history on this device?")) clearEvents(); }} className="text-xs font-semibold text-muted-foreground hover:text-destructive">Clear my practice history</button>}
    </div>
  );
}
