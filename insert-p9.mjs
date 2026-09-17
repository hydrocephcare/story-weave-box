import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const mapping = JSON.parse(fs.readFileSync('r2-limb-anatomy-revision-mapping.json', 'utf8'));

let content = fs.readFileSync('content-drafts/limb-anatomy-revision.md', 'utf8');
content = content.replace(/__IMG:([^_]+)__/g, (m, relPath) => {
  const url = mapping[relPath];
  if (!url) throw new Error(`No URL for ${relPath}`);
  return url;
});
if (content.match(/__IMG:/g)) throw new Error('unresolved placeholders remain');

const row = {
  id: randomUUID(),
  title: 'Limb Anatomy Revision — Lower & Upper Limb Lecture Notes',
  slug: 'limb-anatomy-revision-lower-upper-limb-lecture-notes',
  category: 'Year 1: Anatomy',
  unit: 'Anatomy',
  university: 'University of Nairobi',
  exam_type: 'Lecture Notes',
  content,
  published: true,
  meta_title: 'Limb Anatomy Revision — Lower & Upper Limb Lecture Notes | Ompath Study',
  meta_description: 'Dr. Anne Pulei\'s Limb Anatomy Revision lecture: labelled reference diagrams for the lower and upper limb plus a consolidated practice-question set with answers.',
  og_image_url: mapping['limb-anatomy-revision/hamstrings.jpg'],
};

const { error } = await supabase.from('articles').insert(row);
if (error) { console.error('INSERT FAILED', error.message); process.exit(1); }
console.log('inserted', row.slug, `(${content.length} chars)`);
