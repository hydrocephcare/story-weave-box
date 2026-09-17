// pharm-apply.mjs
// WRITES to the database. Splits Year 3 "Basic Pharmacology" into
// "Basic Pharmacology I/II/III" (Trimester 1/2/3) based on actual content,
// per the trimester topic breakdown the site owner provided.
// Test-row write first, then bulk, full log written to pharm-update-log.csv.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

// id -> { unit, confidence, reason } ; rows not listed here are left unsplit
// (mega-compilations spanning multiple trimesters, or no real content) —
// they stay as plain "Basic Pharmacology" rather than being force-assigned.
const PLAN = {
  "3b3ab8d9-1b8a-4fe1-b913-8ac369842086": { unit: "Basic Pharmacology I", confidence: "medium", reason: "Antifungals/antivirals/antihelminthics/antiprotozoals drug-class framing matches Trimester 1's chemotherapy series; extensive HIV/ART section also overlaps Trimester 2 - genuinely mixed" },
  "4d7edcf6-517a-4eb9-8dcc-226d602931d8": { unit: "Basic Pharmacology II", confidence: "high", reason: "Opens with 'Principles of Rational Antimicrobial Prescribing & Infectious Diseases' - exact match to Trimester 2's first topic" },
  "558d5138-78da-426b-a7c3-555c9b97e59a": { unit: "Basic Pharmacology I", confidence: "medium", reason: "Dose-response/bioavailability MCQ set - core Trimester 1 PK/PD intro material; 60 questions may span further" },
  "9202095d-257c-4276-ae65-56ff1f4cfbbb": { unit: "Basic Pharmacology I", confidence: "medium", reason: "Pharmacokinetics/pharmacodynamics framing (ADME, bioavailability) - Trimester 1 intro topic" },
  "ef61c80e-1e66-4624-a4a6-7192ee43d8a3": { unit: "Basic Pharmacology III", confidence: "high", reason: "\"WEEK 1 - Introduction to Oncology\" - exact match Trimester 3 opening topic" },
  "50dbd673-dc01-4f1a-9429-8de8dc035725": { unit: "Basic Pharmacology III", confidence: "high", reason: "\"WEEK 2 - Treatment Approaches in Oncology\" (surgery/radiotherapy) - Trimester 3 topic" },
  "eb948af9-2b1c-4e77-961c-b2994e180a8f": { unit: "Basic Pharmacology III", confidence: "high", reason: "Cancer pharmacology, cell cycle, oncogenes, drug targets - Trimester 3" },
  "fe23f6a7-e01d-4b5d-9ac8-cf78b973cb88": { unit: "Basic Pharmacology III", confidence: "high", reason: "\"WEEK 3\" cell cycle classification of chemo drugs - Trimester 3" },
  "c22b7ee9-6698-4359-bfe9-062d89fc548b": { unit: "Basic Pharmacology I", confidence: "medium", reason: "Content is drug-response/receptors/bioavailability/antifungals (Trimester 1 intro material) despite title saying 'SEM 3CAT' - title conflicts with content, flagging for owner review" },
  "3894745c-5fbf-4ef5-bcd3-5219ee7553db": { unit: "Basic Pharmacology II", confidence: "high", reason: "\"Wk 1 & 2\" antimicrobial therapy/resistance mechanisms - matches Trimester 2's opening weeks" },
  "e5570ce6-84b0-4141-b124-18f49aa946bd": { unit: "Basic Pharmacology I", confidence: "high", reason: "\"WEEK 6 & 7\" Cell Wall Inhibitors/Protein Synthesis Inhibitors/Quinolones/Antimycobacterials - Trimester 1's chemotherapy series, matches week numbering" },
  "33fb0af9-68e8-46d8-a2bf-14a6d661d667": { unit: "Basic Pharmacology III", confidence: "high", reason: "Duplicate of the Oncology Intro note - Trimester 3" },
  "31d07a12-1d26-49e0-8804-3474f6aed1e0": { unit: "Basic Pharmacology III", confidence: "high", reason: "Duplicate of the Oncology Intro note - Trimester 3" },
  "bd31016e-acfc-4759-bc4a-fc6d1e928eda": { unit: "Basic Pharmacology III", confidence: "high", reason: "Chemotherapy drug classification by cell cycle phase - Trimester 3" },
  "e89cc675-7eb8-42c2-b021-241126472bd1": { unit: "Basic Pharmacology I", confidence: "high", reason: "\"Introduction to Pharmacology Quiz 1\" - absorption/basic PK concepts, Trimester 1 opening topic" },
  "cb17dd01-18e8-4a33-b4ac-76aeedd53e2c": { unit: "Basic Pharmacology III", confidence: "medium", reason: "\"WEEK 1: INTRODUCTION TO ONCOLOGY\" crash course - entirely within oncology's Trimester 3 domain even though it's long" },
  "74c68d06-4cda-4429-b6b4-a82444456bf3": { unit: "Basic Pharmacology II", confidence: "medium", reason: "Antibiotic combination therapy for a specific infection (enterococci) - case-based antimicrobial content matches Trimester 2's patient-case-series structure" },
};

const SKIP_REASONS = {
  "7875deff-6c18-4eaf-b532-dac472317493": "Assignment instructions/cover-page requirements only - no real teaching content to classify",
  "2b6584eb-2323-4db3-990f-85138828a1cc": "\"Pharmacology Cheat Code\" - broad cram sheet, likely spans multiple trimesters, can't confidently single-assign",
  "4b5f904e-ea92-4732-b3e5-dd1f589db48f": "\"120 CHALLENGING MCQs\" mega-compilation (48k chars) - almost certainly spans all 3 trimesters",
  "96eb9450-a0e7-401d-b5ec-dbf8d0b17d42": "\"Basic Pharmacology - Study Guide\" mega-compilation (48k chars, unfamiliar course code) - spans too much to single-assign",
  "901655db-b9ee-4e89-afb9-adefe31d2590": "Largest note (79k chars), opens with a broken AI-meta-comment preamble - too large/messy to confidently split without deeper review",
};

async function main() {
  const { data: rows, error } = await supabase
    .from('articles')
    .select('id, title, category, unit')
    .eq('category', 'Year 3: Basic Pharmacology');
  if (error) { console.error(error.message); return; }

  const toWrite = rows.filter(r => PLAN[r.id]);
  const toSkip = rows.filter(r => !PLAN[r.id]);
  console.log(`Total Basic Pharmacology rows: ${rows.length}`);
  console.log(`Rows to split by trimester: ${toWrite.length}`);
  console.log(`Rows left unsplit: ${toSkip.length}`);
  toSkip.forEach(r => console.log(`  UNSPLIT ${r.id} - "${r.title}" (${SKIP_REASONS[r.id] || 'no plan entry'})`));

  // Test write
  const test = toWrite[0];
  const testPlan = PLAN[test.id];
  console.log(`\n--- Test write: "${test.title}" -> unit "${testPlan.unit}" ---`);
  const { error: testErr } = await supabase.from('articles').update({ unit: testPlan.unit }).eq('id', test.id);
  if (testErr) { console.error('FATAL test write failed:', testErr.message); return; }
  const { data: verifyRow, error: verifyErr } = await supabase.from('articles').select('unit').eq('id', test.id).single();
  if (verifyErr || verifyRow.unit !== testPlan.unit) {
    console.error('FATAL: test write did not verify.', verifyErr?.message, verifyRow);
    return;
  }
  console.log('Test write verified. Proceeding with the rest.\n');

  const log = [{ id: test.id, title: test.title, old_unit: test.unit || '', new_unit: testPlan.unit, confidence: testPlan.confidence, reason: testPlan.reason, status: 'success' }];
  let ok = 1, fail = 0;
  for (const row of toWrite.slice(1)) {
    const plan = PLAN[row.id];
    const { error: err } = await supabase.from('articles').update({ unit: plan.unit }).eq('id', row.id);
    if (err) {
      fail++;
      log.push({ id: row.id, title: row.title, old_unit: row.unit || '', new_unit: plan.unit, confidence: plan.confidence, reason: plan.reason, status: `FAILED: ${err.message}` });
      console.error(`  FAILED ${row.id}: ${err.message}`);
    } else {
      ok++;
      log.push({ id: row.id, title: row.title, old_unit: row.unit || '', new_unit: plan.unit, confidence: plan.confidence, reason: plan.reason, status: 'success' });
    }
  }
  toSkip.forEach(row => {
    log.push({ id: row.id, title: row.title, old_unit: row.unit || '', new_unit: '(unchanged - Basic Pharmacology)', confidence: '', reason: SKIP_REASONS[row.id] || '', status: 'skipped' });
  });

  const csvEscape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cols = ['id', 'title', 'old_unit', 'new_unit', 'confidence', 'reason', 'status'];
  writeFileSync('pharm-update-log.csv', [cols.join(','), ...log.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n'));

  console.log(`\n=== DONE === updated: ${ok}, failed: ${fail}, unsplit: ${toSkip.length}`);
  console.log('Log written to pharm-update-log.csv');
}
main();
