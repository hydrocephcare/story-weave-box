import { afterEach, describe, expect, it, vi } from "vitest";
import liteWeb from "./ompathLiteWeb.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function responseSink() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function stubHealthStorage() {
  const id = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    const address = String(url);
    calls.push({ address, options });
    if (address.includes("/rest/v1/articles?")) return new Response("[]", { status: 200 });
    if (address.includes("/rest/v1/lite_health_encounters?select=")) return new Response("[]", { status: 200 });
    if (address.endsWith("/rest/v1/lite_health_encounters") && options.method === "POST") {
      return new Response(JSON.stringify([{ id, status: "intake_started", assessment: null }]), { status: 201 });
    }
    if (address.includes("/rest/v1/lite_health_encounters?id=") && options.method === "PATCH") {
      return new Response(JSON.stringify([{ id, status: "complete" }]), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  }));
  return { calls, id };
}

describe("Lite Health Support web API", () => {
  it("creates an anonymous, consented assessment without collecting a phone number", async () => {
    const { calls, id } = stubHealthStorage();
    const res = responseSink();
    await liteWeb({
      method: "POST",
      body: {
        action: "health-assess",
        session_id: "123e4567-e89b-42d3-a456-426614174000",
        concern_category: "Lower abdominal pain",
        original_message: "Mild lower abdominal pain since yesterday",
        consent_given: true,
        answers: [
          { question_id: "emergency_screen", answer: "2" },
          { question_id: "onset", answer: "2" },
          { question_id: "pregnancy_possibility", answer: "2" },
          { question_id: "fever_vomiting", answer: "2" },
          { question_id: "severity", answer: "2" },
        ],
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.assessment.status).toBe("not_a_diagnosis");
    expect(res.body.assessment.differential_diagnoses.length).toBeGreaterThan(0);
    expect(res.body.assessment.recommended_evaluation.length).toBeGreaterThan(0);
    expect(res.body.reference).toBe(id);
    const insert = calls.find((call) => call.options.method === "POST");
    expect(JSON.parse(insert.options.body).phone_number).toBeNull();
  });

  it("returns emergency guidance immediately when the emergency screen is positive", async () => {
    stubHealthStorage();
    const res = responseSink();
    await liteWeb({
      method: "POST",
      body: {
        action: "health-assess",
        session_id: "123e4567-e89b-42d3-a456-426614174001",
        concern_category: "Other health concern",
        original_message: "",
        consent_given: true,
        answers: [{ question_id: "emergency_screen", answer: "1" }],
      },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.assessment.urgency_level).toBe("emergency");
    expect(res.body.assessment.next_steps[0]).toMatch(/emergency medical care now/i);
  });

  it("does not expose the old Lite learning or MCQ API", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    const res = responseSink();
    await liteWeb({ method: "POST", body: { action: "library", phone: "+254700000000" } }, res);
    expect(res.statusCode).toBe(410);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("requires consent and a valid emergency-screen answer before storing data", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    const res = responseSink();
    await liteWeb({
      method: "POST",
      body: {
        action: "health-assess",
        session_id: "123e4567-e89b-42d3-a456-426614174002",
        concern_category: "Bleeding",
        consent_given: false,
        answers: [{ question_id: "emergency_screen", answer: "2" }],
      },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
