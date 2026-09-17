// pharm-fetch.mjs — read-only fetch of Year 3 Basic Pharmacology articles
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, category, unit, content')
    .eq('category', 'Year 3: Basic Pharmacology');
  if (error) { console.error(error.message); return; }
  console.log(`Fetched ${data.length} Basic Pharmacology articles.`);
  writeFileSync('pharm-raw.json', JSON.stringify(data, null, 2));
}
main();
