// Part 2: the four places that cut JSON out of a reply now use extractJson (one of them had lost its backslashes: /{[sS]*}/, so the verifier never filtered anything).
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const lines = (s, fn) => fn(s.split("\n")).join("\n");

edit("supabase/functions/_shared/topicAi.js", (s) => lines(s, (L) => {
  const out = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i].includes("const m = text.match(") && L[i + 1]?.includes("if (!m) throw new Error(\"no JSON in the reply\");")) {
      const indent = L[i].match(/^\s*/)[0];
      out.push(`${indent}const json = extractJson(text);`, `${indent}if (!json) throw new Error("no JSON in the reply");`);
      i++;
    } else out.push(L[i]);
  }
  return out;
}).replace("sanitizePage(extractJson(text))", "sanitizePage(json)"));

edit("supabase/functions/_shared/contentCheck.js", (s) => lines(s, (L) => {
  const out = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i].includes("const m = r.text.match(") && L[i + 1]?.includes("if (!m)")) {
      const indent = L[i].match(/^\s*/)[0];
      const second = L[i + 1];
      out.push(`${indent}const json = extractJson(r.text);`, second.includes("return issues") ? `${indent}if (!json) return issues;` : `${indent}if (!json) throw new Error("no JSON in the reply");`);
      i++;
    } else out.push(L[i]);
  }
  return out;
}));
console.log("patched part 2");
