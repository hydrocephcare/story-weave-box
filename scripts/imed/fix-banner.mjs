// One-off repair: the exam-mode banner sat inside a conditional next to the article without a wrapper (a syntax error that stopped the build), and its pattern lost
// a backslash. Both are wrapped in a fragment now, and the toolbar no longer sticks to the screen on any device.
import fs from "node:fs";
const f = "src/pages/StaticNote.tsx";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const need = (x) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); };

need(": (\n            {examMode && !note.paper && (");
s = s.replace(": (\n            {examMode && !note.paper && (", ": (\n            <>\n            {examMode && !note.paper && (");
const art = s.indexOf("            <article style={note.paper ? undefined");
need("            <article style={note.paper ? undefined");
const close = s.indexOf("\n          )}", art);
if (close < 0) throw new Error("conditional end not found");
s = s.slice(0, close) + "\n            </>" + s.slice(close);
s = s.replace("match(/<h2[s>]/g)", "match(/<h2[\\s>]/g)");
s = s.replace("note-toolbar z-20 sm:sticky -mx-1 mb-5", "note-toolbar -mx-1 mb-5").replace(" print:hidden sm:top-[4.25rem]\"", " print:hidden\"");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("repaired");
