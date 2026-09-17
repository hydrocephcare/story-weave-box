// scan-and-classify.mjs
// Read-only: does NOT touch the database.
// Fetches ALL articles, parses `category` into year + unit where possible,
// and writes two CSV files for you to review:
//   - clean-mapping.csv   -> confident year/unit assignments
//   - needs-review.csv    -> anything that didn't fit the pattern, with a reason

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Matches "Year 3: Something", "Year 3 : Something", "Year 3:Something"
const YEAR_PATTERN = /^Year\s*(\d+)\s*:\s*(.+)$/i;

// Categories/units that look like they aren't real academic units.
// This is just a heuristic flag for YOUR review -- nothing gets decided automatically.
const SUSPICIOUS_UNIT_WORDS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'test me', 'stories', 'exam timetable', 'general'
];

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const lines = rows.map(row => columns.map(col => csvEscape(row[col])).join(','));
  return [header, ...lines].join('\n');
}

async function main() {
  console.log('Fetching all articles...\n');

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, category, unit, exam_year, content');

  if (error) {
    console.error('Error fetching articles:', error.message);
    return;
  }

  console.log(`Fetched ${data.length} articles. Parsing...\n`);

  const clean = [];
  const needsReview = [];

  for (const note of data) {
    const category = (note.category || '').trim();
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

    if (year < 1 || year > 3) {
      needsReview.push({
        id: note.id,
        title: note.title,
        category: note.category,
        reason: `Year ${year} is outside expected range 1-3`,
      });
      continue;
    }

    const unitLower = unit.toLowerCase();
    const suspicious = SUSPICIOUS_UNIT_WORDS.some(word => unitLower.includes(word));
    if (suspicious) {
      needsReview.push({
        id: note.id,
        title: note.title,
        category: note.category,
        reason: `Unit "${unit}" looks like it may not be a real academic unit`,
      });
      continue;
    }

    clean.push({
      id: note.id,
      title: note.title,
      year: year,
      unit: unit,
      original_category: note.category,
    });
  }

  // Write CSVs
  writeFileSync(
    'clean-mapping.csv',
    toCsv(clean, ['id', 'title', 'year', 'unit', 'original_category'])
  );
  writeFileSync(
    'needs-review.csv',
    toCsv(needsReview, ['id', 'title', 'category', 'reason'])
  );

  // Summary
  console.log(`Confidently classified: ${clean.length}`);
  console.log(`Needs your review:      ${needsReview.length}`);
  console.log('\nWritten to clean-mapping.csv and needs-review.csv in this folder.\n');

  // Unique units per year, for the semester-mapping step next
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
