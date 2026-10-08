// A study plan made from the student's own week: the units on their timetable, plus any weak topics from Review. Plain arithmetic, so it
// costs no credits and gives the same plan for the same inputs. Saving it and exporting it to a calendar are Pro (admin can change that).
export interface PlanBlock { unit: string; task: string; minutes: number; weak?: boolean }
export interface PlanDay { date: string; label: string; blocks: PlanBlock[]; note?: string }
export interface Plan { id: string; title: string; createdAt: number; year: number; hoursPerDay: number; days: PlanDay[] }

const TASKS = [
  (u: string) => `Read your notes on ${u}`,
  (u: string) => `Do 15 MCQs on ${u}`,
  (u: string) => `Past-paper questions on ${u}`,
  (u: string) => `Say ${u} out loud from memory, then check your notes`,
  (u: string) => `Redo the questions you missed in ${u}`,
];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface PlanInput { year: number; units: string[]; weak: string[]; hoursPerDay: number; days: number; now: Date; examLabel?: string; examInDays?: number }

export function buildPlan(p: PlanInput): Plan {
  const focus = [...p.weak.map((w) => ({ name: w, weak: true })), ...p.units.filter((u) => !p.weak.includes(u)).map((u) => ({ name: u, weak: false }))];
  if (!focus.length) focus.push({ name: "your core units", weak: false });
  const block = p.hoursPerDay <= 1 ? 30 : 45;
  const perDay = Math.max(1, Math.min(6, Math.round((p.hoursPerDay * 60) / block)));
  const days: PlanDay[] = [];
  let cursor = 0;
  for (let i = 0; i < p.days; i++) {
    const d = new Date(p.now.getFullYear(), p.now.getMonth(), p.now.getDate() + i);
    const label = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    const sunday = d.getDay() === 0;
    const last = i === p.days - 1 && p.days >= 5;
    if (last) { days.push({ date: iso(d), label, blocks: [{ unit: "Everything this week", task: "Timed mixed quiz: 30 MCQs across the week's units", minutes: 60 }, { unit: "Review", task: "Go through what you missed and note three things to fix", minutes: 30 }], note: "Mock day" }); continue; }
    const n = sunday ? Math.max(1, Math.floor(perDay / 2)) : perDay;
    const blocks: PlanBlock[] = [];
    for (let b = 0; b < n; b++) {
      const f = focus[cursor % focus.length];
      const t = TASKS[(Math.floor(cursor / focus.length) + b + i) % TASKS.length];
      blocks.push({ unit: f.name, task: t(f.name), minutes: block, weak: f.weak });
      cursor++;
    }
    days.push({ date: iso(d), label, blocks, note: sunday ? "Lighter day: rest, then look at the week ahead" : undefined });
  }
  const exam = p.examInDays !== undefined && p.examLabel ? ` · ${p.examLabel} in ${p.examInDays} days` : "";
  return { id: `p${Date.now()}`, title: `Year ${p.year} plan · ${p.days} days · ${p.hoursPerDay} h a day${exam}`, createdAt: Date.now(), year: p.year, hoursPerDay: p.hoursPerDay, days };
}

const KEY = "ompath_plans_v1";
export const readPlans = (): Plan[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
export function savePlan(plan: Plan) { try { localStorage.setItem(KEY, JSON.stringify([plan, ...readPlans().filter((x) => x.id !== plan.id)].slice(0, 6))); } catch { /* storage full */ } window.dispatchEvent(new Event("ompath:review")); }
export function deletePlan(id: string) { try { localStorage.setItem(KEY, JSON.stringify(readPlans().filter((x) => x.id !== id))); } catch { /* ignore */ } window.dispatchEvent(new Event("ompath:review")); }

/** One calendar entry per plan day, at 7 pm local time, listing the blocks. */
export function planToEvents(plan: Plan): { id: string; text: string; at: number; minutes: number; notes: string }[] {
  return plan.days.filter((d) => d.blocks.length).map((d) => {
    const [y, m, day] = d.date.split("-").map(Number);
    return { id: `${plan.id}-${d.date}`, text: `Study: ${d.blocks.slice(0, 2).map((b) => b.unit).join(" and ")}`, at: new Date(y, m - 1, day, 19, 0).getTime(), minutes: d.blocks.reduce((s, b) => s + b.minutes, 0), notes: d.blocks.map((b) => `${b.task} (${b.minutes} min)`).join("\n") };
  });
}
