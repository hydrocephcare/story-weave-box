import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const mapping = JSON.parse(fs.readFileSync('r2-anatomy-marathon-1-mapping.json', 'utf8'));

let content = fs.readFileSync('content-drafts/anatomy-marathon-1.md', 'utf8');
content = content.replace(/__IMG:([^_]+)__/g, (m, relPath) => {
  const url = mapping[relPath];
  if (!url) throw new Error(`No URL for ${relPath}`);
  return url;
});
if (content.match(/__IMG:/g)) throw new Error('unresolved placeholders remain');

const row = {
  id: randomUUID(),
  title: 'Anatomy Marathon 1 — Lower Limb',
  slug: 'anatomy-marathon-1-lower-limb',
  category: 'Year 1: Anatomy',
  unit: 'Anatomy',
  university: 'University of Nairobi',
  exam_type: 'SPOT',
  content,
  published: true,
  meta_title: 'Anatomy Marathon 1 — Lower Limb',
  meta_description: "Revision set by Beda Otieno, Level V MBChB, sent 11 June 2017. 22 questions, lower limb focus.",
  og_image_url: mapping['anatomy-marathon-1/q01.jpg'],
};

const { error } = await supabase.from('articles').insert(row);
if (error) { console.error('INSERT FAILED', error.message); process.exit(1); }
console.log('inserted', row.slug, `(${content.length} chars)`);
