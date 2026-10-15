// One-off: study-time chart on /my-week, "My notes" under notes and topics (and on /saved), and the missing parts of the Understanding Psychosis PDF.
import fs from "node:fs";
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const out = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
}
const swap = (s, x, y) => { if (!s.includes(x)) throw new Error("missing: " + x.slice(0, 80)); return s.replace(x, y); };

edit("src/lib/readLog.ts", (s) => {
  if (s.includes("addStudySeconds")) return s;
  s = swap(s, 'import { useAuth } from "@/hooks/useAuth";', 'import { useAuth } from "@/hooks/useAuth";\nimport { addStudySeconds } from "@/lib/studyTime";');
  s = swap(s, "      secs += 5;\n", "      secs += 5;\n      addStudySeconds(uid, 5);\n");
  return s;
});

edit("src/pages/MyWeek.tsx", (s) => {
  if (s.includes("StudyTimeCard")) return s;
  const imp = s.indexOf('import { readsThisWeek } from "@/lib/readLog";');
  if (imp < 0) throw new Error("import not found");
  s = s.replace('import { readsThisWeek } from "@/lib/readLog";', 'import { readsThisWeek } from "@/lib/readLog";\nimport StudyTimeCard from "@/components/StudyTimeCard";');
  return swap(s, "\n      {due.length > 0 && (", "\n      <StudyTimeCard />\n\n      {due.length > 0 && (");
});

edit("src/pages/StaticNote.tsx", (s) => {
  if (s.includes("MyNotesBox")) return s;
  s = swap(s, 'import contentMarks from "@/data/contentMarks.json";', 'import contentMarks from "@/data/contentMarks.json";\nimport MyNotesBox from "@/components/MyNotesBox";');
  return swap(s, "          {!note.paper && <NoteComments slug={note.slug}", "          {!note.paper && <MyNotesBox title={note.title} />}\n          {!note.paper && <NoteComments slug={note.slug}");
});

edit("src/pages/TopicPage.tsx", (s) => {
  if (s.includes("MyNotesBox")) return s;
  s = swap(s, 'import SaveTopicButton from "@/components/SaveTopicButton";', 'import SaveTopicButton from "@/components/SaveTopicButton";\nimport MyNotesBox from "@/components/MyNotesBox";');
  return swap(s, "            {page && <HelpfulVote slug={slug} />}", "            {page && <HelpfulVote slug={slug} />}\n            {page && <MyNotesBox title={name} />}");
});

edit("src/pages/SavedPages.tsx", (s) => {
  if (s.includes("allMyNotes")) return s;
  s = swap(s, 'import { topicPath } from "@/lib/topics";', 'import { topicPath } from "@/lib/topics";\nimport { allMyNotes } from "@/lib/myNotes";');
  s = swap(s, "  const empty = !topics.length && !notes.length;", "  const mine = Object.entries(allMyNotes(user?.id)).sort((a, b) => b[1].at - a[1].at);\n  const empty = !topics.length && !notes.length && !mine.length;");
  return swap(s, "      {notes.length > 0 && (", [
    "      {mine.length > 0 && (",
    "        <section className=\"mt-8\">",
    "          <h2 className=\"font-serif text-2xl font-bold\">My notes</h2>",
    "          <ul className=\"mt-3 divide-y divide-border rounded-2xl border border-border\">",
    "            {mine.map(([path, n]) => (",
    "              <li key={path} className=\"px-4 py-3\"><Link to={path} className=\"font-semibold hover:underline\">{n.t}</Link><p className=\"mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground\">{n.text}</p></li>",
    "            ))}",
    "          </ul>",
    "        </section>",
    "      )}",
    "      {notes.length > 0 && (",
  ].join("\n"));
});

// the PDF's one-page summary ("Ten things to remember") and its further reading were not on the note yet
edit("src/content/notes/psychiatry-understanding-psychosis.md", (s) => {
  if (s.includes("Ten things to remember")) return s;
  s = swap(s, "## High-yield exam points\n", [
    "## Ten things to remember",
    "",
    "1. **Psychosis** = losing touch with reality without realising it.",
    "2. It is a **syndrome, not a diagnosis**: like fever, find the cause.",
    "3. **Kraepelin** = course. **Bleuler** = the name \"schizophrenia\" and the 4 As.",
    "4. **Jaspers** = describing symptoms; a delusion is certain, incorrigible and false.",
    "5. **Schneider** = first-rank symptoms. **Meyer** = the whole person. **Lambo** = community care.",
    "6. **DSM-5-TR**: five features. **APA and ICD-11**: impaired reality testing.",
    "7. A belief shared by the patient's **culture** is not a delusion.",
    "8. Kenya's **treatment gap is about 75%**. About half of Africans see a **healer first**.",
    "9. Healers are chosen for **beliefs, access, cost, trust and stigma**. Work with them, not against them.",
    "10. Today: **early help, genes plus environment, rule out medical causes, rights-based care**.",
    "",
    "## High-yield exam points",
    "",
  ].join("\n"));
  return swap(s, "*Prepared from Dr Kendi's class summary", [
    "**Further reading**: DSM-5-TR (APA, 2022) · ICD-11 (WHO) · NIMH, \"What is psychosis?\" · Burns and Tomita 2015, healers in the pathway to care in Africa · Gureje et al. 2020 (COSIMPO), *Lancet* · Kenya Mental Health (Amendment) Act 2022.",
    "",
    "*Prepared from Dr Kendi's class summary",
  ].join("\n"));
});
console.log("wired");
