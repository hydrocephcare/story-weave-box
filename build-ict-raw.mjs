// build-ict-raw.mjs
// Builds ict-raw.json from the six markdown drafts in content-drafts/.
import fs from 'fs';

const articles = [
  {
    title: 'HIT100: Information Technology — Course Syllabus',
    slug: 'hit100-ict-course-syllabus',
    unit: 'HIT100',
    file: 'content-drafts/ict-syllabus.md',
  },
  {
    title: 'Internet Computing — HIT100 Course Notes',
    slug: 'hit100-internet-computing',
    unit: 'HIT100',
    file: 'content-drafts/ict-internet-computing.md',
  },
  {
    title: 'MS Word — HIT100 Course Notes',
    slug: 'hit100-ms-word',
    unit: 'HIT100',
    file: 'content-drafts/ict-ms-word.md',
  },
  {
    title: 'MS Excel — HIT100 Course Notes',
    slug: 'hit100-ms-excel',
    unit: 'HIT100',
    file: 'content-drafts/ict-ms-excel.md',
  },
  {
    title: 'SPSS Statistical Analysis — HIT100 Course Notes',
    slug: 'hit100-spss-statistical-analysis',
    unit: 'HIT100',
    file: 'content-drafts/ict-spss.md',
  },
  {
    title: 'HIT100 ICT Revision Questions & Answers — Past Papers Compilation',
    slug: 'hit100-ict-revision-questions-answers',
    unit: 'HIT100',
    file: 'content-drafts/ict-revision-qa.md',
  },
];

const raw = articles.map((a) => ({
  title: a.title,
  category: 'Year 1: ICT',
  unit: a.unit,
  slug: a.slug,
  content: fs.readFileSync(a.file, 'utf8'),
}));

fs.writeFileSync('ict-raw.json', JSON.stringify(raw, null, 2));
console.log(`Wrote ict-raw.json with ${raw.length} articles:`);
for (const a of raw) console.log(`  - ${a.title} (${a.content.length} chars)`);
