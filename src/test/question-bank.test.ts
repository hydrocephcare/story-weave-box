import { describe, expect, it } from "vitest";
import { drillIntent, parseBank, pickQuestions, sectionFor, type Bank } from "@/lib/questionBank";

const md = `# Pelvis & Hip

## Q1: State the basis of a positive Trendelenburg sign

![Trendelenburg stance](https://cdn.example.com/a.jpg)

**Answer:**
- Weak hip abductors
- Pelvis drops on the unsupported side

---

## Q2: Name two contents of the lesser sciatic foramen

**Answer:**
- Internal pudendal vessels
- Tendon of obturator internus

# Thigh & Knee

## Q3: Identify the muscle shown

![Thigh](https://cdn.example.com/b.jpg)

**Answer:**
- Rectus femoris
`;

describe("parseBank", () => {
  const qs = parseBank(md, "b1");
  it("finds every question with its section", () => {
    expect(qs).toHaveLength(3);
    expect(qs.map((q) => q.section)).toEqual(["Pelvis & Hip", "Pelvis & Hip", "Thigh & Knee"]);
  });
  it("keeps the picture and the answer", () => {
    expect(qs[0].image).toBe("https://cdn.example.com/a.jpg");
    expect(qs[0].answer).toContain("Weak hip abductors");
    expect(qs[0].answer).not.toContain("---");
    expect(qs[1].image).toBeUndefined();
  });
  it("ignores notes that are not question banks", () => {
    expect(parseBank("# Heart failure\n\nSome notes.", "x")).toEqual([]);
  });
});

describe("pickQuestions", () => {
  const bank: Bank = { id: "b1", title: "t", href: "/x", subject: "gross", questions: parseBank(md, "b1") };
  it("prefers questions with pictures and stays in the chosen section", () => {
    const got = pickQuestions([bank], "Pelvis & Hip", 1, new Set());
    expect(got[0].section).toBe("Pelvis & Hip");
    expect(got[0].image).toBeTruthy();
  });
  it("does not repeat a question until all have been seen", () => {
    const seen = new Set<string>();
    const first = pickQuestions([bank], "", 2, seen);
    first.forEach((q) => seen.add(q.id));
    const second = pickQuestions([bank], "", 1, seen);
    expect(first.map((q) => q.id)).not.toContain(second[0].id);
  });
});

describe("drillIntent", () => {
  it("recognises a request for anatomy questions", () => {
    expect(drillIntent("give me some anat questions")?.subject).toBe("gross");
    expect(drillIntent("histology quiz")?.subject).toBe("histology");
    expect(drillIntent("embryology questions please")?.subject).toBe("embryology");
    expect(drillIntent("upper limb anatomy marathon")?.topic).toBe("upper limb");
  });
  it("leaves other requests alone", () => {
    for (const q of ["anatomy past papers", "what is aponeurosis", "pharmacology questions", "notes on the brachial plexus"]) expect(drillIntent(q), q).toBeNull();
  });
  it("picks the section that matches the topic", () => {
    expect(sectionFor([{ name: "Pelvis & Hip" }, { name: "Upper Limb" }], "upper limb")).toBe("Upper Limb");
    expect(sectionFor([{ name: "Pelvis & Hip" }], "")).toBe("");
  });
});
