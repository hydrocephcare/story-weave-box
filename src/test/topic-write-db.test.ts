import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockNeon, mockVerifyNeonToken, mockQuery } = vi.hoisted(() => ({
  mockNeon: vi.fn(),
  mockVerifyNeonToken: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({ neon: (...args: unknown[]) => mockNeon(...args) }));
vi.mock("../../api/_lib/neonAdmin.js", () => ({ verifyNeonToken: (...args: unknown[]) => mockVerifyNeonToken(...args) }));

import topicWriteDb from "../../api/_lib/topicWriteDb.js";

const secret = "test-only-gateway-secret-with-more-than-32-characters";
const validPage = {
  medical: true,
  summary: "A sufficiently detailed clinical summary that meets the publication minimum and explains the topic accurately.",
  sections: [{ title: "A" }, { title: "B" }, { title: "C" }],
  exam: Array.from({ length: 8 }, (_, i) => ({ question: "Question " + i })),
  aiReview: { status: "passed", model: "gemini-test", fixRounds: 0 },
  model: "groq-test",
};
const validDeep = {
  checked: true,
  sections: Array.from({ length: 7 }, (_, i) => ({ title: "Section " + i })),
  vivas: Array.from({ length: 12 }, (_, i) => ({ question: "Viva " + i })),
  mcqs: Array.from({ length: 6 }, (_, i) => ({ question: "MCQ " + i })),
  cases: [{ title: "Case 1" }, { title: "Case 2" }],
  facts: Array.from({ length: 6 }, (_, i) => "Fact " + i),
  mistakes: Array.from({ length: 5 }, (_, i) => "Mistake " + i),
  exam: Array.from({ length: 12 }, (_, i) => ({ question: "Exam " + i })),
};

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
}
function request(task: string, extra: Record<string, unknown> = {}) {
  return {
    method: "POST",
    headers: { "x-neon-db-gateway-secret": secret, authorization: "Bearer valid-token" },
    body: { task, ...extra },
  };
}

describe("server-side Neon topic persistence gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEON_DB_GATEWAY_SECRET = secret;
    process.env.DATABASE_URL = "postgresql://test.invalid/db";
    mockVerifyNeonToken.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001" });
    mockQuery.mockResolvedValue([{ result: { ok: true, saved: true } }]);
    mockNeon.mockReturnValue(mockQuery);
  });

  it("fails closed when the shared secret is missing", async () => {
    delete process.env.NEON_DB_GATEWAY_SECRET;
    const res = response();
    await topicWriteDb(request("publish_topic"), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockVerifyNeonToken).not.toHaveBeenCalled();
    expect(mockNeon).not.toHaveBeenCalled();
  });

  it("rejects requests without the shared secret", async () => {
    const req = request("publish_topic");
    req.headers["x-neon-db-gateway-secret"] = "wrong";
    const res = response();
    await topicWriteDb(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockVerifyNeonToken).not.toHaveBeenCalled();
  });

  it("requires a valid Neon Auth session", async () => {
    mockVerifyNeonToken.mockResolvedValue(null);
    const res = response();
    await topicWriteDb(request("publish_topic"), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNeon).not.toHaveBeenCalled();
  });

  it("publishes only pages that passed the independent clinical review", async () => {
    const res = response();
    await topicWriteDb(request("publish_topic", { slug: "test-topic", name: "Test topic", category: "Medicine", page: validPage }), res);
    expect(mockNeon).toHaveBeenCalledWith(process.env.DATABASE_URL);
    expect(mockQuery.mock.calls[0][0].join("")).toContain("publish_topic_page_system");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, slug: "test-topic" }));
  });

  it("rejects a topic that has not passed independent clinical review", async () => {
    const page = { ...validPage, aiReview: { status: "issues", model: "gemini-test" } };
    const res = response();
    await topicWriteDb(request("publish_topic", { slug: "test-topic", name: "Test topic", page }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockNeon).not.toHaveBeenCalled();
  });

  it("saves structurally complete deep notes through the privileged database function", async () => {
    const res = response();
    await topicWriteDb(request("save_deep", { slug: "test-topic", name: "Test topic", deep: validDeep }), res);
    expect(mockQuery.mock.calls[0][0].join("")).toContain("save_topic_deep");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects incomplete or unsafe deep notes before touching Neon", async () => {
    const res = response();
    await topicWriteDb(request("save_deep", { slug: "test-topic", name: "Test topic", deep: { ...validDeep, exam: [] } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockNeon).not.toHaveBeenCalled();
  });

  it("returns a controlled persistence error when Neon fails", async () => {
    mockQuery.mockRejectedValue(new Error("database connection details must not be returned"));
    const res = response();
    await topicWriteDb(request("publish_topic", { slug: "test-topic", name: "Test topic", page: validPage }), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: "Neon persistence failed." });
  });
});
