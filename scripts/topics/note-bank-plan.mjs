// Spread legacy flashcard re-review across the daily batch without stopping new deck generation.
export function noteBankRequest(mode, index) {
  if (mode !== "flashcards") return {};
  return { upgrade_legacy: Number(index) % 2 === 1 };
}
