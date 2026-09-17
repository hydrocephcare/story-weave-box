// build-preview.mjs
// Read-only: does NOT touch the database.
// Produces final-preview.csv (everything confidently mapped) and
// unmapped-review.csv (raw labels with no confident mapping -- needs your call).

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const YEAR_PATTERN = /^Year\s*(\d+)\s*:\s*(.+)$/i;

// raw subunit label (lowercase, trimmed) -> { course_unit, subunit }
const MAP = {
  1: {
    'anatomy': { course_unit: 'Human Anatomy I', subunit: 'Anatomy' },
    'gross anatomy head and neck': { course_unit: 'Human Anatomy I', subunit: 'Gross Anatomy Head and Neck' },
    'embryology': { course_unit: 'Human Anatomy I', subunit: 'Embryology' },
    'cardiovascular physiology': { course_unit: 'Medical Physiology I', subunit: 'Cardiovascular Physiology' },
    'neurophysiology i': { course_unit: 'Medical Physiology I', subunit: 'Neurophysiology I' },
    'carbohydrate metabolism and bioenergetics': { course_unit: 'Medical Biochemistry I', subunit: 'Carbohydrate Metabolism and Bioenergetics' },
    'enzymes, vitamins and minerals': { course_unit: 'Medical Biochemistry I', subunit: 'Enzymes, Vitamins and Minerals' },
  },
  2: {
    'cellular immunology': { course_unit: 'Immunology', subunit: 'Cellular Immunology' },
    'clinical biochemistry': { course_unit: 'Medical Biochemistry II', subunit: 'Clinical Biochemistry' },
    'molecular biology': { course_unit: 'Medical Biochemistry II', subunit: 'Molecular Biology' },
    'molecular genetics and cytogenetics': { course_unit: 'Medical Biochemistry II', subunit: 'Molecular Genetics and Cytogenetics' },
    'git physiology': { course_unit: 'Medical Physiology II', subunit: 'GIT Physiology' },
    'physiology': { course_unit: 'Medical Physiology II', subunit: 'Physiology' },
    'microbiology': { course_unit: 'Principles of Microbiology and Parasitology', subunit: 'Microbiology' },
    'parasitology': { course_unit: 'Principles of Microbiology and Parasitology', subunit: 'Parasitology' },
    'human communication skills': { course_unit: 'Human Communication Skills', subunit: 'Human Communication Skills' },
    'epidemiology and statistics': { course_unit: 'Epidemiology and Biostatistics', subunit: 'Epidemiology and Statistics' },
  },
  3: {
    'bacteriology': { course_unit: 'Medical Microbiology and Parasitology', subunit: 'Bacteriology' },
    'bacteriology exam': { course_unit: 'Medical Microbiology and Parasitology', subunit: 'Bacteriology' },
    'basic pharmacology ii': { course_unit: 'Basic Pharmacology', subunit: 'Basic Pharmacology' },
    'basic pharmacology iii': { course_unit: 'Basic Pharmacology', subunit: 'Basic Pharmacology' },
    'pharmacology': { course_unit: 'Basic Pharmacology', subunit: 'Basic Pharmacology' },
    'blood transfusion': { course_unit: 'Hematology and Blood Transfusion', subunit: 'Blood Transfusion' },
    'hematopathology': { course_unit: 'Hematology and Blood Transfusion', subunit: 'Hematopathology' },
    'haematology and blood transfusion pathology': { course_unit: 'Hematology and Blood Transfusion', subunit: 'Hematopathology' },
    'exam hematology': { course_unit: 'Hematology and Blood Transfusion', subunit: 'Hematopathology' },
    'bone and soft tissue pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Bone and Soft Tissue Pathology' },
    'breast pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Breast Pathology' },
    'cardiovascular system pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Cardiovascular System Pathology' },
    'chemical pathology': { course_unit: 'Chemical Pathology', subunit: 'Chemical Pathology' },
    'clinical chemistry': { course_unit: 'Chemical Pathology', subunit: 'Clinical Chemistry' },
    'clinical techniques': { course_unit: 'Clinical Techniques', subunit: 'Clinical Techniques' },
    'introduction to clinical techniques': { course_unit: 'Clinical Techniques', subunit: 'Clinical Techniques' },
    'spot/practical examination': { course_unit: 'Clinical Techniques', subunit: 'Clinical Techniques' },
    'community health': { course_unit: 'Community Health', subunit: 'Community Health' },
    'exam: general & systemic pathology': { course_unit: 'General & Systemic Pathology', subunit: 'General Pathology' },
    'endocrine and metabolic pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Endocrine and Metabolic Pathology' },
    'exam general and systemic pathology': { course_unit: 'General & Systemic Pathology', subunit: 'General Pathology' },
    'female reproductive system pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Female Reproductive System Pathology' },
    'gastrointestinal pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Gastrointestinal Pathology' },
    'general pathology': { course_unit: 'General & Systemic Pathology', subunit: 'General Pathology' },
    'genetic disorders': { course_unit: 'General & Systemic Pathology', subunit: 'Genetic Disorders' },
    'head & neck pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Head & Neck Pathology' },
    'histopathology & cytopathology:': { course_unit: 'General & Systemic Pathology', subunit: 'Histopathology & Cytopathology' },
    'immunopathology': { course_unit: 'Immunopathology', subunit: 'Immunopathology' },
    'introduction to pathology': { course_unit: 'General & Systemic Pathology', subunit: 'General Pathology' },
    'junior clerkship - general pathology i': { course_unit: 'General & Systemic Pathology', subunit: 'General Pathology' },
    'male reproductive and urinary system pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Male Reproductive and Urinary System Pathology' },
    'medical mycology': { course_unit: 'Medical Microbiology and Parasitology', subunit: 'Medical Mycology' },
    'medical virology': { course_unit: 'Medical Microbiology and Parasitology', subunit: 'Medical Virology' },
    'must know virology': { course_unit: 'Medical Microbiology and Parasitology', subunit: 'Medical Virology' },
    'neuropathology': { course_unit: 'General & Systemic Pathology', subunit: 'Neuropathology' },
    'nutrition & diuretics year 3 notes': { course_unit: 'Nutrition and Dietetics', subunit: 'Nutrition and Dietetics' },
    'oncopathology': { course_unit: 'General & Systemic Pathology', subunit: 'Oncopathology' },
    'parasitology': { course_unit: 'Medical Microbiology and Parasitology', subunit: 'Parasitology' },
    'respiratory system pathology': { course_unit: 'General & Systemic Pathology', subunit: 'Respiratory System Pathology' },
  },
};

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  return `"${String(v).replace(/"/g, '""')}"`;
}
function toCsv(rows, cols) {
  return [cols.join(','), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n');
}

async function main() {
  console.log('Fetching all articles...\n');
  const { data, error } = await supabase.from('articles').select('id, title, category, content');
  if (error) { console.error(error.message); return; }

  const preview = [];
  const unmapped = [];
  const personal = [];
  const reference = [];

  for (const note of data) {
    const category = (note.category || '').trim();

    if (category.toLowerCase() === 'stories') {
      personal.push({ id: note.id, title: note.title });
      continue;
    }

    const match = category.match(YEAR_PATTERN);
    if (!match) continue; // already handled/skipped in earlier pass (blank etc.)

    let year = parseInt(match[1], 10);
    const rawUnit = match[2].trim();
    const rawUnitLower = rawUnit.toLowerCase();

    if (rawUnitLower.includes('exam timetable')) {
      reference.push({ id: note.id, title: note.title });
      continue;
    }

    if (year === 5) year = 3; // confirmed reassignment

    if (year < 1 || year > 3) continue;

    const mapping = MAP[year] && MAP[year][rawUnitLower];

    if (!mapping) {
      unmapped.push({
        id: note.id,
        title: note.title,
        year,
        raw_unit: rawUnit,
        content_preview: (note.content || '').slice(0, 150).replace(/\n/g, ' '),
      });
      continue;
    }

    preview.push({
      id: note.id,
      title: note.title,
      year,
      course_unit: mapping.course_unit,
      subunit: mapping.subunit,
      old_category: note.category,
    });
  }

  writeFileSync('final-preview.csv', toCsv(preview, ['id', 'title', 'year', 'course_unit', 'subunit', 'old_category']));
  writeFileSync('unmapped-review.csv', toCsv(unmapped, ['id', 'title', 'year', 'raw_unit', 'content_preview']));
  writeFileSync('personal.csv', toCsv(personal, ['id', 'title']));
  writeFileSync('reference.csv', toCsv(reference, ['id', 'title']));

  console.log(`Confidently mapped: ${preview.length}`);
  console.log(`Unmapped (needs your call): ${unmapped.length}`);
  console.log(`Personal: ${personal.length}`);
  console.log(`Reference: ${reference.length}`);
  console.log('\nFiles written: final-preview.csv, unmapped-review.csv, personal.csv, reference.csv');
}

main();
