export type ImedFoundationNote = {
  id:string; topic:string; section:string; definition:string; why:string;
  foundations:string[]; clinical:string[]; examination:string[]; investigations:string[];
  reasoning:string[]; viva:string[];
};

const N=(id:string,topic:string,section:string,definition:string,why:string,foundations:string[],clinical:string[],examination:string[],investigations:string[],reasoning:string[],viva:string[]):ImedFoundationNote=>({id,topic,section,definition,why,foundations,clinical,examination,investigations,reasoning,viva});

export const IMED_FOUNDATION_NOTES: ImedFoundationNote[] = [
N("resp-foundations","Respiratory foundations","Respiratory",
"Respiration moves oxygen from atmosphere to tissues and removes carbon dioxide. Understanding ventilation, perfusion and diffusion explains most respiratory symptoms and investigations.",
"Learn the normal system first: disease makes sense when you can identify which normal step has failed.",
["Ventilation = movement of air into and out of alveoli.","Perfusion = pulmonary blood flow reaching ventilated alveoli.","Diffusion = gas movement across the alveolar-capillary membrane.","V/Q matching matters: an alveolus needs both air and blood flow for efficient gas exchange.","Hypoxaemia can result from V/Q mismatch, shunt, diffusion limitation, hypoventilation or low inspired oxygen.","CO2 rises especially when effective alveolar ventilation is inadequate."],
["Dyspnoea means perceived breathing difficulty; ask onset, triggers, progression and functional limitation.","Cough: acute/chronic, dry/productive, sputum amount/colour and haemoptysis.","Chest pain: pleuritic pain worsens with inspiration/cough; pressure-like pain raises cardiac differentials.","Wheeze suggests narrowed intrathoracic airways; stridor suggests upper-airway obstruction.","Haemoptysis demands severity assessment plus causes such as infection/TB, bronchiectasis, malignancy and PE."],
["Count respiratory rate before disturbing the patient.","Look for work of breathing, accessory muscles, cyanosis, ability to speak and mental status.","Inspect → palpate → percuss → auscultate, comparing symmetrical areas.","Reduced expansion, percussion note and breath sounds help localise pathology."],
["Pulse oximetry measures oxygen saturation but does not measure ventilation or CO2.","ABG answers oxygenation, ventilation and acid-base questions.","CXR localises patterns such as consolidation, effusion, pneumothorax and masses.","CBC, microbiology, spirometry, CT and other tests should answer a specific clinical question."],
["Airspace filled with inflammatory fluid → consolidation pattern, e.g. pneumonia.","Air around lung → pneumothorax; fluid around lung → pleural effusion.","Narrowed variable airways → asthma; persistent airflow limitation → COPD.","Always connect symptom → anatomical/physiological problem → differential → targeted test."],
["Why can a patient be hypoxic with a normal-looking respiratory rate?","Why can pulse oximetry be acceptable while CO2 is dangerously high?","Explain V/Q mismatch in one minute."]),

N("resp-history","Respiratory history","Respiratory","A respiratory history converts symptoms and exposures into a focused problem representation and differential diagnosis.",
"Good investigations start with a good pre-test differential; otherwise tests become random.",
["Start with presenting complaint and chronology before jumping to disease labels.","Characterise breathlessness, cough, sputum, haemoptysis, chest pain, wheeze and fever.","Severity matters: rest symptoms, inability to speak, syncope, confusion or rapidly worsening breathlessness are red flags."],
["Ask smoking and vaping exposure quantitatively where possible.","Ask TB contact, previous TB and treatment, HIV/immunosuppression and recurrent infections.","Occupational/environmental exposure: dusts, fumes, asbestos/silica and biomass smoke.","Ask orthopnoea/PND/leg swelling because cardiac disease can mimic respiratory disease.","Medication history matters: ACE-inhibitor cough, sedatives, immunosuppressants and inhaler adherence/technique."],
["Use the history to predict examination findings before touching the patient.","Assess general state, respiratory distress, cachexia, fever, cyanosis and clubbing.","Then perform a structured respiratory exam and relevant CVS/DVT examination."],
["Choose tests from the differential: CXR for structural pattern, sputum/microbiology for infection, spirometry for airflow disease, ECG/troponin for cardiac mimics, D-dimer/imaging only in appropriate PE pathways."],
["Acute fever + productive cough + focal pleuritic pain → pneumonia rises.","Chronic cough + weight loss/night sweats + exposure → TB rises.","Episodic wheeze with triggers/variability → asthma rises.","Older smoker + progressive dyspnoea/chronic sputum → COPD rises.","Sudden pleuritic pain + dyspnoea → consider PE or pneumothorax urgently."],
["Give a 30-second respiratory history summary.","Which history questions distinguish asthma from COPD?","What haemoptysis features make you escalate immediately?"]),

N("resp-exam","Respiratory examination","Respiratory","A structured bedside examination identifies respiratory distress, localises chest pathology and tests whether history and physiology agree.",
"The exam is not a ritual: each sign changes the anatomical or physiological hypothesis.",
["Before IPPA, inspect from the end of the bed: distress, oxygen, posture, respiratory rate, speech and mental status.","Hands/face can reveal clubbing, cyanosis, nicotine staining, pallor and CO2-retention clues.","Tracheal position and chest symmetry help detect major volume/pressure abnormalities."],
["Inspection: shape, scars, symmetry and work of breathing.","Palpation: trachea, expansion and selected tactile fremitus.","Percussion: resonant normally; dull with fluid/solid tissue; hyperresonant with excess air.","Auscultation: intensity/type of breath sounds plus added sounds such as crackles and wheeze."],
["Consolidation can cause dull percussion, bronchial breathing and increased vocal resonance.","Pleural effusion often gives stony dull percussion with reduced breath sounds.","Pneumothorax tends toward hyperresonance with reduced breath sounds; tension physiology adds haemodynamic compromise.","Diffuse wheeze suggests airflow narrowing; fine inspiratory crackles suggest interstitial/alveolar processes depending on context."],
["After examination, correlate with SpO2 and choose imaging/labs based on localisation and severity."],
["Ask: is this airway, alveolar, pleural, interstitial, vascular or extrapulmonary?","Do not diagnose from one sign; combine signs into a pattern.","Normal auscultation does not exclude PE or important early disease."],
["Why is an effusion dull but pneumothorax hyperresonant?","What causes bronchial breathing over peripheral lung?","Present a normal respiratory examination, then an abnormal one."]),

N("cxr-approach","Chest X-ray approach","Respiratory","Chest radiograph interpretation is a systematic assessment of image quality followed by airway, lungs/pleura, cardiac/mediastinal structures, diaphragm and bones/soft tissues.",
"A fixed sequence reduces missed findings and forces you to connect an image to the patient's physiology.",
["Confirm patient/date and projection, then assess image quality before pathology.","Use a consistent search pattern such as ABCDE.","Compare both lungs and costophrenic angles; look behind heart and below diaphragms.","Describe first, diagnose second: location, opacity/lucency, borders, volume change and associated signs."],
["Consolidation: air-space opacity, sometimes air bronchograms.","Pleural effusion: blunted costophrenic angle/meniscus when sufficiently large.","Pneumothorax: visceral pleural line with absent peripheral lung markings.","Cardiomegaly/pulmonary oedema may explain dyspnoea that initially sounded respiratory."],
["CXR follows clinical examination; it does not replace it."],
["If CXR does not explain severe symptoms, reconsider PE, early infection, asthma/COPD, metabolic acidosis and cardiac causes.","CT, ultrasound or repeat imaging may be needed depending on the question."],
["Ask whether the radiograph explains the patient's severity.","Distinguish air-space disease, pleural disease and volume loss.","Never call an opacity 'pneumonia' without clinical context."],
["Give your CXR sequence without looking at notes.","How do effusion and consolidation differ on CXR?","Why can a patient with PE have a near-normal CXR?"]),

N("abg-basics","ABG basics","Respiratory","Arterial blood gas analysis evaluates pH, PaCO2, bicarbonate and oxygenation to identify respiratory and metabolic acid-base disturbances.",
"ABGs become easy when interpreted in the same order every time rather than memorising isolated numbers.",
["Step 1: pH — acidemia or alkalemia.","Step 2: PaCO2 — respiratory component; CO2 behaves as an acid.","Step 3: bicarbonate — metabolic component.","Step 4: identify the primary process and ask whether compensation is appropriate.","Step 5: assess oxygenation in clinical context.","Mixed disorders are likely when compensation does not fit the primary disorder."],
["High CO2 with acidemia → primary respiratory acidosis, often acute or chronic ventilatory failure.","Low CO2 with alkalemia → respiratory alkalosis, seen with hyperventilation from causes such as hypoxaemia, pain or sepsis.","Low bicarbonate with acidemia → metabolic acidosis; tachypnoea may be compensatory rather than primary lung disease."],
["ABG interpretation must be paired with respiratory rate, work of breathing, mental status and oxygen delivery."],
["Use electrolytes and clinical context to investigate metabolic disorders; compare previous gases in chronic respiratory disease."],
["Oxygenation failure and ventilation failure are not the same problem.","A patient can have severe hypercapnia despite an SpO2 that looks acceptable on supplemental oxygen.","Always ask what process could produce the gas, not merely name the acid-base disorder."],
["Why does CO2 retention cause respiratory acidosis?","Why can DKA cause deep rapid breathing without primary lung disease?","Interpret pH → CO2 → bicarbonate → oxygenation aloud."])
];
