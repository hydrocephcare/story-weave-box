// year3-classify-fetch.mjs
// Read-only: fetches all Year 3 articles and saves raw data to year3-raw.json
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, category, unit, content, created_at')
    .ilike('category', 'Year 3%');

  if (error) {
    console.error('Error fetching articles:', error.message);
    process.exit(1);
  }

  console.log(`Fetched ${data.length} Year 3 articles.`);
  writeFileSync('year3-raw.json', JSON.stringify(data, null, 2));
  console.log('Saved to year3-raw.json');
}

main();
