// Minutes of real study (the page visible and the student active), per day, kept per account on this device. Shown on /my-week as "Time studied".
const key = (uid: string | null | undefined) => `ompath_studytime_${uid ?? "guest"}`;
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function read(uid: string | null | undefined): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(key(uid)) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

/** Adds study seconds to today (called every few seconds while the student is active). */
export function addStudySeconds(uid: string | null | undefined, secs: number) {
  try {
    const all = read(uid);
    const today = dayOf(new Date());
    all[today] = (all[today] ?? 0) + secs;
    // only the last 60 days are kept
    const keep = Object.keys(all).sort().slice(-60);
    const out: Record<string, number> = {};
    keep.forEach((k) => { out[k] = all[k]; });
    localStorage.setItem(key(uid), JSON.stringify(out));
  } catch { /* storage blocked */ }
}

/** The last seven days, oldest first: { day, label, mins }. */
export function lastSevenDays(uid: string | null | undefined): { day: string; label: string; mins: number }[] {
  const all = read(uid);
  const out: { day: string; label: string; mins: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const day = dayOf(d);
    out.push({ day, label: d.toLocaleDateString(undefined, { weekday: "short" }), mins: Math.round((all[day] ?? 0) / 60) });
  }
  return out;
}
