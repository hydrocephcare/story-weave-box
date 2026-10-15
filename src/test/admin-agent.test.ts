import { describe as suite, expect, it } from "vitest";
import { describe as plan, pickExam, type AgentWorld } from "@/lib/adminAgent";

const papers = [
  { id: "1", title: "Respiratory McQs 2", category: "x" },
  { id: "2", title: "Cardiovascular Pathology MCQs", category: "x" },
  { id: "3", title: "Respiratory McQs 2 (answers)", category: "x" },
] as any;
const world = {
  universities: [{ id: "u1", slug: "university-of-nairobi", name: "University of Nairobi", abbreviation: "UoN", active: true }, { id: "u2", slug: "mount-kenya-university", name: "Mount Kenya University", abbreviation: "MKU", active: true }],
  papers,
  contests: [{ id: "c1", slug: "test", title: "test", stage: "concept" }],
} as unknown as AgentWorld;

suite("admin assistant plan", () => {
  it("picks the closest exam, preferring the shorter title", () => {
    expect(pickExam(papers, "respiratory mcqs")?.id).toBe("1");
    expect(pickExam(papers, "cardiovascular pathology")?.id).toBe("2");
    expect(pickExam(papers, "dermatology")).toBeNull();
  });
  it("describes a contest it can run and flags one it cannot", () => {
    const ok = plan([{ tool: "create_contest", args: { title: "UoN vs MKU", universities: ["university-of-nairobi", "mount-kenya-university"], exam: "respiratory mcqs", start: "2026-10-17T20:00", minutes: 30 } }], world)[0];
    expect(ok.ok).toBe(true);
    expect(ok.line).toContain("UoN + MKU");
    const bad = plan([{ tool: "create_contest", args: { title: "x", universities: ["university-of-nairobi"], exam: "", start: "" } }], world)[0];
    expect(bad.ok).toBe(false);
  });
  it("marks deletion as dangerous and refuses unknown contests", () => {
    const [del, ghost] = plan([{ tool: "delete_contest", args: { slug: "test" } }, { tool: "delete_contest", args: { slug: "nope" } }], world);
    expect(del.danger).toBe(true); expect(del.ok).toBe(true); expect(ghost.ok).toBe(false);
  });
});

suite("admin assistant: more tools", () => {
  it("describes post edits, publishing and clean-up, and refuses empty ones", () => {
    const [edit, pub, clean, bad, send] = plan([
      { tool: "update_post", args: { query: "nephrotic", meta_description: "A clearer description." } },
      { tool: "publish_post", args: { query: "nephrotic" } },
      { tool: "clean_notifications", args: { days: 7 } },
      { tool: "update_post", args: { query: "x" } },
      { tool: "send_notification", args: { title: "Hello", message: "New notes are up", audience: "all_users" } },
    ], world);
    expect(edit.ok).toBe(true); expect(pub.ok).toBe(true); expect(clean.ok).toBe(true); expect(bad.ok).toBe(false);
    expect(send.danger).toBe(true); expect(send.line).toContain("ALL users");
  });
});
