import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  verifyNeonToken: vi.fn(),
  neon: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: (...args: unknown[]) => {
    mocks.neon(...args);
    return mocks.sql;
  },
}));
vi.mock("../../api/_lib/neonAdmin.js", () => ({
  verifyNeonToken: mocks.verifyNeonToken,
}));

import topicWrite from "../../api/_lib/topicWrite.js";

function responseRecorder() {
  const result: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader(name: string, value: string) { result.headers[name] = value; return this; },
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
  return { res, result };
}

const validDeep = {
  checked: true,
  sections: Array.from({ length: 7 }, (_, i) => ({ title: "Section " + i, content: "Clinical content." })),
  vivas: Array.from({ length: 12 }, (_, i) => ({ question: "Viva " + i, answer: "Answer." })),
  mcqs: Array.from({ length: 6 }, (_, i) => ({ question: "MCQ " + i, answer: "Answer." })),
  cases: Array.from({ length: 2 }, (_, i) => ({ case: "Case " + i })),
  facts: Array.from({ length: 6 }, (_, i) => "Fact " + i),
  mistakes: Array.from({ length: 5 }, (_, i) => "Mistake " + i),
  exam: Array.from({ length: 12 }, (_, i) => ({ question: "Exam " + i, answer: "Answer." })),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/neondb");
  mocks.verifyNeonToken.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
});

describe("topic-write privileged Neon persistence", () => {
  it("persists only independently checked deep notes through the server-only RPC", async () => {
    const base = { subject: "Acute myocardial infarction", sections: [{ title: "Overview" }] };
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("SELECT slug, name, category, content, status")) {
        return [{ slug: "acute-myocardial-infarction", name: "Acute myocardial infarction", category: "Cardiology", content: base, status: "published" }];
      }
      if (query.includes("public.save_topic_deep")) return [{ result: { ok: true, saved: true } }];
      throw new Error("Unexpected SQL: " + query);
    });
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-neon-authorization")).toBe("header.payload.signature");
      expect(JSON.parse(String(init?.body)).task).toBe("deep");
      return new Response(JSON.stringify({ status: "generated", deep: validDeep, quota: { allowed: true } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = responseRecorder();

    await topicWrite({
      method: "POST",
      url: "/api/ai?task=topic",
      headers: { authorization: "Bearer header.payload.signature", "x-forwarded-for": "198.51.100.11" },
      body: { mode: "deep", name: "Acute myocardial infarction", slug: "acute-myocardial-infarction" },
    } as any, res as any);

    expect(result.statusCode).toBe(200);
    expect((result.body as any).saved).toBe(true);
    expect((result.body as any).deep.checked).toBe(true);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    expect(mocks.sql.mock.calls[1][0].join(" ")).toContain("public.save_topic_deep");
  });

  it("publishes topic pages through the server-only system RPC after Gemini review passes", async () => {
    const page = {
      medical: true,
      model: "groq",
      summary: "A sufficiently long summary that passes the server-side publication quality gate.",
      sections: [{ title: "Overview" }, { title: "Causes" }, { title: "Management" }],
      aiReview: { status: "passed", model: "gemini", fixRounds: 1 },
    };
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("SELECT slug, name, content, status")) return [];
      if (query.includes("public.publish_topic_page_system")) return [{ result: { ok: true, existing: false } }];
      throw new Error("Unexpected SQL: " + query);
    });
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).task).toBe("topic");
      return new Response(JSON.stringify({ status: "generated", page, quota: { allowed: true } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = responseRecorder();

    await topicWrite({
      method: "POST",
      url: "/api/ai?task=topic",
      headers: { authorization: "Bearer header.payload.signature", "x-forwarded-for": "198.51.100.12" },
      body: { name: "Acute myocardial infarction", category: "Cardiology" },
    } as any, res as any);

    expect(result.statusCode).toBe(200);
    expect((result.body as any).saved).toBe(true);
    expect((result.body as any).page.aiReview.model).toBe("gemini");
    expect(mocks.sql.mock.calls[1][0].join(" ")).toContain("public.publish_topic_page_system");
  });
});
