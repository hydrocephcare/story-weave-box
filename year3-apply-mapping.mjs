// year3-apply-mapping.mjs
// WRITES to the database. Applies year3-final-mapping.csv to articles.category/unit.
// Does a single-row test write first, verifies it, then applies the rest.
// Writes a full change log to year3-update-log.csv.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const n = text.length;
  let field = '';
  let row = [];
  let inQuotes = false;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++; continue;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter(r => r.length === header.length).map(r => {
    const obj = {};
    header.forEach((h, idx) => obj[h] = r[idx]);
    return obj;
  });
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  return `"${String(v).replace(/"/g, '""')}"`;
}
function toCsv(rows, cols) {
  return [cols.join(','), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n');
}

async function main() {
  const csvText = readFileSync('year3-final-mapping.csv', 'utf8');
  const mapping = parseCsv(csvText);
  console.log(`Loaded ${mapping.length} mapping rows.\n`);

  // Resolve each row's target category/unit (null = leave untouched / skip)
  const plan = mapping.map(r => {
    if (r.bucket === 'junk') {
      return { ...r, skip: true, skipReason: 'junk bucket - left untouched, flag for manual deletion' };
    }
    if (r.bucket === 'reference') {
      return { ...r, targetCategory: 'Year 3: Reference', targetUnit: null, skip: false };
    }
    return { ...r, targetCategory: r.new_category, targetUnit: r.new_unit || null, skip: false };
  });

  const toWrite = plan.filter(r => !r.skip);
  const toSkip = plan.filter(r => r.skip);
  console.log(`Rows to write: ${toWrite.length}`);
  console.log(`Rows skipped (junk): ${toSkip.length}`);
  toSkip.forEach(r => console.log(`  SKIP ${r.id} - "${r.title}" (${r.skipReason})`));

  // --- Single-row test write ---
  const testRow = toWrite[0];
  console.log(`\n--- Test write: id=${testRow.id} "${testRow.title}" ---`);
  console.log(`  category: "${testRow.old_category}" -> "${testRow.targetCategory}"`);
  console.log(`  unit:     "${testRow.old_unit}" -> "${testRow.targetUnit}"`);

  const { data: beforeRow, error: beforeErr } = await supabase
    .from('articles').select('id, category, unit').eq('id', testRow.id).single();
  if (beforeErr) { console.error('FATAL: could not read test row before write:', beforeErr.message); return; }

  const { error: testErr } = await supabase
    .from('articles')
    .update({ category: testRow.targetCategory, unit: testRow.targetUnit })
    .eq('id', testRow.id);
  if (testErr) { console.error('FATAL: test write failed:', testErr.message); return; }

  const { data: afterRow, error: afterErr } = await supabase
    .from('articles').select('id, category, unit').eq('id', testRow.id).single();
  if (afterErr) { console.error('FATAL: could not verify test row after write:', afterErr.message); return; }

  if (afterRow.category !== testRow.targetCategory || (afterRow.unit || null) !== (testRow.targetUnit || null)) {
    console.error('FATAL: test row did not verify correctly after write. Aborting bulk update.');
    console.error('Before:', beforeRow, 'After:', afterRow);
    return;
  }
  console.log('Test write verified successfully. Proceeding with bulk update.\n');

  // --- Bulk write (remaining rows) ---
  const remaining = toWrite.slice(1);
  const log = [{
    id: testRow.id, title: testRow.title,
    old_category: testRow.old_category, old_unit: testRow.old_unit,
    new_category: testRow.targetCategory, new_unit: testRow.targetUnit,
    status: 'success'
  }];

  let successCount = 1;
  let failCount = 0;
  for (const row of remaining) {
    const { error } = await supabase
      .from('articles')
      .update({ category: row.targetCategory, unit: row.targetUnit })
      .eq('id', row.id);
    if (error) {
      failCount++;
      log.push({
        id: row.id, title: row.title,
        old_category: row.old_category, old_unit: row.old_unit,
        new_category: row.targetCategory, new_unit: row.targetUnit,
        status: `FAILED: ${error.message}`
      });
      console.error(`  FAILED ${row.id} "${row.title}": ${error.message}`);
    } else {
      successCount++;
      log.push({
        id: row.id, title: row.title,
        old_category: row.old_category, old_unit: row.old_unit,
        new_category: row.targetCategory, new_unit: row.targetUnit,
        status: 'success'
      });
    }
  }

  for (const row of toSkip) {
    log.push({
      id: row.id, title: row.title,
      old_category: row.old_category, old_unit: row.old_unit,
      new_category: '(unchanged)', new_unit: '(unchanged)',
      status: `skipped: ${row.skipReason}`
    });
  }

  writeFileSync('year3-update-log.csv', toCsv(log, ['id', 'title', 'old_category', 'old_unit', 'new_category', 'new_unit', 'status']));

  console.log(`\n=== DONE ===`);
  console.log(`Successfully updated: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Skipped (junk): ${toSkip.length}`);
  console.log(`Full change log written to year3-update-log.csv`);
}

main();
