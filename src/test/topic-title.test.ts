import { describe, expect, it } from "vitest";
import { cleanTopicTitle } from "../../supabase/functions/_shared/topicTitle.js";

describe("cleanTopicTitle", () => {
  it.each([
    ["1.a) ACUTE RHEUMATIC FEVER MB chB IV", "Acute rheumatic fever"],
    ["L26- GI bleeding", "GI bleeding"],
    ["7b TUBULOINTERSTITIAL DISEASES", "Tubulointerstitial diseases"],
    ["2.ASTHMA PPT MKU", "Asthma"],
    ["1b BONE MARROW FAILURE", "Bone marrow failure"],
    ["Community acquired pneumonia", "Community acquired pneumonia"],
    ["CVS INTERNAL MED", "CVS internal med"],
    ["Aspiration syndromes-1", "Aspiration syndromes"],
    ["HIV ENTEROPATHY", "HIV enteropathy"],
  ])("%s -> %s", (raw, want) => { expect(cleanTopicTitle(raw)).toBe(want); });
  it("never returns an empty name", () => { expect(cleanTopicTitle("1.")).toBe("1."); });
});
