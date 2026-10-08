import { describe, expect, it } from "vitest";
import { essayIntent, paperIntent, pickPapers, quizIntent } from "@/lib/ompathAiTools";
import { drillIntent } from "@/lib/questionBank";
import { activity, strongTopics, topicStats, weakTopics, type PracticeEvent } from "@/lib/review";

describe("quizIntent", () => {
  it("reads the number and the topic", () => {
    expect(quizIntent("I need 30 mcqs on physiology")).toMatchObject({ kind: "quiz", n: 30, topic: "physiology" });
    expect(quizIntent("quiz me on heart failure")).toMatchObject({ topic: "heart failure", n: 10 });
    expect(quizIntent("give me 20 questions on year 2 git physiology")).toMatchObject({ n: 20, year: 2 });
  });
  it("keeps the size sensible", () => {
    expect(quizIntent("500 mcqs on anatomy of the heart")?.n).toBe(50);
    expect(quizIntent("2 mcqs on shock")?.n).toBe(5);
  });
  it("leaves other requests to the other tools", () => {
    for (const q of ["essay questions on shock", "past papers on pharmacology", "notes on psychiatry", "what is a question", "hi"]) expect(quizIntent(q), q).toBeNull();
  });
  it("does not clash with the anatomy drill", () => {
    expect(drillIntent("give me some anat questions")).not.toBeNull();
  });
});

describe("essayIntent and paperIntent", () => {
  it("recognises essays", () => {
    expect(essayIntent("essay questions on shock")).toMatchObject({ kind: "essay", topic: "shock" });
    expect(essayIntent("saq on diabetes")?.topic).toBe("diabetes");
    expect(essayIntent("30 mcqs on shock")).toBeNull();
  });
  it("recognises papers", () => {
    expect(paperIntent("I need the full paper for paediatrics")).toMatchObject({ kind: "paper", topic: "paediatrics" });
    expect(paperIntent("last year's pharmacology cat")?.latest).toBe(true);
    expect(paperIntent("30 mcqs on physiology")).toBeNull();
  });
});

describe("pickPapers", () => {
  it("always gives a paper, and says when it is only the closest", () => {
    const hit = pickPapers("paediatrics", null, false);
    expect(hit?.best.paper).toBeTruthy();
    expect(hit?.exact).toBe(true);
    const far = pickPapers("zzzqqq nonsense", null, false);
    expect(far?.best).toBeTruthy();
    expect(far?.exact).toBe(false);
  });
});

describe("review", () => {
  const now = Date.now();
  const ev = (topic: string, ok: boolean, ago = 0): PracticeEvent => ({ t: now - ago, kind: "mcq", topic, ok });
  it("finds weak and strong topics", () => {
    const events = [...Array(4)].map(() => ev("Cardiology", false)), more = [...Array(6)].map(() => ev("Renal", true));
    expect(weakTopics(5, [...events, ...more]).map((t) => t.topic)).toEqual(["Cardiology"]);
    expect(strongTopics(5, [...events, ...more]).map((t) => t.topic)).toEqual(["Renal"]);
    expect(topicStats([...events, ...more]).find((t) => t.topic === "Renal")?.accuracy).toBe(1);
  });
  it("counts the streak of days practised", () => {
    const d = 86_400_000;
    expect(activity([ev("a", true), ev("a", true, d), ev("a", true, 2 * d), ev("a", true, 5 * d)], now).streak).toBe(3);
  });
});
