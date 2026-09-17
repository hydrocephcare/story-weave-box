import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const PAPERS = [
  { slug: 'sdl-revision-mock-marathon-upper-limb-histology-and-embryology', dir: 'sdl-mock-marathon' },
  { slug: 'pat-iii-progress-assessment-test-8-november-2019', dir: 'pat3-2019' },
  { slug: 'embryology-slide-review-marathon', dir: 'embryology-slide-review' },
];

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
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
      return uploadOne(localPath, filename, attempt + 1);
    }
    throw e;
  }
}

async function main() {
  const mapping = {}; // old relative path -> new R2 url
  const log = [];

  for (const paper of PAPERS) {
    const dir = path.join(IMG_ROOT, paper.dir);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort();
    console.log(`\n${paper.dir}: ${files.length} images`);
    for (const file of files) {
      const localPath = path.join(dir, file);
      const oldRef = `/images/year1/anatomy/aponeurosis-01/${paper.dir}/${file}`;
      try {
        const url = await uploadOne(localPath, `y1-anatomy-${paper.dir}-${file}`);
        mapping[oldRef] = url;
        log.push({ paper: paper.dir, file, url, ok: true });
        process.stdout.write('.');
      } catch (e) {
        log.push({ paper: paper.dir, file, error: e.message, ok: false });
        process.stdout.write('x');
      }
    }
  }
  console.log('\n');

  fs.writeFileSync('r2-image-mapping.json', JSON.stringify(mapping, null, 2));
  fs.writeFileSync('r2-upload-log.json', JSON.stringify(log, null, 2));

  const failed = log.filter(l => !l.ok);
  console.log(`Uploaded: ${log.length - failed.length}/${log.length}`);
  if (failed.length) console.log('Failed:', failed.map(f => `${f.paper}/${f.file}: ${f.error}`).join('\n'));

  // Now rewrite article content in the DB
  for (const paper of PAPERS) {
    const { data: article, error: fetchErr } = await supabase
      .from('articles')
      .select('id, content')
      .eq('slug', paper.slug)
      .single();
    if (fetchErr) { console.error(`fetch ${paper.slug}:`, fetchErr.message); continue; }

    let newContent = article.content;
    let replaced = 0;
    for (const [oldRef, newUrl] of Object.entries(mapping)) {
      if (newContent.includes(oldRef)) {
        newContent = newContent.split(oldRef).join(newUrl);
        replaced++;
      }
    }
    if (replaced === 0) { console.log(`${paper.slug}: no matching image refs found`); continue; }

    const { error: updErr } = await supabase.from('articles').update({ content: newContent }).eq('id', article.id);
    if (updErr) { console.error(`update ${paper.slug}:`, updErr.message); continue; }
    console.log(`${paper.slug}: replaced ${replaced} image refs`);
  }
}

main();
