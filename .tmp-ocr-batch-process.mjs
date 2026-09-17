/**
 * Batch OCR Processing Script
 * Processes papers in batches of 2 pages, saves progress, and formats content
 */

import 'dotenv/config';
import fs from 'fs/promises';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PAPERS = [
  { 
    key: '2c38ca8422b56c99', 
    articleId: '1e88a2ee-68b0-4894-a8ac-90029c266cf6', 
    title: 'EOY 2021 — End of Year Examination', 
    pages: 42,
    category: 'Year 3: General Pathology',
    fileName: '2C38CA84-EOY 2021.pdf'
  },
  { 
    key: '77118281ffb25ba6', 
    articleId: '6dd22c75-4736-404b-bf82-ff7978ecd96e', 
    title: 'CAT Makeup — Continuous Assessment', 
    pages: 37,
    category: 'Year 3: General Pathology',
    fileName: '77118281-cat makeup.pdf'
  }
];

const BATCH_SIZE = 2;
const DELAY_MS = 2000;
const PROGRESS_FILE = '.tmp-ocr-batch-progress.json';

async function loadProgress() {
  try {
    return JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function runOcr(articleId, from, count, startNumber) {
  const url = `${SUPABASE_URL}/functions/v1/paper-ocr`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      action: 'ocr',
      article_id: articleId,
      from,
      count,
      start_number: startNumber
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
  }
  
  return await response.json();
}

async function commitContent(articleId, content) {
  const url = `${SUPABASE_URL}/functions/v1/paper-ocr`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      action: 'commit',
      article_id: articleId,
      content,
      published: true
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Commit failed: ${text.substring(0, 200)}`);
  }
  
  return await response.json();
}

function formatContent(text, title) {
  // Clean up OCR text
  let content = text
    .replace(/^```(?:markdown)?/gm, '')
    .replace(/```$/gm, '')
    .replace(/\[unreadable\]/g, '*[unreadable]*')
    .trim();
  
  // Ensure proper spacing
  content = content.replace(/\n{3,}/g, '\n\n');
  
  return content;
}

async function processPaper(paper, progress) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${paper.title}`);
  console.log(`Article ID: ${paper.articleId}`);
  console.log(`Pages: ${paper.pages}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const paperProgress = progress[paper.key] || {
    nextFrom: 0,
    questionNumber: 1,
    parts: [],
    completed: false
  };
  
  if (paperProgress.completed) {
    console.log('Already completed, skipping...');
    return true;
  }
  
  let { nextFrom, questionNumber, parts } = paperProgress;
  
  while (nextFrom < paper.pages) {
    const batchSize = Math.min(BATCH_SIZE, paper.pages - nextFrom);
    console.log(`Batch: pages ${nextFrom + 1}-${nextFrom + batchSize} of ${paper.pages}`);
    
    try {
      const result = await runOcr(paper.articleId, nextFrom, batchSize, questionNumber);
      
      if (result.text) {
        parts.push(result.text);
        
        // Count questions in this batch
        const questions = result.text.match(/^\s*\d+\.\s+/gm) || [];
        if (questions.length > 0) {
          const lastNum = questions[questions.length - 1].match(/\d+/)[0];
          questionNumber = parseInt(lastNum) + 1;
        }
        
        console.log(`  ✓ Got ${result.text.length} chars, ${questions.length} questions (total: ${questionNumber - 1})`);
      }
      
      nextFrom = result.next_from || nextFrom + batchSize;
      
      // Save progress
      progress[paper.key] = { nextFrom, questionNumber, parts, completed: false };
      await saveProgress(progress);
      
      if (result.done) {
        console.log('  ✓ OCR complete!');
        break;
      }
      
      // Delay between batches
      await new Promise(r => setTimeout(r, DELAY_MS));
      
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      // Save progress and continue
      progress[paper.key] = { nextFrom, questionNumber, parts, completed: false };
      await saveProgress(progress);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  if (parts.length === 0) {
    console.error('No OCR text collected');
    return false;
  }
  
  // Combine all parts
  const allText = parts.join('\n\n');
  console.log(`\nTotal OCR text: ${allText.length} chars`);
  console.log(`Total questions: ${questionNumber - 1}`);
  
  // Format content
  const formatted = formatContent(allText, paper.title);
  
  // Commit to database
  console.log('\nCommitting to database...');
  try {
    const result = await commitContent(paper.articleId, formatted);
    console.log('✓ Committed successfully');
    
    // Mark as completed
    progress[paper.key].completed = true;
    await saveProgress(progress);
    
    return true;
  } catch (error) {
    console.error(`✗ Commit failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Batch OCR Processing Script');
  console.log(`${'='.repeat(60)}\n`);
  
  const progress = await loadProgress();
  
  let successCount = 0;
  
  for (const paper of PAPERS) {
    try {
      const success = await processPaper(paper, progress);
      if (success) {
        successCount++;
        console.log(`\n✓ ${paper.title} completed successfully`);
      } else {
        console.log(`\n✗ ${paper.title} failed`);
      }
    } catch (error) {
      console.error(`\n✗ ${paper.title} error: ${error.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${successCount}/${PAPERS.length} papers processed`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
