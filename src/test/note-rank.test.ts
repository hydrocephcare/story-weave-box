import { describe, expect, it } from "vitest";
import { noteKind, rankResults, visibleToYear } from "@/lib/noteRank";

const r = (id: string, title: string, category: string, extra: Record<string, unknown> = {}) => ({ id, title, category, updated_at: "2026-10-20", ...extra });

describe("note kinds", () => {
  it("tells lecturers' files, papers and ordinary notes apart", () => {
    expect(noteKind({ title: "Perioperative care slides", content_type: "Lecture Materials" })).toBe("slides");
    expect(noteKind({ title: "Wound healing", source_type: "google_drive_year4" })).toBe("slides");
    expect(noteKind({ title: "Surgery CAT 2024", content_type: "CAT" })).toBe("papers");
    expect(noteKind({ title: "Surgical infections", content_type: "Notes" })).toBe("note");
  });
});

describe("ranking a search", () => {
  const results = [
    r("1", "Caesarean Section and Perioperative Care: Indications", "Year 4: Obstetrics and Gynaecology", { content_type: "Notes" }),
    r("2", "Surgical Infections and Antibiotic Prophylaxis", "Year 4: Surgery", { content_type: "Notes", meta_description: "perioperative care and prophylaxis" }),
    r("3", "Fluids and Electrolytes in Surgery", "Year 4: Surgery", { content_type: "Notes" }),
    r("4", "Anaesthesia and perioperative care (lecture)", "Year 4: Surgery", { content_type: "Lecture Materials", source_type: "google_drive_year4" }),
    r("5", "Surgery CAT 1", "Year 4: Surgery", { content_type: "CAT" }),
  ];
  it("puts the unit the search points to first, then its slides, its papers, then other units", () => {
    const out = rankResults(results, "perioperative care");
    expect(out.primary).toBe("Year 4: Surgery"); // "perioperative" points to surgery even though one obstetrics title matches best
    expect(out.groups.map((g) => g.key)).toEqual(["notes", "slides", "papers", "other"]);
    expect(out.groups.find((g) => g.key === "other")!.items.map((x) => x.id)).toEqual(["1"]);
    expect(out.groups.find((g) => g.key === "slides")!.items.map((x) => x.id)).toEqual(["4"]);
  });
  it("uses the unit chosen on the page when there is one", () => {
    expect(rankResults(results, "perioperative care", "Year 4: Obstetrics and Gynaecology").primary).toBe("Year 4: Obstetrics and Gynaecology");
  });
  it("orders notes by how well the title matches", () => {
    const out = rankResults(results.filter((x) => x.category === "Year 4: Surgery" && x.id !== "5"), "perioperative care");
    expect(out.groups[0].items[0].id).toBe("2"); // its description names the topic
  });
});

describe("what a student may see", () => {
  it("shows their own year and the years below, never above", () => {
    expect(visibleToYear("Year 3: Pathology", 4)).toBe(true);
    expect(visibleToYear("Year 4: Surgery", 4)).toBe(true);
    expect(visibleToYear("Year 4: Surgery", 3)).toBe(false);
    expect(visibleToYear("Aponeurosis - Anatomy", 3)).toBe(true);
    expect(visibleToYear("Year 6: Anything", null)).toBe(true);
  });
});
