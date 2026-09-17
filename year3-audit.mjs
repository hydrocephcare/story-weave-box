// year3-audit.mjs
// Read-only: does NOT touch the database.
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, category, unit, og_image_url, featured_image, published')
    .ilike('category', 'Year 3%');
  if (error) { console.error(error.message); return; }
  console.log(`Total Year 3 articles: ${data.length}\n`);

  const byUnit = {};
  for (const row of data) {
    const u = row.unit || '(no unit)';
    if (!byUnit[u]) byUnit[u] = [];
    byUnit[u].push(row);
  }
  const sorted = Object.entries(byUnit).sort((a, b) => b[1].length - a[1].length);
  for (const [unit, rows] of sorted) {
    console.log(`--- ${unit} (${rows.length}) ---`);
  }

  const noImg = data.filter(r => !r.og_image_url && !r.featured_image);
  console.log(`\nArticles with NO og_image_url and NO featured_image: ${noImg.length} / ${data.length}`);
}
main();
