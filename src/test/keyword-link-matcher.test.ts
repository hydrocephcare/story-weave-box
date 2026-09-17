import { describe, expect, it } from "vitest";
import { buildLinkTrie, findBestMatch, type LinkEntry } from "@/lib/keyword-link";

function entry(term: string, quality = 10, path = `/blog/${term.replace(/\s+/g, "-")}`): LinkEntry {
  return { term, lower: term.toLowerCase(), path, target: term.toLowerCase().replace(/\s+/g, "-"), quality };
}

describe("keyword-link trie matcher", () => {
  it("finds a whole-word match", () => {
    const trie = buildLinkTrie([entry("malaria")]);
    const match = findBestMatch("Patients with malaria often present with fever.", trie);
    expect(match?.matched).toBe("malaria");
    expect(match?.index).toBe(14);
  });

  it("never matches inside a longer word (word-boundary check)", () => {
    const trie = buildLinkTrie([entry("malaria")]);
    const match = findBestMatch("hypermalarial states are different.", trie);
    expect(match).toBeNull();
  });

  it("prefers the longest match starting at the same position", () => {
    const trie = buildLinkTrie([entry("pathology", 5), entry("general pathology", 10)]);
    const match = findBestMatch("Overview of general pathology today.", trie);
    expect(match?.matched).toBe("general pathology");
  });

  it("prefers the earliest starting match over a later, longer one", () => {
    const trie = buildLinkTrie([entry("malaria"), entry("general pathology")]);
    const match = findBestMatch("A short note on malaria before general pathology.", trie);
    expect(match?.matched).toBe("malaria");
  });

  it("returns null when nothing in the pool appears in the text", () => {
    const trie = buildLinkTrie([entry("tuberculosis")]);
    expect(findBestMatch("This text is about something else entirely.", trie)).toBeNull();
  });

  it("is case-insensitive but returns the original-case slice", () => {
    const trie = buildLinkTrie([entry("malaria")]);
    const match = findBestMatch("MALARIA is common.", trie);
    expect(match?.matched).toBe("MALARIA");
  });
});
