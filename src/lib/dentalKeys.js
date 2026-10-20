// One place that decides how a dental question is split into answerable units and what key each unit is stored under. Used by the site and by the seed
// script, so an answer written by the job always lands under the question it belongs to.
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

const sumMarks = (parts) => (parts || []).reduce((n, p) => n + (p.marks || 0) + sumMarks(p.parts), 0);
const lines = (parts, depth = 1) => (parts || []).map((p) => `${"   ".repeat(depth)}${p.l ? p.l + ") " : "- "}${p.text}${p.marks ? ` (${p.marks} marks)` : ""}${lines(p.parts, depth + 1) ? "\n" + lines(p.parts, depth + 1) : ""}`).join("\n");

/**
 * The answerable units of a question: the whole question when it has no parts, otherwise one unit per top-level lettered part (with its sub-parts).
 * Each unit: { key, label, marks, prompt } where prompt is what the answer writer is shown.
 */
export function answerUnits(q) {
  const stem = String(q.text || "").trim();
  if (!q.parts?.length) return [{ key: hash(norm(stem)), label: "", marks: q.marks || null, prompt: `${q.n ? q.n + ". " : ""}${stem}` }];
  return q.parts.map((p) => ({
    key: hash(norm(stem + (p.l || "") + p.text)), label: p.l || "", marks: (p.marks || 0) + sumMarks(p.parts) || null,
    prompt: `Question ${q.n || ""}: ${stem}\nANSWER THIS PART ONLY: ${p.l ? p.l + ") " : ""}${p.text}${p.marks ? ` (${p.marks} marks)` : ""}${p.parts?.length ? "\n" + lines(p.parts) : ""}`,
  }));
}
