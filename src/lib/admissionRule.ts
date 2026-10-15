// Builds an admission-number rule from one real example, and tests a typed number against a rule the way the database does.
// The rule is stored as a POSIX pattern (what Postgres reads) and a replacement that says how the number is saved.

const SEP = "[[:space:]/\\-_.]*"; // between the parts, any run of spaces, / - _ or . (or nothing)

/** "BMS/2023/60482" -> pattern ^BMS<sep>([0-9]{4})<sep>([0-9]{3,6})$ and replacement BMS/\1/\2. "MBCHB262700349" -> ^MBCHB<sep>([0-9]{9})$ and MBCHB\1. */
export function ruleFromExample(example: string): { pattern: string; replacement: string } | null {
  const t = example.trim().toUpperCase();
  const m = t.match(/^([A-Z]{2,12})[\s/\-_.]*([0-9].*)$/);
  if (!m) return null;
  const prefix = m[1];
  const groups = m[2].split(/[\s/\-_.]+/).filter(Boolean);
  if (!groups.length || groups.some((g) => !/^[0-9]+$/.test(g))) return null;
  const joiner = t.slice(prefix.length).match(/[/\-_.]/)?.[0] ?? "";
  const part = (g: string, last: boolean) => (groups.length > 1 && last && g.length >= 4 ? `([0-9]{${Math.max(3, g.length - 2)},${g.length + 1}})` : `([0-9]{${g.length}})`);
  const body = groups.map((g, i) => part(g, i === groups.length - 1)).join(SEP);
  return { pattern: `^${prefix}${SEP}${body}$`, replacement: prefix + groups.map((_, i) => `${joiner}\\${i + 1}`).join("") };
}

/** The same test in the browser: Postgres' [[:space:]] becomes \s. */
export function ruleMatches(pattern: string, typed: string): boolean {
  try { return new RegExp(pattern.replace(/\[\[:space:\]/g, "[\\s")).test(typed.trim().toUpperCase()); } catch { return false; }
}
