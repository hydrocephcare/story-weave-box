import type { CaseDef, Ddx, MCQ, Skill } from "./types";
import { orderSensitive, seededRandom } from "../../supabase/functions/_shared/mcqPositions.js";

export interface McqResult { earned: number; correctPicked: number[]; wrongPicked: number[]; missed: number[]; allRight: boolean }

/**
 * The options in the order they are shown. Questions are written with the right answer first, so each question is shown in its own fixed random
 * order (seeded by its id: the same order every time, so a question looks the same when it comes back). Grading uses each option's `ok` flag, so it
 * does not depend on the order. Options whose order means something ("all of the above", ordered values, letters named in the text) stay as written.
 */
export function displayOrder(q: MCQ): MCQ {
  const asText = { question: q.q, options: q.options.map((o) => o.t), explanation: [q.explain, ...q.options.map((o) => o.why)].join(" "), correct_answer: Math.max(0, q.options.findIndex((o) => o.ok)) };
  if (q.options.length < 3 || orderSensitive(asText)) return q;
  const rand = seededRandom(`clinical:${q.id}`);
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { ...q, options: order.map((i) => q.options[i]) };
}

/** Score a (single or multi) choice question. Partial credit for multi-select; wrong picks subtract. */
export function scoreMcq(q: MCQ, picked: number[], hintsUsed: number, retried: boolean): McqResult {
  const right = q.options.map((o, i) => (o.ok ? i : -1)).filter((i) => i >= 0);
  const correctPicked = picked.filter((i) => q.options[i]?.ok);
  const wrongPicked = picked.filter((i) => !q.options[i]?.ok);
  const missed = right.filter((i) => !picked.includes(i));
  let raw = right.length ? (correctPicked.length - wrongPicked.length) / right.length : 0;
  raw = Math.max(0, Math.min(1, raw));
  const penalty = Math.min(0.45, hintsUsed * 0.12) + (retried ? 0.25 : 0);
  return { earned: Math.max(0, raw * (1 - penalty)), correctPicked, wrongPicked, missed, allRight: wrongPicked.length === 0 && missed.length === 0 };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Which of the case's differentials does the learner's free text correspond to? */
export function matchDdx(text: string, list: Ddx[]): number {
  const t = norm(text);
  if (t.length < 2) return -1;
  for (let i = 0; i < list.length; i++) {
    const names = [list[i].name, ...list[i].aliases].map(norm);
    if (names.some((n) => n === t || (t.length >= 3 && n.includes(t)) || (n.length >= 3 && t.includes(n)))) return i;
  }
  return -1;
}

export const pct = (e: number, t: number) => (t > 0 ? Math.round((e / t) * 100) : 0);

export type SkillTally = Partial<Record<Skill, [number, number]>>;
export function addScore(tally: SkillTally, skill: Skill, earned: number, total = 1): SkillTally {
  const [e, t] = tally[skill] ?? [0, 0];
  return { ...tally, [skill]: [e + earned, t + total] };
}

export const STAGES_BY_MODE: Record<string, string[]> = {
  full: ["intro", "history", "exam", "ddx", "ix", "event", "twist", "dx", "mgmt", "consult", "summary"],
  cold: ["cold", "history", "exam", "problems", "ddx", "ix", "event", "twist", "dx", "mgmt", "drug", "why", "consult", "present", "summary"],
  long: ["intro", "history", "exam", "report", "problems", "ddx", "ix", "event", "twist", "dx", "mgmt", "drug", "consult", "present", "summary"],
  ddx: ["intro", "ddx", "summary"],
  history: ["intro", "history", "summary"],
  exam: ["intro", "exam", "summary"],
  report: ["intro", "exam", "report", "summary"],
  ix: ["intro", "ix", "summary"],
  emergency: ["intro", "event", "summary"],
  problems: ["intro", "problems", "summary"],
  present: ["intro", "present", "summary"],
  drug: ["intro", "drug", "summary"],
  why: ["intro", "why", "summary"],
};

export const MODE_INFO: Record<string, { label: string; blurb: string; hard?: boolean }> = {
  full: { label: "Full ward round", blurb: "From the first sentence to the management plan." },
  cold: { label: "Cold patient", blurb: "One line from the nurse. Nothing else. You decide everything.", hard: true },
  long: { label: "Long case", blurb: "History, examination, report, problem list, plan — then present to the consultant." },
  ddx: { label: "Differential diagnosis", blurb: "Handover given — generate and justify differentials." },
  history: { label: "History taking", blurb: "Ask the right questions; see what you missed." },
  exam: { label: "Examination", blurb: "Choose what to examine and why." },
  report: { label: "Report the examination", blurb: "Examine, then report normal and abnormal findings like a doctor." },
  ix: { label: "Investigation interpretation", blurb: "Order tests and read the results." },
  emergency: { label: "Emergency", blurb: "The patient deteriorates — what do you do NOW?" },
  problems: { label: "Problem list", blurb: "Name every active problem and rank what threatens life first." },
  present: { label: "Present to the consultant", blurb: "Present the patient in order; get graded on 8 criteria." },
  drug: { label: "Drug reasoning", blurb: "Why this drug? Class, mechanism, adverse effects, cautions, special groups." },
  why: { label: "Why ladder", blurb: "Keep asking why until you reach the physiology." },
};

/** Stages that only make sense when the learner has seen the patient, so key facts are handed over in modes that skip them. */
export const stagesHandOver = (stages: string[]) => !stages.includes("history") && !stages.includes("exam") && !stages.includes("cold");

import { CASE_DRUGS } from "./extras/drugs";
import { PROBLEMS } from "./extras/problems";

export function caseHasStage(c: CaseDef, stage: string): boolean {
  if (stage === "drug") return Boolean(CASE_DRUGS[c.id]?.length);
  if (stage === "problems") return Boolean(PROBLEMS[c.id]);
  if (stage === "event") return Boolean(c.event);
  if (stage === "twist") return Boolean(c.twist);
  return true;
}
