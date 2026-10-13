import { describe, expect, it } from "vitest";
import { chunksOf, kindOf, needsPaperFormat, soundPolish } from "../../api/_lib/blogPolishCore.js";
import { polishArticle } from "../../api/_lib/blogPolishRun.js";

const mcq = (n: number, answered: boolean) => Array.from({ length: n }, (_, i) => `Question ${i + 1}\nWhat is X${i}?\nA. a\nB. b\nC. c\nD. d${answered ? "\nAnswer: B. b" : ""}`).join("\n\n");
const essays = Array.from({ length: 4 }, (_, i) => `Question ${i + 1}\nDiscuss the topic number ${i + 1} in full.`).join("\n\n");

describe("kind of page", () => {
  it("sends each kind of page to the right polish", () => {
    expect(kindOf("# Biochemistry EOY 2015 — Visual Scan Archive\n\nnoise")).toBe("scan");
    expect(kindOf(mcq(8, false))).toBe("questions");
    expect(kindOf(mcq(8, true).replace(/Question (\d+)/g, "### Question $1"))).toBe("formatted");
    expect(kindOf(essays)).toBe("questions");
    expect(kindOf("## Heart\n\nA note about the heart and its valves. ".repeat(10))).toBe("note");
  });
  it("sees an essay paper that is not yet one question per heading", () => {
    expect(needsPaperFormat(essays)).toBe(true);
    // already in the site's layout: "**1. question**" then "**Model answer:** ..." (the page tells it apart by those bold numbered lines)
    const standard = Array.from({ length: 4 }, (_, i) => `Question ${i + 1}\n**${i + 1}. Discuss the topic number ${i + 1} in full.**\n**Model answer:** points`).join("\n\n");
    expect(needsPaperFormat(standard)).toBe(false);
  });
});

describe("splitting long text", () => {
  it("cuts at headings and keeps every line", () => {
    const text = Array.from({ length: 12 }, (_, i) => `## Section ${i + 1}\n\n${"A sentence about the topic. ".repeat(40)}`).join("\n\n");
    const parts = chunksOf(text, 3000);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(p.startsWith("## Section")).toBe(true);
    expect(parts.join("\n").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });
});

describe("polishing", () => {
  const a = { id: "1", title: "Heart note", category: "Year 3: Cardiology", content: ["## Heart", "", "The heart pumps blood to the body and the lungs.", "", "## Valves", "", "The mitral valve and the aortic valve control the left side of the heart in adults."].join("\n") };
  const good = `*This note covers the heart.*\n\n**In short:** the heart pumps blood.\n\n## 1. Heart\n\nThe heart pumps blood to the body and the lungs.\n\n## 2. Valves\n\nThe mitral valve and the aortic valve control the left side of the heart in adults.`;

  it("keeps a good polish, with its title and description", async () => {
    const answers = [JSON.stringify({ verdict: "keep", reason: "A clear note.", title: "The Heart and Its Valves", description: "How the heart pumps blood and how the mitral and aortic valves control the flow on the left side of the heart." }), good];
    const r = await polishArticle(a, async () => answers.shift() as string);
    expect(r.title).toBe("The Heart and Its Valves");
    expect(r.content).toContain("**In short:**");
    expect(r.status).toBe("done");
  });

  it("leaves the text alone when the AI drops the facts", async () => {
    const answers = [JSON.stringify({ verdict: "keep", title: "The Heart and Its Valves", description: "x".repeat(80) }), "## Heart\n\nShort.\n\n## Valves\n\nShort."];
    const r = await polishArticle(a, async () => answers.shift() as string);
    expect(r.content).toBeNull();
    expect(r.reason).toContain("rejected");
  });

  it("does not touch the text of an irrelevant page", async () => {
    const r = await polishArticle(a, async () => JSON.stringify({ verdict: "irrelevant", reason: "A notice.", title: "Notice to students", description: "x".repeat(80) }));
    expect(r.verdict).toBe("irrelevant");
    expect(r.content).toBeNull();
  });

  it("marks the page partial when the AI is too slow for the text", async () => {
    let n = 0;
    const r = await polishArticle(a, async () => { if (n++ === 0) return JSON.stringify({ verdict: "keep", title: "The Heart and Its Valves", description: "x".repeat(80) }); throw new Error("timeout"); });
    expect(r.status).toBe("partial");
    expect(r.title).toBe("The Heart and Its Valves");
  });

  it("a polish may add practice questions without being rejected", () => {
    const withQs = `${good}\n\n## Practice questions\n\n### Question 1\nWhich valve is on the left?\n\nA. mitral\nB. tricuspid\nC. pulmonary\nD. none\n\nAnswer: A. mitral\nExplanation: The mitral valve is on the left.`;
    // a real note is long: five questions add a fraction of its length, so the original here is made realistic
    const long = Array.from({ length: 30 }, (_, i) => `## Part ${i}\n\nThe mitral valve and the aortic valve control the left side number ${i} of the heart in adults.`).join("\n\n");
    expect(soundPolish(long, `${long}\n\n${withQs}`, { maxRatio: 2.0 })).toBe("");
  });
});
