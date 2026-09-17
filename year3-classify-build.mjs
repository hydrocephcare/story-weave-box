// year3-classify-build.mjs
// Read-only: builds year3-final-mapping.csv from year3-raw.json
// Does NOT touch the database.
import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('year3-raw.json', 'utf8'));

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  return `"${String(v).replace(/"/g, '""')}"`;
}

// ---------- Base map: raw category suffix (lowercased, trimmed) -> {cu, su} ----------
const BASE_MAP = {
  'general pathology': ['General & Systemic Pathology', 'General Pathology'],
  'endocrine and metabolic pathology': ['General & Systemic Pathology', 'Endocrine and Metabolic Pathology'],
  'bone and soft tissue pathology': ['General & Systemic Pathology', 'Bone and Soft Tissue Pathology'],
  'medical virology': ['Medical Microbiology and Parasitology', 'Medical Virology'],
  'medical mycology': ['Medical Microbiology and Parasitology', 'Medical Mycology'],
  'male reproductive and urinary system pathology': ['General & Systemic Pathology', 'Male Reproductive and Urinary System Pathology'],
  'hematopathology': ['Hematology and Blood Transfusion', 'Hematopathology'],
  'basic pharmacology ii': ['Basic Pharmacology', 'Basic Pharmacology'],
  'basic pharmacology iii': ['Basic Pharmacology', 'Basic Pharmacology'],
  'pharmacology': ['Basic Pharmacology', 'Basic Pharmacology'],
  'breast pathology': ['General & Systemic Pathology', 'Breast Pathology'],
  'chemical pathology': ['Chemical Pathology', 'Chemical Pathology'],
  'cardiovascular system pathology': ['General & Systemic Pathology', 'Cardiovascular System Pathology'],
  'blood transfusion': ['Hematology and Blood Transfusion', 'Blood Transfusion'],
  'introduction to clinical techniques': ['Clinical Techniques', 'Introduction to Clinical Techniques'],
  'neuropathology': ['General & Systemic Pathology', 'Neuropathology'],
  'respiratory system pathology': ['General & Systemic Pathology', 'Respiratory System Pathology'],
  'must know virology': ['Medical Microbiology and Parasitology', 'Medical Virology'],
  'exam hematology': ['Hematology and Blood Transfusion', 'Hematopathology'],
  'genetic disorders': ['General & Systemic Pathology', 'Genetic Disorders'],
  'community health': ['Community Health', 'Community Health'],
  'introduction to pathology': ['General & Systemic Pathology', 'General Pathology'],
  'clinical chemistry': ['Chemical Pathology', 'Clinical Chemistry'],
  'gastrointestinal pathology': ['General & Systemic Pathology', 'Gastrointestinal Pathology'],
  'oncopathology': ['General & Systemic Pathology', 'Oncopathology'],
  'exam timetable': ['__REFERENCE__', null],
  'immunopathology': ['Immunopathology', 'Immunopathology'],
  'exam medical microbiology iii': ['Medical Microbiology and Parasitology', null], // needs per-row
  'histopathology & cytopathology:': ['General & Systemic Pathology', 'Histopathology & Cytopathology'],
  'bacteriology': ['Medical Microbiology and Parasitology', 'Bacteriology'],
  'tuesday': [null, null], // per-row override
  'exam: general & systemic pathology': ['General & Systemic Pathology', null], // per-row
  'dr. irungu 2026': ['General & Systemic Pathology', 'Oncopathology'], // override #1
  'dr. irungu sem 1 crash course': [null, null], // per-row
  'parasitology': ['Medical Microbiology and Parasitology', 'Parasitology'],
  'haematology and blood transfusion pathology': ['Hematology and Blood Transfusion', 'Hematopathology'],
  'spot/practical examination': ['Clinical Techniques', 'Spot/Practical Examination'],
  'clinical techniques': ['Clinical Techniques', 'Clinical Techniques'],
  'nutrition & diuretics year 3 notes': ['Nutrition and Dietetics', 'Nutrition and Dietetics'],
  'exam general and systemic pathology': ['General & Systemic Pathology', null], // per-row
  'head & neck pathology': ['General & Systemic Pathology', 'Head & Neck Pathology'],
  'junior clerkship - general pathology i': [null, null], // per-row override (actually Blood Transfusion)
  'female reproductive system pathology': ['General & Systemic Pathology', 'Female Reproductive System Pathology'],
  'pathology final': [null, null], // per-row
  'sunday': [null, null], // per-row
  'resp & cardio revision': ['General & Systemic Pathology', 'Cardiovascular System Pathology'],
  'female & male patho essays': ['General & Systemic Pathology', 'Female Reproductive System Pathology'],
  'list year 3 rev': ['General & Systemic Pathology', 'Gastrointestinal Pathology'],
  "dr. irungu sem 3 rev.": ['General & Systemic Pathology', 'Dermatopathology'],
  'bacteriology exam': ['Medical Microbiology and Parasitology', 'Bacteriology'],
  'general': [null, null], // per-row
  'patho rev': [null, null], // per-row
};

// ---------- Per-row overrides: id -> {cu, su, bucket, confidence, reason} ----------
const OVERRIDE = {};
function ov(id, cu, su, confidence, reason, bucket = null) {
  OVERRIDE[id] = { cu, su, bucket, confidence, reason };
}

// ===== Override #1: lecturer-name-only titles =====
ov('630499ad-3a4c-4052-a6a6-2cf936b454c0', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Override #1: title is lecturer name only ("Pathology by Dr. Irungu") -> Oncopathology per site owner confirmation');
ov('d53fea41-7313-464b-b63b-e2393f3f585e', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Override #1: title is lecturer name only ("Dr. Irungu Notes") -> Oncopathology per site owner confirmation');

// ===== "Dr. Irungu SEM 1 CRASH COURSE" - titles are NOT lecturer-name-only, classify by content =====
ov('91cfce23-4b62-4897-8203-dc421ee21d3f', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Content is Molecular Basis of Cancer/Cell Cycle/Apoptosis/Angiogenesis - clear Oncopathology; title is not lecturer-name so override #1 does not strictly apply but content independently confirms Oncopathology');
ov('1bdcb672-529f-4edf-afef-f655e4c0ec70', 'General & Systemic Pathology', 'Genetic Disorders', 'low',
  'Multi-topic, picked dominant: Genetic Disorders. Doc covers Section One: Genetic Disorders (~10.8k chars) + Section Two: Neoplasia & Oncology (~5.5k) + Section Three: mixed genetics/cancer biology (~12.9k, roughly half each). Genetics slightly larger overall (~17.3k vs ~12k oncology) and title leads with "Genetic Disorders" - also covers substantial Oncopathology content, review for possible split');

// ===== "Dr. Irungu Sem 3 Rev." content-based (skin content, not lecturer-name title) =====
ov('9788f43d-af8c-4129-9aa2-830d355700d9', 'General & Systemic Pathology', 'Dermatopathology', 'high',
  'Content is entirely skin pathology (infectious dermatoses, psoriasis, pemphigus) - clear Dermatopathology; title is not lecturer-name-only so override #1 does not apply, classified by content per override #3 methodology');

// ===== "Tuesday" / "Tuesday Part 2" - garbage labels, classified by content =====
ov('f92ded78-f5b7-4ec7-ab7d-69a9590611ef', 'General & Systemic Pathology', 'General Pathology', 'medium',
  'Multi-topic, picked dominant: General Pathology. Doc = "TUESDAY PART 1: GENERAL PATHOLOGY" (cell injury/inflammation/wound healing/neoplasia/amyloidosis/forensic/histo-cytology technique, ~15.4k chars) + "PART 2: FEMALE GENITAL SYSTEM PATHOLOGY" (cervical Ca/genital ulcers/endometriosis/fibroids/ovarian neoplasms/vulval path, ~7.9k chars). General Pathology section is ~2x larger by volume.');
ov('698a6fca-b506-4ccb-b40d-cb209da7a376', 'General & Systemic Pathology', 'Gastrointestinal Pathology', 'medium',
  'Multi-topic, picked dominant: GI Pathology. Doc = "TUESDAY PART 3: CARDIOVASCULAR (4.0k) / RESPIRATORY (4.8k) / GI-HEPATOBILIARY (5.9k) PATHOLOGY" - three roughly-equal thirds, GI/Hepatobiliary slightly largest by content volume.');

// ===== "PATHOLOGY FINAL" - mega multi-day, multi-course compilation =====
ov('14775036-cb2c-4e84-bdb7-b6a520583f11', 'General & Systemic Pathology', 'General Pathology', 'low',
  'Extremely multi-topic: full-course final-revision compilation spanning Chemical Pathology (1.7k), Haematology & Blood Transfusion (1.4k), Systemic Pathology Paper1/2 (3.6k+6.0k = largest single course share), Immunopathology (1.3k), Practical Exam/Clinical Techniques (1.6k+0.2k), Basic Pharmacology (1.9k). Picked GSP/General Pathology as largest course-unit share (~54%) but genuinely needs manual splitting into ~6-8 separate notes by site owner.');

// ===== "Sunday" - Chem Path + Haem combined pack =====
ov('e2eaaf23-35c7-41fe-b8a1-6d9d2e8c8d40', 'Hematology and Blood Transfusion', 'Hematopathology', 'low',
  'Multi-topic: "MONDAY FULL REVISION PACK" = Chemical Pathology/Clinical Chemistry (renal/liver/cardiac/adrenal/thyroid/DM/acid-base/lipid function tests, ~12.1k chars, 44%) + Haematology & Blood Transfusion (~15.2k chars, 56%, itself split: anaemia/WBC/platelet/coag/hematopathology-flavored ~8.8k vs blood-products/transfusion-reactions ~5.7k). Picked Hematopathology by volume but title ("Renal, Liver, Cardiac & Adrenal Function Tests") suggests Chemical Pathology/Clinical Chemistry is the intended framing - conflicting signals, needs manual review/split.');

// ===== "Resp & Cardio Revision" title-level content check =====
ov('8758aae2-1de4-4fee-bd39-7e154705a14f', 'General & Systemic Pathology', 'Cardiovascular System Pathology', 'medium',
  'Multi-topic, near-even split: Cardiovascular Pathology (~4.1k chars) vs Respiratory Pathology (~4.0k chars). Cardiovascular slightly larger and leads the title.');

// ===== "Female & Male Patho Essays" =====
ov('39b39d64-52b2-40c9-8bf2-d02ef1ba7b5d', 'General & Systemic Pathology', 'Female Reproductive System Pathology', 'medium',
  'Multi-topic: Female Genital System essays (~11k chars incl. repeated cervical Ca essay, ~55%) + Male Reproductive/testicular/prostate essays (~6.5k, ~32%) + Breast Carcinoma essay (~1.5k, ~8%). Female Reproductive dominant by volume.');

// ===== "List year 3 Rev" - Ovarian & Colorectal + huge diabetes tail =====
ov('6cd8fd6c-ddc3-4cba-a3cb-da6636b09c08', 'General & Systemic Pathology', 'Gastrointestinal Pathology', 'low',
  'Extremely multi-topic: 20 essay questions (Q37-Q56) spanning GI (Colorectal/PUD/Gastritis/Oesophageal-Gastric Ca/Gallstones, ~6.8k, largest), Female Reproductive/PCOS (~5.0k), Endocrine/Diabetes/Cushing (~4.5k), Respiratory/Lung Ca/TB/ARDS (~4.5k), Neuropathology/Stroke/Dementia (~3.2k), Renal/AKI-CKD (~3.2k), Hematopathology/Lymphoma-Leukemia (~3.1k). Picked GI as dominant by volume but this needs manual splitting into ~7 separate notes.');

// ===== "General" - empty title, Blood Transfusion content (NOTE 2 of a series) =====
ov('32d6141b-af76-42cf-b8bc-30e1f095ea36', 'Hematology and Blood Transfusion', 'Blood Transfusion', 'high',
  'Empty title field + leftover AI continuation preamble ("Got it. Continuing exactly from where I was cut off.") at start of content, but actual substance is high-quality, unambiguous, extensive Blood Transfusion Medicine content (ABO/Rh systems, compatibility testing, transfusion reactions) - "HAEMATOLOGY AND BLOOD TRANSFUSION NOTE 2". Kept as real content (not junk) despite missing title; recommend site owner add a title.');

// ===== "Patho Rev" - mega MCQ/essay bank =====
ov('05730379-3a50-4d3f-b9b4-4633b675ec2c', 'General & Systemic Pathology', 'General Pathology', 'low',
  'Extremely multi-topic mega-compilation (77k chars): MONDAY Chemical Pathology+Haematology (~17.7k, 23%), TUESDAY Systemic/General Pathology MCQs+Essays merged from ALL papers (~54.5k, 70%), WEDNESDAY Immunopathology (~4.8k, 6%). Picked GSP/General Pathology as dominant course share by volume but this is a mega question-bank spanning virtually the entire Year 3 curriculum and needs manual splitting; title mentions only "Chemical Pathology & Haematology" though those are the minority.');

// ===== "Must Know Virology" - per-row content check =====
ov('ac44d724-0955-4975-910b-aae0148879cb', 'Medical Microbiology and Parasitology', 'Medical Virology', 'high',
  'Content confirmed Medical Virology (adenoviruses, hemorrhagic fever, viral receptors)');
ov('550e3408-a708-4f85-9f3e-4d765f5ff070', 'Medical Microbiology and Parasitology', 'Medical Mycology', 'high',
  'Category says "Must Know Virology" but content is 100% Mycology (0 viral mentions, 61 fungal mentions) - reclassified');
ov('028b0cbc-30f6-42f0-9076-5d31f7738227', 'Medical Microbiology and Parasitology', 'Medical Mycology', 'medium',
  'Multi-topic: mixed viral (interferons/vaccines/influenza/rabies/HIV, ~5.1k chars) and fungal (true-vs-opportunistic/mycetoma/dermatophytosis/lab diagnosis/tinea/antifungals, ~7.9k chars) content, plus one general/onco topic (normal vs tumor cell, ~1.2k). Fungal content dominant by volume.');
ov('594d8cce-de88-4f98-be4f-d163232cc369', 'Medical Microbiology and Parasitology', 'Medical Virology', 'high',
  'Content confirmed Medical Virology (Cytomegalovirus pathogenesis/diagnosis/treatment)');
ov('2eeef818-c0aa-45c1-a985-d8c3a1c3975a', 'Medical Microbiology and Parasitology', 'Medical Virology', 'high',
  'Content confirmed Medical Virology (pathogenesis, HSV, CMV, Hepatitis, Flu)');

// ===== Breast Pathology category - skin overrides (#2) and mixed content =====
ov('b13a3a5a-ceb4-49cc-a1c0-ef516fba3c9c', 'General & Systemic Pathology', 'Dermatopathology', 'high',
  'Override #2: content is Pigmentation & Melanocyte Disorders (nevi, freckles) - pure skin pathology mislabeled as Breast Pathology');
ov('eeb34078-9794-4228-90f0-44da0fb3fd58', 'General & Systemic Pathology', 'Dermatopathology', 'high',
  'Override #2: content is Acute Skin Inflammation (urticaria, eczema) - pure skin pathology mislabeled as Breast Pathology');
ov('63983f31-3cd1-44cc-a518-643d9dfb8d6b', 'General & Systemic Pathology', 'Dermatopathology', 'high',
  'Override #2: content is Acne Vulgaris & Rosacea (disorders of epidermal appendages) - pure skin pathology mislabeled as Breast Pathology');
ov('ec0d95b4-aceb-409d-bbef-f15088fe1210', 'General & Systemic Pathology', 'Breast Pathology', 'medium',
  'Multi-topic: "Disorders of the Vagina and Breast" - Breast section (fibrocystic change/mastitis/fibroadenoma/phyllodes/carcinoma/male breast, ~8.6k chars) much larger than Vagina section (vaginitis/vaginal neoplasms, ~3.5k chars). Breast Pathology dominant by volume.');
ov('095a3290-926f-4693-ac8e-0f27cce893b5', 'General & Systemic Pathology', 'Breast Pathology', 'low',
  'Multi-topic, near-even split: genuine joint "MBPA 3536B Skin and Breast Pathology" CAT exam. Breast-related keyword mentions (38) slightly outnumber skin-related mentions (34) - picked Breast Pathology by slight margin; could equally be filed as Dermatopathology, needs manual review.');

// ===== Endocrine and Metabolic Pathology category - reclassifications from content check =====
ov('656c382f-db9f-4048-a720-a5d759707f4a', 'Chemical Pathology', 'Clinical Chemistry', 'high',
  'Title/category say Endocrine but content is entirely Clinical Chemistry MCQs (BMP, liver function, electrolytes) - reclassified');
ov('3760740f-f17c-45e1-ab0e-4942df60d09c', 'Chemical Pathology', 'Chemical Pathology', 'low',
  'Content is Neurochemistry (MBMB2234, neurotransmitters e.g. "runner\'s high") - a Medical Biochemistry II topic not clearly covered by the given Year 3 taxonomy. No clean fit; filed under Chemical Pathology (biochemistry-adjacent) as closest analog. Recommend site owner review - may be a Year 2 Biochemistry course mislabeled as Year 3.');
ov('e2f0610f-8534-4830-adcf-467f33b027b0', 'General & Systemic Pathology', 'General Pathology', 'high',
  'Title/category say Endocrine but content is "Cellular Responses to Stress and Toxic Insults" (Robbins Ch.1, cellular adaptations) - core General Pathology topic, reclassified');
ov('ee8c269e-f49e-4b62-a75b-a6c564f51f5a', 'Chemical Pathology', 'Clinical Chemistry', 'high',
  'Title/category say Endocrine but content is Lipid and Lipoprotein Disorders MCQs (VLDL/LDL/HDL/chylomicrons) - Clinical Chemistry topic, reclassified');
ov('72b76c33-b5f6-4437-a582-54fe706c772d', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'high',
  'Content confirmed: Pituitary Tumour, PCOS, Type 1 Diabetes, HHS clinical cases - matches Endocrine and Metabolic Pathology');
ov('2b0ef5f6-f740-4e40-947a-7e37d575945d', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'low',
  'Note has essentially no real teaching content - just meta-instructions about diagrams to draw for Biochemical Endocrinology exam prep, actual diagrams not included. Borderline placeholder; kept under Endocrine and Metabolic Pathology since on-topic, but content is very thin.');
ov('324543fa-1375-425f-9a6d-9b55f0cf6a2b', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'medium',
  'Multi-topic: covers Adrenal/Cushing/Conn/Phaeo/Diabetes/Parathyroid/Porphyrias (Endocrine, ~14.9k chars, dominant), Renal function/AKI/CKD/Calculi (~4.6k), and Lung Tumours/Transplant (~3.3k). Endocrine dominant by volume.');
ov('12d71bf7-98e0-40ba-9a80-92519ec7512f', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'low',
  'Note is essentially just a references/bibliography list (recommended textbooks) with no actual teaching content - very thin, kept under Endocrine and Metabolic Pathology as on-topic course material.');
ov('2e0c9564-762b-4369-a0fe-3139660d9c83', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'medium',
  'Multi-topic (same structure as "Endocrine & Renal Pathology"): Adrenal/Cushing/Conn/Phaeo/Diabetes/Parathyroid/Porphyrias (Endocrine, ~10.4k chars, dominant) + Renal (~5.4k) + Lung Tumours/Transplant (~3.7k). Endocrine dominant by volume.');
ov('ee837240-29c1-4326-bd96-9044973fd0d9', 'Chemical Pathology', 'Clinical Chemistry', 'high',
  'Category says Endocrine but real text content (after stripping ~1.07MB of embedded base64 image data) is "Kidney Function Tests & Gastric Function" - renal/glomerular/tubular function physiology and lab tests - clearly Clinical Chemistry, not endocrine gland disease. Reclassified.');
ov('2bf2b760-1f7b-4ceb-9706-2d48021afc61', 'General & Systemic Pathology', 'Neuropathology', 'medium',
  'Category says Endocrine (likely due to "Metabolism" keyword) but content is Neuroanatomy (brain lobes, blood supply, brain glucose/ketone metabolism) - closest topical fit is Neuropathology, though this is foundational anatomy/physiology rather than disease pathology per se. Reclassified.');
ov('debe9cfe-b489-4acb-900c-93a1aca541c7', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'high',
  'Content confirmed: "LECTURE 1: Principles of Endocrinology" - matches category (real text ~20k chars after stripping embedded base64 images)');
ov('791a83e4-6bdb-417d-87e0-774990888a3f', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'high',
  'Content confirmed: Obesity Types/Causes/Treatments - endocrine/metabolic topic, matches category (real text ~10.4k chars after stripping embedded base64 images)');
ov('863ee0f6-6bff-4265-9377-8545da87c2e4', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'high',
  'Content confirmed: Thyroid hormone synthesis Q&A - matches category (real text only ~5.2k chars after stripping ~1.09MB of embedded base64 image data)');
ov('aa80da6c-f516-42b2-a9e2-196682594bc8', 'General & Systemic Pathology', 'Genetic Disorders', 'medium',
  'Multi-topic: "SECTION A: Oncopathology" (grading/staging, ~4.8k chars) + "SECTION B: Genetic Disorders" (Mendelian inheritance patterns, ~8.4k chars). Genetic Disorders section is larger by volume.');
ov('a26c5e3e-79eb-475e-9910-58b207a5413d', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'medium',
  'Content is "Biochemical Endocrinology, MBMB2234: Neurochemistry" exam paper (Medical Biochemistry II, unit code MBMB2200) - genuinely about hormone biochemistry, fits Endocrine and Metabolic Pathology topically despite being from a different course code; kept as on-topic match.');
ov('069963bb-0d9e-4ce9-a506-ac8c51ccb377', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'high',
  'Content confirmed Endocrine and Metabolic Pathology MCQs (real text ~17k chars after stripping ~1.4MB of embedded base64 image data)');
ov('5c815f8a-1046-4fca-bb3c-f5873435d072', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'high',
  'Content confirmed Endocrine and Metabolic Pathology MCQs for Medical Students (real text ~33k chars after stripping ~1.2MB of embedded base64 image data)');

// ===== "Exam Hematology" per-row content =====
ov('1221cab3-aed5-4e10-b285-be7681d9596f', 'Hematology and Blood Transfusion', 'Hematopathology', 'high',
  'Content confirmed: Haematology MCQs (general anaemia/exam content)');
ov('48c72126-7f3a-447e-9b9a-7631632d78c5', 'Hematology and Blood Transfusion', 'Hematopathology', 'high',
  'Content confirmed: Haematopoiesis, Anaemia & IDA (Topics 1-5)');
ov('7c1cc27d-4cbf-4bba-8a0f-32aa9a6e1b2d', 'Hematology and Blood Transfusion', 'Hematopathology', 'high',
  'Content confirmed: Acute Leukaemia (AML/ALL) & WBC Disorders (Topics 7-14)');
ov('a15874d0-3082-4e8e-8783-520e71372e63', 'Hematology and Blood Transfusion', 'Blood Transfusion', 'high',
  'Content confirmed: Blood Transfusion Guide - ABO, Reactions, Products & Safety (Topics 15-18)');

// ===== "EXAM: General & Systemic Pathology" / "Exam General and Systemic Pathology" per-row =====
ov('65e06c63-1c47-4dc8-8a5f-0faf30b2e8e6', 'Hematology and Blood Transfusion', 'Hematopathology', 'low',
  'Multi-topic: two full exam papers concatenated - "General & Systemic Pathology Exam" (broad multi-system SAQ/essay paper: cervical Ca/ovarian/diabetes/oedema/glomerular/atherosclerosis/cirrhosis/carcinogens/genetics/fracture-healing/diarrhoea/RHD/vasculitis/pre-eclampsia, ~3.2k chars, no single dominant subunit) + "Haematology Exam" (leukemia/anaemia/myeloma/CML/blood-products, ~4.5k chars, Hematopathology-flavored). Haematology section is larger by volume; picked Hematopathology but title says "General & Systemic Pathology Exam" - conflicting signals, needs manual split.');
ov('58ec9e18-54ef-42e3-a0da-500fa9bc95d9', 'General & Systemic Pathology', 'Respiratory System Pathology', 'medium',
  'Multi-topic, near-even 3-way split: Cardiovascular Pathology (~4.4k chars), Respiratory Pathology (~5.2k, largest), GI/Hepatobiliary Pathology (~4.9k). Respiratory slightly dominant by volume though title leads with "Cardiovascular".');
ov('061820bb-1f88-4a1c-ac40-577c1762347c', 'General & Systemic Pathology', 'General Pathology', 'medium',
  'Broad multi-system SAQ paper (neural tube defects/Neuro, carcinogenesis/Onco, genetics, oedema/general, glomerular injury/renal, atherosclerosis/cardio, liver cirrhosis/GI, diabetes/endocrine, fracture healing/bone - all roughly equal weight, no single dominant subunit). Used General Pathology as the default/comprehensive-exam bucket per taxonomy guidance.');

// ===== "Exam Medical Microbiology III" category (2 rows) - per-row content check =====
ov('c9a18250-7c66-4fee-a1e8-317cbbe14abf', 'Medical Microbiology and Parasitology', 'Medical Mycology', 'low',
  'Multi-topic, near-even split: huge combined exam-paper compilation (74.8k chars) with viral keyword mentions (136) almost exactly matching fungal keyword mentions (138) - title itself says "Viruses, Fungi & Diagnosis". Picked Medical Mycology by the slimmest margin; genuinely a coin-flip, needs manual split.');
ov('cf20af6c-cd88-4dfb-be92-1a8122520772', 'Medical Microbiology and Parasitology', 'Medical Mycology', 'high',
  'Content is dominated by Cryptococcosis/Cryptococcal meningitis (fungal) discussion; brief prion/viral-encephalitis questions are marked "(2 repeats - refer to previous answer)" i.e. not elaborated. Title ("Cryptococcal Meningitis... Fungal Treatment") confirms Medical Mycology.');

// ===== Immunopathology, Bacteriology, etc are clean - no overrides needed =====

// ===== BONE AND SOFT TISSUE PATHOLOGY category contamination (6 rows -> Neuropathology, 6 rows -> GI) =====
const boneToNeuro = [
  ['5e57bab6-11dc-4a14-8355-f748d8bd16ed', 'CNS Trauma Neuropathology: Fractures, Concussion & CTE'],
  ['8d6d0fd0-fd97-4e51-a3af-d9b7d3df6788', 'CNS Malformations: NTDs, Spina Bifida & Anencephaly Guide'],
  ['15738b26-7ee3-418f-8f67-200ea52cb681', 'Neurodegenerative Prion Diseases: CJD, Pathology & Rapid Dementia'],
  ['3959b2df-052f-48d6-a788-28971fbdd2f8', 'Cerebral Edema, Hydrocephalus, Raised ICP & Brain Herniation Pathology'],
  ['64058384-a7f1-412a-b6f7-64dbbb8be870', 'Cerebrovascular Disease: Stroke, Ischemia & Hemorrhage Explained'],
  ['f39e50af-cef9-45fa-bc4a-3bc6f274b1b0', 'Neuropathology: CNS Neuronal & Astrocyte Injury Reactions'],
];
for (const [id, t] of boneToNeuro) {
  ov(id, 'General & Systemic Pathology', 'Neuropathology', 'high',
    `Category is "Bone and Soft Tissue Pathology" but title/content ("${t}") is clearly CNS/Neuropathology - reclassified (systemic mislabeling found across this category)`);
}
const boneToGI = [
  ['27f16853-5416-4b75-aca1-ba875ef90076', 'Liver Tumors: Benign, Primary, and Secondary Malignancies Summary'],
  ['6928f654-7580-444e-8aa6-ce5c383b45cc', 'GASTROINTESTINAL PATHOLOGY (Part 2)'],
  ['e5fddead-3212-46e0-8726-8cf3344641de', 'Gastrointestinal Neoplasms: High-Yield Exam Review'],
  ['953933e9-3757-4d65-bc83-b898d01ba82c', 'Gastropathology Pathology'],
  ['1bb6bd21-a4e2-4115-9962-92dc457b7cac', 'Tumours of the Gastrointestinal Tract'],
  ['66ca2809-8db2-484f-a77a-8865020d5a36', 'Liver Tumors: Benign and Malignant Overview'],
];
for (const [id, t] of boneToGI) {
  ov(id, 'General & Systemic Pathology', 'Gastrointestinal Pathology', 'high',
    `Category is "Bone and Soft Tissue Pathology" but title/content ("${t}") is clearly GI/hepatobiliary - reclassified (systemic mislabeling found across this category)`);
}

// ===== GENERAL PATHOLOGY category contamination =====
ov('499e2e1f-0b3d-4a44-be8b-acc0f89af7ac', 'General & Systemic Pathology', 'General Pathology', 'high',
  'Category is "Gastrointestinal Pathology" but title/content ("CELLULAR INJURY AND ADAPTATION MCQs") is core General Pathology - reclassified');
ov('59384604-9e23-49c8-8599-d1dcd764c66f', 'General & Systemic Pathology', 'Gastrointestinal Pathology', 'high',
  'Category is "General Pathology" but title/content ("GASTROINTESTINAL PATHOLOGY Part 1") is GI Pathology - reclassified');
ov('b4d538f1-3017-4c63-97d9-d288e9f133dd', 'General & Systemic Pathology', 'Gastrointestinal Pathology', 'high',
  'Category is "General Pathology" but title/content ("GASTROINTESTINAL PATHOLOGY Part 3") is GI Pathology - reclassified');
ov('0f5655da-913d-400f-8032-4b8ca98abc11', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("General Pathology MCQs: Cancer, Tumors & Molecular Path Review") is Oncopathology content - reclassified');
ov('e4e9c1e8-45a6-4154-8b27-1c48664603a3', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("Hallmarks of Cancer: Molecular Basis, Cell Cycle & Oncogenes") is Oncopathology - reclassified');
ov('64d58490-0228-4109-8d96-35105b3feff9', 'Chemical Pathology', 'Chemical Pathology', 'high',
  'Category is "General Pathology" but title ("Chemical Pathology Practice Examination") is Chemical Pathology - reclassified');
ov('ce08bfa7-871f-4b12-991e-851a2035d771', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("ONCOPATHOLOGY MCQs - HALLMARKS OF CANCER") is Oncopathology - reclassified');
ov('99e6fa6d-0567-4972-a637-96e100819790', 'General & Systemic Pathology', 'Female Reproductive System Pathology', 'high',
  'Category is "General Pathology" but title ("Outline of Female Reproductive Pathology") is Female Reproductive System Pathology - reclassified');
ov('94108dad-7d21-421f-9801-4acb35332f18', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("ONCOPATHOLOGY - SHORT ANSWER QUESTIONS") is Oncopathology - reclassified');
ov('69cdc7a8-1b2a-441a-ab60-9956fd966818', 'General & Systemic Pathology', 'General Pathology', 'medium',
  '"INTRODUCTION TO NEOPLASIA MCQs" - foundational neoplasia nomenclature/concepts typically taught as part of General Pathology intro chapter rather than the specialized Oncopathology (molecular/cancer-biology) course; kept as General Pathology, borderline with Oncopathology');
ov('b61441a2-fce2-4e1e-b47a-501dc3947850', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("Oncopathology Hallmarks of Cancer MCQs") is Oncopathology - reclassified');
ov('a9f7c42f-1831-49af-8ea1-29172e7a15b5', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("ONCOPATHOLOGY MCQ EXAMINATION Hallmarks of Cancer") is Oncopathology - reclassified');
ov('86d65f5d-3d3a-43dc-8f33-ff834798534f', 'General & Systemic Pathology', 'Cardiovascular System Pathology', 'high',
  'Category is "General Pathology" but title ("Heart Disease: Must Knows") is Cardiovascular System Pathology - reclassified');
ov('024030f6-f8fb-4529-ac28-0a4e59ae6b01', 'Medical Microbiology and Parasitology', 'Parasitology', 'high',
  'Category is "General Pathology" but title/content ("Life Cycles of Medically Important Trematodes (Flukes)") is Parasitology - reclassified');
ov('958891be-f438-4ac7-91d4-6bdde759a53f', 'General & Systemic Pathology', 'Histopathology & Cytopathology', 'medium',
  'Multi-topic: Q1-9 Oncopathology (benign/malignant tumours, hallmarks, oncoviruses, tumour markers, ~1.9k chars) + Q10-31 Histopathology & Cytopathology (cytology, histopath, tissue fixation, FNA, decalcification, tissue processing, ~7.7k chars). Histopathology & Cytopathology dominant by volume (~80%).');
ov('847aa557-0b8b-4082-a06a-c934b5331f42', 'Chemical Pathology', 'Clinical Chemistry', 'high',
  'Category is "General Pathology" but title ("Clinical Enzymes: Functions and Applications") is Clinical Chemistry - reclassified');
ov('3f48f7eb-e5db-4d23-bc47-8abfd70c9e28', 'General & Systemic Pathology', 'Respiratory System Pathology', 'high',
  'Category is "General Pathology" but title ("Respiratory Pathology 1b") is Respiratory System Pathology - reclassified');
ov('b3dd28be-c71f-4074-b27a-ca5ba9ba123b', 'General & Systemic Pathology', 'Gastrointestinal Pathology', 'high',
  'Category is "Hematopathology" but content ("Liver Histology, Physiology and Pathology") is GI/hepatobiliary - reclassified (see also Hematopathology contamination notes)');
ov('e9981bb9-6fe6-492d-b5f1-dd73553fac9a', null, null, 'medium',
  'Pure administrative/course-outline document (Department vision/mission, course purpose, quality objectives for the Chemical Pathology course unit MBPA 3600) - no actual teaching content. Not a real course-content article; bucketed as reference alongside Exam Timetable documents.', 'reference');
ov('bf553699-2614-44ec-a209-80dbfdedcd13', 'General & Systemic Pathology', 'Cardiovascular System Pathology', 'high',
  'Category is "General Pathology" but title ("VASCULAR PATHOLOGY — Must-Know Comprehensive Notes") is Cardiovascular System Pathology - reclassified');
ov('7f8d6102-fe3f-4752-a226-6b1370420b35', 'General & Systemic Pathology', 'Cardiovascular System Pathology', 'high',
  'Category is "General Pathology" but title ("VASCULAR PATHOLOGY — Must-Know Notes") is Cardiovascular System Pathology - reclassified (duplicate of bf553699)');
ov('9a4e4df0-e574-4340-b0bd-1d6a06a6d16d', 'General & Systemic Pathology', 'Cardiovascular System Pathology', 'high',
  'Category is "General Pathology" but title ("Heart Disease — Must Knows") is Cardiovascular System Pathology - reclassified (duplicate of 86d65f5d)');
ov('ea588569-cc68-464d-affd-73ab3a131161', 'General & Systemic Pathology', 'Female Reproductive System Pathology', 'high',
  'Category is "General Pathology" but title ("Female Reproductive Pathology: HPV, Cancer, PCOS & Pregnancy") is Female Reproductive System Pathology - reclassified');
ov('a95a31da-273f-4718-a9c3-3ebc7d8ac64d', 'General & Systemic Pathology', 'Respiratory System Pathology', 'high',
  'Category is "General Pathology" but title ("Lung Pathology — Must-Know") is Respiratory System Pathology - reclassified');
ov('fa8ac930-6e96-4732-9167-77c21ac6eba7', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("ONCOPATHOLOGY - 30 KEY SHORT ANSWER QUESTIONS Hallmarks") is Oncopathology - reclassified');
ov('7220b242-bdb5-4bb9-965b-81fdcbf7a481', 'General & Systemic Pathology', 'Oncopathology', 'high',
  'Category is "General Pathology" but title ("ONCOPATHOLOGY - MCQs WITH EXPLANATIONS") is Oncopathology - reclassified');
ov('54d3293c-53b6-402f-9f93-506be2299bfb', null, null, 'high',
  'Broken/placeholder note: title is a leftover AI meta-comment ("Looking back at the document, I need to check if I\'ve covered all questions...") and content is only 89 characters of AI self-talk with no real teaching content whatsoever', 'junk');

// ===== HEMATOPATHOLOGY category contamination =====
ov('fcf197c0-b3ae-4473-baab-d88da4b5f839', 'Hematology and Blood Transfusion', 'Blood Transfusion', 'high',
  'Category is "Hematopathology" but content ("Blood Transfusion Contraindications & Acute Reactions") is Blood Transfusion - reclassified');
ov('88e06805-a632-4109-bf3d-0bb895aec903', 'Chemical Pathology', 'Clinical Chemistry', 'high',
  'Category is "Hematopathology" but content ("ACIDOSIS AND ALKALOSIS MCQs") is acid-base/Clinical Chemistry - reclassified');
ov('22888b16-2692-490d-b7d9-2744c58bda25', 'General & Systemic Pathology', 'Genetic Disorders', 'high',
  'Category is "Hematopathology" but content ("Defects in DNA Repair and Replication") is molecular genetics/cancer predisposition - Genetic Disorders, reclassified (sickle cell used only as an illustrative missense-mutation example)');
ov('5647759d-d436-479e-9ae4-7e8bedcfab30', 'General & Systemic Pathology', 'Genetic Disorders', 'high',
  'Category is "Hematopathology" but content is entirely mutation types/DNA repair/transcription/gene-transfer molecular genetics (sickle cell/thalassemia used only as illustrative examples) - Genetic Disorders, reclassified');
ov('72488117-a7e1-4c85-9812-3f609eb13b8c', 'Hematology and Blood Transfusion', 'Hematopathology', 'high',
  'Title says "Chemical Pathology" but content is entirely hematology case questions (anaemia, thalassemia, myeloma, coagulation - 57 heme keyword mentions vs 8 chem-path mentions) - title is a misnomer, category label is correct, kept as Hematopathology');

// ===== JUNIOR CLERKSHIP category (1 row) =====
ov('f80d97cf-4334-45df-891e-64a4bfea6491', 'Hematology and Blood Transfusion', 'Blood Transfusion', 'high',
  'Category is "Junior Clerkship - General Pathology I" but content ("Transfusion: Governance, Donor Selection & Blood Groups") is clearly Blood Transfusion - reclassified');

// ===== FEMALE REPRODUCTIVE category contamination (1 row) =====
ov('7a528db0-4b22-4d38-a889-0b66d3109b7b', 'General & Systemic Pathology', 'Dermatopathology', 'high',
  'Category is "Female Reproductive System Pathology" but content is the joint "MBPA 3536B Skin and Breast Pathology" CAT exam, and skin-related mentions (73) vastly outnumber breast-related mentions (14) - override #2 logic applied, reclassified to Dermatopathology');

// ===== RESPIRATORY category contamination =====
ov('7f72709b-62ae-4234-b0b6-478d053ac684', 'Chemical Pathology', 'Clinical Chemistry', 'high',
  'Category is "Respiratory System Pathology" but content ("ACID-BASE DISORDERS - CLINICAL CASE MCQs", Winter\'s formula/anion gap) is Clinical Chemistry - reclassified');
ov('16936379-5541-46a7-9138-7089393c06a3', 'Nutrition and Dietetics', 'Nutrition and Dietetics', 'high',
  'Category is "Respiratory System Pathology" but title ("Bnd 3104 Nutrition And Dietetics") is clearly Nutrition and Dietetics - reclassified');

// ===== BLOOD TRANSFUSION category contamination =====
ov('ef1a7f99-7653-4535-b148-19e8877c2075', 'Hematology and Blood Transfusion', 'Hematopathology', 'medium',
  'Category is "Blood Transfusion" but content ("Haemostasis & Coagulation: Platelet Function & Bleeding Disorders", MBML3223 NOTE 1) covers hemostasis/coagulation/platelet/bleeding disorders which fit Hematopathology (blood-disorder pathology) better than Blood Transfusion (transfusion-practice); reclassified for consistency with similar content elsewhere');
ov('d333712a-dc6c-4e69-a939-8e404cb506a2', 'Hematology and Blood Transfusion', 'Hematopathology', 'high',
  'Category is "Blood Transfusion" but content ("MDS, Myelofibrosis & HLH") is Hematopathology (myeloid neoplasms), not transfusion practice - reclassified');
ov('cd769b67-4dcd-4814-bd15-50ad6c9989dc', 'Hematology and Blood Transfusion', 'Hematopathology', 'high',
  'Category is "Blood Transfusion" but content ("Aplastic Anemia... Hoffbrand\'s Essential Haematology Ch.22, Bone Marrow Failure") is Hematopathology - reclassified');

// ===== COMMUNITY HEALTH category contamination =====
ov('ba67f4bc-480e-40d1-90dc-f91bc27d0cfb', 'Clinical Techniques', 'Introduction to Clinical Techniques', 'high',
  'Category is "Community Health" but title ("Chest X-ray Interpretation Guide: ABCDE Approach for Medical Students") is a clinical/radiology skill, not community health - reclassified');

// ===== MEDICAL VIROLOGY category contamination =====
ov('4f9386c9-9fe1-411b-8a70-f423ce1433fb', 'Medical Microbiology and Parasitology', 'Medical Mycology', 'high',
  'Title says "Medical Virology & Mycology — MCQ Bank" but content is 100% Mycology (0 viral keyword mentions, 150 fungal mentions; only "SECTION 1: MYCOLOGY" header present, no virology section) - reclassified');

// ===== CLINICAL CHEMISTRY category - crash course multi-topic =====
ov('f18fa6cb-76d8-4403-812f-88213fb76ffa', 'Chemical Pathology', 'Clinical Chemistry', 'medium',
  'Multi-topic compilation ("3 Sections covering full 565-page document"): Clinical Chemistry fundamentals/panels/specimen-handling/plasma-proteins/enzymes/acid-base/lipids/QC (~12.4k chars, ~57%), Histopathology & Cytopathology/tissue-fixation/cytology-technique (~8.1k, ~37%), Nutrition & Dietetics/vitamins-malnutrition (~1.0k, ~5%). Clinical Chemistry dominant by volume, matches original label.');

// ===== EMPTY-TITLE rows (kept, content verified legitimate) =====
ov('3caafd28-a84d-4495-9281-32d9acda913d', 'General & Systemic Pathology', 'Male Reproductive and Urinary System Pathology', 'high',
  'Empty title field but content matches the "Penile & Testicular Pathologies" male reproductive overview - legitimate content, category label correct, just missing a title');
ov('c2b9c790-26af-41fd-b5c2-01c27380fa81', 'Chemical Pathology', 'Clinical Chemistry', 'high',
  'Empty title field but content is a genuine Chemical Pathology exam paper (BPA2103, acid-base/respiratory-alkalosis MCQs) - legitimate content, category label correct, just missing a title');

// ===== VINDICATE row (Introduction to Clinical Techniques -> GI content) =====
ov('ac1c4907-be3b-4a36-9bd4-5040dae4bdfc', 'General & Systemic Pathology', 'Gastrointestinal Pathology', 'medium',
  'Category is "Introduction to Clinical Techniques" but content is GI disease classification via the VINDICATE mnemonic (vascular/infectious/neoplastic/etc. causes of GI disease) - disease content, not an exam-technique/history-taking skill; reclassified to GI Pathology');

// ===== "Endocrine LAqs and SAqs" under Basic Pharmacology III =====
ov('74d6acd4-c449-40af-83c4-25bae2ae556b', 'General & Systemic Pathology', 'Endocrine and Metabolic Pathology', 'medium',
  'Category is "Basic Pharmacology III" but content is "Biochemical Endocrinology" past-paper notes (endocrine disruptors, hormone therapy) with no pharmacology drug-mechanism focus - reclassified to Endocrine and Metabolic Pathology as closest topical fit');

// ===== "Medical Biochemistry II" under Basic Pharmacology III =====
ov('d170f990-cb11-424f-accf-9023014f1ace', 'Chemical Pathology', 'Chemical Pathology', 'low',
  'Category is "Basic Pharmacology III" but content is a "Medical Biochemistry II (MBMB 2200)" exam paper on integrated metabolism - not pharmacology at all and no clean taxonomy fit. Filed under Chemical Pathology (biochemistry-adjacent) as closest analog; recommend review, may be a Year 2 Biochemistry course mislabeled as Year 3.');

// ---------- Junk bucket additions (broken/placeholder) ----------
// (54d3293c and others already added above with bucket 'junk')

// ---------- Build output rows ----------
const out = [];
let refCount = 0, personalCount = 0, junkCount = 0, lowConfCount = 0;
const comboCounts = {};

for (const row of data) {
  const id = row.id;
  const title = row.title || '';
  const rawCategory = (row.category || '').trim();
  const match = rawCategory.match(/^Year\s*3\s*:\s*(.+)$/i);
  const suffix = match ? match[1].trim() : rawCategory;
  const suffixLower = suffix.toLowerCase().replace(/\s+/g, ' ').trim();

  let cu = null, su = null, bucket = null, confidence = 'high', reason = '';

  if (OVERRIDE[id]) {
    const o = OVERRIDE[id];
    cu = o.cu; su = o.su; bucket = o.bucket; confidence = o.confidence; reason = o.reason;
  } else if (BASE_MAP[suffixLower]) {
    const [baseCu, baseSu] = BASE_MAP[suffixLower];
    if (baseCu === '__REFERENCE__') {
      bucket = 'reference';
      confidence = 'high';
      reason = 'Exam Timetable document - not a course unit';
    } else {
      cu = baseCu; su = baseSu;
      confidence = 'high';
      reason = `Clean label match: raw suffix "${suffix}" maps directly to taxonomy`;
    }
  } else {
    // Unhandled raw label with no base map and no override - should not happen, but flag for safety
    cu = 'General & Systemic Pathology'; su = 'General Pathology';
    confidence = 'low';
    reason = `UNHANDLED raw category suffix "${suffix}" - defaulted to General Pathology, needs manual review`;
  }

  if (bucket === 'reference') refCount++;
  if (bucket === 'personal') personalCount++;
  if (bucket === 'junk') junkCount++;
  if (confidence === 'low') lowConfCount++;

  const newCategory = bucket ? '' : `Year 3: ${cu}`;
  const newUnit = bucket ? '' : su;

  if (!bucket) {
    const comboKey = `${cu} | ${su}`;
    comboCounts[comboKey] = (comboCounts[comboKey] || 0) + 1;
  } else {
    comboCounts[`[bucket] ${bucket}`] = (comboCounts[`[bucket] ${bucket}`] || 0) + 1;
  }

  out.push({
    id,
    title,
    old_category: rawCategory,
    old_unit: row.unit || '',
    new_category: newCategory,
    new_unit: newUnit,
    bucket: bucket || '',
    confidence,
    reason,
  });
}

// ---------- Write CSV ----------
const columns = ['id', 'title', 'old_category', 'old_unit', 'new_category', 'new_unit', 'bucket', 'confidence', 'reason'];
const csvLines = [columns.join(',')];
for (const r of out) {
  csvLines.push(columns.map(c => csvEscape(r[c])).join(','));
}
writeFileSync('year3-final-mapping.csv', csvLines.join('\n'));

// ---------- Summary ----------
console.log(`Total rows processed: ${out.length}\n`);
console.log('Counts per new_category + new_unit (and buckets), sorted descending:');
const sortedCombos = Object.entries(comboCounts).sort((a, b) => b[1] - a[1]);
for (const [combo, count] of sortedCombos) {
  console.log(`  ${count}\t${combo}`);
}
console.log(`\nLow-confidence rows: ${lowConfCount}`);
console.log(`Reference bucket: ${refCount}`);
console.log(`Personal bucket: ${personalCount}`);
console.log(`Junk bucket: ${junkCount}`);

console.log('\n--- Low confidence / flagged rows detail ---');
for (const r of out) {
  if (r.confidence === 'low' || r.bucket === 'junk' || r.reason.toLowerCase().includes('multi-topic')) {
    console.log(`\n[${r.confidence}${r.bucket ? ' | bucket=' + r.bucket : ''}] ${r.id} | ${JSON.stringify(r.title)}`);
    console.log(`  old: ${r.old_category}`);
    console.log(`  new: ${r.new_category} ${r.new_unit}`);
    console.log(`  reason: ${r.reason}`);
  }
}
