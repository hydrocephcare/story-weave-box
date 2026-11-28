import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerifyMock } = vi.hoisted(() => ({ jwtVerifyMock: vi.fn() }));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ testJwks: true })),
  jwtVerify: jwtVerifyMock,
}));
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
vi.mock("../../supabase/functions/_shared/topicParts.js", () => ({ pickSubject: vi.fn() }));
vi.mock("../../supabase/functions/_shared/topicAi.js", () => ({ askModel: vi.fn(), askGroqModel: vi.fn(), generateReviewedTopicPage: vi.fn() }));
vi.mock("../../supabase/functions/_shared/contentCheck.js", () => ({ generateCheckedDeep: vi.fn(), checkContent: vi.fn() }));
vi.mock("../../api/_lib/supabaseAiEnv.js", () => ({ supabaseAiEnv: vi.fn() }));
vi.mock("../../supabase/functions/_shared/mcqPositions.js", () => ({ placeNewQuestions: vi.fn() }));
vi.mock("../../supabase/functions/_shared/noteBanks.js", () => ({ dedupeNoteMcqs: vi.fn(), generateNoteMcqs: vi.fn(), generateNoteFlashcards: vi.fn() }));

import { verifyWorkflow } from "../../api/_lib/topicMaintenance.js";

const request = { headers: { authorization: "Bearer test-oidc-token" } };
const repository = "hydrocephcare/story-weave-box";
const previousBranch = process.env.TOPIC_MAINTENANCE_STAGING_BRANCH;

describe("topic-maintenance GitHub OIDC allowlist", () => {
  beforeEach(() => jwtVerifyMock.mockReset());
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
