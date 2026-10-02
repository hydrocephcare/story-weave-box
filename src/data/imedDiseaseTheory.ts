export type ImedDiseaseTheory = {
  id: string;
  system: string;
  name: string;
  definition: string;
  causes: string[];
  mechanism: string;
  presentation: string[];
  investigations: string[];
  management: string[];
  complications: string[];
  viva: string;
};

export const IMED_DISEASE_THEORY: ImedDiseaseTheory[] = [
  {
    id:"pneumonia", system:"Respiratory", name:"Community-acquired pneumonia",
    definition:"Acute infection of lung parenchyma acquired outside hospital or early after admission.",
    causes:["Streptococcus pneumoniae is a classic typical cause","Haemophilus influenzae and other bacteria","Atypical organisms","Viruses; aspiration and immune status change the differential"],
    mechanism:"Organisms reach distal airways, trigger alveolar inflammation and exudate, impair gas exchange and may produce consolidation and systemic sepsis.",
    presentation:["Fever and cough","Dyspnoea or tachypnoea","Pleuritic chest pain","Crackles/bronchial breathing or signs of consolidation","Hypoxaemia or confusion in severe disease"],
    investigations:["Pulse oximetry and observations","Chest X-ray when indicated","FBC and renal function in admitted/severe disease","Microbiology guided by severity and context","Assess severity using clinical judgement plus an appropriate score such as CURB-65 in adults"],
    management:["Assess ABC and oxygenation","Appropriate empiric antibiotics based on severity/local guidance then narrow when possible","Fluids only according to haemodynamic need","Treat sepsis/respiratory failure promptly","Reassess response and complications"],
    complications:["Respiratory failure","Sepsis/septic shock","Parapneumonic effusion/empyema","Lung abscess"],
    viva:"Consolidation classically increases vocal resonance and produces bronchial breathing; pleural effusion reduces breath sounds and vocal transmission."
  },
  {
    id:"tb", system:"Respiratory/Infection", name:"Tuberculosis",
    definition:"Infectious disease caused by Mycobacterium tuberculosis complex, most commonly affecting lungs but potentially any organ.",
    causes:["Airborne transmission from infectious pulmonary/laryngeal TB","Risk rises with HIV/immunosuppression, close exposure, undernutrition and crowded settings"],
    mechanism:"Inhaled bacilli are taken up by macrophages; cell-mediated immunity forms granulomas. Latent infection can later reactivate when immune control fails.",
    presentation:["Chronic cough","Weight loss","Fever/night sweats","Haemoptysis","Lymphadenopathy or organ-specific symptoms in extrapulmonary TB"],
    investigations:["Appropriate sputum molecular testing/microbiology","Chest imaging","HIV testing according to consent/local practice","Drug-resistance testing where indicated","Site-specific sampling for extrapulmonary disease"],
    management:["Use guideline-based multidrug anti-TB therapy","Assess adherence, interactions and toxicity","Infection-control measures for infectious pulmonary disease","Integrate HIV care when relevant","Follow clinical and microbiological response as appropriate"],
    complications:["Massive haemoptysis","Bronchiectasis/fibrosis","Pleural disease","Disseminated/miliary TB","TB meningitis and other extrapulmonary disease"],
    viva:"A chronic cough with constitutional symptoms is a pattern, not proof of TB; seek microbiological confirmation whenever possible."
  },
  {
    id:"asthma", system:"Respiratory", name:"Asthma",
    definition:"Chronic inflammatory airway disorder characterised by variable respiratory symptoms and variable expiratory airflow limitation.",
    causes:["Atopy/genetic susceptibility","Allergens","Viral infections","Exercise/cold air","Smoke and occupational exposures","Some medicines can trigger bronchospasm in susceptible patients"],
    mechanism:"Airway inflammation and hyper-responsiveness cause reversible bronchoconstriction, mucosal oedema and mucus production.",
    presentation:["Episodic wheeze","Dyspnoea","Chest tightness","Cough, often variable or nocturnal","Severe attack: inability to speak normally, hypoxaemia, exhaustion or silent chest"],
    investigations:["Peak flow or spirometry demonstrating variable airflow limitation when feasible","Pulse oximetry during acute attacks","Assess triggers and inhaler technique","Investigate alternative diagnoses when atypical"],
    management:["Reliever bronchodilation during acute symptoms","Inhaled corticosteroid-containing long-term strategy","Systemic corticosteroid for significant exacerbation","Oxygen according to saturation and urgent escalation for life-threatening features","Education, adherence and trigger/inhaler review"],
    complications:["Status asthmaticus","Respiratory failure","Pneumothorax rarely","Death in severe uncontrolled attacks"],
    viva:"A silent chest in a very breathless asthmatic is dangerous because airflow may be critically reduced."
  },
  {
    id:"copd", system:"Respiratory", name:"Chronic obstructive pulmonary disease",
    definition:"Chronic respiratory disease with persistent airflow obstruction associated with airway/alveolar abnormalities, commonly related to noxious exposure.",
    causes:["Tobacco smoke","Biomass fuel exposure","Occupational dust/fumes","Less commonly genetic predisposition such as alpha-1 antitrypsin deficiency"],
    mechanism:"Chronic inflammation causes small-airway narrowing, mucus hypersecretion and/or emphysematous loss of elastic recoil and gas-exchange surface.",
    presentation:["Progressive exertional dyspnoea","Chronic cough/sputum","Wheeze","Frequent infective exacerbations","Hyperinflation and reduced breath sounds in advanced disease"],
    investigations:["Spirometry confirms persistent airflow obstruction when stable","Pulse oximetry","Chest imaging when indicated","ABG in severe exacerbation/possible hypercapnia","Assess exacerbation history and functional burden"],
    management:["Stop smoking/exposure","Bronchodilator therapy with inhaler education","Vaccination and pulmonary rehabilitation where appropriate","Treat exacerbations with bronchodilators and selected steroids/antibiotics","Controlled oxygen and ventilatory support when indicated"],
    complications:["Respiratory failure","Pulmonary hypertension/cor pulmonale","Pneumothorax","Recurrent infection","Weight loss/deconditioning"],
    viva:"Asthma tends to have more variable/reversible obstruction; COPD obstruction is persistent, though overlap exists."
  },
  {
    id:"heart-failure", system:"Cardiovascular", name:"Heart failure",
    definition:"Clinical syndrome caused by structural or functional cardiac abnormality leading to inadequate output and/or elevated filling pressures.",
    causes:["Ischaemic heart disease","Hypertension","Valvular disease","Cardiomyopathy","Arrhythmia","Other myocardial/pericardial causes"],
    mechanism:"Reduced pump function or abnormal filling activates sympathetic and RAAS pathways, causing vasoconstriction and sodium/water retention; chronic compensation worsens congestion/remodelling.",
    presentation:["Exertional dyspnoea","Orthopnoea and PND","Fatigue","Raised JVP and peripheral oedema","Basal crackles","Displaced apex/S3 in selected patients"],
    investigations:["ECG","Chest X-ray","Echocardiography","Renal function/electrolytes","BNP/NT-proBNP where available and appropriate","Search for precipitant such as ACS, infection or arrhythmia"],
    management:["Treat acute congestion/precipitant and support oxygenation/perfusion","Diuretics relieve fluid overload","For HFrEF use evidence-based disease-modifying therapy as tolerated","Control BP and relevant comorbidities","Daily weight/fluid assessment and patient education"],
    complications:["Acute pulmonary oedema","Cardiogenic shock","Arrhythmia/sudden death","Renal dysfunction","Thromboembolism"],
    viva:"Raised JVP supports systemic venous congestion; nephrotic oedema usually does not itself raise the JVP."
  },
  {
    id:"hypertension", system:"Cardiovascular", name:"Hypertension",
    definition:"Persistent elevation of systemic arterial blood pressure confirmed using appropriate repeated measurements unless presenting with a hypertensive emergency.",
    causes:["Primary hypertension is most common","Renal parenchymal/renovascular disease","Endocrine causes","Obstructive sleep apnoea","Drugs/substances","Coarctation and other secondary causes"],
    mechanism:"Long-term elevation reflects altered vascular resistance, volume regulation, sympathetic/RAAS activity and vascular remodelling, with mechanisms varying by patient.",
    presentation:["Often asymptomatic","Headache is nonspecific","End-organ disease may present with stroke, ACS, heart failure, CKD or retinopathy"],
    investigations:["Confirm accurate BP measurement","Assess cardiovascular risk and target-organ injury","Urinalysis/renal function/electrolytes","Glucose/lipids","ECG and additional testing guided by age/severity/secondary-cause clues"],
    management:["Lifestyle and risk-factor modification","Use guideline-appropriate antihypertensive classes tailored to comorbidity and patient factors","Combination therapy is often required","Treat hypertensive emergency with monitored controlled BP reduction and organ-specific care"],
    complications:["Stroke","Ischaemic heart disease","Heart failure/LVH","CKD","Retinopathy","Aortic disease"],
    viva:"Hypertensive emergency means severe BP elevation with acute target-organ damage; the number alone does not define the emergency."
  },
  {
    id:"acs", system:"Cardiovascular", name:"Acute coronary syndrome",
    definition:"Spectrum of acute myocardial ischaemia comprising unstable angina, NSTEMI and STEMI.",
    causes:["Usually atherosclerotic plaque disruption with coronary thrombosis","Less commonly spasm, embolism or supply-demand mechanisms"],
    mechanism:"Abrupt reduction in coronary blood flow causes myocardial ischaemia; prolonged severe ischaemia produces irreversible myocyte necrosis and troponin release.",
    presentation:["Central pressure/heaviness","Radiation to arm/jaw/back","Sweating, nausea or dyspnoea","Atypical presentations occur, especially in older adults and people with diabetes"],
    investigations:["12-lead ECG promptly","Serial troponin interpreted with symptoms/ECG","Continuous observations","Renal function/FBC and risk assessment","Echocardiography/coronary evaluation as indicated"],
    management:["Immediate ABC assessment","Antiplatelet/antithrombotic and anti-ischaemic therapy according to ACS type and contraindications","Urgent reperfusion for eligible STEMI","Treat complications and institute secondary prevention"],
    complications:["Arrhythmias","Heart failure/cardiogenic shock","Mechanical complications","Pericarditis","Recurrent ischaemia"],
    viva:"Do not wait for troponin before acting on a convincing STEMI ECG and clinical presentation."
  },
  {
    id:"aki", system:"Renal", name:"Acute kidney injury",
    definition:"Abrupt reduction in kidney function recognised by a rise in creatinine and/or reduced urine output.",
    causes:["Pre-renal: hypovolaemia, shock or reduced effective circulation","Intrinsic: glomerular, tubular, interstitial or vascular injury","Post-renal: urinary tract obstruction"],
    mechanism:"Reduced filtration results from impaired perfusion, structural nephron injury or obstruction; prolonged pre-renal injury can progress to intrinsic tubular injury.",
    presentation:["May be asymptomatic initially","Oliguria","Fluid overload","Uraemic symptoms","Features of the underlying cause"],
    investigations:["Trend creatinine and urine output","Urinalysis","Electrolytes/bicarbonate","Volume-status examination","Medication review","Ultrasound/bladder assessment when obstruction is possible","Targeted tests for intrinsic disease"],
    management:["Treat the cause","Optimise perfusion without causing overload","Stop/adjust nephrotoxic or renally cleared drugs","Correct dangerous electrolytes/acidosis","Relieve obstruction","Dialysis for appropriate refractory/life-threatening complications"],
    complications:["Hyperkalaemia","Pulmonary oedema","Metabolic acidosis","Uraemia","Drug toxicity","Progression to CKD"],
    viva:"Creatinine can lag behind the kidney insult; urine output and clinical context matter."
  },
  {
    id:"ckd", system:"Renal", name:"Chronic kidney disease",
    definition:"Persistent abnormal kidney structure or function with health implications, generally present for at least three months.",
    causes:["Diabetes","Hypertension","Chronic glomerular disease","Hereditary/cystic disease","Chronic obstruction/reflux and other renal disorders"],
    mechanism:"Progressive nephron loss causes compensatory hyperfiltration in remaining nephrons, promoting further damage and loss of endocrine/excretory functions.",
    presentation:["Often silent early","Hypertension and oedema","Fatigue/pruritus/nausea in advanced disease","Anaemia and bone-mineral manifestations"],
    investigations:["eGFR trend","Urine albumin/protein assessment","Urinalysis","Electrolytes/bicarbonate","FBC","Calcium/phosphate and other complication monitoring","Ultrasound/etiologic work-up as appropriate"],
    management:["Treat cause and slow progression","BP and diabetes control","Avoid nephrotoxins and adjust doses","Manage anaemia/mineral-bone/acidosis/fluid complications","Cardiovascular risk reduction","Plan renal replacement therapy when advanced"],
    complications:["Hyperkalaemia/acidosis","Fluid overload","Anaemia","CKD-mineral bone disorder","Uraemia","High cardiovascular risk"],
    viva:"CKD is not diagnosed from one raised creatinine; chronicity must be established."
  },
  {
    id:"stroke", system:"Neurology", name:"Acute stroke",
    definition:"Acute focal neurological dysfunction due to cerebral infarction or intracranial haemorrhage.",
    causes:["Ischaemic: large-artery atherosclerosis, cardioembolism, small-vessel disease and others","Haemorrhagic: hypertension, vascular lesions, anticoagulation and other causes"],
    mechanism:"Interrupted blood flow causes energy failure and infarction; haemorrhage additionally causes direct tissue injury, mass effect and raised intracranial pressure.",
    presentation:["Sudden unilateral weakness/numbness","Facial weakness","Speech/language disturbance","Visual deficit","Ataxia/brainstem signs","Severe headache or reduced consciousness can suggest haemorrhage"],
    investigations:["Establish onset/last-known-well","Immediate glucose","Urgent non-contrast brain imaging","ECG and vascular/cardiac evaluation as appropriate","Basic labs without delaying time-critical treatment"],
    management:["ABC and physiological optimisation","Determine ischaemic versus haemorrhagic stroke urgently","Reperfusion for eligible ischaemic stroke according to time/imaging criteria","Appropriate antithrombotic strategy after haemorrhage is excluded","Swallow assessment, complication prevention and rehabilitation"],
    complications:["Aspiration pneumonia","Cerebral oedema","DVT/PE","Pressure injury","Seizures","Depression and disability"],
    viva:"A bedside diagnosis of stroke does not tell you whether it is infarction or haemorrhage; brain imaging is essential."
  },
  {
    id:"meningitis", system:"Neurology/Infection", name:"Acute meningitis",
    definition:"Inflammation of the meninges, commonly infectious, with bacterial meningitis requiring especially urgent treatment.",
    causes:["Bacterial organisms vary with age/risk factors","Viral meningitis","TB and cryptococcal meningitis in relevant contexts"],
    mechanism:"Pathogen invasion triggers meningeal inflammation, cerebral oedema, altered perfusion and potentially raised intracranial pressure/sepsis.",
    presentation:["Fever","Headache","Neck stiffness","Photophobia","Vomiting","Altered mental state","Seizures or focal signs in complicated disease"],
    investigations:["Blood cultures when feasible without delaying therapy","Lumbar puncture with CSF cells/protein/glucose/microbiology when safe","Brain imaging before LP only when clinically indicated","HIV/other targeted testing according to context"],
    management:["Stabilise ABC","Prompt empiric antimicrobial therapy for suspected bacterial meningitis","Adjunctive therapy according to likely pathogen/local protocol","Manage seizures, shock and raised ICP complications","Use appropriate infection-control/public-health measures"],
    complications:["Seizures","Raised ICP/herniation","Hearing loss","Focal neurological deficits","Septic shock","Cognitive impairment"],
    viva:"Do not delay life-saving antibiotics solely to obtain CT or CSF in an unstable patient."
  },
  {
    id:"diabetes", system:"Endocrine", name:"Diabetes mellitus",
    definition:"Group of metabolic disorders characterised by chronic hyperglycaemia due to impaired insulin secretion, insulin action or both.",
    causes:["Type 1: autoimmune beta-cell destruction","Type 2: insulin resistance with progressive beta-cell dysfunction","Other specific/secondary forms and gestational diabetes"],
    mechanism:"Insulin deficiency/resistance reduces glucose uptake and increases hepatic glucose output; chronic hyperglycaemia causes microvascular and macrovascular injury.",
    presentation:["Polyuria/polydipsia","Weight loss in marked insulin deficiency","Recurrent infection","Blurred vision","May be asymptomatic and detected on screening"],
    investigations:["Diagnostic plasma glucose/HbA1c according to criteria and context","Renal function","Urine albumin","Lipids","Foot and eye complication screening","Ketones/acid-base tests when acutely unwell"],
    management:["Education, nutrition/activity and cardiovascular risk reduction","Individualised glucose-lowering therapy","Insulin is essential in type 1 and selected type 2/acute settings","Monitor kidney, eye, foot and cardiovascular complications"],
    complications:["DKA/HHS/hypoglycaemia","Retinopathy","Nephropathy","Neuropathy/foot disease","ASCVD and stroke"],
    viva:"DKA is defined by ketosis and metabolic acidosis, not hyperglycaemia alone."
  },
  {
    id:"malaria", system:"Infection/Tropical", name:"Malaria",
    definition:"Protozoal infection caused by Plasmodium species and transmitted by infected Anopheles mosquitoes.",
    causes:["Plasmodium falciparum is the major cause of severe malaria in Africa","Other Plasmodium species occur in different epidemiological settings"],
    mechanism:"Blood-stage parasites invade erythrocytes, causing cyclical haemolysis/inflammation; falciparum-infected cells can sequester in microvasculature and cause organ dysfunction.",
    presentation:["Fever/chills","Headache and malaise","Anaemia/thrombocytopenia may occur","Severe disease: altered consciousness, seizures, severe anaemia, hypoglycaemia, acidosis, shock, kidney injury or respiratory distress"],
    investigations:["Confirm parasitaemia with recommended rapid test and/or microscopy when available","Glucose in severe disease","FBC, renal function and acid-base/lactate assessment guided by severity","Search for alternative/coexisting infection"],
    management:["Treat uncomplicated malaria with recommended effective combination therapy according to current national guidance","Severe malaria requires urgent parenteral antimalarial therapy plus supportive management","Correct hypoglycaemia, seizures, anaemia, shock and organ failure appropriately"],
    complications:["Cerebral malaria","Severe anaemia","Hypoglycaemia","AKI","Acidosis/shock","Pulmonary oedema/ARDS","Death"],
    viva:"Severity is determined by organ dysfunction and metabolic/haematological features, not by how high the fever is."
  },
  {
    id:"anaemia", system:"Haematology", name:"Anaemia approach",
    definition:"Haemoglobin concentration below the appropriate reference threshold, resulting in reduced blood oxygen-carrying capacity.",
    causes:["Microcytic: iron deficiency, thalassaemia, chronic inflammation and others","Normocytic: acute blood loss, chronic disease, renal disease, haemolysis and marrow disease","Macrocytic: B12/folate deficiency, alcohol/liver disease, drugs and marrow disorders"],
    mechanism:"Anaemia results from reduced red-cell production, increased destruction or blood loss; compensatory tachycardia and increased cardiac output support oxygen delivery.",
    presentation:["Fatigue","Exertional dyspnoea","Palpitations","Pallor","Severe: angina, syncope or heart failure","Cause-specific clues such as bleeding, jaundice or neurological symptoms"],
    investigations:["FBC and MCV","Reticulocyte count","Blood film","Iron studies/B12/folate as indicated","Haemolysis tests when suspected","Renal function and cause-directed investigation for blood loss or marrow disease"],
    management:["Treat the cause rather than haemoglobin alone","Replace deficient nutrients when confirmed/likely","Control bleeding or haemolysis cause","Transfusion based on severity, symptoms, haemodynamics and context rather than a single universal number"],
    complications:["High-output cardiac strain","Ischaemia in susceptible patients","Cause-specific complications","Neurological injury in prolonged B12 deficiency"],
    viva:"MCV tells you cell size; the reticulocyte count tells you whether the marrow is responding."
  }
];
