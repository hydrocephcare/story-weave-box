// hema-chempath-apply.mjs
// WRITES to the database. Splits Hematopathology/Blood Transfusion and
// Chemical Pathology/Clinical Chemistry by actual content into semester-specific
// subunits, eliminating the "Other Units" bucket for these. Also fixes 2 rows
// that are genuinely Year 2 Biochemistry content miscategorized as Year 3.
// Updates BOTH category and unit together so the frontend (which only reads
// category) stays consistent. Test-write first, then bulk, full log.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

// id -> { category, unit, confidence, reason }
const PLAN = {
  // --- Wrong year entirely (Year 2 Biochemistry content, not Year 3 Chemical Pathology) ---
  "d170f990-cb11-424f-accf-9023014f1ace": { category: "Year 2: Medical Biochemistry II", unit: "Medical Biochemistry II", confidence: "high", reason: "Content explicitly says 'Unit Title: Medical Biochemistry II' (MBMB 2200 = Year 2 code per exam timetable), not Year 3 Chemical Pathology" },
  "3760740f-f17c-45e1-ab0e-4942df60d09c": { category: "Year 2: Medical Biochemistry II", unit: "Medical Biochemistry II", confidence: "medium", reason: "MBMB2234 Neurochemistry Test - biochemistry course code, not a Chemical Pathology topic at all" },

  // --- Chemical Pathology / Clinical Chemistry -> Chemical Pathology I (Sem1) ---
  "c7befa18-3168-4fa5-b65f-b0739206e4de": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "medium", reason: "Clinical enzymology/biomarkers - Sem1 'plasma proteins & enzymes' topic" },
  "e486f428-24cb-44b7-9113-a82f877481e8": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Specimen/sample handling - exact match to Sem1's first topic" },
  "e0aa7e9d-ec9f-418b-944d-e6a2fa233d24": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Liver function tests - exact match to Sem1 'liver function and disease' topic" },
  "64d58490-0228-4109-8d96-35105b3feff9": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "low", reason: "Generic MBPA 3600 practice exam, no semester stated - defaulted" },
  "847aa557-0b8b-4082-a06a-c934b5331f42": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Clinical enzymes - Sem1 'plasma proteins & enzymes' topic" },
  "656c382f-db9f-4048-a720-a5d759707f4a": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "medium", reason: "General clinical chemistry/basic metabolic panel - intro-level Sem1 content" },
  "f0919406-1c17-468e-ad04-63ed01b065fd": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Content explicitly labeled 'Chemical Pathology I' and covers Quality Control - exact Sem1 topic match" },
  "ee8c269e-f49e-4b62-a75b-a6c564f51f5a": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Lipid and lipoprotein disorders - exact Sem1 topic match" },
  "c3585606-cb89-4afc-8447-fbc836ec0829": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Quality control in clinical chemistry - exact Sem1 topic match" },
  "47daa53a-f9b3-4a73-a34d-186b4f8fcb1e": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Sodium disorders - exact Sem1 'fluid & electrolyte disorders (Na/K)' topic match" },
  "8f6e9f23-1e3c-4e2a-b49e-d4fb01bfa3a9": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Title literally states 'Chemical Pathology Sem 1'" },
  "f18fa6cb-76d8-4403-812f-88213fb76ffa": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Title literally states 'CRUSH COURSE YEAR 3 SEM 1 WORK'" },
  "c2b9c790-26af-41fd-b5c2-01c27380fa81": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "medium", reason: "Respiratory alkalosis/acid-base - Sem1 'acid-base/blood gas analysis' topic" },
  "8544c7a9-8ff7-4418-a282-ddf5f2978c24": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "GI/pancreatic disorders and liver disease - both exact Sem1 topics; part of the same series as the explicit 'SEM 1' crash course" },
  "cb640a0a-7fc6-4c0f-bb17-e701fc6d7626": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "medium", reason: "Cytology/vitamins/trace elements section of the same 'SEM 1' crash course series (Parts 1-3)" },
  "7f72709b-62ae-4234-b0b6-478d053ac684": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Acid-base disorders - exact Sem1 topic match" },
  "88e06805-a632-4109-bf3d-0bb895aec903": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "high", reason: "Acidosis and alkalosis - exact Sem1 acid-base topic match" },

  // --- Chemical Pathology / Clinical Chemistry -> Chemical Pathology II (Sem2) ---
  "5f937a40-812a-42ae-ac53-a4f8c4c4e386": { category: "Year 3: Chemical Pathology II", unit: "Chemical Pathology II", confidence: "high", reason: "Content explicitly says 'Assessment: End of Semester 2 CAT - Unit: Chemical Pathology II'" },
  "aca1d504-5556-4456-949f-0e1de4785028": { category: "Year 3: Chemical Pathology II", unit: "Chemical Pathology II", confidence: "medium", reason: "Diabetes and renal disease are Sem2 topics (endocrine disorders, renal function evaluation)" },
  "370992f8-1b16-402c-9049-2ae71ba57e1c": { category: "Year 3: Chemical Pathology II", unit: "Chemical Pathology II", confidence: "low", reason: "Title names Endocrine & Renal (Sem2 topics) though content preview shows general electrolytes too - mixed" },
  "ee837240-29c1-4326-bd96-9044973fd0d9": { category: "Year 3: Chemical Pathology II", unit: "Chemical Pathology II", confidence: "medium", reason: "Kidney function tests - Sem2 'renal function evaluation' topic" },

  // --- Reclassified out of Hematopathology into their real unit ---
  "e2eaaf23-35c7-41fe-b8a1-6d9d2e8c8d40": { category: "Year 3: Chemical Pathology II", unit: "Chemical Pathology II", confidence: "low", reason: "Mixed Chem Path/Haematology revision pack, dominant framing is organ function tests (renal/adrenal are Sem2 topics); was mislabeled under Hematopathology unit" },
  "65e06c63-1c47-4dc8-8a5f-0faf30b2e8e6": { category: "Year 3: General Pathology", unit: "General Pathology", confidence: "medium", reason: "Title is 'General & Systemic Pathology Exam', not Haematology - was mislabeled under Hematopathology unit" },
  "72488117-a7e1-4c85-9812-3f609eb13b8c": { category: "Year 3: Chemical Pathology I", unit: "Chemical Pathology I", confidence: "low", reason: "Generic pre-op lab panel question, Chemical Pathology content mislabeled under Hematopathology unit" },

  // --- Blood Transfusion -> all Semester 3 (confirmed: it's explicitly a Sem3 topic) ---
  "9f8daef9-7582-4f7d-8f23-a5588b663adf": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Content explicitly states 'MBML 3223 | Semester 3'" },
  "fcf197c0-b3ae-4473-baab-d88da4b5f839": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Same document series as the explicit Semester 3 blood transfusion notes" },
  "90467770-9f70-4027-b637-d23f2ffb743e": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Content explicitly states 'Mid Semester 3 - Continuous Assessment Test'" },
  "f80d97cf-4334-45df-891e-64a4bfea6491": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Blood transfusion governance/donor selection - Sem3 topic" },
  "779250a3-b0a5-4004-95b2-9172cc013f2f": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Blood grouping/typing - Sem3 blood transfusion topic" },
  "d6381565-892e-40c3-8cde-093f6542df0d": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Blood transfusion medicine review - Sem3 topic" },
  "32d6141b-af76-42cf-b8bc-30e1f095ea36": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Same MBML3223 Semester 3 blood transfusion note series" },
  "a15874d0-3082-4e8e-8783-520e71372e63": { category: "Year 3: Blood Transfusion", unit: "Blood Transfusion", confidence: "high", reason: "Blood groups/transfusion compatibility - Sem3 topic" },

  // --- Hematopathology -> Hematopathology II (Sem2: haemopoiesis/anaemia/WBC/coagulation) ---
  "89c47275-d9c4-43ff-b89d-52bb93d36599": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "medium", reason: "Sickle cell disease - Sem2 'anaemia' topic" },
  "d433fddc-e909-4503-93f4-1a7c78f835e1": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "high", reason: "Content explicitly states 'CAT 2 - End of Semester 2'" },
  "b3645b00-b674-4194-9a4b-e2e4303354d5": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "medium", reason: "Lymphoma - Sem2 'WBC malignancies' topic" },
  "13eb910f-247b-422f-810a-8dc6b04333c8": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "high", reason: "White cell disorders - exact Sem2 'WBC malignancies' topic match" },
  "43093875-63a2-4e93-9217-af5d525d29f3": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "medium", reason: "Hematologic malignancies and bleeding disorders - Sem2 WBC malignancy/coagulation topics" },
  "cbdf513e-1dd7-4e90-840e-2bc27aaee18f": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "low", reason: "Garbled 'Semester Two (Sem 1)' header - leaned Sem2" },
  "53e948b2-60ac-45fe-b1d3-573b242a19b0": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "high", reason: "Anaemia, leukaemia, clotting - all three are Sem2 topics" },
  "48c72126-7f3a-447e-9b9a-7631632d78c5": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "high", reason: "Haematopoiesis and anaemia/IDA - exact Sem2 topic match" },
  "087bd6a6-36f6-48b6-96d5-077cb2844840": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "low", reason: "Generic past-paper MCQs/essays, no clear semester signal - defaulted" },
  "7cd72a72-6794-4fcc-a54a-9b9cf7b36a63": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "medium", reason: "Opens with haemopoietic bone marrow composition - Sem2 haemopoiesis topic" },
  "7c1cc27d-4cbf-4bba-8a0f-32aa9a6e1b2d": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "high", reason: "WBC function & disorders, acute leukaemia - exact Sem2 topic match" },
  "076c3be4-52e9-4c52-ba8c-cfe55d9d4491": { category: "Year 3: Hematopathology II", unit: "Hematopathology II", confidence: "medium", reason: "Non-Hodgkin Lymphoma - Sem2 WBC malignancy topic" },

  // --- Hematopathology -> Hematopathology III (Sem3: MDS/aplastic anaemia/stem cell/myeloproliferative) ---
  "d333712a-dc6c-4e69-a939-8e404cb506a2": { category: "Year 3: Hematopathology III", unit: "Hematopathology III", confidence: "high", reason: "MDS/myelofibrosis - exact Sem3 'myeloproliferative disease/myelodysplastic syndromes' topic match" },
  "ef1a7f99-7653-4535-b148-19e8877c2075": { category: "Year 3: Hematopathology III", unit: "Hematopathology III", confidence: "high", reason: "Content explicitly states 'MBML 3223 | Semester 3'" },
  "ee5492ab-fb9e-4dd9-829b-ee6a57e23ee4": { category: "Year 3: Hematopathology III", unit: "Hematopathology III", confidence: "medium", reason: "Part of the same explicit-Semester-3 haemostasis/coagulation note series" },
  "1221cab3-aed5-4e10-b285-be7681d9596f": { category: "Year 3: Hematopathology III", unit: "Hematopathology III", confidence: "low", reason: "End-of-year comprehensive exam spanning the whole Haematology course - defaulted to Sem3 as the culminating semester" },
  "cdb4d91d-c68d-4a3e-942d-dd7c944dc880": { category: "Year 3: Hematopathology III", unit: "Hematopathology III", confidence: "high", reason: "Content explicitly states 'SEMESTER THREE - REMAINING TOPICS' covering MDS" },
  "cd769b67-4dcd-4814-bd15-50ad6c9989dc": { category: "Year 3: Hematopathology III", unit: "Hematopathology III", confidence: "high", reason: "Aplastic anaemia and bone marrow failure - exact Sem3 topic match" },
};

function csvEscape(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

async function main() {
  const ids = Object.keys(PLAN);
  console.log(`Planned updates: ${ids.length}`);

  const test = ids[0];
  const testPlan = PLAN[test];
  const { data: before } = await supabase.from('articles').select('id,title,category,unit').eq('id', test).single();
  console.log(`\n--- Test write: "${before.title}" ---`);
  console.log(`  category: "${before.category}" -> "${testPlan.category}"`);
  console.log(`  unit: "${before.unit}" -> "${testPlan.unit}"`);
  const { error: testErr } = await supabase.from('articles').update({ category: testPlan.category, unit: testPlan.unit }).eq('id', test);
  if (testErr) { console.error('FATAL test write failed:', testErr.message); return; }
  const { data: after, error: verifyErr } = await supabase.from('articles').select('category,unit').eq('id', test).single();
  if (verifyErr || after.category !== testPlan.category || after.unit !== testPlan.unit) {
    console.error('FATAL: test write did not verify.', verifyErr?.message, after);
    return;
  }
  console.log('Test write verified. Proceeding with the rest.\n');

  const log = [{ id: test, title: before.title, old_category: before.category, old_unit: before.unit, new_category: testPlan.category, new_unit: testPlan.unit, confidence: testPlan.confidence, reason: testPlan.reason, status: 'success' }];
  let ok = 1, fail = 0;
  for (const id of ids.slice(1)) {
    const plan = PLAN[id];
    const { data: row } = await supabase.from('articles').select('title,category,unit').eq('id', id).single();
    const { error: err } = await supabase.from('articles').update({ category: plan.category, unit: plan.unit }).eq('id', id);
    if (err) {
      fail++;
      log.push({ id, title: row?.title || '', old_category: row?.category || '', old_unit: row?.unit || '', new_category: plan.category, new_unit: plan.unit, confidence: plan.confidence, reason: plan.reason, status: `FAILED: ${err.message}` });
      console.error(`  FAILED ${id}: ${err.message}`);
    } else {
      ok++;
      log.push({ id, title: row?.title || '', old_category: row?.category || '', old_unit: row?.unit || '', new_category: plan.category, new_unit: plan.unit, confidence: plan.confidence, reason: plan.reason, status: 'success' });
    }
  }

  const cols = ['id', 'title', 'old_category', 'old_unit', 'new_category', 'new_unit', 'confidence', 'reason', 'status'];
  writeFileSync('hema-chempath-log.csv', [cols.join(','), ...log.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n'));

  console.log(`\n=== DONE === updated: ${ok}, failed: ${fail}`);
  console.log('Log written to hema-chempath-log.csv');
}
main();
