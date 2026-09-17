// scan-and-classify-v2.mjs
// Read-only: does NOT touch the database.
// Sorts every article into one of five buckets and writes a CSV for each:
//   - clean-mapping.csv    -> confident year/unit assignments
//   - personal.csv         -> "Stories" posts, kept outside Year/Semester
//   - reference.csv        -> Exam Timetable notes, not treated as a unit
//   - reassign-year5.csv   -> mislabeled "Year 5" notes, moved to Year 3 (unit needs confirming from content)
//   - needs-review.csv     -> everything else that's genuinely ambiguous

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const YEAR_PATTERN = /^Year\s*(\d+)\s*:\s*(.+)$/i;

// Exact-match junk unit names (not substrings, to avoid false positives like "General Pathology")
const JUNK_UNITS = new Set([
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'test me', 'general'
]);

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function toCsv(rows, columns) {
  if (rows.length === 0) return columns.join(',');
  const header = columns.join(',');
  const lines = rows.map(row => columns.map(col => csvEscape(row[col])).join(','));
  return [header, ...lines].join('\n');
}

async function main() {
  console.log('Fetching all articles...\n');

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, category, unit, content');

  if (error) {
    console.error('Error fetching articles:', error.message);
    return;
  }

  console.log(`Fetched ${data.length} articles. Sorting...\n`);

  const clean = [];
  const personal = [];
  const reference = [];
  const reassignYear5 = [];
  const needsReview = [];

  for (const note of data) {
    const category = (note.category || '').trim();

    // Bucket: Personal stories
    if (category.toLowerCase() === 'stories') {
      personal.push({ id: note.id, title: note.title, category: note.category });
      continue;
    }

    const match = category.match(YEAR_PATTERN);

    if (!match) {
      needsReview.push({
        id: note.id,
        title: note.title,
        category: note.category,
        reason: 'No "Year N:" prefix found in category',
      });
      continue;
    }

    const year = parseInt(match[1], 10);
    const unit = match[2].trim();
    const unitLower = unit.toLowerCase();

    // Bucket: Exam Timetable -> reference, regardless of year
    if (unitLower.includes('exam timetable')) {
      reference.push({ id: note.id, title: note.title, category: note.category });
      continue;
    }

    // Bucket: mislabeled Year 5 -> reassign to Year 3, but flag unit for confirmation
    if (year === 5) {
      reassignYear5.push({
        id: note.id,
        title: note.title,
        old_category: note.category,
        content_preview: (note.content || '').slice(0, 150).replace(/\n/g, ' '),
      });
      continue;
    }

    if (year < 1 || year > 3) {
      needsReview.push({
        id: note.id,
        title: note.title,
        category: note.category,
        reason: `Year ${year} is outside expected range 1-3`,
      });
      continue;
    }

    // Bucket: genuinely junk/ambiguous unit names (exact match only)
    if (JUNK_UNITS.has(unitLower)) {
      needsReview.push({
        id: note.id,
        title: note.title,
        category: note.category,
        reason: `Unit "${unit}" is not a real academic unit name -- needs content-based classification`,
      });
      continue;
    }

    // Everything else: confident clean match
    clean.push({
      id: note.id,
      title: note.title,
      year: year,
      unit: unit,
      original_category: note.category,
    });
  }

  writeFileSync('clean-mapping.csv', toCsv(clean, ['id', 'title', 'year', 'unit', 'original_category']));
  writeFileSync('personal.csv', toCsv(personal, ['id', 'title', 'category']));
  writeFileSync('reference.csv', toCsv(reference, ['id', 'title', 'category']));
  writeFileSync('reassign-year5.csv', toCsv(reassignYear5, ['id', 'title', 'old_category', 'content_preview']));
  writeFileSync('needs-review.csv', toCsv(needsReview, ['id', 'title', 'category', 'reason']));

  console.log(`Clean (confident):     ${clean.length}`);
  console.log(`Personal (Stories):    ${personal.length}`);
  console.log(`Reference (Timetable): ${reference.length}`);
  console.log(`Reassign (was Year 5): ${reassignYear5.length}`);
  console.log(`Needs review:          ${needsReview.length}`);
  console.log(`Total:                 ${clean.length + personal.length + reference.length + reassignYear5.length + needsReview.length} (should equal ${data.length})`);
  console.log('\n5 CSV files written to this folder.\n');

  const unitsByYear = {};
  for (const row of clean) {
    if (!unitsByYear[row.year]) unitsByYear[row.year] = new Set();
    unitsByYear[row.year].add(row.unit);
  }
  for (const year of Object.keys(unitsByYear).sort()) {
    console.log(`--- Year ${year} unique units (${unitsByYear[year].size}) ---`);
    [...unitsByYear[year]].sort().forEach(u => console.log(`  - ${u}`));
    console.log('');
  }
}

main();
