// ict-apply.mjs
// WRITES to the database. Publishes the Year 1 ICT (HIT100) articles staged
// in ict-raw.json as new rows in `articles`.
// Test-row insert first (published:false, verified, then deleted), then
// the real bulk insert (published:true). Log written to ict-apply-log.csv.

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

async function insertRow(article, published, slug) {
  return supabase
    .from('articles')
    .insert({
      title: article.title,
      content: article.content,
      category: article.category,
      unit: article.unit,
      slug,
      meta_title: article.title,
      meta_description: metaDescription(article.content),
      og_image_url: firstImage(article.content),
      university: 'University of Nairobi',
      exam_type: 'SPOT',
      published,
    })
    .select('id, slug, title')
    .single();
}

async function main() {
  const articles = JSON.parse(fs.readFileSync('ict-raw.json', 'utf8'));
  const log = [];

  // 1. Test-row insert (published:false)
  const test = articles[0];
  const testSlug = await uniqueSlug(slugifyTitle(test.title));
  const { data: testRow, error: testErr } = await insertRow(test, false, testSlug);

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

  // delete the test row (published:false, draft only)
  const { error: delErr } = await supabase.from('articles').delete().eq('id', testRow.id);
  if (delErr) {
    console.error('Failed to delete test row:', delErr.message);
    process.exit(1);
  }
  log.push({ id: '', title: test.title, slug: testSlug, status: 'test-deleted' });
  console.log('Test row deleted:', test.title);

  // 2. Real bulk insert (published:true)
  for (const a of articles) {
    const slug = await uniqueSlug(slugifyTitle(a.title));
    const { data, error } = await insertRow(a, true, slug);

    if (error) {
      console.error('FAILED:', a.title, error.message);
      log.push({ id: '', title: a.title, slug: '', status: `FAILED: ${error.message}` });
      continue;
    }
    log.push({ id: data.id, title: a.title, slug: data.slug, status: 'published' });
    console.log('Published:', a.title, '->', `/blog/${data.slug}`);
  }

  const csv = ['id,title,slug,status', ...log.map((r) => `${r.id},"${r.title.replace(/"/g, '""')}",${r.slug},${r.status}`)].join('\n');
  fs.writeFileSync('ict-apply-log.csv', csv);
  console.log(`\nDone. ${log.filter((r) => r.status === 'published').length}/${articles.length} published. Log: ict-apply-log.csv`);
}

main();
