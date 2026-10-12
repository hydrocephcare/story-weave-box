import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateTopicPage, kindOf, sanitizePage, slugOf, topicAiCore, validName } from "../../supabase/functions/_shared/topicAi.js";

const goodPage = {
  medical: true,
  summary: "Oppositional defiant disorder is a pattern of angry, argumentative and defiant behaviour in children that is beyond what is expected for their age.",
  aka: ["ODD"],
  sections: [
    { h: "Overview", p: "A childhood behaviour disorder." },
    { h: "How it presents", b: ["Often loses temper", "Argues with adults and refuses rules"] },
    { h: "Management", p: "Parent training is first line.", b: ["Parent management training", "Treat any coexisting ADHD or anxiety"] },
  ],
  whenToSeekHelp: ["Behaviour that puts the child or others at risk"],
  faq: [{ q: "Is ODD the same as conduct disorder?", a: "No. Conduct disorder involves serious rule breaking and harm to others." }],
  related: ["Conduct disorder", "ADHD"],
};

describe("topic page writer", () => {
  it("accepts a good page and keeps its shape", () => {
    const p = sanitizePage(goodPage);
    expect(p.medical).toBe(true);
    expect(p.sections).toHaveLength(3);
    expect(p.faq).toHaveLength(1);
    expect(p.related).toContain("Conduct disorder");
  });

  it("drops anything that looks like a drug dose", () => {
    const p = sanitizePage({ ...goodPage, sections: [...goodPage.sections, { h: "Medicines", b: ["Give 500 mg twice daily", "Antibiotics may be needed"] }] });
    const meds = p.sections.find((s: { h: string }) => s.h === "Medicines");
    expect(meds.b).toEqual(["Antibiotics may be needed"]);
    expect(() => sanitizePage({ ...goodPage, summary: "Give 10 mg of the drug every day to every child with this condition, always." })).toThrow();
  });

  it("keeps lab thresholds and test tables, and the examiner questions", () => {
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

  it("calls Gemini through the gateway and returns a checked page", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "Here you go: " + JSON.stringify(goodPage) } }] }) }));
    const page = await generateTopicPage({ name: "Oppositional defiant disorder", category: "Psychiatry", env: { LOVABLE_API_KEY: "k" }, fetchImpl });
    expect(page.medical).toBe(true);
    expect(page.kind).toBe("disease");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls as unknown as string[][])[0][0])).toContain("ai.gateway.lovable.dev");
  });

  it("falls back to a direct Gemini key when the gateway fails", async () => {
    const fetchImpl = vi.fn(async (url: string) => String(url).includes("lovable") ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(goodPage) }] } }] }) });
    const page = await generateTopicPage({ name: "Oppositional defiant disorder", category: "Psychiatry", env: { LOVABLE_API_KEY: "k", GEMINI_API_KEY: "g" }, fetchImpl });
    expect(page.medical).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("topic-ai flow", () => {
  const baseEnv = { LOVABLE_API_KEY: "k", SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "s" };
  let rows: Record<string, any>;
  let modelReply: any;
  let modelCalls: number;
  const fetchImpl: any = async (url: string, init: any = {}) => {
    if (String(url).includes("ai.gateway")) { modelCalls++; return modelReply; }
    const u = new URL(url);
    if (init.method === "POST") { const b = JSON.parse(init.body); rows[b.slug] = { ...(rows[b.slug] ?? {}), ...b }; return { ok: true, headers: new Headers(), json: async () => [] }; }
    if (u.searchParams.has("created_at")) return { ok: true, headers: new Headers({ "content-range": `0-0/${Object.keys(rows).length}` }), json: async () => [] };
    const slug = (u.searchParams.get("slug") ?? "").replace("eq.", "");
    return { ok: true, headers: new Headers(), json: async () => (rows[slug] ? [rows[slug]] : []) };
  };
  const call = (input: unknown, env: Record<string, string> = baseEnv) => topicAiCore(input, { env, fetchImpl });
  beforeEach(() => { rows = {}; modelCalls = 0; modelReply = { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(goodPage) } }] }) }; });

  it("says 'unavailable' when no AI key is set up", async () => {
    const r = await call({ name: "Oppositional defiant disorder" }, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "s" });
    expect(r.code).toBe(503);
    expect(r.body.status).toBe("unavailable");
  });

  it("writes a page once, saves it, and gives the saved copy to the next reader without spending credits", async () => {
    const first = await call({ name: "Oppositional defiant disorder", category: "Psychiatry" });
    expect(first.code).toBe(200);
    expect((first.body as any).page.sections).toHaveLength(3);
    expect(rows["oppositional-defiant-disorder"].status).toBe("published");
    expect(modelCalls).toBe(1);
    const second = await call({ name: "Oppositional defiant disorder" });
    expect(second.code).toBe(200);
    expect(modelCalls).toBe(1);
  });

  it("stops at the daily cap", async () => {
    const r = await call({ name: "Nephrotic syndrome" }, { ...baseEnv, TOPIC_AI_DAILY_CAP: "0" });
    expect(r.code).toBe(429);
    expect(modelCalls).toBe(0);
  });

  it("turns away a topic that is not medical, and remembers it", async () => {
    modelReply = { ok: true, json: async () => ({ choices: [{ message: { content: '{"medical": false}' } }] }) };
    const r = await call({ name: "Taylor Swift" });
    expect(r.code).toBe(404);
    expect(rows["taylor-swift"].status).toBe("rejected");
  });

  it("fails politely when the model is down", async () => {
    modelReply = { ok: false, status: 500, json: async () => ({}) };
    const r = await call({ name: "Nephrotic syndrome" });
    expect(r.code).toBe(502);
    expect(rows["nephrotic-syndrome"].status).toBe("failed");
  });

  it("rejects bad names", async () => {
    expect((await call({ name: "<b>x</b>" })).code).toBe(400);
  });
});
