import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const IMG_ROOT = 'public/images/year1/anatomy/aponeurosis-01';

async function uploadOne(localPath, filename, attempt = 1) {
  const buf = fs.readFileSync(localPath);
  const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
  try {
    const { data, error } = await supabase.functions.invoke('r2-upload', { body: { dataUrl, filename } });
    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || 'no url');
    return data.url;
  } catch (e) {
    if (attempt < 5) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return uploadOne(localPath, filename, attempt + 1);
    }
    throw e;
  }
}

async function main() {
  const log = JSON.parse(fs.readFileSync('r2-upload-log.json', 'utf8'));
  const mapping = JSON.parse(fs.readFileSync('r2-image-mapping.json', 'utf8'));
  const failed = log.filter(l => !l.ok);
  console.log(`Retrying ${failed.length} failed uploads...`);

  for (const item of failed) {
    const localPath = path.join(IMG_ROOT, item.paper, item.file);
    const oldRef = `/images/year1/anatomy/aponeurosis-01/${item.paper}/${item.file}`;
    try {
      const url = await uploadOne(localPath, `y1-anatomy-${item.paper}-${item.file}`);
      mapping[oldRef] = url;
      item.ok = true;
      item.url = url;
      delete item.error;
      process.stdout.write('.');
    } catch (e) {
      item.error = e.message;
      process.stdout.write('x');
    }
  }
  console.log('\n');

  fs.writeFileSync('r2-image-mapping.json', JSON.stringify(mapping, null, 2));
  fs.writeFileSync('r2-upload-log.json', JSON.stringify(log, null, 2));

  const stillFailed = log.filter(l => !l.ok);
  console.log(`Total uploaded: ${log.length - stillFailed.length}/${log.length}`);
  if (stillFailed.length) console.log('Still failed:', stillFailed.map(f => `${f.paper}/${f.file}`).join(', '));

  // Re-apply content replacement for pat3-2019 (the only article with newly recovered refs)
  const { data: article, error: fetchErr } = await supabase
    .from('articles')
    .select('id, content')
    .eq('slug', 'pat-iii-progress-assessment-test-8-november-2019')
    .single();
  if (fetchErr) { console.error('fetch:', fetchErr.message); return; }

  let newContent = article.content;
  let replaced = 0;
  for (const [oldRef, newUrl] of Object.entries(mapping)) {
    if (newContent.includes(oldRef)) {
      newContent = newContent.split(oldRef).join(newUrl);
      replaced++;
    }
  }
  const stillLocal = (newContent.match(/\(\/images\//g) || []).length;
  console.log(`pat3-2019: replaced ${replaced} more refs this pass, ${stillLocal} local refs remain`);

  if (replaced > 0) {
    const { error: updErr } = await supabase.from('articles').update({ content: newContent }).eq('id', article.id);
    if (updErr) console.error('update:', updErr.message);
    else console.log('pat3-2019 updated.');
  }
}

main();
