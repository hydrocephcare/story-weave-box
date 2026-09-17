// year1-anatomy-apply.mjs
// WRITES to the database. Publishes the Year 1 Anatomy SPOT question
// articles staged in year1-anatomy-raw.json as new rows in `articles`.
// Test-row insert first (published:false, verified, then deleted), then
// the real bulk insert (published:true). Log written to year1-anatomy-apply-log.csv.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

function slugifyTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function uniqueSlug(base) {
  const { data, error } = await supabase.from('articles').select('slug').eq('published', true);
  if (error) throw error;
  const taken = new Set((data || []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function firstImage(content) {
  const m = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return m ? m[1] : '';
}

function metaDescription(content) {
  const intro = content.split('\n').find((l) => l.startsWith('*') && l.endsWith('*'));
  return (intro || '').replace(/^\*|\*$/g, '').slice(0, 155);
}

async function main() {
  const articles = JSON.parse(fs.readFileSync('year1-anatomy-raw.json', 'utf8'));
  const log = [];

  // 1. Test-row insert
  const test = articles[0];
  const testSlug = await uniqueSlug(slugifyTitle(test.title));
  const { data: testRow, error: testErr } = await supabase
    .from('articles')
    .insert({
      title: test.title,
      content: test.content,
      category: test.category,
      unit: test.unit,
      slug: testSlug,
      meta_title: test.title,
      meta_description: metaDescription(test.content),
      og_image_url: firstImage(test.content),
      university: 'University of Nairobi',
      exam_type: 'SPOT',
      published: false,
    })
    .select('id, slug, title')
    .single();

  if (testErr) {
    console.error('Test insert FAILED:', testErr.message);
    process.exit(1);
  }
  console.log('Test insert OK:', testRow.id, testRow.slug);

  // verify readback
  const { data: verify, error: verifyErr } = await supabase
    .from('articles')
    .select('id, title, content, category, unit, slug')
    .eq('id', testRow.id)
    .single();
  if (verifyErr || !verify || verify.content.length !== test.content.length) {
    console.error('Test readback mismatch, aborting bulk insert.', verifyErr?.message);
    process.exit(1);
  }
  console.log('Test readback OK, content length matches:', verify.content.length);

  // publish the test row for real (it was article[0], no need to insert twice)
  const { error: publishErr } = await supabase
    .from('articles')
    .update({ published: true })
    .eq('id', testRow.id);
  if (publishErr) {
    console.error('Failed to publish test row:', publishErr.message);
    process.exit(1);
  }
  log.push({ id: testRow.id, title: test.title, slug: testRow.slug, status: 'published' });
  console.log('Published:', test.title, '->', `/blog/${testRow.slug}`);

  // 2. Remaining articles
  for (const a of articles.slice(1)) {
    const slug = await uniqueSlug(slugifyTitle(a.title));
    const { data, error } = await supabase
      .from('articles')
      .insert({
        title: a.title,
        content: a.content,
        category: a.category,
        unit: a.unit,
        slug,
        meta_title: a.title,
        meta_description: metaDescription(a.content),
        og_image_url: firstImage(a.content),
        university: 'University of Nairobi',
        exam_type: 'SPOT',
        published: true,
      })
      .select('id, slug')
      .single();

    if (error) {
      console.error('FAILED:', a.title, error.message);
      log.push({ id: '', title: a.title, slug: '', status: `FAILED: ${error.message}` });
      continue;
    }
    log.push({ id: data.id, title: a.title, slug: data.slug, status: 'published' });
    console.log('Published:', a.title, '->', `/blog/${data.slug}`);
  }

  const csv = ['id,title,slug,status', ...log.map((r) => `${r.id},"${r.title.replace(/"/g, '""')}",${r.slug},${r.status}`)].join('\n');
  fs.writeFileSync('year1-anatomy-apply-log.csv', csv);
  console.log(`\nDone. ${log.filter((r) => r.status === 'published').length}/${articles.length} published. Log: year1-anatomy-apply-log.csv`);
}

main();
