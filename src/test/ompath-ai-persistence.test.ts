import { describe, expect, it, vi } from "vitest";
import {
  checkNeonDatabase,
  deepReady,
  publishReviewedTopic,
  saveReviewedDeep,
} from "../../supabase/functions/ompath-ai/persistence.js";

describe("privileged Neon AI persistence", () => {
  it("publishes only through the server-only reviewed-topic RPC", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ result: { ok: true, existing: false } }]) };
    const page = { model: "groq", aiReview: { status: "passed", model: "gemini-3.8-flash" } };
    const result = await publishReviewedTopic(db, {
      slug: "acute-asthma", name: "Acute asthma", category: "Medicine", page,
    });
    expect(result).toEqual({ ok: true, existing: false });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("publish_topic_page_system"),
      ["acute-asthma", "Acute asthma", "Medicine", JSON.stringify(page), "groq"],
    );
  });

  it("saves deep notes through the server-only RPC, never the user Data API role", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ result: { ok: true, saved: true } }]) };
    const base = { subject: "Medicine" };
    const deep = {
      checked: "2026-11-28",
      sections: Array.from({ length: 7 }, (_, i) => ({ h: "Section " + i })),
      vivas: Array.from({ length: 12 }, (_, i) => ({ q: "Viva " + i, a: "Answer " + i })),
      mcqs: Array.from({ length: 6 }, (_, i) => ({ q: "MCQ " + i, o: ["A", "B", "C", "D"], a: 0, e: "Explanation" })),
      cases: Array.from({ length: 2 }, (_, i) => ({ v: "Case " + i, qs: [{ q: "Question", a: "Answer" }, { q: "Question 2", a: "Answer 2" }] })),
      facts: Array.from({ length: 6 }, (_, i) => "Fact " + i),
      mistakes: Array.from({ length: 5 }, (_, i) => "Mistake " + i),
      exam: Array.from({ length: 12 }, (_, i) => "Exam " + i),
    };
    const result = await saveReviewedDeep(db, {
      slug: "acute-asthma", name: "Acute asthma", category: "Medicine", base, deep,
    });
    expect(result).toEqual({ ok: true, saved: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("save_topic_deep"),
      ["acute-asthma", "Acute asthma", "Medicine", JSON.stringify(base), JSON.stringify(deep)],
    );
  });

  it("holds deep notes that do not meet the comprehensive standard", async () => {
    const db = { query: vi.fn() };
    await expect(saveReviewedDeep(db, {
      slug: "acute-asthma", name: "Acute asthma", category: "Medicine", base: {}, deep: { checked: "today" },
    })).resolves.toEqual({ ok: false, reason: "quality" });
    expect(db.query).not.toHaveBeenCalled();
    expect(deepReady({ checked: "today", sections: Array(7), vivas: Array(12), mcqs: Array(6), cases: Array(2), facts: Array(6), mistakes: Array(5), exam: Array(12) })).toBe(true);
  });

  it("fails closed when the database returns no RPC result", async () => {
    const db = { query: vi.fn().mockResolvedValue([]) };
    await expect(publishReviewedTopic(db, {
      slug: "x", name: "Topic", category: "", page: {},
    })).resolves.toEqual({ ok: false, reason: "empty_result" });
  });

  it("reports a real Neon connection and published-topic count", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ ok: 1, published_topics: 123 }]) };
    await expect(checkNeonDatabase(db)).resolves.toEqual({ ok: true, publishedTopics: 123 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("FROM public.topic_pages"));
  });
});
