import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const audit = JSON.parse(fs.readFileSync('.tmp-incomplete-local-audit.json', 'utf8'));
const sourceDir = '.tmp-desktop-pastpapers-source';
const sourceFiles = fs.readdirSync(sourceDir).filter(name => name.toLowerCase().endsWith('.pdf'));
const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const targets = audit.filter(item => item.status === 'needs-ocr' && item.pages <= 17);
fs.mkdirSync('.tmp-scan-only-ocr', { recursive: true });

for (const item of targets) {
  const sourceName = sourceFiles.find(name => name === item.file) || sourceFiles.find(name => normalize(name) === normalize(item.file));
  if (!sourceName) throw new Error(`Missing ${item.file}`);
  const dir = path.join('.tmp-scan-only-ocr', item.key);
  fs.mkdirSync(dir, { recursive: true });
  const prefix = path.join(dir, 'page');
  if (!fs.readdirSync(dir).some(name => name.endsWith('.jpg'))) execFileSync('pdftoppm', ['-jpeg', '-r', '200', path.join(sourceDir, sourceName), prefix], { stdio: 'ignore' });
  const images = fs.readdirSync(dir).filter(name => name.endsWith('.jpg')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const pages = [];
  for (let index = 0; index < images.length; index++) {
    const outputBase = path.join(dir, `ocr-${String(index + 1).padStart(3, '0')}`);
    if (!fs.existsSync(`${outputBase}.txt`)) execFileSync('C:\\Program Files\\Tesseract-OCR\\tesseract.exe', [path.join(dir, images[index]), outputBase, '-l', 'eng', '--psm', '6'], { stdio: 'ignore' });
    pages.push(fs.readFileSync(`${outputBase}.txt`, 'utf8').trim());
  }
  const combined = pages.map((text, index) => `\n--- PAGE ${index + 1} ---\n\n${text}`).join('\n');
  fs.writeFileSync(path.join(dir, 'complete.txt'), combined);
  console.log(`OCR ${item.file}: ${images.length}/${item.pages} pages, ${combined.length} chars`);
}
console.log(JSON.stringify({ papers: targets.length, pages: targets.reduce((sum, item) => sum + item.pages, 0) }));
