// verify-counts.mjs — read-only. Replicates Blog.tsx's count logic against live
// data to check for the "Semester 3 == All Semesters" discrepancy reported.
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const YEAR3_SEMESTER = {
  "General Pathology": 1, "Oncopathology": 1, "Genetic Disorders": 1,
  "Histopathology & Cytopathology": 1, "Bacteriology": 1, "Parasitology": 1,
  "Nutrition and Dietetics": 1, "Basic Pharmacology I": 1,
  "Cardiovascular System Pathology": 2, "Respiratory System Pathology": 2,
  "Gastrointestinal Pathology": 2, "Female Reproductive System Pathology": 2,
  "Head & Neck Pathology": 2, "Endocrine and Metabolic Pathology": 2,
  "Research Methodology and Proposal Writing": 2, "Basic Pharmacology II": 2,
  "Neuropathology": 3, "Bone and Soft Tissue Pathology": 3, "Breast Pathology": 3,
  "Dermatopathology": 3, "Male Reproductive and Urinary System Pathology": 3,
  "Immunopathology": 3, "Medical Mycology": 3, "Medical Virology": 3,
  "Clinical Techniques": 3, "Introduction to Clinical Techniques": 3,
  "Spot/Practical Examination": 3, "Community Health": 3, "Basic Pharmacology III": 3,
};

function getCategoryDisplayName(category) {
  if (!category) return category;
  const parts = category.split(":");
  return parts.length > 1 ? parts[1].trim() : category;
}
function getYear3Semester(name) { return YEAR3_SEMESTER[name] ?? null; }

async function main() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, category')
    .eq('published', true)
    .like('category', 'Year 3:%');
  if (error) { console.error(error.message); return; }

  console.log('Total published Year 3 articles:', articles.length);

  // Replicate unitsForYear: group by raw category
  const unitsMap = new Map();
  articles.forEach(a => {
    if (!unitsMap.has(a.category)) unitsMap.set(a.category, []);
    unitsMap.get(a.category).push(a);
  });
  const unitsForYear = Array.from(unitsMap.entries()).map(([cat, arts]) => ({
    category: cat, name: getCategoryDisplayName(cat), count: arts.length,
  }));

  // Replicate year3SemesterCounts
  const counts = { "1": 0, "2": 0, "3": 0, other: 0 };
  unitsForYear.forEach(u => {
    const sem = getYear3Semester(u.name);
    counts[sem ? String(sem) : "other"] += u.count;
  });
  console.log('\nSemester tab counts (year3SemesterCounts):');
  console.log('  Semester 1:', counts["1"]);
  console.log('  Semester 2:', counts["2"]);
  console.log('  Semester 3:', counts["3"]);
  console.log('  Other Units:', counts.other);
  console.log('  SUM:', counts["1"] + counts["2"] + counts["3"] + counts.other, '(should equal total articles above)');

  // Replicate "All Units" chip count when no semester/unit selected (should be full total)
  console.log('\n"All Units" chip when no semester selected (filtered.length): should be', articles.length);

  // Replicate "All Units" chip when Semester 3 selected
  const sem3Units = unitsForYear.filter(u => getYear3Semester(u.name) === 3);
  const sem3Total = sem3Units.reduce((n, u) => n + u.count, 0);
  console.log('"All Units" chip when Semester 3 selected: should be', sem3Total);

  console.log('\nUnits with NO semester mapping (fall into Other Units):');
  unitsForYear.filter(u => !getYear3Semester(u.name)).forEach(u => console.log(' ', u.count, '|', u.name));
}
main();
