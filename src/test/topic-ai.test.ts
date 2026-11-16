import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateTopicPage, kindOf, sanitizePage, slugOf, topicAiCore, validName } from "../../supabase/functions/_shared/topicAi.js";

const headings = ["Definition and diagnosis", "Severity and staging", "Causes and risk factors", "Mechanisms and pathophysiology", "Clinical presentation", "Investigations and interpretation", "Management principles", "Pharmacology and safety", "Complications and prognosis", "Follow-up and prevention", "Special populations", "Differential diagnosis", "Clinical examples"];
const fullPage = (title = "Oppositional defiant disorder", subject = "Psychiatry", count = 13) => {
  const explanatory = Array.from({ length: 8 }, (_, i) => title + " clinical explanation " + (i + 1) + " describes the mechanism, clinical relevance, diagnostic reasoning, management principles and how findings are interpreted in context.").join(" ");
  return {
    medical: true,
    title,
    subject,
    clinicalScope: title + " in the stated clinical context.",
    summary: title + " is a medical topic that requires understanding of mechanisms, presentation, diagnosis and appropriate management. This overview explains the subject for the public and medical learners.",
    aka: ["ODD"],
    sections: Array.from({ length: count }, (_, i) => ({
      h: headings[i] || ("Clinical consideration " + (i + 1)),
      p: explanatory,
      b: ["Recognise the relevant clinical pattern and explain why it occurs.", "Interpret findings in the context of the whole patient and available resources.", "Connect the underlying physiology to the observed clinical features.", "Explain how the evidence changes the investigation or management plan."],
    })),
    whenToSeekHelp: ["Behaviour that puts the child or others at risk"],
    faq: [
      { q: "Is ODD the same as conduct disorder?", a: "No. Conduct disorder involves serious rule breaking and harm to others." },
      { q: "How is it assessed?", a: "Assessment uses a careful history, developmental context and evaluation for coexisting conditions." },
      { q: "What is the first management principle?", a: "Use evidence-based psychosocial support and address coexisting needs." },
    ],
    exam: Array.from({ length: 10 }, (_, i) => "Examiner question " + (i + 1) + " — explain the reasoning, investigation and management implications."),
    related: ["Conduct disorder", "ADHD"],
  };
};
const goodPage = fullPage();
const deepPage = fullPage("Oppositional defiant disorder", "Psychiatry", 13);

describe("topic page writer", () => {
  it("accepts a comprehensive page and keeps its shape", () => {
    const p = sanitizePage(goodPage);
    expect(p.medical).toBe(true);
    expect(p.sections).toHaveLength(13);
    expect(p.faq).toHaveLength(3);
    expect(p.related).toContain("Conduct disorder");
  });

  it("drops anything that looks like a drug dose", () => {
    const p = sanitizePage({ ...goodPage, sections: [...goodPage.sections, { h: "Medicines", b: ["Give 500 mg twice daily", "Antibiotics may be needed", "Check contraindications and monitor for adverse effects"] }] });
    const meds = p.sections.find((s: { h: string }) => s.h === "Medicines");
    expect(meds.b).toEqual(["Antibiotics may be needed", "Check contraindications and monitor for adverse effects"]);
    expect(() => sanitizePage({ ...goodPage, summary: "Give 10 mg of the drug every day to every child with this condition, always." })).toThrow();
  });

  it("keeps lab thresholds and test tables, and examiner questions", () => {
    const p = sanitizePage({ ...goodPage, exam: ["What is the KDIGO creatinine criterion?"], sections: [...goodPage.sections, { h: "Investigations", t: [{ a: "Creatinine", b: "How severe is it? A rise of 26.5 µmol/L (0.3 mg/dL) in 48 h fits AKI; K+ above 6.5 mmol/L is dangerous" }, { a: "HBV DNA", b: "Treat above 20,000 IU/mL with raised ALT" }] }] });
    const inv = p.sections.find((s: { h: string }) => s.h === "Investigations");
    expect(inv.t).toHaveLength(2);
    expect(p.exam).toHaveLength(1);
  });

  it("refuses a page with too little in it, and passes on a non-medical verdict", () => {
    expect(() => sanitizePage({ ...goodPage, sections: [goodPage.sections[0]] })).toThrow();
    expect(sanitizePage({ medical: false })).toEqual({ medical: false });
    expect(() => sanitizePage(null)).toThrow();
  });

  it("chooses the layout from the subject", () => {
    expect(kindOf("Anatomy")).toBe("anatomy");
    expect(kindOf("Microbiology & immunology")).toBe("microbe");
    expect(kindOf("Psychiatry")).toBe("disease");
    expect(kindOf("")).toBe("general");
  });

  it("makes safe addresses and rejects odd names", () => {
    expect(slugOf("Oppositional Defiant Disorder")).toBe("oppositional-defiant-disorder");
    expect(validName("Type 2 diabetes")).toBe(true);
    expect(validName("<script>alert(1)</script>")).toBe(false);
    expect(validName("a")).toBe(false);
  });

  it("uses Groq for generation and Gemini for independent verification", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "Here you go: " + JSON.stringify(deepPage) } }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }] }) });
    const page = await generateTopicPage({ name: "Oppositional defiant disorder", category: "Psychiatry", env: { GROQ_API_KEYS: "g", GEMINI_API_KEYS: "v" }, fetchImpl });
    expect(page.medical).toBe(true);
    expect(page.kind).toBe("disease");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api.groq.com");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
  });

  it("does not use Gemini as a writer when Groq is not configured", async () => {
    const fetchImpl = vi.fn();
    await expect(generateTopicPage({ name: "Oppositional defiant disorder", category: "Psychiatry", env: { GEMINI_API_KEYS: "v" }, fetchImpl })).rejects.toThrow("Groq generation is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("topic-ai flow", () => {
  const baseEnv = { GROQ_API_KEYS: "groq-test-key", GEMINI_API_KEYS: "gemini-test-key", SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "s" };
  let rows: Record<string, any>;
  let groqReply: any;
  let reviewReply: any;
  let modelCalls: number;
  const fetchImpl: any = async (url: string, init: any = {}) => {
    if (String(url).includes("api.groq.com")) { modelCalls++; return groqReply; }
    if (String(url).includes("generativelanguage.googleapis.com")) { modelCalls++; return reviewReply; }
    const u = new URL(url);
    if (init.method === "POST" || init.method === "PATCH") {
      const b = JSON.parse(init.body);
      rows[b.slug] = { ...(rows[b.slug] ?? {}), ...b };
      return { ok: true, headers: new Headers(), json: async () => init.method === "PATCH" ? [rows[b.slug]] : [] };
    }
    if (u.searchParams.has("created_at")) return { ok: true, headers: new Headers({ "content-range": `0-0/${Object.keys(rows).length}` }), json: async () => [] };
    const slug = (u.searchParams.get("slug") ?? "").replace("eq.", "");
    return { ok: true, headers: new Headers(), json: async () => (rows[slug] ? [rows[slug]] : []) };
  };
  const call = (input: unknown, env: Record<string, string> = baseEnv) => topicAiCore(input, { env, fetchImpl });
  beforeEach(() => {
    rows = {};
    modelCalls = 0;
    groqReply = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(deepPage) } }] }) };
    reviewReply = { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"verdict":"ok","issues":[]}' }] } }] }) };
  });

  it("says unavailable when both model keys are not set up", async () => {
    const r = await call({ name: "Oppositional defiant disorder" }, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "s" });
    expect(r.code).toBe(503);
    expect(r.body.status).toBe("unavailable");
  });

  it("writes a page once, saves it, and gives the saved copy to the next reader without spending credits", async () => {
    const first = await call({ name: "Oppositional defiant disorder", category: "Psychiatry" });
    expect(first.code).toBe(200);
    expect((first.body as any).page.sections).toHaveLength(13);
    expect(rows["oppositional-defiant-disorder"].status).toBe("published");
    expect(modelCalls).toBe(2);
    const second = await call({ name: "Oppositional defiant disorder" });
    expect(second.code).toBe(200);
    expect(modelCalls).toBe(2);
  });

  it("stops at the daily cap", async () => {
    const r = await call({ name: "Nephrotic syndrome" }, { ...baseEnv, TOPIC_AI_DAILY_CAP: "0" });
    expect(r.code).toBe(429);
    expect(modelCalls).toBe(0);
  });

  it("turns away a topic that is not medical, and remembers it", async () => {
    groqReply = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"medical": false}' } }] }) };
    const r = await call({ name: "Taylor Swift" });
    expect(r.code).toBe(404);
    expect(rows["taylor-swift"].status).toBe("rejected");
  });

  it("fails politely when the Groq writer is down", async () => {
    groqReply = { ok: false, status: 500, json: async () => ({}) };
    const r = await call({ name: "Nephrotic syndrome" });
    expect(r.code).toBe(502);
    expect(rows["nephrotic-syndrome"].status).toBe("failed");
  });

  it("rejects bad names", async () => {
    expect((await call({ name: "<b>x</b>" })).code).toBe(400);
  });
});
