// Papers typed as "(a) ... (b) ..." or "a) ... b) ..." under a numbered stem are multiple-choice questions. The reader shows A) to E) lines as
// proper option rows, so a run that starts at (a) and climbs without a gap (three or more) is rewritten as "A) ...".
// Lettered parts of written questions ("(a) Explain ... (6 marks)", "(a) Describe ...") are left alone.
const OPT = /^\s*\(?([a-e])[.)]\s+(\S.*)$/;
const WRITTEN = /\(\s*\d{1,2}(?:\.\d+)?\s*marks?\s*\)|^(?:what|describe|explain|mention|enumerate|discuss|list|state|outline|define|give|name|how|why|write|draw|classify|compare|differentiate|identify)\b/i;

export function normaliseParenOptions(content: string): string {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPT);
    if (!m || m[1] !== "a") continue;
    const run: number[] = [i]; let want = "b"; let j = i + 1;
    while (j < lines.length) {
      const o = lines[j].match(OPT);
      if (o && o[1] === want) { run.push(j); want = String.fromCharCode(want.charCodeAt(0) + 1); j++; continue; }
      if (!lines[j].trim() && lines[j + 1]?.match(OPT)?.[1] === want) { j++; continue; }
      break;
    }
    if (run.length >= 3 && run.filter((k) => WRITTEN.test(lines[k].match(OPT)![2])).length < Math.ceil(run.length / 2)) {
      for (const k of run) lines[k] = lines[k].replace(OPT, (_s, l: string, t: string) => `${l.toUpperCase()}) ${t}`);
    }
    i = j - 1;
  }
  return lines.join("\n");
}
