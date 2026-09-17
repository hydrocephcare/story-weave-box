/**
 * OCR Processing Script for Remaining Papers
 * 
 * This script processes papers that have placeholder content and need OCR.
 * It converts PDF pages to images, uploads them to R2, and then runs OCR.
 */

import fs from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';

// Load environment
const envPath = '.env';
const envContent = await fs.readFile(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

// Papers to process
const PAPERS = [
  {
    id: '1e88a2ee-68b0-4894-a8ac-90029c266cf6',
    title: 'EOY 2021',
    pdfFile: '2C38CA84-EOY 2021.pdf',
    pages: 42,
    category: 'Year 3: General Pathology'
  },
  {
    id: '6dd22c75-4736-404b-bf82-ff7978ecd96e',
    title: 'cat makeup',
    pdfFile: '77118281-cat makeup.pdf',
    pages: 37,
    category: 'Year 3: General Pathology'
  }
];

const SOURCE_DIR = '.tmp-desktop-pastpapers-source';
const OUTPUT_DIR = '.tmp-ocr-remaining';
const R2_BASE = 'https://cdn.ompathstudy.com';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function convertPdfToImages(pdfPath, outputDir, prefix) {
  console.log(`Converting ${pdfPath} to images...`);
  await ensureDir(outputDir);
  
  const outputPath = path.join(outputDir, prefix);
  try {
    execFileSync('pdftoppm', ['-jpeg', '-r', '200', pdfPath, outputPath], { stdio: 'ignore' });
    const files = await fs.readdir(outputDir);
    const images = files.filter(f => f.endsWith('.jpg')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    console.log(`  Generated ${images.length} images`);
    return images;
  } catch (error) {
    console.error(`  Error converting PDF: ${error.message}`);
    return [];
  }
}

async function uploadToR2(imagePath, filename) {
  // Read image file
  const imageBuffer = await fs.readFile(imagePath);
  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  
  // Upload using the r2-upload edge function
  const response = await fetch(`${SUPABASE_URL}/functions/v1/r2-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ dataUrl, filename })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Upload failed: ${error.error}`);
  }
  
  const result = await response.json();
  return result.url;
}

async function updateArticleContent(articleId, content, imageUrls) {
  // Build the article content with images
  const scans = imageUrls.map((url, i) => `![Page ${i + 1}](${url})`).join('\n\n');
  const fullContent = `## Questions and answers\n\n${content}\n\n## Original scanned pages\n\n${scans}`;
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${articleId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      content: fullContent,
      updated_at: new Date().toISOString(),
      published: true
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Update failed: ${error.message}`);
  }
  
  return true;
}

async function runOcr(articleId, startNumber = 1) {
  console.log(`Running OCR for article ${articleId}...`);
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/paper-ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      action: 'ocr',
      article_id: articleId,
      from: 0,
      count: 8,
      start_number: startNumber
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OCR failed: ${error.error}`);
  }
  
  return await response.json();
}

async function processPaper(paper) {
  console.log(`\n=== Processing: ${paper.title} ===`);
  console.log(`  PDF: ${paper.pdfFile}`);
  console.log(`  Pages: ${paper.pages}`);
  
  const pdfPath = path.join(SOURCE_DIR, paper.pdfFile);
  const outputDir = path.join(OUTPUT_DIR, paper.id);
  const prefix = paper.id.substring(0, 8);
  
  // Check if PDF exists
  try {
    await fs.access(pdfPath);
  } catch {
    console.error(`  PDF not found: ${pdfPath}`);
    return false;
  }
  
  // Convert PDF to images
  const images = await convertPdfToImages(pdfPath, outputDir, prefix);
  if (images.length === 0) {
    console.error('  No images generated');
    return false;
  }
  
  // Upload images to R2
  console.log('Uploading images to R2...');
  const imageUrls = [];
  for (let i = 0; i < images.length; i++) {
    const imagePath = path.join(outputDir, images[i]);
    const filename = `${paper.id.substring(0, 8)}-page-${String(i + 1).padStart(3, '0')}.jpg`;
    try {
      const url = await uploadToR2(imagePath, filename);
      imageUrls.push(url);
      console.log(`  Uploaded page ${i + 1}/${images.length}`);
    } catch (error) {
      console.error(`  Failed to upload page ${i + 1}: ${error.message}`);
    }
  }
  
  if (imageUrls.length === 0) {
    console.error('  No images uploaded');
    return false;
  }
  
  // Update article content with image URLs (placeholder for OCR)
  const placeholderContent = imageUrls.map((url, i) => `![Page ${i + 1}](${url})`).join('\n\n');
  await updateArticleContent(paper.id, '', imageUrls);
  console.log(`  Updated article with ${imageUrls.length} images`);
  
  // Run OCR
  console.log('Running OCR...');
  let allText = '';
  let nextFrom = 0;
  let questionNumber = 1;
  
  while (nextFrom < imageUrls.length) {
    try {
      const result = await runOcr(paper.id, questionNumber);
      if (result.text) {
        allText += '\n\n' + result.text;
        // Count questions in the text
        const questions = result.text.match(/^\s*\d+\.\s+/gm) || [];
        if (questions.length > 0) {
          const lastQuestion = questions[questions.length - 1];
          const num = parseInt(lastQuestion.match(/\d+/)[0]);
          questionNumber = num + 1;
        }
      }
      nextFrom = result.next_from || nextFrom + 8;
      console.log(`  OCR progress: ${nextFrom}/${imageUrls.length} pages`);
    } catch (error) {
      console.error(`  OCR error: ${error.message}`);
      break;
    }
  }
  
  if (allText.trim().length < 200) {
    console.error('  OCR produced too little text');
    return false;
  }
  
  // Format the content nicely
  const formattedContent = formatOcrContent(allText, paper.title);
  
  // Update article with final content
  await updateArticleContent(paper.id, formattedContent, imageUrls);
  console.log(`  Final content: ${formattedContent.length} chars`);
  
  return true;
}

function formatOcrContent(text, title) {
  // Clean up the OCR text
  let content = text
    .replace(/```(?:markdown)?/g, '')
    .replace(/\[unreadable\]/g, '*[unreadable]*')
    .trim();
  
  // Add answer formatting if not present
  content = content.replace(
    /^(\s*\d+\.\s+.+?)(?:\n|$)/gm,
    (match) => {
      // Check if it already has answer formatting
      if (match.includes('✅ Answer:') || match.includes('Answer:')) {
        return match;
      }
      return match;
    }
  );
  
  // Ensure proper spacing between questions
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  return content;
}

async function main() {
  console.log('OCR Processing Script for Remaining Papers');
  console.log('==========================================\n');
  
  let successCount = 0;
  
  for (const paper of PAPERS) {
    try {
      const success = await processPaper(paper);
      if (success) {
        successCount++;
        console.log(`✅ ${paper.title} processed successfully`);
      } else {
        console.log(`❌ ${paper.title} failed`);
      }
    } catch (error) {
      console.error(`❌ ${paper.title} error: ${error.message}`);
    }
  }
  
  console.log(`\n==========================================`);
  console.log(`Processed ${successCount}/${PAPERS.length} papers`);
}

main().catch(console.error);
