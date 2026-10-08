// Conversations that take more than one message, without using the AI: setting a reminder and building a study plan. When a detail is
// missing, a quick question with tappable answers is returned (like asking "which year?"), and the answer carries on from where it stopped.
import { MBCHB_2026_TRIMESTER_1 } from "@/lib/timetable2026";
import type { KeyDate } from "@/lib/siteConfig";
import { YEAR_ASK } from "@/lib/ompathAiPersonal";
import { addReminder, parseWhen, timeChoices, whenLabel, type Reminder } from "@/lib/reminders";
import { buildPlan, type Plan } from "@/lib/studyPlan";

export interface FlowCtx { year: number | null; units: string[]; weak: string[]; keyDates: KeyDate[]; now: Date; canReminders: boolean }
export interface FlowReply {
  answer: string;
  followUps?: string[];
  clarify?: { question: string; options: string[]; other?: string; send?: Record<string, string> };
  reminder?: Reminder;
  plan?: Plan;
  /** The student answered "which year?" in the middle of a plan: remember it. */
  setYear?: number;
  /** The request needs a Pro feature this person does not have. */
  locked?: "reminders";
}

const REMIND = "ompath_flow_reminder";
const PLAN = "ompath_flow_plan";
const get = <T,>(k: string): T | null => { try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const put = (k: string, v: unknown) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const drop = (k: string) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } };
const clean = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export const isReminderRequest = (s: string) => /\bremind(er|ers)?\b|\bset (an? )?(alarm|alert)\b/.test(clean(s));
export const isPlanRequest = (s: string) => /\b(study|revision|reading|exam)\s*(plan|schedule|programme|program)\b|\b(plan|schedule) (for )?my (study|studies|revision|week|reading)\b|\b(make|create|build|give|need|want)\b.{0,16}\bplan\b|\bhelp me (plan|study)\b/.test(clean(s));

// ---------- reminders ----------
function reminderFlow(text: string, ctx: FlowCtx): FlowReply | null {
  const pending = get<{ text: string }>(REMIND);
  const asking = isReminderRequest(text);
  if (!asking && !pending) return null;
  if (asking && !ctx.canReminders) return { answer: "Reminders are a Pro feature. Pro students can say “remind me to revise cardiology tomorrow at 6 pm” and get an alert on the site and an entry in their phone calendar.", locked: "reminders" };
  const w = parseWhen(text, ctx.now);
  if (!asking) {
    // an answer to "when?": it must contain a time, otherwise the request was dropped
    if (!w.at) { drop(REMIND); return null; }
    drop(REMIND);
    const r = addReminder(pending!.text, w.at);
    return { answer: `Done. I will remind you to **${r.text}** — ${whenLabel(r.at, ctx.now.getTime()).toLowerCase()}.`, reminder: r, followUps: ["What do we have tomorrow?", "Make me a study plan"] };
  }
  const what = w.text || "study";
  if (w.at) { drop(REMIND); const r = addReminder(what, w.at); return { answer: `Done. I will remind you to **${r.text}** — ${whenLabel(r.at, ctx.now.getTime()).toLowerCase()}.`, reminder: r, followUps: ["Make me a study plan"] }; }
  put(REMIND, { text: what });
  const choices = timeChoices(ctx.now);
  return { answer: `Got it: **${what}**.`, clarify: { question: "When should I remind you?", options: choices.map((c) => c.label), other: "Or type a time, like Friday 5 pm", send: Object.fromEntries(choices.map((c) => [c.label, c.phrase])) } };
}

// ---------- study plan ----------
interface PlanState { hours?: number; days?: number }
function readHours(s: string): number | undefined {
  const m = s.match(/\b(\d)\s*\+?\s*(?:hours?|hrs?|h)\b/) ?? s.match(/\b(one|two|three|four|five)\s+hours?\b/);
  if (!m) return undefined;
  const n = Number(m[1]) || ["", "one", "two", "three", "four", "five"].indexOf(m[1]);
  return n >= 1 && n <= 8 ? n : undefined;
}
function readDays(s: string, ctx: FlowCtx): number | undefined {
  if (/\buntil (the )?(cats?|exams?)\b|\bbefore (the )?(cats?|exams?)\b/.test(s)) {
    const cat = new Date(`${MBCHB_2026_TRIMESTER_1.catStartDate}T00:00:00`);
    const left = Math.ceil((cat.getTime() - ctx.now.getTime()) / 86_400_000);
    return Math.min(28, Math.max(5, left));
  }
  const w = s.match(/\b(\d+|one|two|three|four)\s*weeks?\b/);
  if (w) { const n = Number(w[1]) || ["", "one", "two", "three", "four"].indexOf(w[1]); return Math.min(28, Math.max(1, n) * 7); }
  if (/\b(this week|a week|7 days|seven days|week)\b/.test(s)) return 7;
  const d = s.match(/\b(\d{1,2})\s*days?\b/);
  if (d) return Math.min(28, Math.max(3, Number(d[1])));
  return undefined;
}

function planFlow(text: string, ctx: FlowCtx): FlowReply | null {
  const s = clean(text);
  const asking = isPlanRequest(s);
  let state = get<PlanState>(PLAN);
  if (!asking && !state) return null;
  if (asking) state = {};
  const hours = readHours(s), days = readDays(s, ctx);
  const saidYear = !asking ? Number(s.match(/^i am in year ([1-6])$/)?.[1]) || undefined : undefined; // the answer to "which year?"
  if (!asking && !saidYear && hours === undefined && days === undefined) { drop(PLAN); return null; } // an unrelated message: forget the plan
  const year = saidYear ?? ctx.year;
  state = { ...state, ...(hours !== undefined ? { hours } : {}), ...(days !== undefined ? { days } : {}) };
  put(PLAN, state);

  if (!year) return { answer: "I will build it around your week.", clarify: YEAR_ASK };
  const withYear = saidYear ? { setYear: saidYear } : {};
  if (!state.hours) return { ...withYear, answer: `${saidYear ? `Year ${saidYear}, noted. ` : ""}Let us make a plan that fits your week.`, clarify: { question: "How much can you study each day?", options: ["1 hour", "2 hours", "3 hours", "4 hours or more"], send: { "1 hour": "I can study 1 hour a day", "2 hours": "I can study 2 hours a day", "3 hours": "I can study 3 hours a day", "4 hours or more": "I can study 4 hours a day" } } };
  if (!state.days) return { answer: `${state.hours} hour${state.hours === 1 ? "" : "s"} a day, good.`, clarify: { question: "How long should the plan run?", options: ["This week", "2 weeks", "Until the CATs"], send: { "This week": "plan for this week", "2 weeks": "plan for 2 weeks", "Until the CATs": "plan until the cats" } } };

  drop(PLAN);
  const today = ctx.now.toISOString().slice(0, 10);
  const next = ctx.keyDates.filter((k) => k.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const examInDays = next ? Math.ceil((new Date(`${next.date}T00:00:00`).getTime() - ctx.now.getTime()) / 86_400_000) : undefined;
  const plan = buildPlan({ year, units: ctx.units, weak: ctx.weak, hoursPerDay: state.hours, days: state.days, now: ctx.now, examLabel: next?.label, examInDays });
  return { ...withYear, answer: `Here is your ${plan.days.length}-day plan, built from your timetable this week${ctx.weak.length ? " and the topics you have been missing" : ""}. Making it used no credits.`, plan, followUps: ["Remind me to start tomorrow at 7 am", "Quiz me on my weakest topic"] };
}

export function flowReply(text: string, ctx: FlowCtx): FlowReply | null {
  if (!text.trim() || text.length > 220) return null;
  return reminderFlow(text, ctx) ?? planFlow(text, ctx);
}
