// The OmpathStudy lesson format. Assistants fetch it with get_style_guide before writing; validate_lesson and preview_lesson report where a draft departs from it.

export const STYLE_GUIDE = `# OmpathStudy lesson format (follow this exactly)

Write revision notes a Kenyan MBChB student can learn from without the textbook: complete, accurate, scannable. Markdown only (no HTML).

## Structure, in this order
1. \`# Clean Title\` (title case; no numbering, no author, no university name).
2. \`**Year N · <Department> · <Topic area>**\` (for example \`**Year 4 · Internal Medicine · Hepatology**\`).
3. A one-line summary callout: \`> **In one line:** ...\` (1 to 3 sentences with the key mechanism or idea).
4. \`## What you must know\` : 4 to 8 bullets of the highest-yield facts.
5. Content sections as \`## <Name>\` (definition, epidemiology, aetiology, pathophysiology, classification, clinical features, investigations, differential diagnosis, management, complications, prognosis, prevention: only those that fit). Do NOT number the headings ("## 1. Causes") and do NOT use numbered lists for things that are not steps: the site can mistake numbered lines for exam questions.
6. Tables for classifications, comparisons, drug lists, staging, criteria and differentials (header row and a --- separator row are required).
7. Two to five callouts: \`> **Exam tip:** ...\` or \`> **Remember:** ...\` for traps and high-yield links.
8. \`## Key points to revise\` : 5 to 8 one-line bullets.
9. Last line, italic: \`*Source: ... Educational resource; follow local protocols and senior guidance.*\`

## Content rules
- Be thorough: typically 1,200 to 3,000 words. Keep every fact the user supplied; add the mechanism, why a sign occurs, investigation interpretation, management by severity, complications.
- Use standard references (Davidson, Harrison, Bailey and Love, Nelson, Kumar and Clark, Kenya MoH guidelines). Never invent statistics, doses or guideline numbers; if unsure, say so in a "> **Check:**" callout.
- British English, short sentences, bold key terms. No emojis, no filler, no "Slide N", no university or lecturer branding.
- Images: only from upload_image / request_upload_url (cdn.ompathstudy.com), each with descriptive alt text and a caption, placed under the section they illustrate: \`![alt](url)\` then \`*Figure: caption*\` on the next line.
- Use update_lesson to change one section of an existing lesson; do not rewrite a whole published lesson unless the user asks.
`;

export interface FormatCheck { score: number; of: number; missing: string[] }

/** How closely a draft follows STYLE_GUIDE. Advice only: nothing here blocks a publish. */
export function formatCheck(md: string): FormatCheck {
  const t = md.replace(/\r\n/g, "\n");
  const words = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).filter(Boolean).length;
  const checks: [boolean, string][] = [
    [/^#\s+\S/m.test(t), "a '# Title' line"],
    [/^\*\*Year\s+\d\s*·\s*[^*]+\*\*\s*$/m.test(t), "the '**Year N · Department · Topic**' line under the title"],
    [/^>\s*\*\*In one line:?\*\*/m.test(t), "a '> **In one line:** ...' summary"],
    [/^##\s+What you must know\s*$/im.test(t), "a '## What you must know' section"],
    [/^##\s+Key points to revise\s*$/im.test(t), "a '## Key points to revise' section"],
    [/^\s*\|[\s:|-]+\|\s*$/m.test(t), "at least one table (header + --- row)"],
    [/^>\s*\*\*(Exam tip|Remember|Check):?\*\*/im.test(t), "one or more '> **Exam tip:**' or '> **Remember:**' callouts"],
    [!/^##\s+\d+[.)]\s/m.test(t), "unnumbered '## ' headings (numbered headings can be mistaken for exam questions)"],
    [/^\*Source:/m.test(t), "a closing '*Source: ...*' line"],
    [words >= 900, `more depth (about ${words} words; aim for 1,200 or more)`],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, why]) => why);
  return { score: checks.length - missing.length, of: checks.length, missing };
}
