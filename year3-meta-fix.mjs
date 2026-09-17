// year3-meta-fix.mjs
// WRITES to the database. Adds real meta_title/meta_description to the 14
// Year 3 articles that had empty/thin ones (falling back to a generic
// title-based description, contributing to thin/duplicate SEO signals).
// Test-write first, then bulk, full log.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const PLAN = {
  "bf8d8ef7-164e-4ac0-835a-ab75e875e0dc": {
    meta_title: "Cardiovascular Disease MCQs | Biochemical Markers - Year 3",
    meta_description: "Practice MBChB Year 3 MCQs on cardiovascular disease and biochemical markers, covering chest pain presentations, cardiac enzymes and diagnostic reasoning.",
  },
  "ce08bfa7-871f-4b12-991e-851a2035d771": {
    meta_title: "Oncopathology MCQs: Hallmarks of Cancer (30 Qs) | Year 3",
    meta_description: "30 MCQs on the hallmarks of cancer for MBChB Year 3 Oncopathology, covering tumor suppressor genes, VHL syndrome and molecular mechanisms of malignancy.",
  },
  "558d5138-78da-426b-a7c3-555c9b97e59a": {
    meta_title: "Pharmacology Exam MCQs: Dose-Response & PK/PD | Year 3",
    meta_description: "60-question Basic Pharmacology exam MCQ set for MBChB Year 3 covering dose-response relationships, pharmacokinetics and pharmacodynamics.",
  },
  "f0919406-1c17-468e-ad04-63ed01b065fd": {
    meta_title: "Quality Control in Clinical Chemistry MCQs | Chem Path I",
    meta_description: "35 MCQs with explanations on quality control and quality assurance in clinical chemistry for MBChB Year 3 Chemical Pathology I.",
  },
  "68641b6b-7c93-4e05-9bbc-b280891e9124": {
    meta_title: "Cell Injury, Death & Adaptation MCQs | General Pathology",
    meta_description: "MBChB Year 3 General Pathology MCQs on cell injury, cellular adaptation, etiology and pathogenesis, with explained answers for exam revision.",
  },
  "b61441a2-fce2-4e1e-b47a-501dc3947850": {
    meta_title: "Hallmarks of Cancer MCQs (50 Qs) | Oncopathology Year 3",
    meta_description: "50-question MCQ set on the hallmarks of cancer for MBChB Year 3 Oncopathology, covering angiogenesis, VHL syndrome and tumor biology mechanisms.",
  },
  "ee8c269e-f49e-4b62-a75b-a6c564f51f5a": {
    meta_title: "Lipid & Lipoprotein Disorders MCQs | Chemical Pathology",
    meta_description: "40 comprehensive MCQs on lipid and lipoprotein disorders for MBChB Year 3 Chemical Pathology, covering VLDL, LDL, chylomicrons and dyslipidemia.",
  },
  "499e2e1f-0b3d-4a44-be8b-acc0f89af7ac": {
    meta_title: "Cellular Injury & Adaptation MCQs | General Pathology",
    meta_description: "General Pathology MCQs for MBChB Year 3 on cellular injury and adaptation, featuring clinical cases like hepatitis A and jaundice.",
  },
  "7f72709b-62ae-4234-b0b6-478d053ac684": {
    meta_title: "Acid-Base Disorders MCQs | Clinical Cases - Chem Path",
    meta_description: "30 clinical-case MCQs on acid-base disorders for MBChB Year 3 Chemical Pathology, with Winter's formula, anion gap and delta ratio calculations.",
  },
  "72488117-a7e1-4c85-9812-3f609eb13b8c": {
    meta_title: "Pre-Operative Lab Workup Quiz | Chemical Pathology",
    meta_description: "Chemical Pathology quiz for MBChB Year 3 covering pre-operative laboratory workup interpretation and clinical decision-making.",
  },
  "e2f0610f-8534-4830-adcf-467f33b027b0": {
    meta_title: "Cellular Adaptation & Stress MCQs | General Pathology",
    meta_description: "50 MCQs on cellular responses to stress and toxic insults (Robbins Pathology Ch. 1) for MBChB Year 3 General Pathology revision.",
  },
  "88e06805-a632-4109-bf3d-0bb895aec903": {
    meta_title: "Acidosis & Alkalosis MCQs | Chemical Pathology Year 3",
    meta_description: "40 comprehensive MCQs on acidosis and alkalosis for MBChB Year 3 Chemical Pathology, covering blood pH regulation and acid-base balance.",
  },
  "69cdc7a8-1b2a-441a-ab60-9956fd966818": {
    meta_title: "Introduction to Neoplasia MCQs | General Pathology",
    meta_description: "40 MCQs introducing neoplasia for MBChB Year 3 General Pathology, covering tumor definitions, classification and growth patterns.",
  },
  "a9f7c42f-1831-49af-8ea1-29172e7a15b5": {
    meta_title: "Hallmarks of Cancer MCQs (60 Qs) | Oncopathology Exam",
    meta_description: "60-question Oncopathology exam MCQs on the hallmarks of cancer, including familial retinoblastoma and Knudson's two-hit hypothesis.",
  },
};

function csvEscape(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

async function main() {
  const ids = Object.keys(PLAN);
  console.log(`Planned meta updates: ${ids.length}`);

  const test = ids[0];
  const { data: before } = await supabase.from('articles').select('id,title,meta_title,meta_description').eq('id', test).single();
  console.log(`\n--- Test write: "${before.title}" ---`);
  const { error: testErr } = await supabase.from('articles').update(PLAN[test]).eq('id', test);
  if (testErr) { console.error('FATAL test write failed:', testErr.message); return; }
  const { data: after, error: verifyErr } = await supabase.from('articles').select('meta_title,meta_description').eq('id', test).single();
  if (verifyErr || after.meta_title !== PLAN[test].meta_title) {
    console.error('FATAL: test write did not verify.', verifyErr?.message, after);
    return;
  }
  console.log('Test write verified. Proceeding with the rest.\n');

  const log = [{ id: test, title: before.title, old_meta_title: before.meta_title || '', old_meta_description: before.meta_description || '', new_meta_title: PLAN[test].meta_title, new_meta_description: PLAN[test].meta_description, status: 'success' }];
  let ok = 1, fail = 0;
  for (const id of ids.slice(1)) {
    const { data: row } = await supabase.from('articles').select('title,meta_title,meta_description').eq('id', id).single();
    const { error: err } = await supabase.from('articles').update(PLAN[id]).eq('id', id);
    if (err) {
      fail++;
      log.push({ id, title: row?.title || '', old_meta_title: row?.meta_title || '', old_meta_description: row?.meta_description || '', new_meta_title: PLAN[id].meta_title, new_meta_description: PLAN[id].meta_description, status: `FAILED: ${err.message}` });
    } else {
      ok++;
      log.push({ id, title: row?.title || '', old_meta_title: row?.meta_title || '', old_meta_description: row?.meta_description || '', new_meta_title: PLAN[id].meta_title, new_meta_description: PLAN[id].meta_description, status: 'success' });
    }
  }

  const cols = ['id', 'title', 'old_meta_title', 'old_meta_description', 'new_meta_title', 'new_meta_description', 'status'];
  writeFileSync('year3-meta-fix-log.csv', [cols.join(','), ...log.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n'));

  console.log(`\n=== DONE === updated: ${ok}, failed: ${fail}`);
  console.log('Log written to year3-meta-fix-log.csv');
}
main();
