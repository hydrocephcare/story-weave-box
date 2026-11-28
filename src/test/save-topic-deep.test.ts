import { beforeEach, describe, expect, it, vi } from "vitest";

const { neonMock, verifyTokenMock } = vi.hoisted(() => ({
  neonMock: vi.fn(),
  verifyTokenMock: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({ neon: neonMock }));
vi.mock("../../api/_lib/neonAdmin.js", () => ({ verifyNeonToken: verifyTokenMock }));

import handler from "../../api/_lib/saveTopicDeep.js";

const SECRET = "test-secret-value-that-is-at-least-thirty-two-bytes";
const makeReq = (overrides = {}) => ({
  method: "POST",
  headers: {
    authorization: "Bearer valid-user-token",
    "x-ompath-neon-write-secret": SECRET,
  },
  body: {
    slug: "test-topic",
    name: "Test Topic",
    category: "Year 4",
    base: { subject: "Test Topic" },
    deep: {
      sections: Array.from({ length: 4 }, (_, i) => ({ heading: `Section ${i + 1}`, content: "Reviewed content" })),
      exam: Array.from({ length: 6 }, (_, i) => ({ question: `Question ${i + 1}`, answer: "Answer" })),
    },
  },
  ...overrides,
});

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

describe("saveTopicDeep privileged persistence proxy", () => {
  let sqlMock;

  beforeEach(() => {
    process.env.OMPATH_NEON_WRITE_SECRET = SECRET;
    process.env.DATABASE_URL = "postgres://test.invalid/neondb";
    verifyTokenMock.mockReset().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    sqlMock = vi.fn().mockResolvedValue([{ result: { ok: true, saved: true } }]);
    neonMock.mockReset().mockReturnValue(sqlMock);
  });

  it("fails closed when the shared proxy secret is not configured", async () => {
    delete process.env.OMPATH_NEON_WRITE_SECRET;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.reason).toBe("proxy_secret_not_configured");
    expect(verifyTokenMock).not.toHaveBeenCalled();
    expect(neonMock).not.toHaveBeenCalled();
  });

  it("rejects a shared secret shorter than 32 bytes", async () => {
    process.env.OMPATH_NEON_WRITE_SECRET = "too-short";
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.reason).toBe("proxy_secret_not_configured");
    expect(neonMock).not.toHaveBeenCalled();
  });

  it("rejects a caller without the shared secret before token or database work", async () => {
    const req = makeReq({ headers: { authorization: "Bearer valid-user-token", "x-ompath-neon-write-secret": "wrong" } });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(verifyTokenMock).not.toHaveBeenCalled();
    expect(neonMock).not.toHaveBeenCalled();
  });

  it("requires a valid Neon Auth token", async () => {
    verifyTokenMock.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.reason).toBe("invalid_session");
    expect(neonMock).not.toHaveBeenCalled();
  });


  it("runs a read-only database health probe with the shared secret", async () => {
    sqlMock.mockResolvedValueOnce([{ ok: 1, can_save: true }]);
    const res = makeRes();
    await handler(makeReq({ method: "GET", query: { health: "1" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: true, canSave: true });
    expect(verifyTokenMock).not.toHaveBeenCalled();
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("persists only after both secret and Neon token verification", async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "saved", slug: "test-topic", saved: true, existing: false });
    expect(neonMock).toHaveBeenCalledWith(process.env.DATABASE_URL);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("does not report success when the database RPC rejects the payload", async () => {
    sqlMock.mockResolvedValueOnce([{ result: { ok: false, reason: "slug_conflict" } }]);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ status: "failed", reason: "slug_conflict" });
  });

  it("rejects invalid slugs before opening a database connection", async () => {
    const req = makeReq({ body: { slug: "../bad", name: "Test Topic", category: "Year 4", deep: { sections: [], exam: [] } } });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(neonMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and oversized deep payloads", async () => {
    const malformed = makeRes();
    await handler(makeReq({ body: "{" }), malformed);
    expect(malformed.statusCode).toBe(400);

    const oversized = makeRes();
    await handler(makeReq({ body: { slug: "test-topic", name: "Test Topic", deep: { text: "x".repeat(81_000) } } }), oversized);
    expect(oversized.statusCode).toBe(413);
    expect(neonMock).not.toHaveBeenCalled();
  });
});
