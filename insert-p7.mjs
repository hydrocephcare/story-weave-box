import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const mapping = JSON.parse(fs.readFileSync('r2-pat3-2015-mapping.json', 'utf8'));

let content = fs.readFileSync('content-drafts/pat3-2015-marathon.md', 'utf8');
content = content.replace(/__IMG:([^_]+)__/g, (m, relPath) => {
  const url = mapping[relPath];
  if (!url) throw new Error(`No URL for ${relPath}`);
  return url;
});
if (content.match(/__IMG:/g)) throw new Error('unresolved placeholders remain');

const row = {
  id: randomUUID(),
  title: 'PAT 3 Marathon — Lower Limb, Upper Limb, Spine & Histology (20 Nov 2015)',
  slug: 'pat-3-marathon-lower-upper-limb-spine-histology-2015',
  category: 'Year 1: Anatomy',
  unit: 'Anatomy',
  university: 'University of Nairobi',
  exam_type: 'SPOT',
  content,
  published: true,
  meta_title: 'PAT 3 Marathon — Lower/Upper Limb, Spine & Histology | Ompath Study',
  meta_description: 'University of Nairobi PAT 3 spot-question marathon, 20 November 2015: 40 questions spanning lower limb, upper limb, vertebral column, histology, genetics and embryology.',
  og_image_url: mapping['pat3-2015/q01.jpg'],
};

const { error } = await supabase.from('articles').insert(row);
if (error) { console.error('INSERT FAILED', error.message); process.exit(1); }
console.log('inserted', row.slug, `(${content.length} chars)`);
