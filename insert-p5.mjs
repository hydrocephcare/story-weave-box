import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const mapping = JSON.parse(fs.readFileSync('r2-pat8-2012-mapping.json', 'utf8'));

let content = fs.readFileSync('content-drafts/pat8-2012.md', 'utf8');
content = content.replace(/__IMG:([^_]+)__/g, (m, relPath) => {
  const url = mapping[relPath];
  if (!url) throw new Error(`No URL for ${relPath}`);
  return url;
});
if (content.match(/__IMG:/g)) throw new Error('unresolved placeholders remain');

const row = {
  id: randomUUID(),
  title: 'PAT 8 — Slideshow (2 March 2012)',
  slug: 'pat-8-slideshow-2-march-2012',
  category: 'Year 1: Anatomy',
  unit: 'Anatomy',
  university: 'University of Nairobi',
  exam_type: 'SPOT',
  content,
  published: true,
  meta_title: 'PAT 8 — Slideshow (2 March 2012)',
  meta_description: 'Progress Assessment Test, Dept. of Human Anatomy, University of Nairobi. Questions 12-40, upper limb, spine, histology and embryology.',
  og_image_url: mapping['pat8-2012/q12.jpg'],
};

const { error } = await supabase.from('articles').insert(row);
if (error) { console.error('INSERT FAILED', error.message); process.exit(1); }
console.log('inserted', row.slug, `(${content.length} chars)`);
