// sample-content.mjs
// Read-only: pulls 10 notes with FULL content so we can manually inspect
// what's actually inside them before deciding on categorization logic.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Change this number if you want more/fewer notes
const SAMPLE_SIZE = 10;

// Optional: filter to a specific existing category to test on a focused batch.
// Leave as null to just grab the first N notes in the table.
const FILTER_CATEGORY = null; // e.g. 'Year 3: General Pathology'

async function main() {
  let query = supabase
    .from('articles')
    .select('id, title, category, unit, exam_year, content, original_notes, tags')
    .limit(SAMPLE_SIZE);

  if (FILTER_CATEGORY) {
    query = query.eq('category', FILTER_CATEGORY);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  data.forEach((note, i) => {
    console.log('='.repeat(80));
    console.log(`NOTE ${i + 1}  |  id: ${note.id}`);
    console.log(`Title:    ${note.title}`);
    console.log(`Category: ${note.category}`);
    console.log(`Unit:     ${note.unit}`);
    console.log(`Tags:     ${JSON.stringify(note.tags)}`);
    console.log('-'.repeat(80));
    const content = note.content || '(no content field)';
    // Print first ~600 characters so we get a real feel for it without flooding the terminal
    console.log(content.slice(0, 600));
    if (content.length > 600) console.log(`\n...[truncated, ${content.length} total characters]`);
    console.log('');
  });

  console.log('='.repeat(80));
  console.log(`Shown ${data.length} of requested ${SAMPLE_SIZE} notes.`);
}

main();
