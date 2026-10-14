/** Table rows that an import or the AI separated with blank lines ("| a | b |", blank, "| c | d |") are joined, so they draw as one table. */
export function joinTableRows(raw: string): string {
  return raw.replace(/^(\s*\|[^\n]*)\n(?:[ \t]*\n)+(?=[ \t]*\|)/gm, "$1\n");
}
