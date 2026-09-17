// check-notes.mjs
// Read-only test: connects to Supabase and reports on the articles table.
// Does NOT edit or delete anything.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('Connecting to Supabase...\n');

  // 1. Total row count
  const { count, error: countError } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error counting rows:', countError.message);
    return;
  }
  console.log(`Total articles visible to this key: ${count}\n`);

  // 2. Breakdown by exam_year
  const { data: yearData, error: yearError } = await supabase
    .from('articles')
    .select('exam_year');

  if (yearError) {
    console.error('Error fetching exam_year breakdown:', yearError.message);
  } else {
    const counts = {};
    for (const row of yearData) {
      const key = row.exam_year || '(empty)';
      counts[key] = (counts[key] || 0) + 1;
    }
    console.log('Breakdown by exam_year:');
    console.table(counts);
  }

  // 3. Breakdown by category
  const { data: catData, error: catError } = await supabase
    .from('articles')
    .select('category');

  if (!catError) {
    const counts = {};
    for (const row of catData) {
      const key = row.category || '(empty)';
      counts[key] = (counts[key] || 0) + 1;
    }
    console.log('Breakdown by category:');
    console.table(counts);
  }

  // 4. How many have empty/very short content
  const { data: contentData, error: contentError } = await supabase
    .from('articles')
    .select('id, title, content');

  if (!contentError) {
    const empty = contentData.filter(r => !r.content || r.content.trim().length < 20);
    console.log(`Articles with little/no content (under 20 chars): ${empty.length}`);
    console.log('Examples:');
    empty.slice(0, 10).forEach(r => console.log(`  - [${r.id}] ${r.title}`));
  }

  // 5. Sample of 5 titles so we can eyeball the mess
  const { data: sample, error: sampleError } = await supabase
    .from('articles')
    .select('id, title, exam_year, unit, category, published')
    .limit(5);

  if (!sampleError) {
    console.log('\nSample of 5 articles (raw):');
    console.table(sample);
  }
}

main();
