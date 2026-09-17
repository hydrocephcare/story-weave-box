import { beforeEach, describe, expect, it } from "vitest";
import { computeStreak, getBookmarks, getProgress, setProgress, toggleBookmark, type ActivityRow } from "@/lib/study";

beforeEach(() => {
  localStorage.clear();
});

describe("computeStreak", () => {
  const dayMs = 86400000;
  const at = (daysAgo: number): ActivityRow => ({
    created_at: new Date(Date.now() - daysAgo * dayMs).toISOString(),
    activity_type: "open",
    duration_seconds: 0,
  });

  it("counts consecutive days ending today", () => {
    expect(computeStreak([at(0), at(1), at(2)])).toBe(3);
  });

  it("does not break the streak just because today has no activity yet", () => {
    expect(computeStreak([at(1), at(2)])).toBe(2);
  });

  it("stops counting at the first gap", () => {
    expect(computeStreak([at(0), at(1), at(3)])).toBe(2);
  });

  it("returns 0 for no activity at all", () => {
    expect(computeStreak([])).toBe(0);
  });
});

describe("guest (signed-out) progress and bookmarks", () => {
  it("round-trips progress through localStorage when there is no user id", async () => {
    await setProgress(null, "article", "a1", { status: "completed", progress_percent: 100 });
    const progress = await getProgress(null);
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ resource_type: "article", resource_id: "a1", status: "completed" });
  });

  it("updates the existing local row instead of duplicating it", async () => {
    await setProgress(null, "article", "a1", { status: "in_progress" });
    await setProgress(null, "article", "a1", { status: "difficult" });
    const progress = await getProgress(null);
    expect(progress).toHaveLength(1);
    expect(progress[0].status).toBe("difficult");
  });

  it("toggles a local bookmark on and off", async () => {
    await toggleBookmark(null, "flashcard", "f1", true);
    expect(await getBookmarks(null)).toHaveLength(1);
    await toggleBookmark(null, "flashcard", "f1", false);
    expect(await getBookmarks(null)).toHaveLength(0);
  });
});
