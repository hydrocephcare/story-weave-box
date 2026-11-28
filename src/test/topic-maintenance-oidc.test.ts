import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerifyMock, groqMock, reviewMock, envMock } = vi.hoisted(() => ({ jwtVerifyMock: vi.fn(), groqMock: vi.fn(), reviewMock: vi.fn(), envMock: vi.fn() }));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ testJwks: true })),
  jwtVerify: jwtVerifyMock,
}));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
vi.mock("../../supabase/functions/_shared/topicParts.js", () => ({ pickSubject: vi.fn() }));
vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({ askModel: vi.fn(), askGroqModel: groqMock, generateReviewedTopicPage: vi.fn() }));
vi.mock("../../supabase/functions/_shared/contentCheck.js", () => ({ generateCheckedDeep: vi.fn(), checkContent: reviewMock }));
vi.mock("../../api/_lib/supabaseAiEnv.js", () => ({ supabaseAiEnv: envMock }));
vi.mock("../../supabase/functions/_shared/mcqPositions.js", () => ({ placeNewQuestions: vi.fn() }));
vi.mock("../../supabase/functions/_shared/noteBanks.js", () => ({ dedupeNoteMcqs: vi.fn(), generateNoteMcqs: vi.fn(), generateNoteFlashcards: vi.fn() }));

import topicMaintenance, { verifyWorkflow } from "../../api/_lib/topicMaintenance.js";

const request = { headers: { authorization: "Bearer test-oidc-token" } };
const repository = "hydrocephcare/story-weave-box";
const previousBranch = process.env.TOPIC_MAINTENANCE_STAGING_BRANCH;

describe("topic-maintenance GitHub OIDC allowlist", () => {
  beforeEach(() => { jwtVerifyMock.mockReset(); groqMock.mockReset(); reviewMock.mockReset(); envMock.mockReset().mockReturnValue({ GROQ_API_KEYS: "test-groq", GEMINI_API_KEYS: "test-gemini" }); });
  afterEach(() => {
    if (previousBranch === undefined) delete process.env.TOPIC_MAINTENANCE_STAGING_BRANCH;
    else process.env.TOPIC_MAINTENANCE_STAGING_BRANCH = previousBranch;
  });

  it("allows only the explicitly configured staging branch and maintenance workflow", async () => {
    process.env.TOPIC_MAINTENANCE_STAGING_BRANCH = "staging";
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/staging",
      workflow_ref: repository + "/.github/workflows/topics-daily.yml@refs/heads/staging",
      event_name: "workflow_dispatch",
    } });
    await expect(verifyWorkflow(request)).resolves.toBe(true);
  });

  it("rejects another branch even when its workflow name matches", async () => {
    process.env.TOPIC_MAINTENANCE_STAGING_BRANCH = "staging";
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/feature-other",
      workflow_ref: repository + "/.github/workflows/topics-daily.yml@refs/heads/feature-other",
      event_name: "workflow_dispatch",
    } });
    await expect(verifyWorkflow(request)).resolves.toBe(false);
  });

  it("does not allow a staging branch unless an exact branch is configured", async () => {
    delete process.env.TOPIC_MAINTENANCE_STAGING_BRANCH;
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/staging",
      workflow_ref: repository + "/.github/workflows/zone-daily.yml@refs/heads/staging",
      event_name: "workflow_dispatch",
    } });
    await expect(verifyWorkflow(request)).resolves.toBe(false);
  });

  it("continues to allow the two trusted production workflows on main", async () => {
    delete process.env.TOPIC_MAINTENANCE_STAGING_BRANCH;
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/main",
      workflow_ref: repository + "/.github/workflows/zone-daily.yml@refs/heads/main",
      event_name: "schedule",
    } });
    await expect(verifyWorkflow(request)).resolves.toBe(true);
  });

  it("uses Groq for daily medical game drafts and Gemini for independent review", async () => {
    process.env.TOPIC_MAINTENANCE_STAGING_BRANCH = "staging";
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/staging",
      workflow_ref: repository + "/.github/workflows/zone-daily.yml@refs/heads/staging",
      event_name: "workflow_dispatch",
    } });
    const questions = Array.from({ length: 8 }, (_, i) => ({
      q: `Which clinical finding supports asthma question ${i + 1}?`,
      options: ["Variable expiratory airflow limitation", "Pleural effusion", "Fixed upper airway obstruction", "Reduced lung compliance"],
      correct: 0,
      explanation: "Asthma causes variable expiratory airflow limitation.",
    }));
    groqMock.mockResolvedValue({ text: JSON.stringify({ questions }), model: "groq-draft-test" });
    reviewMock.mockResolvedValue({ validated: true, model: "gemini-review-test", at: "2026-11-28T08:00:00Z" });
    const res = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.body = value; return this; },
    };
    await topicMaintenance({
      method: "POST",
      headers: { authorization: "Bearer test-oidc-token" },
      body: { task: "zone-write", kind: "quiz", topic: { name: "Asthma", year: 4, unit: "Medicine" } },
    } as never, res as never);
    expect(groqMock).toHaveBeenCalledTimes(1);
    expect(reviewMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).reviewStatus).toBe("passed");
    expect((res.body as any).reviewModel).toBe("gemini-review-test");
  });

  it("rejects unsafe staging branch values", async () => {
    process.env.TOPIC_MAINTENANCE_STAGING_BRANCH = "../main";
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/../main",
      workflow_ref: repository + "/.github/workflows/topics-daily.yml@refs/heads/../main",
      event_name: "workflow_dispatch",
    } });
    await expect(verifyWorkflow(request)).resolves.toBe(false);
  });
});
