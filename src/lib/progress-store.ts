// progress-store.ts
// Lightweight localStorage helpers for tracking visited sets & articles

const KEYS = {
  MCQ_VISITED: "progress:mcq_visited",
  FLASHCARD_VISITED: "progress:flashcard_visited",
  RECENT_ARTICLES: "progress:recent_articles",
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// --- MCQ ---
export function markMcqVisited(id: string) {
  const visited: string[] = readJSON(KEYS.MCQ_VISITED, []);
  if (!visited.includes(id)) {
    writeJSON(KEYS.MCQ_VISITED, [...visited, id]);
  }
}

export function getVisitedMcqIds(): Set<string> {
  return new Set(readJSON<string[]>(KEYS.MCQ_VISITED, []));
}

// --- Flashcards ---
export function markFlashcardVisited(id: string) {
  const visited: string[] = readJSON(KEYS.FLASHCARD_VISITED, []);
  if (!visited.includes(id)) {
    writeJSON(KEYS.FLASHCARD_VISITED, [...visited, id]);
  }
}

export function getVisitedFlashcardIds(): Set<string> {
  return new Set(readJSON<string[]>(KEYS.FLASHCARD_VISITED, []));
}

// --- Articles ---
const MAX_RECENT = 6;

export interface RecentArticle {
  id: string;
  title: string;
  category: string;
  visitedAt: number; // timestamp ms
}

export function markArticleVisited(article: RecentArticle) {
  const existing: RecentArticle[] = readJSON(KEYS.RECENT_ARTICLES, []);
  const filtered = existing.filter((a) => a.id !== article.id);
  const updated = [{ ...article, visitedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
  writeJSON(KEYS.RECENT_ARTICLES, updated);
}

export function getRecentArticles(): RecentArticle[] {
  return readJSON<RecentArticle[]>(KEYS.RECENT_ARTICLES, []);
}
