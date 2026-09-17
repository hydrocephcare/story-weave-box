import { describe, expect, it } from "vitest";
import { extractTopicKeyword, isGenericThumbnail } from "@/lib/topicThumbnail";

describe("topic-aware article thumbnails", () => {
  it("removes exam boilerplate but keeps the medical subject", () => {
    expect(extractTopicKeyword("Brain Anatomy MCQs — Past Paper 2025", "Year 2: Anatomy")).toBe("brain anatomy");
  });

  it("recognises repeated category artwork and unstable search thumbnails", () => {
    expect(isGenericThumbnail("https://x.supabase.co/storage/v1/object/public/story-covers/articles/parasitology.jpg")).toBe(true);
    expect(isGenericThumbnail("https://encrypted-tbn0.gstatic.com/images?q=test")).toBe(true);
  });

  it("keeps a specific article image", () => {
    expect(isGenericThumbnail("https://upload.wikimedia.org/wikipedia/commons/1/14/Human_brain_NIH.jpg")).toBe(false);
  });
});
