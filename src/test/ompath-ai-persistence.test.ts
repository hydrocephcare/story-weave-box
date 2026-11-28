import { describe, expect, it, vi } from "vitest";
import {
  checkNeonDatabase,
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
    const deep = { sections: [{ h: "Clinical" }], exam: [{ q: "Question" }] };
    const result = await saveReviewedDeep(db, {
      slug: "acute-asthma", name: "Acute asthma", category: "Medicine", base, deep,
    });
    expect(result).toEqual({ ok: true, saved: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("save_topic_deep"),
      ["acute-asthma", "Acute asthma", "Medicine", JSON.stringify(base), JSON.stringify(deep)],
    );
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
