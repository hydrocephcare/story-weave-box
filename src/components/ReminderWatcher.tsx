import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { markFired, readReminders } from "@/lib/reminders";

/** While the site is open, shows a reminder when it comes due (and a system alert if the student allowed alerts). Does nothing when there are none. */
export default function ReminderWatcher() {
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const r of readReminders()) {
        if (r.fired || r.at > now) continue;
        markFired(r.id);
        toast({ title: "Reminder", description: r.text, duration: 20000 });
        try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Ompath Study reminder", { body: r.text, icon: "/icon-192.png", tag: r.id }); } catch { /* not allowed here */ }
      }
    };
    check();
    const t = window.setInterval(check, 20_000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  return null;
}
