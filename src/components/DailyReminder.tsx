import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarCheck, X } from "lucide-react";

const LOG = "ompath_daily_v1";
const SEEN = "ompath_daily_reminder_v1";
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A slim reminder under the menu until today's daily questions are done; on Sunday it points to the week review. Hidden on the daily pages themselves and for the day once dismissed. */
export default function DailyReminder() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);
  const today = keyOf(new Date());
  const sunday = new Date().getDay() === 0;
  useEffect(() => {
    try {
      const log = JSON.parse(localStorage.getItem(LOG) ?? "{}") as Record<string, number>;
      const dismissed = localStorage.getItem(SEEN) === today;
      setShow(!dismissed && (log[today] === undefined || sunday));
    } catch { setShow(false); }
  }, [today, sunday, pathname]);
  if (!show || /^\/(daily|admin|login|auth|contests)/.test(pathname)) return null;
  const done = (() => { try { return (JSON.parse(localStorage.getItem(LOG) ?? "{}") as Record<string, number>)[today] !== undefined; } catch { return false; } })();
  const goTo = done && sunday ? "/daily/week" : "/daily";
  const text = done && sunday ? "It is Sunday: rewind the week and test yourself on everything you studied." : "Your five daily questions and the drug of the day are waiting. Five minutes keeps your streak.";
  return (
    <div className="border-b border-primary/20 bg-primary/5 print:hidden" role="region" aria-label="Daily reminder">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-xs sm:px-5 sm:text-sm">
        <CalendarCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-foreground">{text}</p>
        <Link to={goTo} className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">{done && sunday ? "Rewind" : "Start"}</Link>
        <button type="button" onClick={() => { try { localStorage.setItem(SEEN, today); } catch { /* storage blocked */ } setShow(false); }} aria-label="Dismiss for today" className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
