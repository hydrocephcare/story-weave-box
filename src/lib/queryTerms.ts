export const queryTerms = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/i).filter((t) => t.length >= 2);
