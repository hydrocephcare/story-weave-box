// One-off: the contents list of the deep tab only lists what the reader can open (a free reader gets the first section and a "Pro" entry, no dead links).
import fs from "node:fs";
const f = "src/pages/TopicPage.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const a = s.indexOf("  const toc = view === \"deep\" && deep ? [");
const b = s.indexOf("] : [", a);
if (a < 0 || b < 0) throw new Error("toc not found");
const mine = [
  "  const toc = view === \"deep\" && deep ? (canRead",
  "    ? [...deep.sections.map((x) => ({ id: `deep-${anchor(x.h)}`, t: x.h })), ...(deep.facts?.length ? [{ id: \"deep-memorise\", t: \"Numbers to memorise\" }] : []), ...(deep.vivas?.length || deep.exam.length ? [{ id: \"deep-exam\", t: \"Viva questions\" }] : []), ...(deep.mcqs?.length ? [{ id: \"deep-mcqs\", t: \"MCQs\" }] : []), ...(deep.cases?.length ? [{ id: \"deep-cases\", t: \"Cases\" }] : [])]",
  "    : [...deep.sections.slice(0, 1).map((x) => ({ id: `deep-${anchor(x.h)}`, t: x.h })), { id: \"deep-locked\", t: \"Pro: the rest\" }]",
  "  ) : [",
].join("\n");
s = s.slice(0, a) + mine + s.slice(b + "] : [".length);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("toc fixed");
