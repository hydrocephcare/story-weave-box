// year3-fix-category-collapse.mjs
// WRITES to the database. Fixes the bug from the Phase A migration: category was
// rewritten to "Year 3: <course_unit>" (identical for many subunits), but the site's
// actual display/filter code (getCategoryDisplayName, getAllCategories, Blog.tsx)
// only ever reads `category` as one combined string and never reads `unit`.
// This restores category = "Year 3: <subunit>" using the already-correct `unit`
// column value, which is what the frontend actually needs.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

function csvEscape(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

async function main() {
  const { data: rows, error } = await supabase
    .from('articles')
    .select('id, title, category, unit')
    .ilike('category', 'Year 3%');
  if (error) { console.error(error.message); return; }
  console.log(`Total Year 3 articles: ${rows.length}`);

  const toFix = rows.filter(r => r.unit && r.unit.trim());
  const toLeave = rows.filter(r => !r.unit || !r.unit.trim());
  console.log(`Rows with a unit value to restore into category: ${toFix.length}`);
  console.log(`Rows with no unit (left as-is - Reference/junk): ${toLeave.length}`);

  const test = toFix[0];
  const testTarget = `Year 3: ${test.unit}`;
  console.log(`\n--- Test write: "${test.title}" category "${test.category}" -> "${testTarget}" ---`);
  const { error: testErr } = await supabase.from('articles').update({ category: testTarget }).eq('id', test.id);
  if (testErr) { console.error('FATAL test write failed:', testErr.message); return; }
  const { data: verifyRow, error: verifyErr } = await supabase.from('articles').select('category').eq('id', test.id).single();
  if (verifyErr || verifyRow.category !== testTarget) {
    console.error('FATAL: test write did not verify.', verifyErr?.message, verifyRow);
    return;
  }
  console.log('Test write verified. Proceeding with the rest.\n');

  const log = [{ id: test.id, title: test.title, old_category: test.category, new_category: testTarget, status: 'success' }];
  let ok = 1, fail = 0;
  for (const row of toFix.slice(1)) {
    const target = `Year 3: ${row.unit}`;
    if (target === row.category) {
      log.push({ id: row.id, title: row.title, old_category: row.category, new_category: target, status: 'no-op (already correct)' });
      ok++;
      continue;
    }
    const { error: err } = await supabase.from('articles').update({ category: target }).eq('id', row.id);
    if (err) {
      fail++;
      log.push({ id: row.id, title: row.title, old_category: row.category, new_category: target, status: `FAILED: ${err.message}` });
      console.error(`  FAILED ${row.id}: ${err.message}`);
    } else {
      ok++;
      log.push({ id: row.id, title: row.title, old_category: row.category, new_category: target, status: 'success' });
    }
  }
  toLeave.forEach(row => {
    log.push({ id: row.id, title: row.title, old_category: row.category, new_category: '(unchanged - no unit)', status: 'skipped' });
  });

  const cols = ['id', 'title', 'old_category', 'new_category', 'status'];
  writeFileSync('year3-fix-collapse-log.csv', [cols.join(','), ...log.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n'));

  console.log(`\n=== DONE === updated: ${ok}, failed: ${fail}, left-as-is: ${toLeave.length}`);
  console.log('Log written to year3-fix-collapse-log.csv');
}
main();
