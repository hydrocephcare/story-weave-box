import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const OLD_SLUGS = [
  'sdl-revision-mock-marathon-upper-limb-histology-and-embryology',
  'pat-iii-progress-assessment-test-8-november-2019',
  'embryology-slide-review-marathon',
  'anatomy-marathon-1-lower-limb',
  'pat-8-slideshow-2-march-2012',
  'week-12-review-skin-embryology-spine-skull',
  'pat-3-marathon-lower-upper-limb-spine-histology-2015',
  'anatomy-spot-revision-limb-spine-histology-embryology',
];

async function softDeleteOld() {
  for (const slug of OLD_SLUGS) {
    const { error } = await supabase.from('articles').update({ deleted_at: new Date().toISOString() }).eq('slug', slug);
    if (error) { console.error('DELETE FAILED', slug, error.message); process.exit(1); }
    console.log('soft-deleted', slug);
  }
}

const NEW_ARTICLES = [
  {
    file: 'merged/anatomy.md',
    title: 'Aponeurosis — Anatomy Question Bank',
    slug: 'aponeurosis-anatomy-question-bank',
    unit: 'Aponeurosis - Anatomy',
    og_image_key: null, // filled from first image in file
    meta_title: 'Aponeurosis — Anatomy Question Bank | Ompath Study',
    meta_description: 'A consolidated Year 1 anatomy spot-question bank organised by body region: pelvis, thigh, knee, leg, foot, spine, skull, breast, shoulder, arm, forearm and hand.',
  },
  {
    file: 'merged/histology.md',
    title: 'Aponeurosis — Histology Question Bank',
    slug: 'aponeurosis-histology-question-bank',
    unit: 'Aponeurosis - Histology',
    meta_title: 'Aponeurosis — Histology Question Bank | Ompath Study',
    meta_description: 'A consolidated Year 1 histology spot-question bank organised by tissue type: cytology, epithelium, connective tissue, cartilage, bone, muscle, nervous and reproductive histology.',
  },
  {
    file: 'merged/embryology.md',
    title: 'Aponeurosis — Embryology Question Bank',
    slug: 'aponeurosis-embryology-question-bank',
    unit: 'Aponeurosis - Embryology',
    meta_title: 'Aponeurosis — Embryology Question Bank | Ompath Study',
    meta_description: 'A consolidated Year 1 embryology spot-question bank organised by developmental topic: gametogenesis, fertilization, fetal membranes, placenta, folding, and neural tube development.',
  },
];

async function insertNew() {
  for (const a of NEW_ARTICLES) {
    const content = fs.readFileSync(a.file, 'utf8');
    const firstImg = content.match(/!\[[^\]]*\]\((\S+?)\)/);
    const row = {
      id: randomUUID(),
      title: a.title,
      slug: a.slug,
      category: `Year 1: ${a.unit}`,
      unit: a.unit,
      university: 'University of Nairobi',
      exam_type: 'SPOT',
      content,
      published: true,
      meta_title: a.meta_title,
      meta_description: a.meta_description,
      og_image_url: firstImg ? firstImg[1] : null,
    };
    const { error } = await supabase.from('articles').insert(row);
    if (error) { console.error('INSERT FAILED', a.slug, error.message); process.exit(1); }
    console.log('inserted', a.slug, `(${content.length} chars)`);
  }
}

await softDeleteOld();
await insertNew();
