import fs from "node:fs";
const f = "src/pages/GlobalSearch.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let lines = raw.replace(/\r\n/g, "\n").split("\n");
const i = lines.findIndex((l) => l.trim().startsWith("const readAbout ="));
if (i < 0) throw new Error("line not found");
const [line] = lines.splice(i, 1);
// the main component's return is the one after topicHits is defined
const def = lines.findIndex((l) => /const topicHits\b/.test(l));
if (def < 0) throw new Error("topicHits not found");
const ret = lines.findIndex((l, k) => k > def && l.trim() === "return (");
if (ret < 0) throw new Error("return not found");
lines.splice(ret, 0, line);
fs.writeFileSync(f, crlf ? lines.join("\n").replace(/\n/g, "\r\n") : lines.join("\n"));
console.log("moved to line", ret + 1);
