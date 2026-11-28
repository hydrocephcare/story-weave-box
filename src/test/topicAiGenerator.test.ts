import { describe, expect, it, vi } from "vitest";
import { askGeminiModel, askGroqModel, askModel as askSharedModel, buildPrompt, generateReviewedTopicPage, providerKeys, sanitizePage, topicAiCore } from "../../supabase/functions/_shared/topicAi.js";
import { askModel as askGatewayModel, sanitizePage as sanitizeGatewayPage } from "../../supabase/functions/ompath-ai/topicAi.js";
const sectionNames = ["Relevant anatomy, histology and physiology","Definition and diagnosis","Severity and staging","Causes and risk factors","Mechanisms and pathophysiology","Clinical presentation","Investigations and interpretation","Management principles","Pharmacology and safety","Complications and prognosis","Follow-up and prevention","Special populations","Differential diagnosis","Clinical examples"];
const makePage = (title: string, subject: string, count = 14) => {
  const explanation = Array.from({ length: 8 }, (_, i) => title + " clinical detail " + (i + 1) + " explains the mechanism, clinical significance, diagnostic reasoning and management implications in an accurate, evidence-based way.").join(" ");
  return {
    medical: true, title, subject, clinicalScope: title + " in the stated clinical context.",
    summary: title + " is a medical topic that requires understanding of mechanisms, clinical presentation, diagnosis and appropriate management. This overview explains the subject for the public and medical learners.",
    sections: Array.from({ length: count }, (_, i) => ({ h: sectionNames[i] || ("Clinical consideration " + (i + 1)), p: explanation, b: ["Recognise the relevant clinical pattern and explain why it occurs.", "Interpret findings in the context of the whole patient and available resources.", "Connect the underlying physiology to the observed clinical features.", "Explain how the evidence changes the investigation or management plan."] })),
    whenToSeekHelp: ["Seek urgent clinical assessment when severe or rapidly worsening symptoms occur."],
    faq: [{ q: "What is the central point?", a: "Understand the mechanism, clinical features and evidence-based management." }, { q: "How is it assessed?", a: "Use history, examination and appropriately selected investigations." }, { q: "What should be remembered?", a: "Interpret each finding in its clinical context." }],
    exam: Array.from({ length: 10 }, (_, i) => "Examiner question " + (i + 1) + " — explain the reasoning, interpretation and management implications."),
    related: ["Related clinical topic", "Relevant physiology"],
  };
};


describe("AI provider key configuration", () => {
  it("parses comma, whitespace, semicolon and JSON-array key lists without duplicates", () => {
    expect(providerKeys({ GEMINI_API_KEYS: "gem-a, gem-b; gem-c", GEMINI_API_KEY_2: "gem-b", GEMINI_API_KEY_3: "gem-d" }, "GEMINI"))
      .toEqual(["gem-a", "gem-b", "gem-c", "gem-d"]);
    expect(providerKeys({ GROQ_API_KEYS: '["groq-a","groq-b"]' }, "GROQ"))
      .toEqual(["groq-a", "groq-b"]);
  });
});

describe("Groq topic generation boundary", () => {
  it("counts substantial bullet and table content when checking section depth", () => {
    const page = makePage("Laughing gas", "Medicine", 14);
    page.sections = page.sections.map((section) => ({
      h: section.h,
      b: [
        "Nitrous oxide has a rapid onset because it is absorbed through the lungs and reaches the central nervous system quickly, producing effects within minutes.",
        "Its analgesic effect involves endogenous opioid and noradrenergic pathways, while its NMDA receptor antagonism contributes to dissociative anaesthetic effects at higher concentrations.",
        "It is used in selected clinical settings for rapid, titratable analgesia or sedation, including labour and procedural settings when appropriate monitoring and trained staff are available.",
      ],
    }));
    expect(sanitizeGatewayPage(page, { name: "Laughing gas", category: "Medicine" }).sections).toHaveLength(14);
  });

  it("disambiguates neonatal umbilical vein thrombosis and requires a sufficiently deep page", () => {
    const prompt = buildPrompt({ name: "Umbilical Vein Thrombosis", category: "Paediatrics / Neonatal" });

    expect(prompt).toContain("PRE-GENERATION CLINICAL ENTITY DISAMBIGUATION");
    expect(prompt).toContain("umbilical venous catheter (UVC)-associated thrombosis");
    expect(prompt).toContain("antenatal umbilical cord thrombosis");
    expect(prompt).toContain("DEPTH: for a complete topic overview");
    expect(prompt).toContain("AUDIENCE: teach two audiences together");
    expect(prompt).toContain('"clinicalScope"');
  });

  it("instructs Gemini to check entity mixing, heading accuracy and missing sections", async () => {
    const page = makePage("Umbilical Vein Thrombosis", "Paediatrics", 14);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockImplementationOnce(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        const prompt = body.contents[0].parts[0].text;
        expect(prompt).toContain("flag mixed entities");
        expect(prompt).toContain("section whose content does not match its heading");
        expect(prompt).toContain("topic-type missing-sections and minimum-depth check");
        expect(prompt).toContain("Paediatrics / Neonatal");
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      });

    await generateReviewedTopicPage(
      { name: "Umbilical Vein Thrombosis", category: "Paediatrics / Neonatal" },
      { env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" }, fetchImpl, maxFixRounds: 0 },
    );
  });

  it("sends generation requests only to Groq and returns the model used", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        choices: [{ message: { content: '{"medical":true}' } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const result = await askGroqModel("Write a topic page", {
      env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer groq-test-key");
    expect(result).toEqual({ text: '{"medical":true}', model: "openai/gpt-oss-120b" });
  });

  it("does not fall back to Gemini when Groq is not configured", async () => {
    const fetchImpl = vi.fn();

    await expect(
      askGroqModel("Write a topic page", {
        env: { GEMINI_API_KEYS: "gemini-test-key" },
        fetchImpl,
      }),
    ).rejects.toThrow("Groq generation is not configured");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("publishes only after Gemini approves the Groq-generated page", async () => {
    const page = makePage("Asthma", "Medicine", 14);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateReviewedTopicPage(
      { name: "Asthma", category: "Medicine" },
      { env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" }, fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
    expect(result.page.aiReview.status).toBe("passed");
    expect(result.review.status).toBe("passed");
  });

  it("holds a page back when Gemini cannot review it", async () => {
    const page = makePage("Asthma", "Medicine", 14);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("review unavailable", { status: 503 }));

    await expect(generateReviewedTopicPage(
      { name: "Asthma", category: "Medicine" },
      { env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" }, fetchImpl, maxFixRounds: 0 },
    )).rejects.toThrow();
  });

  it("performs a targeted Groq rewrite when Gemini identifies a clinical issue", async () => {
    const page = makePage("Asthma", "Medicine", 14);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"issues","issues":[{"severity":"high","where":"Management: inhaled treatment","problem":"The statement omits the required clinical safety qualification.","fix":"State the appropriate guideline-based safety qualification."}]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateReviewedTopicPage(
      { name: "Asthma", category: "Medicine" },
      { env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" }, fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
    expect(String(fetchImpl.mock.calls[2][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[2][1]?.body)).toContain("appropriate guideline-based safety qualification");
    expect(result.page.aiReview.fixRounds).toBe(1);
  });

  it("persists AI review metadata without marking the page as human-reviewed", async () => {
    const page = makePage("Asthma", "Medicine", 14);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "Content-Range": "0-0/0" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ slug: "asthma" }]), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await topicAiCore(
      { name: "Asthma", category: "Medicine" },
      { env: {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
        GROQ_API_KEYS: "groq-test-key",
        GEMINI_API_KEYS: "gemini-test-key",
      }, fetchImpl },
    );

    expect(result.code).toBe(200);
    const saved = JSON.parse(String(fetchImpl.mock.calls[5][1]?.body));
    expect(saved.status).toBe("published");
    expect(saved.ai_review_status).toBe("passed");
    expect(saved.ai_review_model).toBeTruthy();
    expect(saved.generator_model).toBe("openai/gpt-oss-120b");
    expect(saved.ai_review_fix_rounds).toBe(0);
    expect(saved.reviewed).toBe(false);
    expect(saved.content.aiReview.status).toBe("passed");
  });

  it("fails closed when Gemini labels findings but supplies no usable correction", async () => {
    const page = makePage("Asthma", "Medicine", 14);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"issues","issues":[{"severity":"high","where":"","problem":"Error","fix":""}]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(generateReviewedTopicPage(
      { name: "Asthma", category: "Medicine" },
      { env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" }, fetchImpl, maxFixRounds: 0 },
    )).rejects.toThrow("malformed clinical findings");
  });
});

describe("topic validation and provider routing", () => {
  it("counts whitespace-separated paragraph words instead of treating a paragraph as one word", () => {
    const page = makePage("Asthma", "Medicine", 14);
    page.sections = page.sections.map(({ h, p }) => ({ h, p }));
    const clean = sanitizePage(page, { name: "Asthma", category: "Medicine" });
    expect(clean.sections).toHaveLength(14);
  });

  it("continues to reject genuinely thin sections", () => {
    const page = makePage("Asthma", "Medicine", 14);
    page.sections = page.sections.map(({ h }) => ({ h, p: "Too short." }));
    expect(() => sanitizePage(page, { name: "Asthma", category: "Medicine" })).toThrow("thin sections");
  });

  it("retries a structural draft failure before invoking the independent Gemini review", async () => {
    const thinPage = makePage("Asthma", "Medicine", 4);
    const completePage = makePage("Asthma", "Medicine", 14);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(thinPage) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockImplementationOnce(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.messages?.[0]?.content).toContain("previous draft failed structural validation");
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(completePage) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateReviewedTopicPage(
      { name: "Asthma", category: "Medicine" },
      { env: { GROQ_API_KEYS: "groq-validation-retry-key", GEMINI_API_KEYS: "gemini-validation-retry-key" }, fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[2][0])).toContain("generativelanguage.googleapis.com");
    expect(result.page.aiReview.status).toBe("passed");
    expect(result.page.aiReview.fixRounds).toBe(1);
  });

  it("can call Gemini independently without routing through Groq", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await askGeminiModel("Return a small JSON object.", {
      env: { GEMINI_API_KEYS: "gemini-independent-key", GEMINI_MODELS: "gemini-3.8-flash" },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("generativelanguage.googleapis.com");
    expect(result.text).toContain('"ok":true');
  });

  it("falls back to Groq when Gemini is unavailable in the shared serverless AI client", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("Gemini unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"fallback":"groq"}' } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await askSharedModel("Return a small JSON object.", {
      env: {
        GEMINI_API_KEYS: "gemini-shared-fallback-key",
        GEMINI_MODELS: "gemini-3.8-flash",
        GROQ_API_KEYS: "groq-shared-fallback-key",
        GROQ_MODELS: "openai/gpt-oss-20b",
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("generativelanguage.googleapis.com");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("api.groq.com");
    expect(result.model).toBe("openai/gpt-oss-20b");
  });

  it("falls back to Gemini when Groq is unavailable in the active Supabase gateway client", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("Groq unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"fallback":"gemini"}' }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await askGatewayModel("Return a small JSON object.", {
      env: {
        GROQ_API_KEYS: "groq-gateway-fallback-key",
        GROQ_MODELS: "openai/gpt-oss-120b",
        GEMINI_API_KEYS: "gemini-gateway-fallback-key",
        GEMINI_MODELS: "gemini-3.8-flash",
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
    expect(result.model).toBe("gemini-3.8-flash");
  });
});
