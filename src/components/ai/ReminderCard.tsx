import { useState } from "react";
import { Bell, BellRing, CalendarPlus, Trash2 } from "lucide-react";
import { downloadIcs, reminderIcs, removeReminder, whenLabel, type Reminder } from "@/lib/reminders";

/** A reminder that has been set. The phone's calendar is what rings when the site is closed, so adding it there is one tap. */
export default function ReminderCard({ reminder }: { reminder: Reminder }) {
  const [gone, setGone] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "none">(typeof Notification === "undefined" ? "none" : Notification.permission);
  if (gone) return <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">Reminder cancelled.</p>;
  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5" aria-label="Reminder">
      <p className="flex items-start gap-2 text-sm font-bold"><BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {reminder.text}</p>
      <p className="mt-0.5 pl-6 text-sm text-muted-foreground">{whenLabel(reminder.at)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => downloadIcs("ompath-reminder", reminderIcs([{ id: reminder.id, text: reminder.text, at: reminder.at }]))} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><CalendarPlus className="h-3.5 w-3.5" /> Add to my phone calendar</button>
        {perm === "default" && <button type="button" onClick={() => void Notification.requestPermission().then(setPerm)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:border-primary"><Bell className="h-3.5 w-3.5" /> Alert me on this device</button>}
        <button type="button" onClick={() => { removeReminder(reminder.id); setGone(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Cancel</button>
      </div>
      <p className="mt-2 pl-0.5 text-[11px] text-muted-foreground">The site shows an alert when this is due and you have it open. The calendar entry rings even when it is closed.</p>
    </section>
  );
}
