import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const mapping = JSON.parse(fs.readFileSync('r2-histology-embryology-spot-review-mapping.json', 'utf8'));

function readStaging() {
  const p = 'C:/Users/LENOVO/Desktop/OMPATHSTUDY/scratch/content/histology-embryology-spot-review.md';
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const text = readStaging();
const [histoBlock, embryoBlock] = text.split('## EMBRYOLOGY_ITEMS');
const histoRaw = histoBlock.split('## HISTOLOGY_ITEMS')[1];

function parseItems(block) {
  const items = [];
  const parts = block.split(/\n### /).slice(1);
  for (const part of parts) {
    const lines = part.split('\n');
    const key = lines[0].trim();
    const question = lines[1].trim();
    const imgLine = lines.find(l => l.startsWith('!['));
    const answerLines = lines.filter(l => l.trim().startsWith('-'));
    const imgMatch = imgLine.match(/!\[(.*?)\]\(__IMG:(.*?)__\)/);
    const alt = imgMatch[1];
    const relPath = imgMatch[2];
    const url = mapping[relPath];
    if (!url) throw new Error('no url for ' + relPath);
    items.push({ key, question, alt, url, answerLines });
  }
  return items;
}

const histoItems = parseItems(histoRaw);
const embryoItems = parseItems(embryoBlock);

const REGION_MAP = {
  'h-pacinian': 'Nervous & Ganglion Tissue',
  'h-apocrine': 'Epithelial Tissue',
  'h-ganglion': 'Nervous & Ganglion Tissue',
  'h-pilosebaceous': 'Epithelial Tissue',
  'h-skeletal-muscle': 'Muscle Tissue',
  'h-bone': 'Bone Tissue',
  'h-pyramidal': 'Nervous & Ganglion Tissue',
  'h-purkinje': 'Nervous & Ganglion Tissue',
  'h-cardiac-muscle': 'Muscle Tissue',
  'h-epiphyseal': 'Bone Tissue',
  'h-hyaline-cartilage': 'Cartilage',
  'h-stereocilia': 'Epithelial Tissue',
  'e-karyotype': 'Genetic & Chromosomal Anomalies',
  'e-menstrual-cycle': 'Gametogenesis & Ovarian/Uterine Cycle',
  'e-blighted-ovum': 'Fertilization & Early Development',
  'e-chordoma': 'Folding & Body Plan',
  'e-spina-bifida': 'Neural Tube, CNS & Neural Crest',
  'e-amniocentesis': 'Fetal Membranes, Placenta & Twinning',
  'e-placenta-anomalies': 'Fetal Membranes, Placenta & Twinning',
};

function insertIntoArticle(content, items, sourceLabel) {
  let qNum = (content.match(/^## Q(\d+):/gm) || []).reduce((max, m) => Math.max(max, parseInt(m.match(/\d+/)[0])), 0);
  for (const item of items) {
    const region = REGION_MAP[item.key];
    const regionHeader = `# ${region}`;
    if (!content.includes(regionHeader)) throw new Error('region not found: ' + region);
    qNum++;
    const block = `## Q${qNum}: ${item.question}\n\n![${item.alt}](${item.url})\n\n**Answer:**\n${item.answerLines.join('\n')}\n\n---\n\n`;
    // Insert right after the region header (and its intro line if present), i.e. before the first "## Q" that follows it.
    const headerIdx = content.indexOf(regionHeader);
    const afterHeader = content.indexOf('\n## Q', headerIdx);
    if (afterHeader === -1) throw new Error('no question found after region ' + region);
    content = content.slice(0, afterHeader + 1) + block + content.slice(afterHeader + 1);
  }
  // update source attribution line
  content = content.replace(
    /\*Compiled from the Aponeurosis SPOT collection \(/,
    `*Compiled from the Aponeurosis SPOT collection (${sourceLabel}; `
  );
  return content;
}

async function run() {
  const { data: histoRow, error: e1 } = await supabase.from('articles').select('id,content').eq('slug', 'aponeurosis-histology-question-bank').single();
  if (e1) throw e1;
  const { data: embryoRow, error: e2 } = await supabase.from('articles').select('id,content').eq('slug', 'aponeurosis-embryology-question-bank').single();
  if (e2) throw e2;

  const newHisto = insertIntoArticle(histoRow.content, histoItems, 'Histology and Embryology Spot Review by Mohamed Onyango');
  const newEmbryo = insertIntoArticle(embryoRow.content, embryoItems, 'Histology and Embryology Spot Review by Mohamed Onyango');

  const { error: u1 } = await supabase.from('articles').update({ content: newHisto }).eq('id', histoRow.id);
  if (u1) throw u1;
  const { error: u2 } = await supabase.from('articles').update({ content: newEmbryo }).eq('id', embryoRow.id);
  if (u2) throw u2;

  fs.writeFileSync('merged/histology.md', newHisto);
  fs.writeFileSync('merged/embryology.md', newEmbryo);
  console.log('updated histology (+', histoItems.length, ') and embryology (+', embryoItems.length, ')');
}

run();
