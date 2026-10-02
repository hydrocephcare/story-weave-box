import { MORE_OUTLINES } from "./courseOutlinesMore.ts";

// MBChB course outlines (Years 3 and 4 curated here; Years 1–4 also get checklists built from the library) (Mount Kenya University), turned into tick-able checklists.
// Item ids are permanent: they key each student's saved progress, so never reuse or renumber them.

export interface OutlineItem {
  id: string;
  title: string;
  week?: string;
  detail?: string;
  lecturer?: string;
  /** Set on checklist items built from a library file: opens that file in the viewer. */
  file?: [id: string, name: string, kind: "pdf" | "ppt" | "doc" | "video" | "img" | "zip" | "file"];
}
export interface OutlineSection {
  id: string;
  title: string;
  note?: string;
  items: OutlineItem[];
}
export interface OutlineDocument { label: string; fileId: string; name: string }
export interface CourseOutline {
  id: string;
  /** MBChB year this outline belongs to (1–6). */
  year: number;
  /** True for checklists built from the library's lecture slides rather than a department document. */
  auto?: boolean;
  department: string;
  title: string;
  summary: string;
  team?: string;
  assessment?: string;
  /** Slugs of the matching folder in that year's library, e.g. ["psychiatry"]. */
  librarySlugs?: string[];
  documents?: OutlineDocument[];
  sections: OutlineSection[];
}

type Row = [week: string, topic: string, detail?: string, lecturer?: string];
const rows = (prefix: string, list: Row[]): OutlineItem[] =>
  list.map(([week, title, detail, lecturer], i) => ({ id: `${prefix}-${String(i + 1).padStart(2, "0")}`, week, title, detail, lecturer }));
const topics = (prefix: string, week: string, list: string[]): OutlineItem[] =>
  list.map((title, i) => ({ id: `${prefix}-${String(i + 1).padStart(2, "0")}`, title, week }));

const KENDI = "Dr. Kendi";
const NEEMA = "Dr. Neema";

/* ------------------------------ Psychiatry ------------------------------ */
const psychiatry: CourseOutline = {
  id: "psychiatry",
  year: 4,
  department: "Psychiatry",
  title: "Year 4 Psychiatry — Junior Clerkship",
  summary: "Mount Kenya University, Department of Psychiatry & Mental Health. Three semesters of weekly lectures with a clinical rotation each week.",
  team: "Dr. Kendi (HOD & Senior Lecturer), Dr. Neema Araka (Lecturer), Dr. Nganga & Dr. Arthur (rotation supervisors). Clinical rotations: Thika Level 5 Hospital and Mathari National Hospital.",
  assessment: "CATs 30% · Logbook & presentations 10% · End-of-clerkship examination 60% (MCQ/SAQ + OSCE/viva).",
  librarySlugs: ["psychiatry"],
  sections: [
    {
      id: "psy-s1", title: "Semester 1 — Foundations of Assessment & Major Disorders",
      note: "Dr. Kendi: history taking, psychopathology, psychotic / neurodevelopmental / neurodegenerative disorders, emergencies. Dr. Neema: classification, MSE, mood / anxiety / somatic disorders, suicide, substance use. Ends with a written CAT + OSCE (history-taking & MSE).",
      items: rows("psy-s1", [
        ["Week 1", "Adult psychiatric history taking", "Structured adult history: presenting complaint, HPC, past psychiatric/medical, family and social history; building rapport.", KENDI],
        ["Week 1", "Classification of mental disorders (DSM-5-TR & ICD-11)", "Structure and purpose of DSM-5-TR and ICD-11; the major diagnostic categories.", NEEMA],
        ["Week 2", "Child & adolescent history taking", "Developmental history, parental/collateral reports, age-appropriate rapport.", KENDI],
        ["Week 2", "Mental State Examination (MSE)", "Appearance, behaviour, speech, mood/affect, thought, perception, cognition, insight — and documenting them.", NEEMA],
        ["Week 3", "Introduction to psychopathology I — thought & perception", "Thought disorder; hallucinations, illusions, delusions.", KENDI],
        ["Week 3", "Introduction to psychopathology II & biopsychosocial formulation", "Constructing a basic biopsychosocial formulation.", NEEMA],
        ["Week 4", "Psychotic disorders I — schizophrenia spectrum", "Phenomenology and diagnosis.", KENDI],
        ["Week 4", "Mood disorders I — depressive disorders", "DSM-5-TR/ICD-11 criteria; Kenyan cultural (somatic) presentations.", NEEMA],
        ["Week 5", "Psychotic disorders II — management & antipsychotics overview", "First-line management principles and basic monitoring.", KENDI],
        ["Week 5", "Mood disorders II — bipolar I & II", "Bipolar I vs II; hypomania, mania, cyclothymia.", NEEMA],
        ["Week 6", "Neurodevelopmental disorders I — autism spectrum & intellectual disability", "Core features and basic assessment approach.", KENDI],
        ["Week 6", "Anxiety disorders — GAD, panic, social anxiety, phobias", "Diagnosis using standard criteria.", NEEMA],
        ["Week 7", "Neurodevelopmental disorders II — ADHD & disruptive behaviour", "Presentations in children and basic management options.", KENDI],
        ["Week 7", "OCD & related disorders", "Phenomenology; CBT/ERP principles at overview level.", NEEMA],
        ["Week 8", "Neurocognitive disorders I — delirium vs dementia", "Clinical and cognitive-testing features that separate them.", KENDI],
        ["Week 8", "Trauma & stressor-related disorders (PTSD, ASD, adjustment)", "Core diagnostic features.", NEEMA],
        ["Week 9", "Neurodegenerative disorders II — dementia subtypes", "Alzheimer's, vascular, HIV-associated neurocognitive disorder.", KENDI],
        ["Week 9", "Somatic symptom & related disorders", "Somatic symptom disorder, illness anxiety, consultation-liaison psychiatry.", NEEMA],
        ["Week 10", "Psychiatric emergencies I — acute psychosis, agitation, violence risk", "Immediate de-escalation and safety steps.", KENDI],
        ["Week 10", "Suicide risk assessment & management", "Structured risk assessment and a basic safety plan.", NEEMA],
        ["Week 11", "Psychiatric emergencies II — rapid tranquillisation & Mental Health Act (Kenya)", "Rapid tranquillisation protocol; Kenya Mental Health Act 2021.", KENDI],
        ["Week 11", "Substance use & addictive disorders (Kenya burden, NACADA data)", "Screening with AUDIT/DAST; burden of alcohol, cannabis, opioids.", NEEMA],
        ["Week 12", "Integration & revision — Kendi thread", "Consolidate psychotic, neurodevelopmental and neurodegenerative content.", KENDI],
        ["Week 12", "Integration & revision — Neema thread", "Consolidate mood, anxiety, somatic, suicide and substance-use content before the CAT.", NEEMA],
        ["CAT", "Semester 1 written CAT + OSCE", "History-taking & MSE."],
      ]),
    },
    {
      id: "psy-s1-rot", title: "Semester 1 — Clinical rotation focus",
      items: rows("psy-s1r", [
        ["Week 1", "Orientation; observed adult history taking"], ["Week 2", "Supervised MSE practice"], ["Week 3", "Case formulation exercise"],
        ["Week 4", "Case presentation: psychosis / mood"], ["Week 5", "Supervised MSE on assigned patient"], ["Week 6", "Developmental / anxiety screening practice"],
        ["Week 7", "Case presentation (student pair)"], ["Week 8", "Ward round participation"], ["Week 9", "Cognitive testing clinic (MMSE / MoCA)"],
        ["Week 10", "Suicide risk OSCE practice"], ["Week 11", "Emergency simulation; addiction screening tools"], ["Week 12", "Full OSCE practice: history, MSE, formulation"],
      ]),
    },
    {
      id: "psy-s2", title: "Semester 2 — Psychopharmacology & Applied Treatment",
      note: "Dr. Kendi: antipsychotics, anxiolytics, stimulants, special populations, ARV interactions, motivational interviewing. Dr. Neema: antidepressants, mood stabilisers, protocols, investigations, CBT/IPT. Ends with a written CAT + OSCE (prescription writing & case management).",
      items: rows("psy-s2", [
        ["Week 1", "Introduction to psychopharmacology — PK/PD, receptors, neurotransmitters", "Basic PK/PD and the major neurotransmitter pathways.", KENDI],
        ["Week 1", "Antidepressants I — SSRIs & SNRIs", "Indications, starting doses and common side effects.", NEEMA],
        ["Week 2", "Antipsychotics I — FGAs (mechanism, EPS, depot)", "FGA mechanism, EPS profile, depot options.", KENDI],
        ["Week 2", "Antidepressants II — atypicals, switching & discontinuation", "Mirtazapine, bupropion, trazodone.", NEEMA],
        ["Week 3", "Antipsychotics II — SGAs & clozapine protocol", "Metabolic side effects and monitoring.", KENDI],
        ["Week 3", "Mood stabilisers I — lithium", "Mechanism, monitoring, toxicity.", NEEMA],
        ["Week 4", "Anxiolytics & hypnotics — benzodiazepines, dependence, tapering", "Mechanism, dependence risk, tapering principles.", KENDI],
        ["Week 4", "Mood stabilisers II — valproate, carbamazepine, lamotrigine", "Mechanisms and key interactions (women of reproductive age).", NEEMA],
        ["Week 5", "Stimulants & ADHD medications", "Mechanism and Kenyan availability.", KENDI],
        ["Week 5", "Antidepressants in comorbidity (HIV, epilepsy, cardiovascular disease)", "Prescribing in medically comorbid patients.", NEEMA],
        ["Week 6", "Special populations I — pregnancy & lactation prescribing", "Risk categories and safest-agent principles.", KENDI],
        ["Week 6", "National & international treatment protocols — Kenya Guidelines 2025 & WHO mhGAP", "Structure of the guidelines.", NEEMA],
        ["Week 7", "Special populations II — paediatric & geriatric prescribing (Beers criteria)", "Cautions in children and older adults.", KENDI],
        ["Week 7", "Psychopharmacology in HIV/AIDS — ARV interactions", "ARV–antidepressant / mood-stabiliser interaction categories.", NEEMA],
        ["Week 8", "ARV–psychotropic interactions — CYP450, efavirenz / ritonavir", "Major interaction categories in Kenyan ART.", KENDI],
        ["Week 8", "Investigations in psychiatry — bloods, TFT/LFT/RFT, ECG, imaging", "Indications and how to order them.", NEEMA],
        ["Week 9", "Long-acting injectables — depot antipsychotics", "Available depots and patient-selection criteria.", KENDI],
        ["Week 9", "CBT principles & applied psychoeducation", "The CBT model, cognitive distortions, behavioural activation.", NEEMA],
        ["Week 10", "Motivational interviewing & brief interventions (FRAMES, OARS)", "Brief-intervention frameworks.", KENDI],
        ["Week 10", "IPT principles (Kenyan adaptation)", "Interpersonal inventory; grief, role transition, disputes.", NEEMA],
        ["Week 11", "Prescribing audit & real case application", "Spotting common prescribing errors.", KENDI],
        ["Week 11", "Real case application — pharmacology + psychotherapy integration", "Linking diagnosis to a basic pharmacological plan.", NEEMA],
        ["Week 12", "Clinical reasoning integration & OSCE preparation — Kendi thread", "Antipsychotic, anxiolytic and special-population prescribing.", KENDI],
        ["Week 12", "Clinical reasoning integration & OSCE preparation — Neema thread", "Antidepressant, mood-stabiliser and protocol knowledge.", NEEMA],
        ["CAT", "Semester 2 written CAT + OSCE", "Prescription writing & case management."],
      ]),
    },
    {
      id: "psy-s2-rot", title: "Semester 2 — Clinical rotation focus",
      items: rows("psy-s2r", [
        ["Week 1", "Prescription writing practice"], ["Week 2", "Titration case exercise"], ["Week 3", "Clozapine / lithium monitoring clinic"],
        ["Week 4", "Case: bipolar patient — review bloods, adjust plan"], ["Week 5", "ADHD case formulation"], ["Week 6", "Shared decision-making simulation"],
        ["Week 7", "HIV-positive patient case"], ["Week 8", "Investigation ordering exercise"], ["Week 9", "Role-play: CBT thought challenging"],
        ["Week 10", "MI / IPT role-play, supervisor-rated"], ["Week 11", "Observed prescribing; supervisor sign-off"], ["Week 12", "Full OSCE practice: history, diagnosis, prescription"],
      ]),
    },
    {
      id: "psy-s3", title: "Semester 3 — Mental Health Correlates, Social Psychiatry & Leadership",
      note: "Dr. Kendi: ACEs, developmental theories, personality disorders, eating/sleep/sexual disorders, forensic psychiatry, ethics. Dr. Neema: community mental health, social determinants, gender, IPV, global mental health, policy, QI. Ends with the written end-of-clerkship exam + logbook + OSCE.",
      items: rows("psy-s3", [
        ["Week 1", "Adverse childhood experiences (ACEs)", "ACE types and the dose-response link with adult health.", KENDI],
        ["Week 1", "Community & public mental health in Kenya", "Community mental health landscape; Mathari; decentralisation.", NEEMA],
        ["Week 2", "Developmental theories", "Erikson, Piaget, Bowlby.", KENDI],
        ["Week 2", "Social determinants of mental health I — poverty, housing, unemployment", undefined, NEEMA],
        ["Week 3", "Personality disorders I — Cluster A", "Paranoid, schizoid, schizotypal.", KENDI],
        ["Week 3", "Social determinants of mental health II — alcohol outlet density, structural violence", undefined, NEEMA],
        ["Week 4", "Personality disorders II — Cluster B", "Antisocial, borderline, narcissistic, histrionic.", KENDI],
        ["Week 4", "Gender & mental health", "Prevalence differences by gender; DSM critique.", NEEMA],
        ["Week 5", "Personality disorders III — Cluster C & general management", "Avoidant, dependent, OCPD.", KENDI],
        ["Week 5", "Intimate partner violence", "Screening, documentation, safety planning.", NEEMA],
        ["Week 6", "Feeding & eating disorders", "Anorexia, bulimia, binge eating and complications.", KENDI],
        ["Week 6", "Peripartum mental health & grief / loss", "Postpartum depression, peripartum psychosis, baby blues.", NEEMA],
        ["Week 7", "Sleep-wake disorders", "Insomnia, hypersomnia, parasomnias.", KENDI],
        ["Week 7", "Global mental health & humanitarian settings", "Global burden; refugee mental health in Kenya.", NEEMA],
        ["Week 8", "Sexual dysfunctions & gender dysphoria", "Culturally safe sexual history-taking.", KENDI],
        ["Week 8", "Mental health policy landscape", "Mental health component of Kenya's BPHS.", NEEMA],
        ["Week 9", "Paraphilic disorders", "Classification and mandatory reporting.", KENDI],
        ["Week 9", "Quality improvement in psychiatry", "Audit-cycle concepts and mhGAP indicators.", NEEMA],
        ["Week 10", "Forensic psychiatry & Kenya Mental Health Act 2021", "Fitness to stand trial; MHA 2021 provisions.", KENDI],
        ["Week 10", "Research literacy", "Reading a psychiatric research abstract critically.", NEEMA],
        ["Week 11", "Ethics in psychiatry", "Autonomy, confidentiality, involuntary admission.", KENDI],
        ["Week 11", "Prevention & promotion", "Anti-stigma; school and workplace mental health promotion.", NEEMA],
        ["Week 12", "Integration, reflection & assignment presentations — Kendi thread", "ACEs, personality disorders or developmental theories.", KENDI],
        ["Week 12", "Integration & assignment presentations — Neema thread", "Gender & DSM critique or community mental health.", NEEMA],
        ["CAT", "End-of-clerkship examination + logbook + OSCE"],
      ]),
    },
    {
      id: "psy-s3-rot", title: "Semester 3 — Clinical rotation focus",
      items: rows("psy-s3r", [
        ["Week 1", "ACE screening / community mapping exercise"], ["Week 2", "Reflective case discussion"], ["Week 3", "Case formulation: personality features"],
        ["Week 4", "Therapeutic alliance-building exercise"], ["Week 5", "IPV simulation"], ["Week 6", "Case: postpartum mood symptoms"],
        ["Week 7", "Case: comorbid sleep / somatic presentation"], ["Week 8", "Reflective seminar on personal bias"], ["Week 9", "QI project scoping exercise"],
        ["Week 10", "Mock court report / journal club"], ["Week 11", "Ethics case discussion"], ["Week 12", "Final OSCE preparation: complex case with social formulation"],
      ]),
    },
  ],
};

/* --------------------------- Internal Medicine --------------------------- */
const internalMedicine: CourseOutline = {
  id: "internal-medicine",
  year: 4,
  department: "Internal Medicine",
  title: "Internal Medicine — Junior Clerkship (Year 4)",
  summary: "Mount Kenya University, Department of Internal Medicine (unit code MBIM). Six units across three trimesters; the 6th-year senior clerkship topics are listed after.",
  team: "Dr. Rosslyn Ngugi and Dr. Alex Wagucu (Lecturers), Dr. Nahashon Okanga (HOD).",
  assessment: "CATs 40% (end of every trimester) · End-of-year exam 60% (MCQ, essay and OSCE). Logbook is handed in at the end of 6th year.",
  librarySlugs: ["internal-medicine"],
  sections: [
    { id: "im-t1-resp", title: "Trimester 1 · Respiratory system", note: "Weeks 1–6", items: topics("im-t1-resp", "Wk 1–6", ["Pneumonia", "Asthma", "COPD", "Bronchiectasis", "Pleural effusion", "Pneumothorax", "Emphysema", "Pulmonary tuberculosis", "Lung cancer"]) },
    { id: "im-t1-cvs", title: "Trimester 1 · Cardiovascular system", note: "Weeks 7–12", items: topics("im-t1-cvs", "Wk 7–12", ["Hypertension", "Rheumatic heart disease", "Infective endocarditis", "Cardiomyopathy", "Heart failure", "Pericardial diseases", "Ischaemic heart disease", "Valvular heart disease", "Venous thromboembolism & pulmonary embolism", "Investigations in cardiology"]) },
    { id: "im-t1-git", title: "Trimester 1 · Gastroenterology", note: "Weeks 1–6", items: topics("im-t1-git", "Wk 1–6", ["Achalasia cardia", "Gastritis & GERD", "Peptic ulcer disease", "Upper GI bleeding", "Acute & chronic diarrhoea", "Cholera & bacillary dysentery", "Acute & chronic pancreatitis", "Cholelithiasis & cholecystitis", "Inflammatory bowel disease", "Malabsorption syndrome", "Hepatitis", "Acute & chronic liver failure", "Gastric carcinoma", "Hepatocellular carcinoma", "Pancreatic carcinoma", "Colorectal carcinoma", "HIV & the GIT", "Interpretation of abnormal LFTs"]) },
    { id: "im-t1-haem", title: "Trimester 1 · Haematology", note: "Weeks 7–12 · Week 14: assessment test", items: topics("im-t1-haem", "Wk 7–12", ["Iron deficiency anaemia", "Vitamin B12 deficiency anaemia", "Macrocytic / megaloblastic anaemia", "Anaemia of chronic disease", "Aplastic anaemia", "Bleeding disorders", "Haemoglobinopathies", "Haemolytic anaemias", "Myelodysplastic disorders"]) },
    { id: "im-t2-renal", title: "Trimester 2 · Renal", note: "Weeks 1–6", items: topics("im-t2-renal", "Wk 1–6", ["Acute kidney injury", "Fluid & electrolyte disorders", "Glomerular diseases", "Nephrotic syndrome", "Urinary tract infections", "Chronic kidney disease", "Tubulointerstitial diseases", "Renal stone disease", "Renal replacement therapy"]) },
    { id: "im-t2-endo", title: "Trimester 2 · Endocrinology", note: "Weeks 1–12", items: topics("im-t2-endo", "Wk 1–12", ["Diabetes mellitus", "Thyroid disorders", "Adrenal disorders", "Pituitary disorders", "Parathyroid gland disorders", "Infertility", "Hypogonadism / precocious puberty", "MEN syndromes"]) },
    { id: "im-t2-rheum", title: "Trimester 2 · Rheumatology", note: "Weeks 7–12 · Week 13: assessment", items: topics("im-t2-rheum", "Wk 7–12", ["Rheumatoid arthritis", "Systemic lupus erythematosus", "Systemic sclerosis", "Ankylosing spondylitis", "Seronegative spondyloarthropathies", "Mixed connective tissue disorders", "Fibromyalgia", "Gout & crystal arthropathies", "Osteoporosis", "Osteoarthritis"]) },
    { id: "im-t3-id", title: "Trimester 3 · Infectious diseases", note: "Weeks 1–10", items: topics("im-t3-id", "Wk 1–10", ["Sepsis", "HIV & AIDS", "HIV & the lung", "Lung abscess", "Malaria", "Leishmaniasis", "Trypanosomiasis", "Viral haemorrhagic fevers", "Intestinal nematodes", "COVID-19", "Bacterial infections", "Fungal infections", "Protozoal infections"]) },
    { id: "im-t3-pois", title: "Trimester 3 · Poisoning", note: "Week 11 · Week 12 assessment · Week 13 revision · Week 14 end-of-year exams", items: topics("im-t3-pois", "Wk 11", ["Approach to the poisoned patient", "Poisoning by pharmaceutical agents", "Drugs of abuse / misuse", "Chemicals and pesticides", "Environmental poisoning"]) },
    { id: "im-6-neuro", title: "6th year senior clerkship · Neurology", note: "Weeks 1–12 · Week 13 revision · Week 14 CAT", items: topics("im-6-neuro", "Wk 1–12", ["Headache", "Epilepsy", "Migraine", "Meningitis / meningoencephalitis", "Strokes", "Disorders of peripheral nerves", "Neurodegenerative disorders", "Disorders of the spinal cord", "Diseases of the neuromuscular junction", "Diseases of muscle"]) },
    { id: "im-6-onc", title: "6th year senior clerkship · Oncology", note: "Trimester 3, weeks 1–11", items: topics("im-6-onc", "Wk 1–11", ["Leukaemias", "Lymphomas", "Bladder & renal cancers", "Breast cancer", "Bone tumours", "Kaposi sarcoma", "Lower GIT cancers", "Hepatocellular carcinoma", "Prostate cancer", "Multiple myeloma & paraproteinaemias", "Cancer of the pancreas", "Gastric cancers", "Endocrine tumours of the GIT"]) },
    { id: "im-6-icu", title: "6th year senior clerkship · Critical care medicine", note: "Trimester 3, weeks 1–11 · Week 12 CAT", items: topics("im-6-icu", "Wk 1–11", ["Cardiogenic shock", "Respiratory failure", "Status epilepticus", "Status asthmaticus", "The unconscious patient", "Other medical emergencies", "Indications for escalation of care to HDU / ICU"]) },
    { id: "im-6-cases", title: "6th year senior clerkship · Trimester 2 case discussions", items: rows("im-6-cases", [
      ["Weeks 1–4", "Respiratory & cardiovascular system case discussions"], ["Weeks 1–4", "Gastroenterology & renal case discussions"],
      ["Weeks 5–10", "Endocrinology & rheumatology case discussions"], ["Weeks 5–10", "Haematology & infectious disease case discussions"], ["Weeks 11–13", "Therapeutics"],
    ]) },
  ],
};

/* ------------------------ Clinical Pharmacology ------------------------ */
const pharmacology: CourseOutline = {
  id: "pharmacology",
  year: 4,
  department: "Clinical Pharmacology",
  title: "Clinical Pharmacology — MBChB Level IV",
  summary: "Mount Kenya University, Dr. K. Ndemo. Three trimester units (MBPL 4411, 4422, 4433). Week numbers follow the order in each outline PDF; open the PDF for the full sub-topic detail.",
  assessment: "One CAT at the end of each trimester, plus end-of-year exams.",
  librarySlugs: ["clinical-pharmacology", "course-outlines"],
  documents: [
    { label: "Overall outline (MBPL 4400)", fileId: "1DMbr7iBFHU1Y3xdI_wlpbdFxT1H9AEev", name: "MBPL4400 Course Outline.pdf" },
    { label: "Trimester 1 (MBPL 4411)", fileId: "1W6jBKwdVxIjyNl2aaoV7YCS9MqFcqRzg", name: "MBPL 4411-Course Outline - 1st Trim.pdf" },
    { label: "Trimester 2 (MBPL 4422)", fileId: "1c023V1hIpZdwS_1j5laBIdFusbRl6lWW", name: "MBPL 4422-Course Outline - 2nd Trim.pdf" },
    { label: "Trimester 3 (MBPL 4433)", fileId: "1JWjKQ5K_9zrIdiZOO5xMD-2e-Inf2PSE", name: "MBPL 4433-Course Outline - 3rd Trim.pdf" },
  ],
  sections: [
    {
      id: "ph-t1", title: "Trimester 1 · Cardiovascular & blood drugs (MBPL 4411)",
      note: "For each class: mechanism & site of action, pharmacological properties, side effects, clinical uses.",
      items: rows("ph-t1", [
        ["Week 1", "Antihypertensive agents I", "Overview of hypertension; beta-blockers, alpha-blockers, centrally acting agents, sympathetic nerve terminal blockers."],
        ["Week 2", "Antihypertensive agents II — diuretics"],
        ["Week 3", "Antihypertensive agents III", "Vasodilators, calcium channel blockers, ACE inhibitors, ARBs, renin inhibitors."],
        ["Week 4", "Drugs used in heart failure", "ACE inhibitors, ARBs, aldosterone antagonists, beta-blockers, diuretics, vasodilators, inotropes (digoxin, beta-agonists, PDE inhibitors)."],
        ["Week 5", "Drugs used in cardiac arrhythmias", "Cardiac electrophysiology, mechanisms of arrhythmia, Class I–IV drugs."],
        ["Week 6", "Drugs used in angina pectoris", "Organic nitrates, calcium channel blockers, beta-blockers, sodium channel blockers."],
        ["Week 7", "Acute coronary syndromes I", "Fibrinolytics (activators and inhibitors) and antiplatelet drugs (COX-1, P2Y12, GP IIb/IIIa, dipyridamole, cilostazol)."],
        ["Week 8", "Acute coronary syndromes II — indirect thrombin inhibitors", "Unfractionated heparin; LMWH (enoxaparin, dalteparin, tinzaparin)."],
        ["Week 9", "Acute coronary syndromes III", "Hirudin, bivalirudin; fondaparinux (parenteral factor Xa inhibitor)."],
        ["Weeks 10–11", "Oral anticoagulants", "Warfarin / coumarins; dabigatran; rivaroxaban, apixaban, edoxaban."],
        ["Weeks 12–13", "Drugs used in hyperlipoproteinaemias", "Lipoprotein transport; statins, niacin, fibrates, bile-acid resins, cholesterol absorption inhibitors, omega-3."],
        ["CAT", "End-of-trimester CAT"],
      ]),
    },
    {
      id: "ph-t2", title: "Trimester 2 · Lipids, immune, endocrine, GIT, analgesics & anaesthetics (MBPL 4422)",
      items: rows("ph-t2", [
        ["Weeks 1–2", "Drugs used in the treatment of dyslipidaemias", "Lipoprotein physiology; statins, niacin, fibrates, resins, ezetimibe, omega-3."],
        ["Week 3", "New agents in cardiovascular medicine"],
        ["Weeks 4–5", "Immunosuppressants", "Cytotoxic immunosuppressants; immunophilin inhibitors; other agents."],
        ["Weeks 6–7", "Endocrine pharmacology", "Hormones of the pituitary and hypothalamus, thyroid drugs, other hormones and antagonists."],
        ["Weeks 8–9", "GIT pharmacology", "Antacids, proton-pump inhibitors and other drugs acting on the GIT."],
        ["Week 10", "Analgesics", "Narcotic and non-narcotic analgesics."],
        ["Weeks 11–12", "Anaesthetic agents", "General anaesthetics and related agents."],
        ["CAT", "End-of-trimester CAT"],
      ]),
    },
    {
      id: "ph-t3", title: "Trimester 3 · CNS, respiratory & toxicology (MBPL 4433)",
      items: rows("ph-t3", [
        ["Week 1", "Introduction to psychopharmacology"],
        ["Week 2", "Sedative–hypnotics"],
        ["Weeks 3–5", "Antidepressants, antimanic & antipsychotic drugs", "Mechanisms, indications, ADME, adverse effects, interactions."],
        ["Weeks 3–5", "Anticonvulsants & drugs for neurodegenerative disease (antiparkinsonian)"],
        ["Weeks 3–5", "CNS stimulants & drugs for drug dependence", "Amphetamines, opioids, alcohol, khat."],
        ["Week 7", "Skeletal muscle relaxants & neuromuscular blockers"],
        ["Weeks 8–10", "Respiratory drugs", "Drugs for asthma, leukotriene antagonists, cough suppressants, expectorants, corticosteroids, cromoglycate."],
        ["Week 11", "Drug toxicology", "Adverse drug reactions (Rawlins–Thompson classification)."],
        ["Week 12", "Non-drug toxicology & herbal preparations", "Environmental & industrial toxicants; pesticides (organophosphate poisoning); herbal medicines."],
        ["CAT", "Week 13 CAT · Weeks 14–16 end-of-year exams"],
      ]),
    },
  ],
};


/* ------------------------------- Surgery ------------------------------- */
const surgery: CourseOutline = {
  id: "surgery",
  year: 4,
  department: "Surgery",
  title: "Year 4 Surgery — Junior Clerkship",
  summary: "Clinical Surgery learning path organised from core surgical method through acute abdomen, trauma, common specialties and peri-operative care. This curriculum spine keeps bedside skills, theory and emergencies connected while the departmental week-by-week outline is being completed.",
  librarySlugs: ["surgery", "general-surgery"],
  sections: [
    { id:"surg-method", title:"Clinical foundations · Core surgical method", items: topics("surg-method","Core",["Surgical history","Acute abdomen examination","Lump examination","Wound and ulcer examination","Pre-operative assessment","Consent","Post-operative review","Fluids and urine output","Pain control","Nutrition"]) },
    { id:"surg-abd", title:"Acute abdomen & gastrointestinal surgery", items: topics("surg-abd","Core",["Appendicitis","Intestinal obstruction","Peritonitis","Perforated viscus","Cholecystitis and cholangitis","Pancreatitis","Hernias and strangulation","GI bleeding","Mesenteric ischaemia red flags"]) },
    { id:"surg-trauma", title:"Trauma & surgical emergencies", items: topics("surg-trauma","Core",["ABCDE trauma assessment","Haemorrhagic shock","Chest trauma","Head injury","Spinal injury","Abdominal trauma","Fractures and neurovascular examination","Compartment syndrome","Burns","Acute limb ischaemia"]) },
    { id:"surg-spec", title:"Common surgical specialties", items: topics("surg-spec","Core",["Breast lump and triple assessment","Thyroid swelling","Diabetic foot","Peripheral arterial disease","Urinary retention","Haematuria","Renal colic","BPH","Testicular torsion","Scrotal swelling"]) },
    { id:"surg-post", title:"Peri-operative care & complications", items: topics("surg-post","Core",["Surgical site infection","Post-operative bleeding","Atelectasis and pneumonia","DVT and PE","Ileus","Anastomotic leak","Wound dehiscence","Sepsis","VTE prophylaxis","Antibiotic prophylaxis"]) },
  ],
};

export const COURSE_OUTLINES: CourseOutline[] = [psychiatry, internalMedicine, surgery, pharmacology, ...MORE_OUTLINES];

const norm = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve a curated outline to the canonical academic unit shown on UnitPage.
 * librarySlugs are the strongest key; title/department matching keeps older unit rows compatible.
 */
export function getCourseOutlineForUnit(year: number, unit: { name: string; slug: string; short_name?: string | null }): CourseOutline | null {
  const slug = norm(unit.slug);
  const names = [unit.name, unit.short_name || ""].map(norm).filter(Boolean);
  const aliases: Record<string, string[]> = {
    "internal-medicine": ["internal medicine", "medicine"],
    "obstetrics-gynaecology": ["obstetrics and gynaecology", "obstetrics gynaecology", "obgyn"],
    "paediatrics": ["paediatrics", "paediatrics and child health", "pediatrics"],
    "psychiatry": ["psychiatry", "mental health"],
    "clinical-pharmacology": ["clinical pharmacology", "pharmacology"],
  };
  return COURSE_OUTLINES.find((outline) => {
    if (outline.year !== year) return false;
    if ((outline.librarySlugs || []).some((s) => norm(s) === slug)) return true;
    const candidates = [outline.id, outline.department, outline.title, ...(aliases[outline.id] || [])].map(norm);
    return names.some((name) => candidates.some((c) => c === name || c.includes(name) || name.includes(c)));
  }) || null;
}
