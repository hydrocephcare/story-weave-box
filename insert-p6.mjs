import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const mapping = JSON.parse(fs.readFileSync('r2-week-12-review-mapping.json', 'utf8'));

let content = fs.readFileSync('content-drafts/week-12-review.md', 'utf8');
content = content.replace(/__IMG:([^_]+)__/g, (m, relPath) => {
  const url = mapping[relPath];
  if (!url) throw new Error(`No URL for ${relPath}`);
  return url;
});
if (content.match(/__IMG:/g)) throw new Error('unresolved placeholders remain');

const row = {
  id: randomUUID(),
  title: 'Week 12 Review — Skin, Embryology, Spine & Skull',
  slug: 'week-12-review-skin-embryology-spine-skull',
  category: 'Year 1: Anatomy',
  unit: 'Anatomy',
  university: 'University of Nairobi',
  exam_type: 'SPOT',
  content,
  published: true,
  meta_title: 'Week 12 Review — Skin, Embryology, Spine & Skull | Ompath Study',
  meta_description: 'Dr. Beda Olabu\'s Week 12 revision marathon: 20 spot questions on skin/breast histology, embryology, vertebral column, and skull/scalp anatomy, plus a bonus spinal cord essay outline.',
  og_image_url: mapping['week-12-review/q01.jpg'],
};

const { error } = await supabase.from('articles').insert(row);
if (error) { console.error('INSERT FAILED', error.message); process.exit(1); }
console.log('inserted', row.slug, `(${content.length} chars)`);
