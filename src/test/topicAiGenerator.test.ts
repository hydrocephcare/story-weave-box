import { describe, expect, it, vi } from "vitest";
import { askGroqModel, buildPrompt, generateReviewedTopicPage, topicAiCore } from "../../supabase/functions/_shared/topicAi.js";

describe("Groq topic generation boundary", () => {
  it("disambiguates neonatal umbilical vein thrombosis and requires a sufficiently deep page", () => {
    const prompt = buildPrompt({ name: "Umbilical Vein Thrombosis", category: "Paediatrics / Neonatal" });

    expect(prompt).toContain("PRE-GENERATION CLINICAL ENTITY DISAMBIGUATION");
    expect(prompt).toContain("umbilical venous catheter (UVC)-associated thrombosis");
    expect(prompt).toContain("antenatal umbilical cord thrombosis");
    expect(prompt).toContain("MINIMUM DEPTH: provide at least 9 substantive sections");
    expect(prompt).toContain('"clinicalScope"');
  });

  it("instructs Gemini to check entity mixing, heading accuracy and missing sections", async () => {
    const page = {
      medical: true, title: "Umbilical Vein Thrombosis", subject: "Paediatrics",
      clinicalScope: "Neonatal umbilical vein thrombosis, usually associated with an umbilical venous catheter.",
      summary: "Neonatal umbilical vein thrombosis is a catheter-associated thrombotic condition.",
      sections: [
        { h: "Definition", p: "A clot in the neonatal umbilical vein." },
        { h: "Causes", p: "Umbilical venous catheter-associated endothelial injury and infection." },
        { h: "Management", p: "Management depends on extent and progression." },
      ],
      whenToSeekHelp: [], faq: [], exam: [], related: [],
    };
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
    expect(result).toEqual({ text: '{"medical":true}', model: "openai/gpt-oss-20b" });
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
    const page = {
      medical: true, title: "Asthma", subject: "Medicine",
      summary: "Asthma is a chronic inflammatory disease of the airways.",
      sections: [
        { h: "Definition", p: "Asthma is a chronic inflammatory airway disorder." },
        { h: "Causes", p: "Common triggers include allergens and respiratory infections." },
        { h: "Management", p: "Management includes inhaled anti-inflammatory treatment." },
      ],
      whenToSeekHelp: [], faq: [], exam: [], related: [],
    };
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
    const page = {
      medical: true, title: "Asthma", subject: "Medicine",
      summary: "Asthma is a chronic inflammatory disease of the airways.",
      sections: [
        { h: "Definition", p: "Asthma is a chronic inflammatory airway disorder." },
        { h: "Causes", p: "Common triggers include allergens and respiratory infections." },
        { h: "Management", p: "Management includes inhaled anti-inflammatory treatment." },
      ],
      whenToSeekHelp: [], faq: [], exam: [], related: [],
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("review unavailable", { status: 503 }));

    await expect(generateReviewedTopicPage(
      { name: "Asthma", category: "Medicine" },
      { env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" }, fetchImpl, maxFixRounds: 0 },
    )).rejects.toThrow();
  });

  it("performs a targeted Groq rewrite when Gemini identifies a clinical issue", async () => {
    const page = {
      medical: true, title: "Asthma", subject: "Medicine",
      summary: "Asthma is a chronic inflammatory disease of the airways.",
      sections: [
        { h: "Definition", p: "Asthma is a chronic inflammatory airway disorder." },
        { h: "Causes", p: "Common triggers include allergens and respiratory infections." },
        { h: "Management", p: "Management includes inhaled anti-inflammatory treatment." },
      ],
      whenToSeekHelp: [], faq: [], exam: [], related: [],
    };
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
    const page = {
      medical: true, title: "Asthma", subject: "Medicine",
      summary: "Asthma is a chronic inflammatory disease of the airways.",
      sections: [
        { h: "Definition", p: "Asthma is a chronic inflammatory airway disorder." },
        { h: "Causes", p: "Common triggers include allergens and respiratory infections." },
        { h: "Management", p: "Management includes inhaled anti-inflammatory treatment." },
      ],
      whenToSeekHelp: [], faq: [], exam: [], related: [],
    };
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
    expect(saved.generator_model).toBe("openai/gpt-oss-20b");
    expect(saved.ai_review_fix_rounds).toBe(0);
    expect(saved.reviewed).toBe(false);
    expect(saved.content.aiReview.status).toBe("passed");
  });

  it("fails closed when Gemini labels findings but supplies no usable correction", async () => {
    const page = {
      medical: true, title: "Asthma", subject: "Medicine",
      summary: "Asthma is a chronic inflammatory disease of the airways.",
      sections: [
        { h: "Definition", p: "Asthma is a chronic inflammatory airway disorder." },
        { h: "Causes", p: "Common triggers include allergens and respiratory infections." },
        { h: "Management", p: "Management includes inhaled anti-inflammatory treatment." },
      ],
      whenToSeekHelp: [], faq: [], exam: [], related: [],
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(page) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"verdict":"issues","issues":[{"severity":"high","where":"","problem":"Error","fix":""}]}' }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(generateReviewedTopicPage(
      { name: "Asthma", category: "Medicine" },
      { env: { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key" }, fetchImpl, maxFixRounds: 0 },
    )).rejects.toThrow("malformed clinical findings");
  });
});
