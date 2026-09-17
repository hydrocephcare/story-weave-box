import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const origMapping = JSON.parse(fs.readFileSync('r2-image-mapping.json', 'utf8'));
const croppedMapping = JSON.parse(fs.readFileSync('r2-cropped-mapping.json', 'utf8'));

const PAPERS = [
  { slug: 'sdl-revision-mock-marathon-upper-limb-histology-and-embryology', file: 'sdl-mock-marathon-bullets.md', useCropped: true },
  { slug: 'pat-iii-progress-assessment-test-8-november-2019', file: 'pat3-2019-bullets.md', useCropped: true },
  { slug: 'embryology-slide-review-marathon', file: 'embryology-slide-review-bullets.md', useCropped: false },
];

function resolvePlaceholders(content, useCropped) {
  return content.replace(/__IMG:([^_]+)__/g, (m, relPath) => {
    if (useCropped) {
      const url = croppedMapping[relPath];
      if (!url) throw new Error(`No cropped URL for ${relPath}`);
      return url;
    } else {
      const oldRef = `/images/year1/anatomy/aponeurosis-01/${relPath}`;
      const url = origMapping[oldRef];
      if (!url) throw new Error(`No original URL for ${oldRef}`);
      return url;
    }
  });
}

async function main() {
  for (const paper of PAPERS) {
    const raw = fs.readFileSync(`content-drafts/${paper.file}`, 'utf8');
    const resolved = resolvePlaceholders(raw, paper.useCropped);
    const remaining = resolved.match(/__IMG:/g);
    if (remaining) throw new Error(`${paper.slug}: unresolved placeholders remain`);

    const { error } = await supabase.from('articles').update({ content: resolved }).eq('slug', paper.slug);
    if (error) { console.error(`${paper.slug}: UPDATE FAILED`, error.message); continue; }
    console.log(`${paper.slug}: updated (${resolved.length} chars)`);
  }
}

main();
