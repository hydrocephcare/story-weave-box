import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerifyMock } = vi.hoisted(() => ({ jwtVerifyMock: vi.fn() }));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({ testJwks: true })),
  jwtVerify: jwtVerifyMock,
}));

import { isTrustedBlogWorkflow } from "../../api/_lib/blogPolishAuth.js";

const previousBranch = process.env.BLOG_POLISH_STAGING_BRANCH;
const auth = "Bearer test-oidc-token";
const repository = "hydrocephcare/story-weave-box";

describe("blog-polish GitHub OIDC allowlist", () => {
  beforeEach(() => jwtVerifyMock.mockReset());
  afterEach(() => {
    if (previousBranch === undefined) delete process.env.BLOG_POLISH_STAGING_BRANCH;
    else process.env.BLOG_POLISH_STAGING_BRANCH = previousBranch;
  });

  it("accepts only the configured staging article-polish workflow", async () => {
    process.env.BLOG_POLISH_STAGING_BRANCH = "staging";
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/staging",
      workflow_ref: repository + "/.github/workflows/blogs-polish.yml@refs/heads/staging",
      event_name: "workflow_dispatch",
    } });
    await expect(isTrustedBlogWorkflow(auth)).resolves.toBe(true);
  });

  it("rejects another staging branch", async () => {
    process.env.BLOG_POLISH_STAGING_BRANCH = "staging";
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/feature-other",
      workflow_ref: repository + "/.github/workflows/blogs-polish.yml@refs/heads/feature-other",
      event_name: "workflow_dispatch",
    } });
    await expect(isTrustedBlogWorkflow(auth)).resolves.toBe(false);
  });

  it("keeps the production workflow pinned to main", async () => {
    delete process.env.BLOG_POLISH_STAGING_BRANCH;
    jwtVerifyMock.mockResolvedValue({ payload: {
      repository,
      ref: "refs/heads/main",
      workflow_ref: repository + "/.github/workflows/blogs-polish.yml@refs/heads/main",
      event_name: "schedule",
    } });
    await expect(isTrustedBlogWorkflow(auth)).resolves.toBe(true);
  });
});
