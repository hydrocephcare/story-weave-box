// fix-slug-collisions.mjs
// WRITES to the database. Finds published records across articles/mcq_sets/
// flashcard_sets/stories whose PUBLIC (cleaned) slug collides with another
// record's, and appends a disambiguating "-2", "-3", etc. to all but the
// oldest record in each collision group, so every record gets its own
// reachable canonical URL. Test-write first, then bulk, full log.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

// Mirrors src/lib/store.ts's cleanPublicSlug + slugifyTitle
function slugifyTitle(title) {
  return (title || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function cleanPublicSlug(rawSlug, fallbackTitle, fallback = 'study') {
  const base = (rawSlug || slugifyTitle(fallbackTitle) || fallback).trim().toLowerCase();
  return base
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
    .replace(/-[0-9a-f]{6}$/i, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

const TABLES = [
  { name: 'articles', fallback: 'article' },
  { name: 'mcq_sets', fallback: 'quiz' },
  { name: 'flashcard_sets', fallback: 'flashcards' },
  { name: 'stories', fallback: 'story' },
];

function csvEscape(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

async function main() {
  const allFixes = []; // { table, id, title, old_slug, new_slug, clean_slug }

  for (const { name: table, fallback } of TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('id, title, slug, created_at, published')
      .eq('published', true);
    if (error) { console.error(table, error.message); continue; }

    const groups = new Map(); // cleanSlug -> rows[]
    data.forEach(r => {
      const clean = cleanPublicSlug(r.slug || '', r.title, fallback);
      if (!groups.has(clean)) groups.set(clean, []);
      groups.get(clean).push({ ...r, clean });
    });

    for (const [clean, rows] of groups.entries()) {
      if (rows.length < 2) continue;
      // Keep the oldest (first created) untouched; disambiguate the rest.
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const newSlug = `${clean}-${i + 1}`;
        allFixes.push({
          table, id: row.id, title: row.title,
          old_slug: row.slug || '', new_slug: newSlug, clean_slug: clean,
        });
      }
    }
  }

  console.log(`Total collision fixes needed: ${allFixes.length}`);
  const byTable = {};
  allFixes.forEach(f => { byTable[f.table] = (byTable[f.table] || 0) + 1; });
  console.log(byTable);

  if (allFixes.length === 0) { console.log('Nothing to fix.'); return; }

  // Test write
  const test = allFixes[0];
  console.log(`\n--- Test write: [${test.table}] "${test.title}" slug "${test.old_slug}" -> "${test.new_slug}" ---`);
  const { error: testErr } = await supabase.from(test.table).update({ slug: test.new_slug }).eq('id', test.id);
  if (testErr) { console.error('FATAL test write failed:', testErr.message); return; }
  const { data: verifyRow, error: verifyErr } = await supabase.from(test.table).select('slug').eq('id', test.id).single();
  if (verifyErr || verifyRow.slug !== test.new_slug) {
    console.error('FATAL: test write did not verify.', verifyErr?.message, verifyRow);
    return;
  }
  console.log('Test write verified. Proceeding with the rest.\n');

  const log = [{ ...test, status: 'success' }];
  let ok = 1, fail = 0;
  for (const fix of allFixes.slice(1)) {
    const { error: err } = await supabase.from(fix.table).update({ slug: fix.new_slug }).eq('id', fix.id);
    if (err) {
      fail++;
      log.push({ ...fix, status: `FAILED: ${err.message}` });
      console.error(`  FAILED [${fix.table}] ${fix.id}: ${err.message}`);
    } else {
      ok++;
      log.push({ ...fix, status: 'success' });
    }
  }

  const cols = ['table', 'id', 'title', 'old_slug', 'new_slug', 'clean_slug', 'status'];
  writeFileSync('slug-collision-fix-log.csv', [cols.join(','), ...log.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n'));

  console.log(`\n=== DONE === updated: ${ok}, failed: ${fail}`);
  console.log('Log written to slug-collision-fix-log.csv');
}
main();
