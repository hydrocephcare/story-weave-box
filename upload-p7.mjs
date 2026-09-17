import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const dir = 'cropped-images/pat3-2015';

async function uploadOne(localPath, filename, attempt = 1) {
  const buf = fs.readFileSync(localPath);
  const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
  try {
    const { data, error } = await supabase.functions.invoke('r2-upload', { body: { dataUrl, filename } });
    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || 'no url');
    return data.url;
  } catch (e) {
    if (attempt < 3) { await new Promise(r => setTimeout(r, 1500 * attempt)); return uploadOne(localPath, filename, attempt + 1); }
    throw e;
  }
}

async function main() {
  const mapping = {};
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort();
  for (const file of files) {
    const url = await uploadOne(path.join(dir, file), `y1-anatomy-pat3-2015-${file}`);
    mapping[`pat3-2015/${file}`] = url;
    process.stdout.write('.');
  }
  console.log('\ndone', Object.keys(mapping).length);
  fs.writeFileSync('r2-pat3-2015-mapping.json', JSON.stringify(mapping, null, 2));
}
main();
