import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const keys = ['896653cf4ba24c4a', 'a2387c337e977a3a'];
const progress = JSON.parse(fs.readFileSync('.tmp-fast-publish-progress.json', 'utf8'));
const sourceDir = '.tmp-desktop-pastpapers-source';
const sourceFiles = fs.readdirSync(sourceDir).filter(name => name.toLowerCase().endsWith('.pdf'));
const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
fs.mkdirSync('.tmp-makeup-ocr', { recursive: true });

for (const key of keys) {
  const state = progress[key];
  const sourceName = sourceFiles.find(name => name === state.fileName) || sourceFiles.find(name => normalize(name) === normalize(state.fileName));
  if (!sourceName) throw new Error(`Missing source ${state.fileName}`);
  const dir = path.join('.tmp-makeup-ocr', key);
  fs.mkdirSync(dir, { recursive: true });
  const prefix = path.join(dir, 'page');
  if (fs.readdirSync(dir).filter(name => name.endsWith('.jpg')).length !== state.uploaded.length) execFileSync('pdftoppm', ['-jpeg', '-r', '180', path.join(sourceDir, sourceName), prefix], { stdio: 'ignore' });
  const images = fs.readdirSync(dir).filter(name => name.endsWith('.jpg')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (images.length !== state.uploaded.length) throw new Error(`${state.fileName}: expected ${state.uploaded.length} renders, found ${images.length}`);
  const pages = [];
  for (let index = 0; index < images.length; index++) {
    const base = path.join(dir, `ocr-${String(index + 1).padStart(3, '0')}`);
    if (!fs.existsSync(`${base}.txt`)) execFileSync('C:\\Program Files\\Tesseract-OCR\\tesseract.exe', [path.join(dir, images[index]), base, '-l', 'eng', '--psm', '6'], { stdio: 'ignore' });
    pages.push(fs.readFileSync(`${base}.txt`, 'utf8').trim());
  }
  const combined = pages.map((text, index) => `\n--- PAGE ${index + 1} ---\n\n${text}`).join('\n');
  fs.writeFileSync(path.join(dir, 'complete.txt'), combined);
  console.log(`OCR ${state.fileName}: ${images.length}/${state.uploaded.length} pages, ${combined.length} chars`);
}
