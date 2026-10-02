export type Year4PharmUnit = {
  id: "medicine" | "obgyn" | "paeds" | "surgery" | "psychiatry";
  name: string;
  topics: string[];
};

export const YEAR4_PHARM_UNITS: Year4PharmUnit[] = [
  { id:"medicine", name:"Internal Medicine", topics:[
    "Antihypertensives: calcium-channel blockers, ACE inhibitors, ARBs, thiazides and beta-blockers",
    "Heart failure: ACE inhibitor/ARB/ARNI, beta-blocker, spironolactone, SGLT2 inhibitor and loop diuretic",
    "Acute coronary syndrome: aspirin, P2Y12 inhibitors, anticoagulation, nitrates and statins",
    "Atrial fibrillation and common antiarrhythmics",
    "Anticoagulants and antiplatelets: heparin, warfarin, DOACs, aspirin and clopidogrel",
    "Asthma and COPD: beta-2 agonists, antimuscarinics, inhaled and systemic corticosteroids",
    "Pneumonia and common antibacterial classes",
    "Tuberculosis drugs: RHZE, key adverse effects and interactions",
    "HIV treatment: core ART principles, TLD and important interactions",
    "Malaria: ACTs and treatment principles for severe malaria",
    "Diabetes: metformin, sulfonylureas, SGLT2 inhibitors and insulin",
    "Thyroid disease: levothyroxine, carbimazole, PTU and beta-blockers",
    "Seizures: benzodiazepines and common antiseizure medicines",
    "Pain and inflammation: paracetamol, NSAIDs and opioids",
    "GI: PPIs, antiemetics, H. pylori therapy and drugs used in GI bleeding",
    "Renal prescribing: dose adjustment, nephrotoxic medicines and electrolyte emergencies",
    "Emergency medicines: adrenaline, dextrose, calcium, oxygen and common antidotes"
  ]},
  { id:"obgyn", name:"Obstetrics & Gynaecology", topics:[
    "General principles of prescribing in pregnancy and breastfeeding",
    "Hypertension in pregnancy: labetalol, nifedipine and methyldopa",
    "Eclampsia: magnesium sulfate and toxicity monitoring",
    "Postpartum haemorrhage: oxytocin, misoprostol, tranexamic acid and uterotonic cautions",
    "Induction and augmentation of labour: prostaglandins and oxytocin",
    "Antenatal supplements: iron, folate and prevention principles",
    "Contraception: combined hormonal, progestin-only, injectables, implants and emergency contraception",
    "Common antimicrobials in pregnancy and important medicines to avoid"
  ]},
  { id:"paeds", name:"Paediatrics", topics:[
    "Weight-based prescribing and safe dose calculation",
    "Maintenance and resuscitation fluids",
    "Fever and safe paediatric analgesia",
    "Pneumonia and common paediatric antibiotics",
    "Asthma: inhaled bronchodilators, steroids and spacer use",
    "Seizures and status epilepticus medicines",
    "Malaria treatment in children",
    "Diarrhoea: ORS and zinc",
    "Neonatal essentials including vitamin K and common emergency medicines",
    "Avoiding age-inappropriate and nephrotoxic medicines"
  ]},
  { id:"surgery", name:"Surgery", topics:[
    "Analgesic ladder: paracetamol, NSAIDs and opioids",
    "Peri-operative antibiotic prophylaxis",
    "Treatment of surgical infection and sepsis",
    "VTE prophylaxis and anticoagulants",
    "IV crystalloid principles and electrolyte replacement",
    "Antiemetics",
    "Local anaesthetic basics and toxicity recognition",
    "Burns: analgesia, fluids and infection principles",
    "Emergency medicines used in resuscitation",
    "Peri-operative management of chronic medicines"
  ]},
  { id:"psychiatry", name:"Psychiatry", topics:[
    "SSRIs and other antidepressants",
    "First-generation and second-generation antipsychotics",
    "Extrapyramidal adverse effects and their treatment",
    "Neuroleptic malignant syndrome",
    "Mood stabilisers: lithium and valproate",
    "Lithium monitoring, interactions and toxicity",
    "Benzodiazepines: uses, dependence and respiratory-depression risk",
    "Alcohol withdrawal and thiamine",
    "Serotonin syndrome",
    "Safe pharmacological management of acute agitation"
  ]}
];
