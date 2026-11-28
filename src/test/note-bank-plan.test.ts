import { describe, expect, it } from "vitest";
import { noteBankRequest } from "../../scripts/topics/note-bank-plan.mjs";

describe("note flashcard batch scheduling", () => {
  it("keeps MCQ generation unchanged", () => {
    expect(noteBankRequest("mcqs", 0)).toEqual({});
    expect(noteBankRequest("mcqs", 1)).toEqual({});
  });

  it("alternates new flashcard decks with legacy-deck review upgrades", () => {
    expect(noteBankRequest("flashcards", 0)).toEqual({ upgrade_legacy: false });
    expect(noteBankRequest("flashcards", 1)).toEqual({ upgrade_legacy: true });
    expect(noteBankRequest("flashcards", 2)).toEqual({ upgrade_legacy: false });
    expect(noteBankRequest("flashcards", 3)).toEqual({ upgrade_legacy: true });
  });
});
