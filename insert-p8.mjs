import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const mapping = JSON.parse(fs.readFileSync('r2-anatomy-spot-revision-mapping.json', 'utf8'));

let content = fs.readFileSync('content-drafts/anatomy-spot-revision.md', 'utf8');
content = content.replace(/__IMG:([^_]+)__/g, (m, relPath) => {
  const url = mapping[relPath];
  if (!url) throw new Error(`No URL for ${relPath}`);
  return url;
});
if (content.match(/__IMG:/g)) throw new Error('unresolved placeholders remain');

const row = {
  id: randomUUID(),
  title: 'Anatomy Spot Revision — Limb, Spine, Histology & Embryology',
  slug: 'anatomy-spot-revision-limb-spine-histology-embryology',
  category: 'Year 1: Anatomy',
  unit: 'Anatomy',
  university: 'University of Nairobi',
  exam_type: 'SPOT',
  content,
  published: true,
  meta_title: 'Anatomy Spot Revision — Limb, Spine, Histology & Embryology | Ompath Study',
  meta_description: 'Mohamed Onyango\'s Anatomy Spot Revision, 30 January 2021: 36 spot questions spanning lower limb, upper limb, spine, skull, histology, genetics and embryology, with inline answers.',
  og_image_url: mapping['anatomy-spot-revision/q01.jpg'],
};

const { error } = await supabase.from('articles').insert(row);
if (error) { console.error('INSERT FAILED', error.message); process.exit(1); }
console.log('inserted', row.slug, `(${content.length} chars)`);
