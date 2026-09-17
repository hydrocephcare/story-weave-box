import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const DIRS = ['sdl-mock-marathon', 'pat3-2019'];
const ROOT = 'cropped-images';

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
  const mapping = {};
  const log = [];
  for (const dirName of DIRS) {
    const dir = path.join(ROOT, dirName);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort();
    console.log(`\n${dirName}: ${files.length} images`);
    for (const file of files) {
      try {
        const url = await uploadOne(path.join(dir, file), `y1-anatomy-cropped-${dirName}-${file}`);
        mapping[`${dirName}/${file}`] = url;
        log.push({ dir: dirName, file, url, ok: true });
        process.stdout.write('.');
      } catch (e) {
        log.push({ dir: dirName, file, error: e.message, ok: false });
        process.stdout.write('x');
      }
    }
  }
  console.log('\n');
  fs.writeFileSync('r2-cropped-mapping.json', JSON.stringify(mapping, null, 2));
  fs.writeFileSync('r2-cropped-upload-log.json', JSON.stringify(log, null, 2));
  const failed = log.filter(l => !l.ok);
  console.log(`Uploaded: ${log.length - failed.length}/${log.length}`);
  if (failed.length) console.log('Failed:', failed.map(f => `${f.dir}/${f.file}: ${f.error}`).join('\n'));
}

main();
