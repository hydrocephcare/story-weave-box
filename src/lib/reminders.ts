// Reminders set by talking to Ompath AI ("remind me to revise cardiology tomorrow at 6 pm"). They are kept on the device, shown as an alert on the
// site when they come due, and can be added to the phone's calendar (.ics), which is what rings when the site is closed. No credits are used.
export interface Reminder { id: string; text: string; at: number; fired?: boolean }
const KEY = "ompath_reminders_v1";
const EVENT = "ompath:reminders";

export const readReminders = (): Reminder[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (list: Reminder[]) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-60))); } catch { /* storage full */ } window.dispatchEvent(new Event(EVENT)); };
export function addReminder(text: string, at: number): Reminder {
  const r: Reminder = { id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`, text: text.trim().slice(0, 140), at };
  write([...readReminders(), r]);
  return r;
}
export const removeReminder = (id: string) => write(readReminders().filter((r) => r.id !== id));
export const markFired = (id: string) => write(readReminders().map((r) => (r.id === id ? { ...r, fired: true } : r)));
export const REMINDERS_EVENT = EVENT;

// ---------- reading "tomorrow at 6 pm" ----------
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const PERIOD: Record<string, [number, number]> = { morning: [7, 0], noon: [12, 0], midday: [12, 0], afternoon: [15, 0], evening: [18, 0], tonight: [20, 0], night: [20, 0] };

export interface When { at: number | null; text: string; hadDay: boolean }
/** Pulls the time out of a sentence and leaves the thing to be reminded about. `at` is null when no time was given. */
export function parseWhen(input: string, now = new Date()): When {
  let s = " " + input.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim() + " ";
  s = s.replace(/^\s*(please |pls )?(can you |could you )?(remind me|set (a )?reminder|reminder)( to| about| that)?\s*/i, " ");
  const strip = (re: RegExp) => { const m = s.match(re); if (m) s = s.replace(m[0], " "); return m; };
  const base = new Date(now);

  const rel = strip(/\bin (\d+|an?|one|two|three|half an?) ?(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/);
  if (rel) {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3 };
    const n = /half/.test(rel[1]) ? 0.5 : Number(rel[1]) || words[rel[1]] || 1;
    const unit = rel[2][0] === "m" ? 60_000 : rel[2][0] === "h" ? 3_600_000 : rel[2][0] === "d" ? 86_400_000 : 604_800_000;
    return { at: now.getTime() + n * unit, text: tidy(s), hadDay: true };
  }

  let day: Date | null = null;
  if (strip(/\bday after tomorrow\b/)) day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2);
  else if (strip(/\b(tomorrow|tmrw|tommorow|tomorow)\b/)) day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  else if (strip(/\btoday\b/)) day = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  else {
    const wd = DAYS.findIndex((d) => new RegExp(`\\b(next |on )?${d}\\b`).test(s));
    if (wd >= 0) { strip(new RegExp(`\\b(next |on )?${DAYS[wd]}\\b`)); const diff = (wd - base.getDay() + 7) % 7 || 7; day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff); }
  }

  let hm: [number, number] | null = null;
  const clock = strip(/\b(?:at |by |around )?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/) ?? strip(/\bat (\d{1,2})(?::(\d{2}))?\b/) ?? strip(/\b(\d{1,2}):(\d{2})\b/);
  if (clock) {
    let h = Number(clock[1]); const m = Number(clock[2] ?? 0); const ap = (clock[3] ?? "").replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    if (!ap && h >= 1 && h <= 6) h += 12; // "at 6" in a study context is the evening
    if (h <= 23 && m <= 59) hm = [h, m];
  }
  const per = strip(/\b(this )?(morning|noon|midday|afternoon|evening|tonight|night)\b/);
  if (!hm && per) hm = PERIOD[per[2]];
  if (per && per[2] === "tonight" && !day) day = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  if (!day && !hm) return { at: null, text: tidy(s), hadDay: false };
  if (day && !hm) return { at: null, text: tidy(s), hadDay: true };
  const target = new Date((day ?? base).getFullYear(), (day ?? base).getMonth(), (day ?? base).getDate(), hm![0], hm![1]);
  if (!day && target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1); // "at 6 pm" said at 7 pm means tomorrow
  return { at: target.getTime(), text: tidy(s), hadDay: true };
}
const tidy = (s: string) => s.replace(/\b(please|pls)\b/g, " ").replace(/\s+/g, " ").replace(/^(to|that|about)\s+/, "").replace(/[\s,.]+$/g, "").trim();

export const whenLabel = (at: number, now = Date.now()) => {
  const d = new Date(at);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()) / 86_400_000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  return `${day} at ${d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}`;
};

/** The quick answers offered when a reminder has no time. */
export function timeChoices(now = new Date()): { label: string; phrase: string }[] {
  const evening = now.getHours() < 19;
  return [
    { label: "In 1 hour", phrase: "in 1 hour" },
    ...(evening ? [{ label: "Tonight 8 pm", phrase: "today at 8 pm" }] : []),
    { label: "Tomorrow 7 am", phrase: "tomorrow at 7 am" },
    { label: "Tomorrow 6 pm", phrase: "tomorrow at 6 pm" },
    { label: "Saturday 9 am", phrase: "saturday at 9 am" },
  ];
}

// ---------- the phone's calendar ----------
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; };
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function reminderIcs(items: { id: string; text: string; at: number; minutes?: number; notes?: string }[]): string {
  const events = items.map((r) => [
    "BEGIN:VEVENT", `UID:${r.id}@ompathstudy.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(r.at)}`, `DTEND:${stamp(r.at + (r.minutes ?? 15) * 60_000)}`,
    `SUMMARY:${esc(r.text)}`, ...(r.notes ? [`DESCRIPTION:${esc(r.notes)}`] : []), "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", `DESCRIPTION:${esc(r.text)}`, "END:VALARM", "END:VEVENT",
  ].join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ompath Study//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
}
export function downloadIcs(filename: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
