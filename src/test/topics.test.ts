import { afterEach, describe, expect, it, vi } from "vitest";
import { imageCaption, resolveTopicSlug, topicPath } from "@/lib/topics";

describe("topic pages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds the page address", () => {
    expect(topicPath("humerus")).toBe("/topic/humerus");
  });

  it("tidies question-bank image captions", () => {
    expect(imageCaption("Q15 - humerus specimen with A and B labelled")).toBe("Humerus specimen with A and B labelled");
    expect(imageCaption("Q3: back dissection")).toBe("Back dissection");
    expect(imageCaption("")).toBe("Image");
  });

  it("finds the page for an abbreviation, whatever its case", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ odd: "oppositional-defiant-disorder", humerus: "humerus" }) })));
    await expect(resolveTopicSlug("ODD")).resolves.toBe("oppositional-defiant-disorder");
    await expect(resolveTopicSlug("humerus")).resolves.toBe("humerus");
    await expect(resolveTopicSlug("not-a-topic")).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
