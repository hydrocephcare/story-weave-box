const clean = (value, max = 2000) => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);

export function shortUssdText(value, max = 40) {
  const text = clean(value).replace(/\\s+/g, " ");
  const limit = /[^\\x00-\\x7F]/.test(text) ? Math.min(max, 18) : max;
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit + 1);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > Math.floor(limit * 0.55) ? cut.slice(0, boundary) : text.slice(0, limit))
    .replace(/[.,;: -]+$/, "") + "...";
}

export function splitUssdWords(value, max = 105) {
  const source = clean(value);
  const limit = /[^\\x00-\\x7F]/.test(source) ? Math.min(max, 48) : max;
  const words = source.split(/\\s+/).filter(Boolean);
  const chunks = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if ((line + " " + word).length <= limit) line += " " + word;
    else {
      chunks.push(line);
      line = word;
    }
  }
  if (line) chunks.push(line);
  return chunks.length ? chunks : ["Question text unavailable."];
}
