import { afterEach, describe, expect, it, vi } from "vitest";
import ompathLite from "./ompathLite.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function responseSink() {
  return {
    statusCode: 200,
    body: "",
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function stubEncounterStorage() {
  let row = null;
  const id = "11111111-1111-4111-8111-111111111111";
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    const address = String(url);
    if (address.includes("/rest/v1/lite_health_encounters") && options.method === "POST") {
      const payload = JSON.parse(options.body);
      row = {
        id,
        ...payload,
        status: "intake_started",
        assessment: null,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      };
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (address.includes("/rest/v1/lite_health_encounters") && options.method === "PATCH") {
      row = { ...row, ...JSON.parse(options.body) };
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (address.includes("/rest/v1/lite_health_encounters?") && !options.method) {
      if (address.includes("session_id=eq.")) return new Response(JSON.stringify(row && address.includes(encodeURIComponent(row.session_id)) ? [row] : []), { status: 200 });
      if (address.includes("phone_number=eq.")) return new Response(JSON.stringify(row && row.phone_number === "+254712345678" && ["intake_started","awaiting_clarification"].includes(row.status) ? [row] : []), { status: 200 });
      return new Response("[]", { status: 200 });
    }
    throw new Error("Unexpected health storage request in test");
  }));
  return () => row;
}

async function sendUssd(text, res = responseSink(), sessionId = "ATUid_test123", callbackKey = "") {
  await ompathLite({
    method: "POST",
    body: { phoneNumber: "+254712345678", sessionId, text },
    query: callbackKey ? { key: callbackKey } : {},
  }, res);
  return res;
}

describe("OmpathStudy Lite USSD Health Support", () => {
  it("renders every numbered option on its own line", async () => {
    stubEncounterStorage();
    const menu = await sendUssd("");
    expect(menu.body).toContain("CON OmpathStudy Lite\n1. Health support\n2. Help and information");
    const intro = await sendUssd("1");
    expect(intro.body).toContain("Reply promptly; your network may close an idle session.");
    expect(intro.body).toContain("1. Continue\n2. Cancel\n0. Main menu");
    const language = await sendUssd("1*1");
    expect(language.body).toContain("1. English\n2. Kiswahili\n0. Back");
    expect(language.body).not.toMatch(/1\\. English +2\\./);
  });

  it("completes the lower abdominal pain pathway and returns a preliminary impression", async () => {
    const getRow = stubEncounterStorage();
    const prefix = "1*1*1*1*3*Tumbo inaniuma chini tangu jana";
    await sendUssd("1");
    await sendUssd("1*1");
    await sendUssd("1*1*1");
    await sendUssd("1*1*1*1");
    await sendUssd("1*1*1*1*3");
    await sendUssd(prefix);
    const firstQuestion = await sendUssd(prefix + "*2");
    expect(firstQuestion.body).toContain("When did the pain start?\n1. Under 1 day\n2. 1-7 days\n3. Over 7 days\n0. Back");
    await sendUssd(prefix + "*2*2");
    await sendUssd(prefix + "*2*2*2");
    await sendUssd(prefix + "*2*2*2*2");
    const consentPrompt = await sendUssd(prefix + "*2*2*2*2*2");
    expect(consentPrompt.body).toContain("CON ");
    expect(consentPrompt.body).toContain("Receive a health guide by SMS?");
    const final = await sendUssd(prefix + "*2*2*2*2*2*2");

    expect(final.statusCode).toBe(200);
    expect(final.body).toContain("END Assessment saved. No SMS will be sent.");
    expect(getRow().status).toBe("complete");
    expect(getRow().assessment.status).toBe("not_a_diagnosis");
    expect(getRow().normalized_summary).toContain("lower abdominal or pelvic pain");
    expect(getRow().clarification_answers).toHaveLength(5);
  });


  it("resumes an unfinished enquiry under a new carrier session after disconnect", async () => {
    const getRow = stubEncounterStorage();
    vi.stubEnv("USSD_CALLBACK_SECRET", "test-callback-secret");
    const prefix = "1*1*1*1*3*Lower abdominal pain since yesterday";
    const oldSession = "ATUid_old123";
    const newSession = "ATUid_resume123";
    const callbackKey = "test-callback-secret";
    await sendUssd("1", responseSink(), oldSession);
    await sendUssd("1*1", responseSink(), oldSession);
    await sendUssd("1*1*1", responseSink(), oldSession);
    await sendUssd("1*1*1*1", responseSink(), oldSession);
    await sendUssd("1*1*1*1*3", responseSink(), oldSession);
    await sendUssd(prefix, responseSink(), oldSession);
    await sendUssd(prefix + "*2", responseSink(), oldSession);
    await sendUssd(prefix + "*2*2", responseSink(), oldSession);

    expect(getRow().clarification_answers).toHaveLength(2);
    const recoveryMenu = await sendUssd("1", responseSink(), newSession, callbackKey);
    expect(recoveryMenu.body).toContain("Resume previous enquiry");
    const restored = await sendUssd("1*2", responseSink(), newSession, callbackKey);
    expect(restored.body).toContain("Your previous enquiry has been restored");
    expect(restored.body).toContain("Could you be pregnant?");
    const next = await sendUssd("1*2*2", responseSink(), newSession, callbackKey);
    expect(next.body).toContain("Fever or repeated vomiting?");
    const finalQuestion = await sendUssd("1*2*2*2", responseSink(), newSession, callbackKey);
    expect(finalQuestion.body).toContain("Is the pain severe or worsening?");
    const assessment = await sendUssd("1*2*2*2*2", responseSink(), newSession, callbackKey);
    expect(assessment.body).toContain("Receive a health guide by SMS?");
    const finished = await sendUssd("1*2*2*2*2*2", responseSink(), newSession, callbackKey);
    expect(finished.body).toContain("END Assessment saved. No SMS will be sent.");
    expect(getRow().session_id).toBe(newSession);
    expect(getRow().clarification_answers).toHaveLength(4);
    expect(getRow().status).toBe("complete");
  });

  it("records explicit consent when the caller chooses a patient-guide SMS", async () => {
    const getRow = stubEncounterStorage();
    const prefix = "1*1*1*1*3*Lower abdominal pain since yesterday";
    await sendUssd("1");
    await sendUssd("1*1");
    await sendUssd("1*1*1");
    await sendUssd("1*1*1*1");
    await sendUssd("1*1*1*1*3");
    await sendUssd(prefix);
    await sendUssd(prefix + "*2");
    await sendUssd(prefix + "*2*2");
    await sendUssd(prefix + "*2*2*2");
    await sendUssd(prefix + "*2*2*2*2");
    await sendUssd(prefix + "*2*2*2*2*2");
    const final = await sendUssd(prefix + "*2*2*2*2*2*1");
    expect(final.body).toContain("END Assessment saved.");
    expect(getRow().sms_consent).toBe(true);
    expect(getRow().status).toBe("guide_pending");
  });

  it("escalates reduced fetal movement after 20 weeks in the pregnancy pathway", async () => {
    const getRow = stubEncounterStorage();
    const prefix = "1*1*1*1*1*I am 30 weeks pregnant and the baby's movements are reduced";
    await sendUssd("1");
    await sendUssd("1*1");
    await sendUssd("1*1*1");
    await sendUssd("1*1*1*1");
    await sendUssd("1*1*1*1*1");
    await sendUssd(prefix);
    await sendUssd(prefix + "*2");
    await sendUssd(prefix + "*2*1");
    await sendUssd(prefix + "*2*1*3");
    await sendUssd(prefix + "*2*1*3*2");
    const consentPrompt = await sendUssd(prefix + "*2*1*3*2*1");
    expect(consentPrompt.body).toContain("CON ");
    expect(consentPrompt.body).toContain("Receive a health guide by SMS?");
    const final = await sendUssd(prefix + "*2*1*3*2*1*2");

    expect(final.body).toContain("END Assessment saved. No SMS will be sent.");
    expect(getRow().status).toBe("referred_urgent");
    expect(getRow().assessment.provisional_diagnosis).toMatch(/reduced fetal movements/i);
    expect(getRow().assessment.urgency_level).toBe("urgent");
  });

  it("interrupts routine questions when the emergency screen is positive", async () => {
    const getRow = stubEncounterStorage();
    const prefix = "1*1*1*1*6*I cannot breathe";
    await sendUssd("1");
    await sendUssd("1*1");
    await sendUssd("1*1*1");
    await sendUssd("1*1*1*1");
    await sendUssd("1*1*1*1*6");
    const final = await sendUssd(prefix);

    expect(final.body).toContain("END EMERGENCY:");
    expect(getRow().status).toBe("referred_urgent");
    expect(getRow().assessment.urgency_level).toBe("emergency");
  });
});
