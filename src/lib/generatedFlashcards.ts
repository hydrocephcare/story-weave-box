export interface GeneratedFlashcard { q: string; a: string }
export interface GeneratedFlashcardDeck {
  id: string;
  title: string;
  sourcePath: string;
  createdAt: number;
  cards: GeneratedFlashcard[];
}

const KEY = "ompath_generated_flashcard_decks_v1";
const readAll = (): GeneratedFlashcardDeck[] => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export function saveGeneratedFlashcardDeck(
  title: string,
  sourcePath: string,
  cards: GeneratedFlashcard[],
): GeneratedFlashcardDeck {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const deck: GeneratedFlashcardDeck = {
    id,
    title: title.trim() || "Generated medical flashcards",
    sourcePath,
    createdAt: Date.now(),
    cards: cards.filter((card) => card.q?.trim() && card.a?.trim()).map((card) => ({
      q: card.q.trim(),
      a: card.a.trim(),
    })),
  };
  const all = readAll().filter((item) => item.id !== id);
  all.push(deck);
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-40)));
  } catch {
    throw new Error("These flashcards could not be saved on this device. Free up browser storage and try again.");
  }
  return deck;
}

export function getGeneratedFlashcardDeck(id: string): GeneratedFlashcardDeck | null {
  return readAll().find((deck) => deck.id === id) ?? null;
}

export function generatedFlashcardPath(id: string): string {
  return `/generated-flashcards/${encodeURIComponent(id)}`;
}
