// The Year 4 Internal Medicine (IMED) curriculum: systems -> topics, and how the topics connect.
// A topic with a `note` is published (it is a note in src/content/notes, registered in staticNotes.json); a topic without one is listed as "coming soon".
// Add a note: write the .md, register it in staticNotes.json, then put its slug on the topic here. Nothing else changes.
import { findStaticNote } from "@/data/staticNotes";

export interface ImedTopic { id: string; name: string; note?: string }
export interface ImedSystem { id: string; name: string; blurb: string; topics: ImedTopic[] }
export type RelationType = "prerequisite" | "related" | "differential" | "mechanism" | "complication" | "investigation" | "management" | "next";
export interface Relation { from: string; to: string; type: RelationType; why: string }

const t = (id: string, name: string, note?: string): ImedTopic => ({ id, name, ...(note ? { note } : {}) });

export const IMED: ImedSystem[] = [
  { id: "respiratory", name: "Respiratory medicine", blurb: "Cough, breathlessness, the chest examination, and the diseases of the lungs and pleura.", topics: [
    t("resp-approach", "Approach to respiratory symptoms and examination", "approach-to-respiratory-symptoms"),
    t("pneumonia", "Pneumonia", "pneumonia"),
    t("tb", "Pulmonary and extrapulmonary tuberculosis", "tuberculosis"),
    t("pcp", "Pneumocystis jirovecii pneumonia (PCP)", "pneumocystis-pneumonia"),
    t("asthma", "Asthma and acute severe asthma", "asthma"),
    t("copd", "COPD and acute exacerbations", "copd"),
    t("bronchitis", "Bronchitis, acute and chronic", "bronchitis"),
    t("bronchiectasis", "Bronchiectasis", "bronchiectasis"),
    t("lung-abscess", "Lung abscess", "lung-abscess"),
    t("pleural-effusion", "Pleural effusion, empyema and pleural fluid", "pleural-effusion"),
    t("pneumothorax", "Pneumothorax", "pneumothorax"),
    t("pe-dvt", "Pulmonary embolism and deep vein thrombosis", "dvt-vte-pulmonary-embolism"),
    t("lung-cancer", "Lung cancer", "lung-cancer"),
    t("ild", "Interstitial lung disease and pulmonary fibrosis", "interstitial-lung-disease"),
    t("occupational-lung", "Occupational lung disease", "occupational-lung-disease"),
    t("resp-failure", "Respiratory failure and arterial blood gases", "respiratory-failure-and-abg"),
    t("ards", "Pulmonary oedema and ARDS", "pulmonary-oedema-and-ards"),
    t("pulm-htn", "Pulmonary hypertension and cor pulmonale", "pulmonary-hypertension-and-cor-pulmonale"),
  ] },
  { id: "cardiovascular", name: "Cardiovascular medicine", blurb: "The heart and circulation: pressure, pump, rhythm, valves and shock.", topics: [
    t("cvs-approach", "Cardiovascular history and examination", "cardio-approach-to-cardiovascular-symptoms-and-examination"),
    t("hypertension", "Hypertension and hypertensive emergencies", "hypertension"),
    t("heart-failure", "Heart failure", "heart-failure-which-tests"),
    t("acs", "Acute coronary syndrome and myocardial infarction"),
    t("rhd", "Rheumatic fever and rheumatic heart disease", "rheumatic-fever-and-jones-criteria"),
    t("valves", "Valvular lesions and heart murmurs", "heart-murmurs"),
    t("endocarditis", "Infective endocarditis"),
    t("arrhythmia", "Arrhythmias and ECG interpretation"),
    t("pericardium", "Pericarditis, effusion and tamponade"),
    t("cardiomyopathy", "Cardiomyopathies"),
    t("pvd", "Peripheral vascular disease"),
    t("shock", "Shock and cardiovascular emergencies"),
  ] },
  { id: "renal", name: "Renal medicine", blurb: "Kidney injury and disease, salt, water and acid-base.", topics: [
    t("renal-approach", "Approach to renal disease"),
    t("aki", "Acute kidney injury", "acute-kidney-injury"),
    t("ckd", "Chronic kidney disease"),
    t("nephrotic", "Nephrotic and nephritic syndromes, glomerulonephritis", "nephrotic-and-nephritic-syndromes"),
    t("electrolytes", "Sodium, potassium and calcium disorders"),
    t("acid-base", "Acid-base disorders"),
    t("diabetic-kidney", "Diabetic kidney disease"),
    t("uti", "Urinary tract infection and pyelonephritis"),
    t("fluid-balance", "Fluid balance"),
    t("dialysis", "Indications for dialysis"),
  ] },
  { id: "infectious", name: "Infectious diseases", blurb: "Fever, HIV, malaria, meningitis, sepsis and antimicrobials.", topics: [
    t("fever", "Approach to fever"),
    t("hiv", "HIV and opportunistic infections"),
    t("malaria", "Malaria, including severe malaria"),
    t("meningitis", "Bacterial meningitis and encephalitis"),
    t("sepsis", "Sepsis and septic shock", "sepsis-and-septic-shock"),
    t("enteric", "Enteric fever"),
    t("skin-infection", "Skin and soft-tissue infections"),
    t("amr", "Antimicrobial selection, stewardship and resistance"),
    t("fungal-parasitic", "Common fungal and parasitic infections"),
  ] },
  { id: "gastro", name: "Gastroenterology and hepatology", blurb: "The gut, liver, pancreas and jaundice.", topics: [
    t("gi-approach", "Approach to abdominal symptoms and jaundice", "hepatitis-b-and-the-jaundiced-patient"),
    t("pud", "Dyspepsia and peptic ulcer disease"),
    t("gi-bleed", "Upper and lower gastrointestinal bleeding", "upper-gi-bleeding"),
    t("cirrhosis", "Chronic liver disease and cirrhosis"),
    t("ascites-sbp", "Ascites and spontaneous bacterial peritonitis"),
    t("hep-enceph", "Hepatic encephalopathy"),
    t("viral-hepatitis", "Viral hepatitis", "hepatitis-b-and-the-jaundiced-patient"),
    t("pancreatitis", "Acute and chronic pancreatitis"),
    t("ibd", "Inflammatory bowel disease"),
    t("malabsorption", "Malabsorption"),
    t("hrs", "Hepatorenal syndrome"),
  ] },
  { id: "haematology", name: "Haematology", blurb: "Anaemia, blood cancers, bleeding and transfusion.", topics: [
    t("anaemia", "Approach to anaemia and the full blood count", "approach-to-anaemia"),
    t("iron-deficiency", "Iron-deficiency anaemia"),
    t("megaloblastic", "Megaloblastic anaemia"),
    t("haemolytic", "Haemolytic anaemia"),
    t("sickle-cell", "Sickle cell disease"),
    t("thalassaemia", "Thalassaemia"),
    t("leukaemia", "Leukaemias"),
    t("lymphoma", "Lymphomas"),
    t("myeloma", "Multiple myeloma"),
    t("platelets", "Thrombocytopenia and platelet disorders"),
    t("coagulation", "Coagulation disorders"),
    t("transfusion", "Blood transfusion and reactions"),
  ] },
  { id: "neurology", name: "Neurology", blurb: "Stroke, seizures, neuropathies and the unconscious patient.", topics: [
    t("neuro-approach", "Neurological history and examination"),
    t("stroke", "Ischaemic and haemorrhagic stroke"),
    t("epilepsy", "Epilepsy and status epilepticus"),
    t("neuropathy", "Peripheral neuropathy and Guillain-Barre syndrome"),
    t("myasthenia", "Myasthenia gravis"),
    t("parkinson", "Parkinson disease"),
    t("dementia", "Dementia and delirium"),
    t("headache", "Headache and red flags"),
    t("cord-compression", "Spinal cord compression"),
    t("raised-icp", "Raised intracranial pressure"),
  ] },
  { id: "endocrine", name: "Endocrinology and metabolism", blurb: "Diabetes, thyroid, adrenal, calcium and pituitary.", topics: [
    t("diabetes", "Diabetes mellitus"),
    t("dka", "Diabetic ketoacidosis and hyperglycaemic emergencies", "diabetic-ketoacidosis"),
    t("hypoglycaemia", "Hypoglycaemia"),
    t("thyroid", "Hyperthyroidism and hypothyroidism"),
    t("thyroid-emergency", "Thyroid storm and myxoedema coma"),
    t("adrenal", "Adrenal insufficiency and Cushing syndrome"),
    t("calcium", "Calcium and parathyroid disorders"),
    t("pituitary", "Pituitary disorders"),
    t("obesity", "Obesity and metabolic syndrome"),
  ] },
  { id: "rheumatology", name: "Rheumatology", blurb: "Joints, connective tissue and vasculitis.", topics: [
    t("ra", "Rheumatoid arthritis"),
    t("sle", "Systemic lupus erythematosus"),
    t("gout", "Gout and crystal arthropathies"),
    t("oa", "Osteoarthritis"),
    t("sclerosis", "Systemic sclerosis"),
    t("vasculitis", "Vasculitis"),
    t("septic-arthritis", "Septic arthritis"),
    t("spa", "Spondyloarthritis"),
  ] },
  { id: "general", name: "General internal medicine", blurb: "Prescribing, poisoning, emergencies and the older patient.", topics: [
    t("pharmacology", "Clinical pharmacology and rational prescribing"),
    t("geriatrics", "Geriatric medicine"),
    t("poisoning", "Poisoning and adverse drug reactions"),
    t("anaphylaxis", "Anaphylaxis"),
    t("nutrition", "Nutrition and vitamin deficiencies"),
  ] },
];

const r = (from: string, to: string, type: RelationType, why: string): Relation => ({ from, to, type, why });

/** How topics connect. Each link says why it matters; links are shown both ways where that helps (see `linksFor`). */
export const RELATIONS: Relation[] = [
  // pneumonia
  r("pneumonia", "resp-approach", "prerequisite", "to recognise consolidation on examination: bronchial breathing, dullness and crackles."),
  r("pneumonia", "resp-failure", "complication", "severe pneumonia impairs gas exchange and leads to hypoxaemic respiratory failure."),
  r("pneumonia", "pleural-effusion", "complication", "a parapneumonic effusion or empyema is the commonest complication when fever persists on treatment."),
  r("pneumonia", "lung-abscess", "complication", "aspiration or necrotising pneumonia can cavitate."),
  r("pneumonia", "sepsis", "complication", "severe pneumonia can progress to organ dysfunction and shock."),
  r("pneumonia", "tb", "differential", "chronic cough, fever and weight loss overlap; a pneumonia that does not resolve needs TB excluded."),
  r("pneumonia", "pcp", "differential", "in an immunocompromised patient with dyspnoea and a dry cough, think PCP."),
  r("pneumonia", "lung-cancer", "differential", "a consolidation that does not clear may hide an obstructing tumour."),
  r("pneumonia", "copd", "related", "exacerbations of COPD are often triggered by infection, and COPD patients get pneumonia more often."),
  // TB, PCP, HIV
  r("tb", "hiv", "related", "HIV is the strongest risk factor for TB; always test, and expect atypical chest X-rays."),
  r("tb", "pneumonia", "differential", "bacterial pneumonia is the first alternative to exclude in a patient with cough and fever."),
  r("tb", "pleural-effusion", "complication", "TB is a leading cause of lymphocytic exudative effusions in our setting."),
  r("tb", "meningitis", "complication", "TB meningitis is the extrapulmonary form with the worst outcome."),
  r("pcp", "hiv", "prerequisite", "PCP is an AIDS-defining illness: know the CD4 thresholds first."),
  r("pcp", "pneumonia", "differential", "PCP presents as pneumonia with hypoxaemia out of proportion to the chest signs."),
  r("pcp", "resp-failure", "complication", "severe PCP causes hypoxaemic failure."),
  // asthma / COPD
  r("asthma", "resp-approach", "prerequisite", "wheeze and breathlessness: know how to examine and what peak flow tells you."),
  r("asthma", "copd", "differential", "reversible airflow obstruction in asthma versus fixed obstruction in COPD."),
  r("asthma", "resp-failure", "complication", "a silent chest and a normal or rising CO2 in acute severe asthma means the patient is tiring."),
  r("copd", "resp-failure", "complication", "type 2 respiratory failure and oxygen targets in COPD exacerbations."),
  r("copd", "pulm-htn", "complication", "chronic hypoxia leads to pulmonary hypertension and cor pulmonale."),
  r("copd", "asthma", "differential", "age at onset, smoking history and reversibility separate them."),
  r("copd", "bronchitis", "related", "chronic bronchitis is half of the COPD definition."),
  r("bronchitis", "copd", "next", "chronic bronchitis with airflow obstruction is COPD."),
  r("bronchiectasis", "pneumonia", "related", "recurrent infection both causes and results from bronchiectasis."),
  r("bronchiectasis", "tb", "mechanism", "post-TB scarring is a common cause of bronchiectasis."),
  r("lung-abscess", "pneumonia", "prerequisite", "most abscesses begin as aspiration or necrotising pneumonia."),
  r("lung-abscess", "lung-cancer", "differential", "a cavity in a smoker may be a tumour, not an abscess."),
  // pleura
  r("pleural-effusion", "pneumonia", "related", "parapneumonic effusion: when to tap and when to drain."),
  r("pleural-effusion", "heart-failure", "mechanism", "transudates come from raised hydrostatic pressure, as in heart failure."),
  r("pleural-effusion", "tb", "differential", "exudate with lymphocytes and high ADA points to TB."),
  r("pleural-effusion", "lung-cancer", "differential", "blood-stained or recurrent effusions need malignancy excluded."),
  r("pneumothorax", "copd", "related", "bullae in COPD are a common cause of secondary pneumothorax."),
  r("pneumothorax", "resp-failure", "complication", "tension pneumothorax is an immediate life threat: decompress before any imaging."),
  r("pe-dvt", "pneumonia", "differential", "pleuritic chest pain and breathlessness: PE and pneumonia are the classic pair."),
  r("pe-dvt", "pulm-htn", "complication", "recurrent emboli lead to chronic thromboembolic pulmonary hypertension."),
  r("pe-dvt", "shock", "complication", "massive PE presents as obstructive shock."),
  r("pe-dvt", "coagulation", "mechanism", "thrombophilia and anticoagulant monitoring."),
  r("lung-cancer", "pleural-effusion", "complication", "malignant effusion is a common presentation."),
  r("lung-cancer", "pneumonia", "differential", "obstructive pneumonia distal to a tumour."),
  r("ild", "resp-failure", "complication", "advanced fibrosis ends in chronic hypoxaemic failure."),
  r("ild", "occupational-lung", "mechanism", "asbestos, silica and coal dust cause fibrosis."),
  r("resp-failure", "acid-base", "investigation", "the ABG separates type 1 from type 2 failure and shows the compensation."),
  r("resp-failure", "ards", "related", "ARDS is the severe end of hypoxaemic failure."),
  r("ards", "sepsis", "mechanism", "sepsis and pneumonia are the commonest triggers of ARDS."),
  r("ards", "heart-failure", "differential", "cardiogenic pulmonary oedema must be separated from ARDS before treating."),
  r("pulm-htn", "heart-failure", "related", "right heart failure (cor pulmonale) is the end result."),
  // cardiovascular
  r("heart-failure", "hypertension", "mechanism", "long-standing hypertension causes remodelling and heart failure."),
  r("heart-failure", "acs", "mechanism", "myocardial injury from infarction impairs the pump."),
  r("heart-failure", "ckd", "related", "heart and kidney failure worsen each other (the cardiorenal syndrome)."),
  r("heart-failure", "ards", "differential", "pulmonary oedema from raised pulmonary venous pressure."),
  r("heart-failure", "electrolytes", "management", "diuretics cause hypokalaemia and hyponatraemia; ACE inhibitors cause hyperkalaemia."),
  r("heart-failure", "anaemia", "mechanism", "anaemia is a treatable contributor to breathlessness and decompensation."),
  r("heart-failure", "pleural-effusion", "complication", "bilateral transudative effusions appear when the right heart fails."),
  r("hypertension", "heart-failure", "complication", "pressure overload leads to ventricular hypertrophy then failure."),
  r("hypertension", "ckd", "complication", "hypertension is both a cause and a consequence of kidney disease."),
  r("hypertension", "stroke", "complication", "the strongest modifiable risk factor for stroke."),
  r("hypertension", "diabetes", "related", "the two together multiply cardiovascular risk."),
  r("rhd", "valves", "complication", "mitral stenosis and regurgitation are the chronic result."),
  r("rhd", "endocarditis", "complication", "damaged valves are the commonest site for infective endocarditis."),
  r("rhd", "heart-failure", "complication", "valve disease is a leading cause of heart failure in young adults here."),
  r("valves", "heart-failure", "complication", "chronic valve lesions lead to failure; the murmur tells you which valve."),
  // renal
  r("aki", "fluid-balance", "prerequisite", "most AKI is pre-renal: assess volume status first."),
  r("aki", "electrolytes", "complication", "hyperkalaemia is the immediate danger."),
  r("aki", "dialysis", "management", "the indications for urgent dialysis (AEIOU)."),
  r("aki", "ckd", "next", "AKI that does not recover becomes CKD."),
  r("nephrotic", "ckd", "complication", "persistent glomerular disease progresses to CKD."),
  r("nephrotic", "hypertension", "related", "nephritic syndrome causes hypertension and fluid retention."),
  r("diabetic-kidney", "diabetes", "prerequisite", "diabetic nephropathy follows years of poor glycaemic control."),
  // infection / sepsis
  r("sepsis", "pneumonia", "related", "the lung is the commonest source."),
  r("sepsis", "shock", "complication", "septic shock is distributive shock."),
  r("sepsis", "amr", "management", "choose empirical antibiotics, then narrow when cultures return."),
  r("meningitis", "raised-icp", "complication", "know the signs of raised pressure before a lumbar puncture."),
  r("meningitis", "sepsis", "related", "meningococcal disease is sepsis with a rash."),
  r("hiv", "tb", "related", "TB is the leading cause of death in people with HIV."),
  r("hiv", "pcp", "complication", "PCP appears when CD4 falls below 200."),
  r("malaria", "fever", "prerequisite", "the approach to the febrile patient comes first."),
  // GI
  r("gi-bleed", "cirrhosis", "mechanism", "variceal bleeding comes from portal hypertension."),
  r("gi-bleed", "pud", "related", "peptic ulcer is the commonest cause of upper GI bleeding."),
  r("cirrhosis", "ascites-sbp", "complication", "ascites forms from portal hypertension and low albumin, and the fluid can become infected."),
  r("cirrhosis", "hep-enceph", "complication", "the failing liver cannot clear ammonia, which clouds consciousness."),
  r("cirrhosis", "hrs", "complication", "kidney failure from splanchnic vasodilatation."),
  r("cirrhosis", "gi-bleed", "complication", "oesophageal varices bleed because portal hypertension forces blood through fragile collateral veins."),
  r("cirrhosis", "coagulation", "complication", "the liver makes the clotting factors."),
  r("cirrhosis", "nutrition", "related", "malnutrition and vitamin deficiencies are common."),
  r("viral-hepatitis", "cirrhosis", "next", "chronic hepatitis B and C lead to cirrhosis and hepatocellular carcinoma."),
  // endocrine
  r("diabetes", "dka", "complication", "the acute metabolic emergency of type 1 diabetes."),
  r("diabetes", "hypoglycaemia", "management", "the commonest emergency caused by treatment."),
  r("diabetes", "diabetic-kidney", "complication", "the leading cause of end-stage kidney disease."),
  r("diabetes", "neuropathy", "complication", "a common microvascular complication."),
  r("diabetes", "sepsis", "related", "infections are more frequent and more severe in diabetes."),
  r("dka", "electrolytes", "management", "potassium falls as insulin drives it into cells: monitor it."),
  r("dka", "acid-base", "investigation", "a high anion-gap metabolic acidosis."),
  // haematology
  r("anaemia", "iron-deficiency", "next", "the commonest cause worldwide."),
  r("anaemia", "heart-failure", "complication", "severe anaemia causes high-output failure."),
  r("anaemia", "sickle-cell", "differential", "haemolysis in a young patient with pain crises."),
  r("sickle-cell", "pneumonia", "complication", "acute chest syndrome looks like pneumonia."),
];

export const topicById = (id: string): { topic: ImedTopic; system: ImedSystem } | null => {
  for (const system of IMED) { const topic = system.topics.find((x) => x.id === id); if (topic) return { topic, system }; }
  return null;
};
/** The IMED topic a published note belongs to (the first, when one note covers two topics). */
export const topicForNote = (slug: string) => { for (const system of IMED) { const topic = system.topics.find((x) => x.note === slug); if (topic) return { topic, system }; } return null; };
export const isPublished = (t: ImedTopic) => Boolean(t.note && findStaticNote(t.note));

export interface ImedLink { type: RelationType; topic: ImedTopic; system: ImedSystem; why: string; published: boolean }
const ORDER: RelationType[] = ["prerequisite", "differential", "complication", "mechanism", "investigation", "management", "related", "next"];
/** Links out of a topic, grouped by the order a student should meet them. */
export function linksFor(id: string): ImedLink[] {
  return RELATIONS.filter((x) => x.from === id)
    .map((x) => { const to = topicById(x.to); return to ? { type: x.type, topic: to.topic, system: to.system, why: x.why, published: isPublished(to.topic) } : null; })
    .filter((x): x is ImedLink => Boolean(x))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}
export const TYPE_LABEL: Record<RelationType, string> = {
  prerequisite: "Before you continue", differential: "Can look like this", complication: "What it can lead to", mechanism: "Shares a mechanism with",
  investigation: "The same test", management: "Treatment connection", related: "Related", next: "Read next",
};
