// Course outlines for Years 3 and 4 taken from the department documents (Pathology, Medical Virology, Basic
// Pharmacology, Obstetrics & Gynaecology). Same rule as courseOutlines.ts: item ids are permanent because they key
// each student's saved progress, so never reuse or renumber them. Weeks are left out where the source document's
// week numbering was ambiguous; topics are listed in teaching order.
import type { CourseOutline, OutlineItem } from "./courseOutlines.ts";

const list = (prefix: string, titles: string[], week?: string): OutlineItem[] =>
  titles.map((title, i) => ({ id: `${prefix}-${String(i + 1).padStart(2, "0")}`, title, week }));
const weeks = (prefix: string, rows: [week: string, title: string, detail?: string][]): OutlineItem[] =>
  rows.map(([week, title, detail], i) => ({ id: `${prefix}-${String(i + 1).padStart(2, "0")}`, week, title, detail }));

const PATH_TEAM = "Department of Pathology, School of Medicine, Mount Kenya University.";
const PATH_ASSESS = "CATs & logbook 40% (a written CAT at the end of every semester) · End-of-year examination 60% (MCQ, SAQ, LAQ and practical).";

const chemicalPathology: CourseOutline = {
  id: "chemical-pathology", year: 3, department: "Chemical Pathology",
  title: "Year 3 Chemical Pathology (MBPA 3600)",
  summary: "Use of the clinical chemistry laboratory to screen, diagnose, monitor and manage disease. Two semesters; practical sessions and a mandatory logbook.",
  team: `${PATH_TEAM} Prepared by Dr. Noelle Orata (HOD).`, assessment: PATH_ASSESS, librarySlugs: ["chemical-pathology"],
  sections: [
    { id: "cp-s1", title: "Semester 1 — Chemical Pathology I", items: list("cp-s1", [
      "Introduction to clinical chemistry", "Clinical utility of biochemical tests", "Specimen collection and handling for biochemical analysis",
      "Outline of analytical techniques", "Principles of automation", "Basic statistics (precision, accuracy, predictive value, disease prevalence)",
      "Quality control", "Quality assurance — internal quality control: pre-analytical, analytical, post-analytical; QC material",
      "Lipids and lipoprotein disorders", "Cardiovascular diseases / biochemical cardiac markers", "Acid–base balance and blood gas analysis",
      "Fluid and electrolyte disorders: water, sodium and potassium", "Plasma proteins and enzymes", "Gastrointestinal and pancreatic disorders (malabsorption)",
      "Clinical nutrition: vitamins, trace elements, protein-energy malnutrition and obesity", "Liver function and disease", "Revision / missed lessons"]) },
    { id: "cp-s2", title: "Semester 2 — Chemical Pathology II", items: list("cp-s2", [
      "The metabolic aspect of malignant disease: tumour markers, paraneoplastic endocrine syndromes, ectopic hormone production", "Gonadal dysfunction",
      "Delayed and precocious puberty, hirsutism, virilism, infertility and semen analysis", "Principles of clinical toxicology: therapeutic drug monitoring and chemical aspects",
      "Inherited metabolic disorders", "Metabolic bone disorders, hyperuricaemia and gout", "Introduction to endocrine disorders", "Pituitary disorders", "Thyroid disorders",
      "Carbohydrate metabolism and diabetes mellitus", "Adrenal disorders I (cortex hyperfunction)", "Adrenal disorders — continued", "Evaluation of renal function: glomerular, tubular, urinalysis",
      "Biochemical tests in acute kidney injury, chronic kidney disease and renal calculi", "Porphyrinurias", "Revision / missed lessons"]) },
  ],
};

const generalPathology: CourseOutline = {
  id: "general-systemic-pathology", year: 3, department: "General & Systemic Pathology",
  title: "Year 3 General & Systemic Pathology",
  summary: "General principles of disease, then organ-system pathology, across three semesters. Each unit runs for about 12 weeks and ends with a recap.",
  team: PATH_TEAM, assessment: PATH_ASSESS, librarySlugs: ["pathology"],
  sections: [
    { id: "gp-s1a", title: "Semester 1 — Introduction to Pathology", items: list("gp-s1a", [
      "The cell as a unit of health and disease", "Cellular responses to stress and toxic insults: adaptation, injury and death", "Inflammation and repair", "Haemodynamic disorders",
      "Thromboembolic disease", "Shock", "Infectious diseases — part 1", "Infectious diseases — part 2", "Environmental diseases", "Nutritional diseases", "Diseases of infancy and childhood"]) },
    { id: "gp-s1b", title: "Semester 1 — Oncopathology", items: list("gp-s1b", [
      "Nomenclature: characteristics of benign and malignant neoplasms", "Epidemiology of cancer", "Molecular basis of cancer: genetic and epigenetic alterations", "Proto-oncogenes, oncogenes and oncoproteins",
      "Insensitivity to growth inhibition: tumour suppressor genes", "Evasion of programmed cell death", "Angiogenesis", "Invasion and metastasis", "Evasion of host defence",
      "Dysregulation of cancer-associated genes", "Carcinogenic agents and their cellular interactions", "Clinical aspects of neoplasia"]) },
    { id: "gp-s1c", title: "Semester 1 — Genetic Disorders", items: list("gp-s1c", [
      "Genes and human diseases", "Mendelian disorders", "Chromosomal disorders", "Down syndrome", "Klinefelter syndrome", "Turner syndrome", "Single-gene disorders with non-classic inheritance",
      "Fragile X syndrome and fragile X tremor", "Prader–Willi and Angelman syndromes", "Molecular genetic diagnosis: methods and indications for testing", "Molecular analysis of genomic alterations", "Next-generation sequencing"]) },
    { id: "gp-s1d", title: "Semester 1 — Introduction to Cytopathology & Histopathology", items: list("gp-s1d", [
      "Tissues and tissue fixation", "Tissue decalcification and processing", "Microtomy", "Histochemical stains", "Immunohistochemical stains", "Introduction to cytology and cytopathology",
      "Exfoliative cytology", "Body fluids cytopathology", "Fine needle aspiration", "Special techniques in cytology"]) },
    { id: "gp-s2a", title: "Semester 2 — Pathology of the Cardiovascular System", items: list("gp-s2a", [
      "Vascular structure, function, anomalies and wall response to injury", "Hypertensive vascular disease and arteriosclerosis", "Atherosclerosis, aneurysms and dissection",
      "Vasculitis: giant cell, Takayasu, polyarteritis nodosa, Kawasaki, Churg–Strauss, Behçet", "Disorders of blood vessel hyperactivity, veins and lymphatics", "Vascular tumours and pathology of vascular intervention",
      "Cardiac structure, specialisations and effects of ageing on the heart", "Overview of cardiac physiology and heart failure", "Congenital heart disease and ischaemic heart disease",
      "Arrhythmias, hypertensive heart disease and valvular heart disease", "Cardiomyopathies, pericardial disease, rheumatologic heart disease, cardiac tumours and transplantation"]) },
    { id: "gp-s2b", title: "Semester 2 — Pathology of the Respiratory System", items: list("gp-s2b", [
      "Congenital anomalies, atelectasis and pulmonary oedema", "Acute lung injury and ARDS (diffuse alveolar damage)", "Obstructive lung diseases", "Chronic diffuse interstitial (restrictive) diseases",
      "Diseases of vascular origin", "Pulmonary infections: community-acquired bacterial pneumonias", "Pulmonary infections: community-acquired viral pneumonias",
      "Hospital-acquired pneumonia, aspiration pneumonia and lung abscess", "Chronic pneumonias; pneumonia in the immunocompromised / HIV", "Lung transplantation and tumours", "Pleura: effusion, pneumothorax, pleural tumours"]) },
    { id: "gp-s2c", title: "Semester 2 — Pathology of the Gastrointestinal System", items: list("gp-s2c", [
      "Congenital abnormalities: atresia, fistula, duplications, hernia, omphalocele, gastroschisis, Meckel diverticulum, pyloric stenosis, Hirschsprung disease", "Oesophagus: obstruction and achalasia", "Oesophagitis and oesophageal tumours",
      "Stomach: gastropathy, acute and chronic gastritis", "Hypertrophic gastropathies, gastric polyps and tumours", "Small intestine and colon: obstruction, ischaemic bowel disease, malabsorption",
      "Infectious enterocolitis and irritable bowel syndrome", "Inflammatory bowel disease, graft-versus-host disease, sigmoid diverticular disease", "Polyps: adenomatous polyposis and hereditary non-polyposis",
      "Colorectal cancer and adenocarcinoma", "Haemorrhoids, acute appendicitis and tumours of the appendix", "Peritoneal cavity and tumours"]) },
    { id: "gp-s2d", title: "Semester 2 — Pathology of the Female Reproductive System", items: list("gp-s2d", [
      "Anatomy of the female reproductive system", "Infections of the female reproductive system", "Vulva: inflammation, infection and neoplasms", "Vagina: inflammation, infection and neoplasms",
      "Cervix: inflammation, infection and neoplasms", "Uterine body: inflammation, infection and neoplasms", "Fallopian tubes: inflammation, infection and neoplasms", "Ovaries: inflammation, infection and neoplasms",
      "Gestational disorders", "Placental disorders: inflammation and infection", "Placental disorders: neoplasms"]) },
    { id: "gp-s2e", title: "Semester 2 — Pathology of the Head, Neck, Endocrine & Metabolic Systems", items: list("gp-s2e", [
      "Oral pathology", "Ear pathology: inflammation, infection and neoplasms", "Eye pathology: inflammation, infection and neoplasms", "Neck: inflammation, infection and neoplasms", "Salivary glands",
      "Pituitary gland", "Thyroid gland", "Parathyroid gland", "Pancreas", "Adrenal gland", "Multiple endocrine neoplasia syndromes and the pineal gland"]) },
    { id: "gp-s3a", title: "Semester 3 — Neuropathology", items: list("gp-s3a", [
      "Cellular pathology of the central nervous system", "Cerebral oedema, hydrocephalus, raised intracranial pressure and herniation", "Malformations and developmental disorders", "Trauma",
      "Cerebrovascular diseases", "Infections", "Prion diseases", "Demyelinating diseases", "Neurodegenerative disease", "Genetic metabolic diseases", "Toxic and acquired metabolic diseases"]) },
    { id: "gp-s3b", title: "Semester 3 — Bone & Soft Tissue Pathology", items: list("gp-s3b", [
      "Bone: structure and function, developmental, genetic and acquired disorders", "Bone: fractures, osteonecrosis, osteomyelitis, bone tumours and tumour-like lesions",
      "Joints: osteoarthritis, rheumatoid arthritis, juvenile idiopathic arthritis, seronegative spondyloarthropathies", "Joints: infectious arthritis, crystal-induced arthritis, tumours and tumour-like lesions",
      "Soft tissue: tumours of adipose, fibrous and skeletal muscle tissue", "Peripheral nerves: injury and neuropathies", "Neuromuscular junction: antibody-mediated disease and congenital myasthenic syndromes",
      "Peripheral nerves: disorders caused by toxins", "Peripheral nerve sheath tumours: schwannomas, MPNST, neurofibromatosis I and II", "Skeletal muscle: atrophy, neurogenic and myopathic change, inflammatory myopathies",
      "Skeletal muscle: toxic myopathies and inherited diseases"]) },
    { id: "gp-s3c", title: "Semester 3 — Skin & Breast Pathology", items: list("gp-s3c", [
      "Epidermis, blistering and bullous disorders, disorders of epidermal appendages", "Dermis: acute and chronic inflammatory dermatoses", "Dermal tumours", "Tumours of cellular migrants of the skin; molecular genetics of skin cancers",
      "Melanocytic tumours", "Life-cycle changes of the breast and inflammation", "Benign epithelial lesions", "Breast cancer", "Stromal tumours", "Male breast", "Diagnostic approach to breast disease"]) },
    { id: "gp-s3d", title: "Semester 3 — Male Reproductive & Urinary System Pathology", items: list("gp-s3d", [
      "Kidney: congenital and developmental anomalies; clinical manifestations of renal disease", "Kidney: glomerular, tubular and interstitial diseases", "Kidney: vascular and cystic diseases, urinary tract obstruction", "Kidney: neoplasms",
      "Lower urinary tract: ureters, bladder and urethra — congenital anomalies", "Lower urinary tract: infections and inflammations", "Lower urinary tract: neoplasms and obstructive lesions", "Male genital tract: congenital anomalies",
      "Male genital tract: infections and inflammations", "Male genital tract: neoplasms and obstructive lesions", "Male genital tract: prostate enlargement and regressive changes"]) },
  ],
};

const haematology: CourseOutline = {
  id: "haematology-blood-transfusion", year: 3, department: "Haematology & Blood Transfusion",
  title: "Year 3 Haematology & Blood Transfusion Pathology",
  summary: "Normal blood and bone marrow, anaemias, leukaemias, haemostasis and transfusion medicine, across semesters 2 and 3.",
  team: PATH_TEAM, assessment: PATH_ASSESS, librarySlugs: ["haematopathology"],
  sections: [
    { id: "hb-s2", title: "Semester 2", items: list("hb-s2", ["Introduction to haematology", "Haemopoiesis", "Erythrocytes", "Haemoglobin", "Anaemia", "Leukocytes", "White blood cell malignancies 1", "White blood cell malignancies 2", "Platelet structure and morphology 1", "Platelet structure and morphology 2", "Coagulation system"]) },
    { id: "hb-s3", title: "Semester 3", items: list("hb-s3", ["Blood transfusion 1", "Blood transfusion 2", "Bone marrow failure and aplastic anaemia", "Plasma cell dyscrasias 1", "Plasma cell dyscrasias 2", "Haematopathology of the reticuloendothelial system",
      "Myeloproliferative disease", "Myelodysplastic syndromes", "Stem cell transplantation", "Haematological changes in systemic disease", "Pregnancy and neonatal haematology", "Haematology in HIV"]) },
  ],
};

const immunopathology: CourseOutline = {
  id: "immunopathology", year: 3, department: "Immunopathology",
  title: "Year 3 Immunopathology",
  summary: "Clinical immunology for the third semester: hypersensitivity, immunodeficiency, transplantation, vaccines and immune-based therapy.",
  team: PATH_TEAM, assessment: PATH_ASSESS,
  sections: [
    { id: "ip-s3", title: "Semester 3", items: list("ip-s3", ["Introduction to clinical management", "Hypersensitivity type 1", "Hypersensitivity type 2", "Hypersensitivity type 3", "Hypersensitivity type 4", "Immunodeficiency states", "Reproductive immunology", "Vaccinology", "Transplantation immunology", "Autoimmunity and autoimmune deficiencies", "Immune-based therapy"]) },
  ],
};

const virology: CourseOutline = {
  id: "medical-virology", year: 3, department: "Medical Virology",
  title: "Year 3 Medical Virology (MBMM 3333)",
  summary: "Viruses as disease-causing agents: structure, replication, pathogenesis, laboratory diagnosis, antivirals, vaccines, and the major DNA and RNA virus families. 42 contact hours.",
  team: "Department of Medical Microbiology — Dr. Suliman Essuman.", assessment: "First sit-in CAT in week 5 and an end-of-term CAT.", librarySlugs: ["microbiology"],
  sections: [
    { id: "mv-1", title: "Basic virology & antivirals", items: weeks("mv-1", [
      ["Week 1", "The virus", "Classification, structure, atypical virus-like agents, slow viruses and prions, replication and the growth curve; Baltimore classification."],
      ["Week 2", "Viral infection of the host cell", "Lytic, lysogenic, latent and persistent infections; host defences; laboratory diagnosis (cell culture, microscopy, serology, nucleic acids)."],
      ["Week 3", "Antiviral agents and vaccines", "Classification and mechanisms of antivirals, selective toxicity, classes of vaccines and how cells fight back."]]) },
    { id: "mv-2", title: "DNA & RNA viruses", items: weeks("mv-2", [
      ["Week 4", "DNA and RNA viruses — differences and clinical implications"],
      ["Week 4", "DNA enveloped viruses", "Herpes viruses (HSV-1, HSV-2, VZV, EBV, CMV, HHV-8); smallpox."],
      ["Week 5", "DNA non-enveloped viruses", "Adenovirus, papillomavirus, parvovirus."],
      ["Week 5", "First sit-in CAT"],
      ["Week 6", "RNA enveloped viruses", "Influenza, measles, mumps, RSV, parainfluenza, rubella, rabies."],
      ["Week 7", "RNA non-enveloped viruses", "Poliovirus, coxsackievirus, rhinovirus, rotavirus."],
      ["Week 7", "Hepatitis viruses", "Hepatitis A, B, C, E."]]) },
    { id: "mv-3", title: "Arboviruses, oncogenic viruses & HIV", items: weeks("mv-3", [
      ["Week 8", "Arboviruses and yellow fever", "Classes, diseases, transmission, control; yellow fever vaccine."],
      ["Week 8", "Tumour development and oncogenic viruses", "Apoptosis, proto-oncogenes, tumour suppressor genes; DNA and RNA tumour viruses."],
      ["Week 9", "Viral encephalitis and haemorrhagic fevers"],
      ["Week 10", "HIV", "Life cycle, epidemiology, antiretroviral therapy and its mechanisms, vaccine challenges."],
      ["CAT", "End-of-term CAT"]]) },
  ],
};

const basicPharmacology: CourseOutline = {
  id: "basic-pharmacology", year: 3, department: "Basic Pharmacology",
  title: "Year 3 Basic Pharmacology (MBPL 3811, 3822, 3833)",
  summary: "Pharmacology across three trimesters: principles, autonomic and CNS drugs, autacoids, anti-infectives, pain and immunomodulation, then antimicrobial therapy and oncology.",
  team: "Dr. Kwansah Ndemo, Pharm.D, MPH.", assessment: "One CAT at the end of each trimester; final exam revision in week 13 of the third trimester.", librarySlugs: ["pharmacology"],
  sections: [
    { id: "bp-t1", title: "Trimester 1 — MBPL 3811", items: weeks("bp-t1", [
      ["Week 1", "Introduction to pharmacology", "History, branches, drug discovery, sources, nomenclature, drug information and classifications."],
      ["Week 2", "Introduction to PK & PD", "Pharmaceutics and pharmacotherapeutics; drug interactions."],
      ["Week 3", "Drug discovery, targets of drug therapy and clinical trials", "Basic principles in toxicology; principles of medication therapy and how to prescribe."],
      ["Week 3", "ANS pharmacology", "Sympathomimetics, adrenergic blockers, cholinomimetics, cholinergic antagonists, neuromuscular blockers, local anaesthetics."],
      ["Week 4", "CNS pharmacology", "Neurotransmitters, antidepressants, psychomotor stimulants, antipsychotics, antiemetics, anti-Parkinson drugs, central analgesics, general anaesthetics, anti-anxiety agents, anticonvulsants."],
      ["Week 5", "Autacoid pharmacology", "Histamine and antihistamines, 5-HT and its antagonists, lipid-derived autacoids and PAF."],
      ["Week 6", "Chemotherapy series: anti-infectives and resistance", "Basic strategies of antimicrobial therapy; the enemies — Gram-positive, Gram-negative and anaerobic pathogens."],
      ["Week 7", "Chemotherapy series: antimicrobial classes", "Mycobacteria, viruses, fungi, protozoa and helminths; cell-wall inhibitors; protein-synthesis inhibitors; quinolones and urinary antiseptics."],
      ["Week 8", "Antimetabolites and antivirals", "Antiviral therapy (herpes), antiretrovirals (HIV and hepatitis), antifungals."],
      ["Week 9", "Vaccines", "Basic principles of immunology and vaccines."],
      ["Week 10", "Pain management: anti-inflammatory agents", "Eicosanoids, cyclooxygenase enzymes, NSAIDs, corticosteroids."],
      ["Week 11", "Gout, rheumatoid arthritis and immunosuppression", "Immunosuppressive and immunomodulating agents, colchicine, uricosurics, allopurinol."],
      ["Week 12", "CAT revision week"]]) },
    { id: "bp-t2", title: "Trimester 2 — MBPL 3822", items: weeks("bp-t2", [
      ["Week 1", "Principles of rational antimicrobial prescribing", "Site-specific signs and symptoms, host factors, empirical therapy, isolating the organism, dosing, failure and toxicity, preventing AMR."],
      ["Week 2", "Patient cases: prophylaxis, CNS and respiratory tract infections, tuberculosis"],
      ["Week 3", "Patient cases: infectious diarrhoea, intra-abdominal infections, UTIs, STDs"],
      ["Week 4", "Patient cases: skin and soft-tissue infections, infections in cancer patients, viral/fungal/parasitic infections"],
      ["Week 5", "Pharmacotherapy of HIV infection", "Opportunistic infections in HIV-infected patients."],
      ["Week 6", "Viral hepatitis A, B and C"],
      ["Week 7", "Pharmacodynamics of antimicrobial agents", "Time-dependent versus concentration-dependent killing."],
      ["Week 8", "Treatment and management of HIV", "Clinical guidelines, review of HAART and the major side effects of ART."],
      ["Week 9", "Emerging communicable diseases", "Focus on COVID-19."],
      ["Week 10", "Medications used in dermatology", "Acne treatment, retinoids, sunscreens."],
      ["Week 11", "Review of chemotherapeutic agents"],
      ["Week 12", "CAT revision week"]]) },
    { id: "bp-t3", title: "Trimester 3 — MBPL 3833", items: weeks("bp-t3", [
      ["Week 1", "Introduction to oncology", "History of cancer treatment, cellular and genetic basis, mechanisms, cancer biology, immuno-oncology."],
      ["Week 2", "Treatment approaches in oncology", "Surgery, radiotherapy, pharmacotherapy."],
      ["Week 3", "Drug classes used in oncology", "How chemotherapy drugs are classified; cell-cycle-specific versus non-specific."],
      ["Week 4", "Alkylating agents, antimetabolites, anthracyclines"],
      ["Week 5", "Topoisomerase inhibitors, mitotic inhibitors, platinum compounds"],
      ["Week 6", "Antitumour antibiotics and miscellaneous agents"],
      ["Week 7", "Targeted therapy, hormonal therapy and immunotherapy"],
      ["Week 8", "Oncology patient care", "Overall care of cancer patients; adverse and toxic effects of oncology drugs and how to manage them."],
      ["Weeks 9–10", "Management and practice of oncology in Kenya", "The life of an oncologist at work; success stories."],
      ["Week 11", "Review of drug classes used in oncology"],
      ["Weeks 12–13", "CAT and final exam revision"]]) },
  ],
};

const obgyn: CourseOutline = {
  id: "obstetrics-gynaecology", year: 4, department: "Obstetrics & Gynaecology",
  title: "Year 4 Obstetrics & Gynaecology — Junior Clerkship in Reproductive Health",
  summary: "Mount Kenya University Department of Obstetrics and Gynaecology. Six units of twelve weeks, each ending with an end-of-trimester CAT.",
  librarySlugs: ["obstetrics-and-gynaecology"],
  sections: [
    { id: "og-o1", title: "Obstetrics I — Diagnosis of pregnancy, early pregnancy disorders, antenatal care", items: weeks("og-o1", [
      ["Week 1", "Diagnosis of pregnancy", "Physical, chemical and radiological."], ["Week 2", "Physiological changes of pregnancy"], ["Week 3", "Abnormalities of early pregnancy", "Abortion."],
      ["Week 4", "Gestational trophoblastic disease"], ["Week 5", "Preconception care"], ["Week 6", "Antenatal care", "Models of ANC; FANC."], ["Week 7", "Safe motherhood initiative"],
      ["Week 8", "Birth preparedness and complication readiness"], ["Week 9", "Prenatal genetic counselling and screening"], ["Week 10", "Discomforts of pregnancy"],
      ["Week 11", "Antenatal assessment of foetal well-being"], ["Week 12", "End-of-trimester CAT"]]) },
    { id: "og-o2", title: "Obstetrics II — Labour", items: weeks("og-o2", [
      ["Week 1", "Normal labour", "Review of anatomy: foetal skull and maternal pelvis."], ["Week 2", "Theories on onset of labour"], ["Week 3", "Physiology of labour"], ["Week 4", "Diagnosis and management of labour"],
      ["Week 5", "Abnormal labour: malpositions"], ["Week 6", "Abnormal labour: malpresentations"], ["Week 7", "Prolonged and obstructed labour"], ["Week 8", "Induction of labour"],
      ["Week 9", "Operative vaginal deliveries", "Vacuum and forceps delivery."], ["Week 9", "Shoulder dystocia"], ["Week 9", "Umbilical cord prolapse"], ["Week 10", "Caesarean section"], ["Week 11", "Perioperative care"], ["Week 12", "End-of-trimester CAT"]]) },
    { id: "og-o3", title: "Obstetrics III — Abnormal pregnancy", items: weeks("og-o3", [
      ["Week 1", "Medical disorders in pregnancy: hypertensive disorders"], ["Week 2", "Malaria and anaemia in pregnancy"], ["Week 3", "Diabetes in pregnancy"], ["Week 4", "HIV in pregnancy"], ["Week 5", "UTI in pregnancy"],
      ["Week 6", "Antepartum haemorrhage", "Placenta praevia and placental abruption."], ["Week 7", "Preterm labour"], ["Week 8", "Premature rupture of membranes and post-term pregnancy"], ["Week 9", "Rhesus isoimmunisation"],
      ["Week 10", "Multiple pregnancy"], ["Week 11", "Assessment of foetal well-being"], ["Week 12", "End-of-trimester CAT"]]) },
    { id: "og-o4", title: "Obstetrics IV — Puerperium", items: weeks("og-o4", [
      ["Week 1", "Normal puerperium"], ["Week 2", "Management of normal puerperium"], ["Week 3", "Complicated puerperium: PPH — uterine atony"], ["Week 4", "PPH — retained placenta and genital tract trauma"],
      ["Week 5", "Breast complications"], ["Week 6", "Psychiatric disorders in the puerperium"], ["Week 7", "Venous thromboembolism and obstetric palsies"], ["Week 8", "Lactation: physiology"], ["Week 9", "Complications of lactation"],
      ["Week 10", "Targeted postpartum care"], ["Week 11", "Maternal audit"], ["Week 12", "End-of-trimester CAT"]]) },
    { id: "og-g1", title: "Gynaecology I", items: weeks("og-g1", [
      ["Week 1", "Evaluation of the gynaecology patient", "History, examination, investigations and diagnostic procedures."], ["Week 2", "Review of anatomy and physiology of the reproductive organs", "Female and male."], ["Week 3", "Congenital disorders"],
      ["Week 4", "Puberty", "Normal and abnormal."], ["Week 5", "Menopause", "Normal and abnormal."], ["Week 6", "Menstrual disorders", "Dysmenorrhoea, PMS, menorrhagia, DUB."], ["Week 7", "Amenorrhoea"], ["Week 8", "Pelvic inflammatory disease"],
      ["Week 9", "Sexually transmitted infections"], ["Week 10", "Uterine fibroids"], ["Week 11", "Ovarian cysts"], ["Week 12", "End-of-trimester CAT"]]) },
    { id: "og-g2", title: "Gynaecology II", items: weeks("og-g2", [
      ["Week 1", "Endometriosis and adenomyosis"], ["Week 2", "Gynaecological oncology: premalignant lesions of the cervix and cervical cancer"], ["Week 3", "Premalignant lesions of the endometrium and endometrial cancer"],
      ["Week 4", "Premalignant lesions of the vulva and vulval cancer"], ["Week 5", "Gestational trophoblastic diseases"], ["Week 6", "Urogynaecology: urinary incontinence — stress, urge, overflow, UTI"], ["Week 7", "Pelvic organ prolapse"],
      ["Week 8", "Genital fistulae", "VVF and RVF."], ["Week 9", "Infertility", "Female and male."], ["Week 10", "Contraception: non-hormonal methods"], ["Week 11", "Contraception: hormonal methods"], ["Week 12", "End-of-trimester CAT"]]) },
  ],
};


const paediatrics: CourseOutline = {
  id: "paediatrics", year: 4, department: "Paediatrics & Child Health",
  title: "Year 4 Paediatrics & Child Health — Junior Clerkship",
  summary: "Mount Kenya University Department of Paediatrics. Six units across three trimesters: lectures plus clerking patients on the wards and in clinic, with a logbook, a written CAT each trimester and a long case + OSCE at the end of the year.",
  team: "Department of Paediatrics and Child Health, MKU School of Medicine.",
  assessment: "CATs 40% · End-of-year examination 60% (MCQ, essay, and clinical exam: one long case and OSCE). Logbook handed in at the end of 6th year.",
  librarySlugs: ["paediatrics-and-child-health"],
  sections: [
    { id: "pd-t1", title: "Trimester 1", items: weeks("pd-t1", [
      ["Week 1", "Paediatric history taking and examination"],
      ["Week 2", "Growth and development", "Developmental milestones, adolescent growth, growth assessment."],
      ["Weeks 3–4", "Nutrition", "Breastfeeding, protein-energy malnutrition, rickets, micronutrient deficiencies."], ["Weeks 3–4", "Severe acute malnutrition"], ["Weeks 3–4", "Rickets"],
      ["Weeks 5–8", "Neonatology", "Birth asphyxia, neonatal jaundice, respiratory distress syndrome, neonatal sepsis, prematurity and low birth weight, meconium aspiration, kangaroo mother care, neonatal history and examination."], ["Weeks 5–8", "Neonatal respiratory distress syndrome"], ["Weeks 5–8", "Prematurity and low birth weight"], ["Weeks 5–8", "Neonatal resuscitation"], ["Weeks 5–8", "Hypoxic-ischaemic encephalopathy"], ["Weeks 5–8", "Neonatal jaundice"], ["Weeks 5–8", "Neonatal sepsis"],
      ["Weeks 9–11", "Respiratory", "Pneumonia, asthma, reporting a chest X-ray, pulmonary TB, aspiration syndromes, croup, bronchiolitis."], ["Weeks 9–11", "Childhood pneumonia"], ["Weeks 9–11", "Childhood asthma"], ["Weeks 9–11", "Croup"], ["Weeks 9–11", "Bronchiolitis"],
      ["Weeks 12–13", "Nephrology", "Acute kidney injury, acute glomerulonephritis, nephrotic syndrome, urinary tract infections, chronic kidney disease."], ["Weeks 12–13", "Paediatric acute kidney injury"], ["Weeks 12–13", "Acute glomerulonephritis"], ["Weeks 12–13", "Childhood nephrotic syndrome"], ["Weeks 12–13", "Paediatric urinary tract infection"],
      ["Week 14", "Assessment test"]]) },
    { id: "pd-t2", title: "Trimester 2", items: weeks("pd-t2", [
      ["Weeks 1–2", "Gastrointestinal system", "GORD, gastritis and peptic ulcer disease, hepatitis, acute liver failure, acute gastroenteritis."], ["Weeks 1–2", "Acute gastroenteritis and dehydration"],
      ["Week 3", "Neurology", "Meningitis and other CNS infections, convulsive disorders, movement disorders, encephalopathies, neurocutaneous syndromes."], ["Week 3", "Paediatric meningitis"], ["Week 3", "Cerebral palsy"], ["Week 3", "Hydrocephalus"],
      ["Weeks 4–6", "Cardiovascular", "Acute rheumatic fever, rheumatic heart disease, infective endocarditis, congenital heart disease, arrhythmias, ECG."], ["Weeks 4–6", "Acute rheumatic fever and rheumatic heart disease"], ["Weeks 4–6", "Congenital heart disease"],
      ["Weeks 7–8", "Blood disorders", "Anaemia, haemophilias, sickle cell disease, blood components and transfusion, other bleeding and thrombotic disorders."], ["Weeks 7–8", "Iron-deficiency anaemia in children"], ["Weeks 7–8", "Haemophilia"], ["Weeks 7–8", "Sickle cell disease in children"],
      ["Weeks 9–10", "Fluids, electrolytes and acid–base", "Hyponatraemia, hypernatraemia, hypokalaemia, hyperkalaemia, blood gas analysis."],
      ["Weeks 11–12", "Endocrinology", "Hypothyroidism, hyperthyroidism, diabetes and DKA, congenital adrenal hyperplasia, Addison disease, precocious puberty."], ["Weeks 11–12", "Type 1 diabetes and diabetic ketoacidosis"],
      ["Week 13", "Assessment"]]) },
    { id: "pd-t3", title: "Trimester 3", items: weeks("pd-t3", [
      ["Weeks 1–10", "Shock"], ["Weeks 1–10", "Immunisation practices"], ["Weeks 1–10", "Fever and fever of unknown origin"], ["Weeks 1–10", "Bacterial infections"],
      ["Weeks 1–10", "Viral infections"], ["Weeks 1–10", "Measles"], ["Weeks 1–10", "Human immunodeficiency virus"], ["Weeks 1–10", "Paediatric HIV"], ["Weeks 1–10", "Fungal infections"], ["Weeks 1–10", "Protozoal infections"], ["Weeks 1–10", "Malaria"], ["Weeks 1–10", "Parasites and helminths"],
      ["Week 11", "Poisoning", "Paraffin, organophosphate, paracetamol, other household products."],
      ["Week 12", "Assessment"], ["Week 13", "Revision"], ["Week 14", "End-of-year examinations"]]) },
  ],
};

export const MORE_OUTLINES: CourseOutline[] = [chemicalPathology, generalPathology, haematology, immunopathology, virology, basicPharmacology, obgyn, paediatrics];
