/**
 * Reformat Articles V3
 * Processes all remaining articles from bad-format-articles.json
 * Skips articles already processed by V1/V2
 * Properly detects and formats actual questions vs subheadings
 */

import 'dotenv/config';
import fs from 'fs/promises';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PROGRESS_FILE = '.tmp-reformat-v3-progress.json';
const BAD_ARTICLES_FILE = 'C:\\Users\\LENOVO\\Desktop\\OMPATHSTUDY\\bad-format-articles.json';

async function loadProgress() {
  try {
    return JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
  } catch {
    return { processed: [], failed: [], skipped: [], stats: { total: 0, examPapers: 0, studyNotes: 0, reformatted: 0 } };
  }
}

async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function fetchArticle(slug) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?slug=eq.${slug}&select=id,slug,title,content,published`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const data = await response.json();
  return data[0] || null;
}

async function updateArticle(id, content) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      content,
      updated_at: new Date().toISOString()
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Update failed: ${text.substring(0, 200)}`);
  }
  
  return true;
}

/**
 * Detect if a ### heading is a question number vs a subheading
 */
function isQuestionHeading(line, nextLine) {
  const questionPatterns = [
    /^###\s*\d+[\.\):]\s*$/i,  // "### 1." or "### 1)" or "### 1:"
    /^###\s*question\s+\d+/i,  // "### Question 1"
    /^###\s*\(\d+\)\s*$/i,     // "### (1)"
    /^###\s*q\d+/i,            // "### Q1"
    /^###\s*\d+\s*$/i,        // "### 1" (just number)
  ];
  
  const lineTrimmed = line.trim();
  
  for (const pattern of questionPatterns) {
    if (pattern.test(lineTrimmed)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect content type from surrounding text
 */
function detectContentType(content) {
  const hasMcqOptions = /^[A-E][\.\)]\s+/m.test(content);
  const hasAnswerLines = /✅\s*Answer:|Answer:\s*[A-E]/m.test(content);
  const hasModelAnswer = /\*\*Model answer:\*\*/m.test(content);
  const hasEssayKeywords = /essay|short answer|long answer|SAQ|LAQ/i.test(content);
  const hasSectionA = /##\s*Section\s*A/i.test(content);
  const hasSectionB = /##\s*Section\s*B/i.test(content);
  
  // Check for question patterns in content
  const hasQuestionNumbers = /\d+\.\s+[A-Z]/m.test(content);
  const hasStemPatterns = /which|what|name|state|list|describe|explain|define|identify/i.test(content);
  
  return {
    isMcq: hasMcqOptions || hasAnswerLines,
    isEssay: hasModelAnswer || hasEssayKeywords,
    hasSections: hasSectionA || hasSectionB,
    hasQuestionNumbers,
    hasStemPatterns
  };
}

/**
 * Check if article is likely an exam paper vs study notes
 */
function isLikelyExamPaper(content, title) {
  // Title indicators
  const titleLower = title.toLowerCase();
  const titleIndicators = ['past paper', 'exam', 'mcq', 'quiz', 'questions and answers', 'cat ', 'eoy'];
  const hasTitleIndicator = titleIndicators.some(indicator => titleLower.includes(indicator));
  
  // Content indicators
  const contentType = detectContentType(content);
  
  // Count question-like ### headings
  const questionHeadings = (content.match(/^###\s*\d+/gm) || []).length;
  
  // Check for MCQ patterns
  const mcqPatterns = (content.match(/^[A-E][\.\)]\s+/gm) || []).length;
  
  // Check for answer patterns
  const answerPatterns = (content.match(/✅\s*Answer:|Answer:\s*[A-E]/gm) || []).length;
  
  // Check for section structure
  const hasSections = /##\s*Section\s*[A-C]/i.test(content);
  
  // Decision logic
  const examScore = [
    hasTitleIndicator ? 3 : 0,
    contentType.isMcq ? 3 : 0,
    contentType.hasSections ? 2 : 0,
    questionHeadings > 5 ? 2 : 0,
    mcqPatterns > 10 ? 3 : 0,
    answerPatterns > 0 ? 2 : 0
  ].reduce((a, b) => a + b, 0);
  
  return examScore >= 4;
}

/**
 * Format a question with answer placeholder
 */
function formatQuestion(number, text, contentType, questionCount) {
  const lines = [];
  
  lines.push(`Question ${number}`);
  lines.push('');
  lines.push(text.trim());
  lines.push('');
  
  if (contentType.isMcq) {
    // MCQ format - check if it has options
    const hasOptions = /^[A-E][\.\)]\s+/m.test(text);
    if (hasOptions) {
      lines.push(`✅ Answer: A. [Answer to be determined]`);
      lines.push('Explanation: [Explanation to be provided]');
    } else {
      lines.push('**Model answer:**');
      lines.push('- [Answer to be provided]');
    }
  } else {
    // SAQ/LAQ format
    lines.push('**Model answer:**');
    lines.push('- [Answer to be provided]');
  }
  
  return lines.join('\n');
}

/**
 * Process article content and reformat questions
 */
function reformatContent(content, contentType) {
  const lines = content.split('\n');
  const output = [];
  let questionCount = 0;
  let currentSection = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    
    // Track section headers
    if (/^##\s*Section/i.test(line)) {
      currentSection = line;
      output.push(line);
      continue;
    }
    
    // Check if this is a question heading
    if (isQuestionHeading(line, nextLine)) {
      // Extract question number
      const numMatch = line.match(/(\d+)/);
      if (numMatch) {
        questionCount = parseInt(numMatch[1]);
      } else {
        questionCount++;
      }
      
      // Get question text (everything until next question or section)
      let questionText = '';
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (isQuestionHeading(nextLine, lines[i + 1]) || /^##\s/.test(nextLine)) {
          break;
        }
        questionText += nextLine + '\n';
        i++;
      }
      i--; // Back up one line
      
      // Format question
      output.push(formatQuestion(questionCount, questionText.trim(), contentType, questionCount));
      output.push('');
      output.push('---');
      output.push('');
    } else {
      // Regular content
      output.push(line);
    }
  }
  
  return output.join('\n');
}

/**
 * Check if article already has proper answers
 */
function hasProperAnswers(content) {
  const answerMarkers = (content.match(/✅ Answer:|\*\*Model answer:\*\*/g) || []).length;
  const emptyAnswers = (content.match(/\[Answer to be provided\]/g) || []).length;
  const questionNs = (content.match(/^Question \d+$/gm) || []).length;
  
  return answerMarkers >= questionNs && emptyAnswers === 0;
}

async function processArticle(slug, progress) {
  console.log(`\nProcessing: ${slug}`);
  
  const article = await fetchArticle(slug);
  if (!article) {
    console.log('  Article not found');
    return false;
  }
  
  console.log(`  Title: ${article.title?.substring(0, 60)}`);
  console.log(`  Content length: ${article.content?.length || 0} chars`);
  
  const content = article.content || '';
  
  // Skip if already has proper answers
  if (hasProperAnswers(content)) {
    console.log('  Already has proper answers, skipping');
    return true;
  }
  
  // Check if already has some answers but needs more
  const existingAnswers = (content.match(/✅ Answer:|\*\*Model answer:\*\*/g) || []).length;
  if (existingAnswers > 0) {
    console.log(`  Has ${existingAnswers} existing answers, will enhance`);
  }
  
  // Detect content type
  const contentType = detectContentType(content);
  console.log(`  Content type: ${contentType.isMcq ? 'MCQ' : contentType.isEssay ? 'Essay' : 'Study Notes'}`);
  
  // Check if this is an exam paper
  const isExamPaper = isLikelyExamPaper(content, article.title || '');
  console.log(`  Is exam paper: ${isExamPaper}`);
  
  if (!isExamPaper) {
    console.log('  Study notes - skipping (no questions to reformat)');
    return true;
  }
  
  // Count question headings
  const questionHeadings = (content.match(/^###\s*\d+/gm) || []).length;
  console.log(`  Question headings found: ${questionHeadings}`);
  
  // If no question headings, skip
  if (questionHeadings === 0) {
    console.log('  No question headings, skipping');
    return true;
  }
  
  // Reformat
  const reformatted = reformatContent(content, contentType);
  
  // Update
  try {
    await updateArticle(article.id, reformatted);
    console.log('  ✓ Updated successfully');
    return true;
  } catch (error) {
    console.error(`  ✗ Update failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Reformat Articles V3');
  console.log('='.repeat(60) + '\n');
  
  // Load bad articles list
  const badArticles = JSON.parse(await fs.readFile(BAD_ARTICLES_FILE, 'utf8'));
  console.log(`Total articles in list: ${badArticles.length}`);
  
  // Load V1/V2 progress to skip already processed
  let v1v2Progress = { processed: [] };
  try {
    v1v2Progress = JSON.parse(await fs.readFile('.tmp-reformat-v2-progress.json', 'utf8'));
  } catch {}
  
  console.log(`Already processed by V1/V2: ${v1v2Progress.processed.length}`);
  
  // Filter out already processed
  const remaining = badArticles.filter(a => !v1v2Progress.processed.includes(a.slug));
  console.log(`Remaining to process: ${remaining.length}`);
  
  const progress = await loadProgress();
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  
  // Process in batches of 10
  const batchSize = 10;
  for (let batchStart = 0; batchStart < remaining.length; batchStart += batchSize) {
    const batch = remaining.slice(batchStart, batchStart + batchSize);
    const batchNum = Math.floor(batchStart / batchSize) + 1;
    const totalBatches = Math.ceil(remaining.length / batchSize);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} articles)`);
    console.log('='.repeat(60));
    
    for (const article of batch) {
      if (progress.processed.includes(article.slug)) {
        console.log(`Skipping ${article.slug} (already processed)`);
        skipCount++;
        continue;
      }
      
      try {
        const success = await processArticle(article.slug, progress);
        if (success) {
          successCount++;
          progress.processed.push(article.slug);
        } else {
          failCount++;
          progress.failed.push(article.slug);
        }
        await saveProgress(progress);
        await new Promise(r => setTimeout(r, 200));
      } catch (error) {
        console.error(`Error: ${error.message}`);
        failCount++;
        progress.failed.push(article.slug);
        await saveProgress(progress);
      }
    }
    
    // Update stats
    progress.stats = {
      total: badArticles.length,
      processed: progress.processed.length,
      failed: progress.failed.length,
      successRate: ((successCount / (successCount + failCount)) * 100).toFixed(1) + '%'
    };
    await saveProgress(progress);
    
    console.log(`\nBatch ${batchNum} complete: ${successCount} success, ${skipCount} skipped, ${failCount} failed`);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(`Total articles: ${badArticles.length}`);
  console.log(`Successfully processed: ${progress.processed.length}`);
  console.log(`Failed: ${progress.failed.length}`);
  console.log(`Skipped: ${skipCount}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
