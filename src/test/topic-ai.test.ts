import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/topic-ai.js";
import { generateTopicPage, kindOf, sanitizePage, slugOf, validName } from "../../api/_lib/topicAi.js";

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

  it("calls the model and returns a checked page", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ text: "Here you go: " + JSON.stringify(goodPage) }] }) }));
    const page = await generateTopicPage({ name: "Oppositional defiant disorder", category: "Psychiatry", apiKey: "k", fetchImpl });
    expect(page.medical).toBe(true);
    expect(page.kind).toBe("disease");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/topic-ai", () => {
  const env = { ...process.env };
  const res = () => { const r: any = { headers: {} }; r.setHeader = (k: string, v: string) => { r.headers[k] = v; }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: unknown) => { r.body = b; return r; }; return r; };
  const call = (body: unknown) => { const r = res(); return handler({ method: "POST", body }, r).then(() => r); };
  let rows: Record<string, any>;
  let modelReply: any;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "k"; process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "s";
    rows = {}; modelReply = { ok: true, json: async () => ({ content: [{ text: JSON.stringify(goodPage) }] }) };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any = {}) => {
      if (String(url).startsWith("https://api.anthropic.com")) return modelReply;
      const u = new URL(url);
      if (init.method === "POST") { const b = JSON.parse(init.body); rows[b.slug] = { ...(rows[b.slug] ?? {}), ...b }; return { ok: true, headers: new Headers(), json: async () => [] }; }
      if (u.searchParams.has("created_at")) return { ok: true, headers: new Headers({ "content-range": `0-0/${Object.keys(rows).length}` }), json: async () => [] };
      const slug = (u.searchParams.get("slug") ?? "").replace("eq.", "");
      return { ok: true, headers: new Headers(), json: async () => (rows[slug] ? [rows[slug]] : []) };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...env }; });

  it("says 'unavailable' when the keys are not set up", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await call({ name: "Oppositional defiant disorder" });
    expect(r.code).toBe(503);
    expect(r.body.status).toBe("unavailable");
  });

  it("writes a page, saves it, and gives the saved copy to the next reader without calling the model again", async () => {
    const first = await call({ name: "Oppositional defiant disorder", category: "Psychiatry" });
    expect(first.code).toBe(200);
    expect(first.body.page.sections).toHaveLength(3);
    expect(rows["oppositional-defiant-disorder"].status).toBe("published");
    const calls = (fetch as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith("https://api.anthropic.com")).length;
    const second = await call({ name: "Oppositional defiant disorder" });
    expect(second.code).toBe(200);
    expect((fetch as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith("https://api.anthropic.com")).length).toBe(calls);
  });

  it("turns away a topic that is not medical, and remembers it", async () => {
    modelReply = { ok: true, json: async () => ({ content: [{ text: '{"medical": false}' }] }) };
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

  it("rejects bad names and wrong methods", async () => {
    expect((await call({ name: "<b>x</b>" })).code).toBe(400);
    const r = res(); await handler({ method: "GET" }, r); expect(r.code).toBe(405);
  });
});
