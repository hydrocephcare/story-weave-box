import type { Rotation } from "@/clinical/types";

export interface Year4CoreTopic {
  unit: Rotation;
  section: string;
  topics: string[];
}

/** Broad Year 4 checklist: theory + bedside + investigations + management.
 * Used to ensure revision content covers the common clinical curriculum, not just simulator cases.
 */
export const YEAR4_CORE_TOPICS: Year4CoreTopic[] = [
  { unit:"medicine", section:"Clinical method", topics:["Medical history and problem representation","General examination and vital signs","Fluid status and JVP","Pulse and blood pressure interpretation","Clubbing, cyanosis, pallor, jaundice and oedema","Lymph nodes","Presenting a case and ranking differentials"] },
  { unit:"medicine", section:"Respiratory", topics:["Pneumonia","Pulmonary tuberculosis","Asthma","COPD","Pleural effusion","Pneumothorax","Pulmonary embolism","Bronchiectasis","Lung cancer","Respiratory failure","ABG interpretation","Chest X-ray approach"] },
  { unit:"medicine", section:"Cardiovascular", topics:["Hypertension","Hypertensive emergency","Heart failure","Acute coronary syndrome","Atrial fibrillation and common arrhythmias","Valvular heart disease and murmurs","Infective endocarditis","Pericarditis and tamponade","Cardiomyopathy","DVT and venous thromboembolism","ECG approach"] },
  { unit:"medicine", section:"Neurology", topics:["Seizure and epilepsy","Status epilepticus","Stroke and TIA","Meningitis and encephalitis","Headache red flags","Raised intracranial pressure","Peripheral neuropathy","Guillain-Barre syndrome","Myasthenia gravis","Parkinsonism","UMN versus LMN localisation","GCS and coma"] },
  { unit:"medicine", section:"Renal and electrolytes", topics:["AKI","CKD","Nephrotic syndrome","Nephritic syndrome","UTI and pyelonephritis","Dialysis indications","Hyperkalaemia","Hypokalaemia","Hyponatraemia","Hypernatraemia","Acid-base disorders","Urinalysis interpretation"] },
  { unit:"medicine", section:"GI and liver", topics:["Upper GI bleeding","Peptic ulcer disease","Cirrhosis and portal hypertension","Ascites and SBP","Hepatic encephalopathy","Viral hepatitis","Jaundice approach","Acute pancreatitis","Dysphagia","Inflammatory bowel disease","Diarrhoea approach"] },
  { unit:"medicine", section:"Endocrine and metabolism", topics:["Diabetes mellitus","DKA","HHS","Hypoglycaemia","Hypothyroidism","Thyrotoxicosis and thyroid storm","Adrenal insufficiency and adrenal crisis","Cushing syndrome","Calcium disorders"] },
  { unit:"medicine", section:"Infection and tropical medicine", topics:["Sepsis and septic shock","Malaria and severe malaria","HIV and opportunistic infections","TB","Meningitis","Typhoid differential","Fever of unknown origin","Antimicrobial stewardship"] },
  { unit:"medicine", section:"Haematology and rheumatology", topics:["Anaemia approach","Iron deficiency","Megaloblastic anaemia","Haemolysis","Sickle cell disease and crises","Bleeding and clotting disorders","Leukaemia and lymphoma red flags","Rheumatoid arthritis","SLE","Gout","Septic arthritis"] },

  { unit:"surgery", section:"Core surgical method", topics:["Surgical history","Acute abdomen examination","Lump examination","Wound and ulcer examination","Pre-operative assessment","Consent","Post-operative review","Fluids and urine output","Pain control","Nutrition"] },
  { unit:"surgery", section:"Acute abdomen", topics:["Appendicitis","Intestinal obstruction","Peritonitis","Perforated viscus","Cholecystitis and cholangitis","Pancreatitis","Hernias and strangulation","GI bleeding","Mesenteric ischaemia red flags"] },
  { unit:"surgery", section:"Trauma and emergencies", topics:["ABCDE trauma assessment","Haemorrhagic shock","Chest trauma","Head injury","Spinal injury","Abdominal trauma","Fractures and neurovascular examination","Compartment syndrome","Burns","Acute limb ischaemia"] },
  { unit:"surgery", section:"Common specialties", topics:["Breast lump and triple assessment","Thyroid swelling","Diabetic foot","Peripheral arterial disease","Urinary retention","Haematuria","Renal colic","BPH","Testicular torsion","Scrotal swelling"] },
  { unit:"surgery", section:"Peri-operative complications", topics:["Surgical site infection","Post-operative bleeding","Atelectasis and pneumonia","DVT and PE","Ileus","Anastomotic leak","Wound dehiscence","Sepsis","VTE prophylaxis","Antibiotic prophylaxis"] },

  { unit:"obgyn", section:"Obstetric foundations", topics:["Gestational age and EDD","Gravidity and parity","Antenatal history","Booking investigations","Antenatal examination","Fundal height","Fetal lie, presentation and position","Fetal heart assessment","Danger signs in pregnancy"] },
  { unit:"obgyn", section:"Pregnancy complications", topics:["Pre-eclampsia","Eclampsia","Gestational diabetes","Anaemia in pregnancy","Antepartum haemorrhage","Placenta praevia","Placental abruption","PROM and PPROM","Preterm labour","Rhesus isoimmunisation"] },
  { unit:"obgyn", section:"Labour and delivery", topics:["Stages of labour","Labour monitoring","Partograph or labour care guide","Fetal compromise","Induction and augmentation","Obstructed labour","Shoulder dystocia","Cord prolapse","Uterine rupture","Caesarean section indications","Third-stage management"] },
  { unit:"obgyn", section:"Postpartum", topics:["Postpartum haemorrhage and 4 Ts","Puerperal sepsis","Postpartum examination","Breastfeeding","Postpartum contraception","Venous thromboembolism","Postpartum mental-health red flags"] },
  { unit:"obgyn", section:"Gynaecology", topics:["Abnormal uterine bleeding","Fibroids","Endometriosis","PID","Ectopic pregnancy","Miscarriage","Ovarian cyst and torsion","PCOS","Cervical cancer","Endometrial cancer","Contraception","Infertility approach"] },

  { unit:"paeds", section:"Paediatric method", topics:["Paediatric history","Birth and neonatal history","Feeding history","Immunisation history","Growth assessment","Developmental milestones","Paediatric vital signs","Weight-based prescribing","IMCI danger signs"] },
  { unit:"paeds", section:"Neonatology", topics:["Neonatal resuscitation","Prematurity","Neonatal sepsis","Neonatal jaundice","Hypoglycaemia","Birth asphyxia","Low birth weight","Thermoregulation","Breastfeeding"] },
  { unit:"paeds", section:"Common childhood disease", topics:["Pneumonia","Asthma and wheeze","Diarrhoea and dehydration","Malaria","Meningitis","Seizures and febrile seizures","UTI","Anaemia","Sickle cell disease","HIV and TB in children"] },
  { unit:"paeds", section:"Nutrition and development", topics:["Severe acute malnutrition","Marasmus and kwashiorkor","Micronutrient deficiency","Growth faltering","Developmental delay","Cerebral palsy","Autism red flags","School and adolescent health"] },
  { unit:"paeds", section:"Paediatric emergencies", topics:["ABCDE in a child","Shock","Severe dehydration","Status epilepticus","Severe asthma","Severe malaria","Sepsis","Hypoglycaemia","Poisoning basics"] },

  { unit:"psychiatry", section:"Foundations and interview", topics:["Psychiatric history","Mental state examination","Risk assessment","Suicide and self-harm assessment","Capacity and consent","Biopsychosocial formulation","4 Ps formulation","Collateral history","Organic causes of psychiatric symptoms"] },
  { unit:"psychiatry", section:"Adult psychiatry", topics:["Depressive disorders","Bipolar disorder","Schizophrenia and psychosis","Anxiety disorders","Panic disorder","OCD","PTSD","Somatic symptom disorders","Personality disorders","Eating disorders"] },
  { unit:"psychiatry", section:"Substance and organic", topics:["Alcohol use disorder","Alcohol withdrawal and delirium tremens","Cannabis-related disorders","Stimulant-related disorders","Opioid-related disorders","Delirium","Dementia","Substance-induced psychosis"] },
  { unit:"psychiatry", section:"Child and adolescent", topics:["ADHD","Autism spectrum disorder","Intellectual disability","Conduct disorder","Depression in young people","Child safeguarding","School refusal and anxiety","Developmental history"] },
  { unit:"psychiatry", section:"Treatment and emergencies", topics:["SSRIs","Antipsychotics","Mood stabilisers","Benzodiazepines","ECT basics","Psychological therapies","Acute agitation","Neuroleptic malignant syndrome","Serotonin syndrome","Extrapyramidal effects","Lithium toxicity"] }
];

export const YEAR4_CORE_COUNT = YEAR4_CORE_TOPICS.reduce((n, s) => n + s.topics.length, 0);
