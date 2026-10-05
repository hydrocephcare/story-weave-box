// How big each book is, filled in when the book list loads (public/data/books.json "sizes", written by
// scripts/library/book-sizes.mjs), so the shelf and the reader can say "50 MB" before anyone opens a file.
const sizes = new Map<string, number>();

export function setBookSizes(map?: Record<string, number>) {
  if (map) for (const [id, mb] of Object.entries(map)) sizes.set(id, mb);
}

export const bookSizeMB = (id: string): number | undefined => sizes.get(id);

export function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
