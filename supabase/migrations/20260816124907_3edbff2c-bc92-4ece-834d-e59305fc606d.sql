-- 1) Make both of the owner's accounts admins
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE email IN ('hydrocephcare@gmail.com','med.hydrocephcare@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Replace the Haematology end-of-year 2025 paper with the supplied content
UPDATE public.articles SET
  title = 'Haematology End of Year 2025 Past Paper — MKU MBML 3200 Questions & Answers',
  slug = 'haematology-end-of-year-2025-past-paper',
  category = 'Year 3: Hematopathology',
  university = 'Mount Kenya University',
  school = 'School of Medicine',
  unit = 'MBML 3200 — Haematology',
  exam_type = 'End of Year',
  exam_year = '2025',
  semester_number = 2,
  content_kind = 'past_paper',
  published = true,
  deleted_at = NULL,
  meta_title = 'Haematology End of Year 2025 Past Paper (MKU MBML 3200) — Answers',
  meta_description = 'Mount Kenya University Haematology (MBML 3200) end of year 2025 past paper: 60 MCQs, 7 SAQs and a long answer question with verified answers and explanations.',
  content = $md$**MOUNT KENYA UNIVERSITY — UNIVERSITY EXAMINATION 2024/2025**

School of Medicine, Department of Pathology | BMBS Year 3

Unit: MBML 3200 — Haematology | Date: 14th July 2025, 2:00PM | Duration: 2hrs 30mins

Paper One — Section A: 60 MCQs (60 marks) | Section B: 7 SAQs (60 marks) | Section C: 1 LAQ (20 marks)

## SECTION A: MCQs

**1.** A 28-year-old woman presents with fatigue and pallor. CBC shows low haemoglobin and peripheral blood film shows microcytic hypochromic red blood cells. What is the most likely diagnosis?

a) Vitamin B12 deficiency
b) Iron deficiency anaemia
c) Aplastic anaemia
d) Haemolytic anaemia
e) Sickle cell anaemia

**Answer: b) Iron deficiency anaemia**
Explanation: Iron deficiency impairs haem synthesis, producing small, pale RBCs.

**2.** The primary site of haematopoiesis in adults is:

a) Liver
b) Spleen
c) Bone marrow
d) Lymph nodes
e) Thymus

**Answer: c) Bone marrow**
Explanation: Adult active marrow is confined mainly to the axial skeleton.

**3.** Which blood cell type is primarily responsible for defence against parasitic infections?

a) Neutrophils
b) Basophils
c) Eosinophils
d) Monocytes
e) Lymphocytes

**Answer: c) Eosinophils**
Explanation: Release major basic protein and cationic protein, cytotoxic to helminths.

**4.** Which clotting factor is deficient in Haemophilia A?

a) Factor V
b) Factor VII
c) Factor VIII
d) Factor IX
e) Factor X

**Answer: c) Factor VIII**
Explanation: X-linked recessive deficiency affecting the intrinsic pathway.

**5.** A patient presents with recurrent infections, petechiae, and anaemia. Bone marrow biopsy shows reduced cellularity. What is the most likely diagnosis?

a) Iron deficiency anaemia
b) Sickle cell disease
c) Polycythaemia vera
d) Aplastic anaemia
e) Thalassaemia

**Answer: d) Aplastic anaemia**
Explanation: Marrow failure causes pancytopenia (infections, bleeding, anaemia).

**6.** Haemopoiesis is the process of:

a) Blood clot formation
b) White blood cell destruction
c) Blood cell production
d) Plasma protein synthesis
e) Iron transport

**Answer: c) Blood cell production**
Explanation: Formation of all blood cellular components from stem cells.

**7.** A 62-year-old man presents with fatigue, fever and bruising. FBC shows WCC 40x10^9/L with 25% circulating blasts, Hb 90 g/L, platelets 50x10^9/L. Which investigation is required to definitively diagnose acute myeloid leukaemia?

a) Bone marrow aspirate and trephine biopsy
b) Peripheral blood smear
c) Flow cytometry of peripheral blood
d) Computed tomography scan
e) Serum lactate dehydrogenase

**Answer: a) Bone marrow aspirate and trephine biopsy**
Explanation: Gives definitive blast count, morphology, cytochemistry, immunophenotyping and cytogenetics.

**8.** Which cytochemical stain is most useful to confirm lymphoblasts in suspected ALL?

a) Myeloperoxidase (MPO)
b) Terminal deoxynucleotidyl transferase (TdT)
c) Sudan Black B
d) Tartrate-resistant acid phosphatase (TRAP)
e) Periodic acid-Schiff (PAS)

**Answer: b) TdT**
Explanation: Nuclear enzyme expressed in immature lymphoid precursors, absent in mature cells.

**9.** A patient receiving chemotherapy shows a drop in neutrophil count. This condition is termed:

a) Anaemia
b) Leukocytosis
c) Neutropenia
d) Thrombocytopenia
e) Erythrocytosis

**Answer: c) Neutropenia**
Explanation: Chemotherapy is myelosuppressive, lowering absolute neutrophil count.

**10.** Which chromosomal translocation is pathognomonic of chronic myeloid leukaemia?

a) t(8;21)
b) t(15;17)
c) t(9;22)(q34;q11)
d) t(4;11)
e) inv(16)

**Answer: c) t(9;22)(q34;q11)**
Explanation: Philadelphia chromosome; BCR-ABL fusion leads to constitutive tyrosine kinase activity.

**11.** Thrombopoietin primarily regulates the production of:

a) Red blood cells
b) Plasma cells
c) Platelets
d) Monocytes
e) Eosinophils

**Answer: c) Platelets**
Explanation: Stimulates megakaryocyte proliferation and maturation.

**12.** Which of the following is a stem cell marker used to identify haematopoietic stem cells?

a) CD3
b) CD4
c) CD19
d) CD34
e) CD20

**Answer: d) CD34**
Explanation: Standard marker for haematopoietic progenitor/stem cells.

**13.** In a bone marrow biopsy of a patient with aplastic anaemia, you would expect to find:

a) Hypercellular marrow with many erythroblasts
b) Increased megakaryocytes
c) Fatty replacement and hypocellularity
d) Increased lymphoid follicles
e) Excessive neutrophil precursors

**Answer: c) Fatty replacement and hypocellularity**
Explanation: Haematopoietic tissue is replaced by fat, reducing cellularity.

**14.** Granulocyte colony-stimulating factor (G-CSF) is used clinically to:

a) Increase platelet production
b) Stimulate lymphocyte activation
c) Promote neutrophil recovery after chemotherapy
d) Inhibit erythropoiesis
e) Enhance clotting factor production

**Answer: c) Promote neutrophil recovery after chemotherapy**
Explanation: Stimulates granulocyte precursor proliferation, shortening neutropenia.

**15.** A patient with Chronic Lymphoid Leukaemia develops a warm autoimmune haemolytic anaemia. Which test is essential to confirm this complication?

a) Direct antiglobulin (Coombs) test
b) Indirect antiglobulin test
c) Serum haptoglobin level
d) Reticulocyte count
e) Lactate dehydrogenase

**Answer: a) Direct antiglobulin (Coombs) test**
Explanation: Detects antibody/complement bound to the patient's own RBCs.

**16.** A 25-year-old woman presents with painless cervical lymphadenopathy and night sweats. Excisional lymph node biopsy shows large binucleated cells expressing CD15 and CD30. What is the most likely diagnosis?

a) Classical Hodgkin lymphoma
b) Follicular lymphoma
c) Diffuse large B-cell lymphoma
d) Mantle cell lymphoma
e) Burkitt lymphoma

**Answer: a) Classical Hodgkin lymphoma**
Explanation: Reed-Sternberg cells are CD15+/CD30+ (owl-eye binucleated cells).

**17.** A 60-year-old man on warfarin therapy for atrial fibrillation attends clinic for monitoring. His prothrombin time is 30 seconds (normal 11-15s) and his APTT is within normal limits. Which test is used to standardise his anticoagulant dose?

a) Activated partial thromboplastin time (APTT)
b) Prothrombin time / international normalised ratio (PT/INR)
c) Thrombin time (TT)
d) D-dimer
e) Platelet count

**Answer: b) PT/INR**
Explanation: Warfarin inhibits vitamin K-dependent factors (II, VII, IX, X); INR standardises PT across labs.

**18.** Which of the following laboratory findings is typically associated with haemolytic anaemia?

a) Decreased reticulocyte count
b) Increased haptoglobin
c) Increased lactate dehydrogenase (LDH)
d) Decreased unconjugated bilirubin
e) Increased mean corpuscular volume (MCV)

**Answer: c) Increased LDH**
Explanation: RBC destruction releases intracellular LDH; also raised reticulocytes, low haptoglobin, raised unconjugated bilirubin.

**19.** A patient with HIV has an absolute neutrophil count of 0.4x10^9/L. Which pathogen poses the greatest risk with this degree of neutropenia?

a) Pneumocystis jirovecii
b) Cryptococcus neoformans
c) Staphylococcus aureus
d) Candida albicans
e) Mycobacterium avium

**Answer: c) Staphylococcus aureus**
Explanation: Severe neutropenia predisposes primarily to bacterial infections from endogenous flora.

**20.** A 25-year-old man of Mediterranean descent presents with mild anaemia and target cells on a blood film. What is the most likely diagnosis?

a) Iron deficiency anaemia
b) Hereditary spherocytosis
c) Vitamin B12 deficiency
d) Thalassaemia trait
e) Sickle cell anaemia

**Answer: d) Thalassaemia trait**
Explanation: Mediterranean ancestry with target cells and mild anaemia is classic.

**21.** A patient with chronic atrophic gastritis is at risk of which type of anaemia?

a) Iron deficiency anaemia
b) Sickle cell anaemia
c) Pernicious anaemia
d) Thalassaemia
e) Anaemia of chronic disease

**Answer: c) Pernicious anaemia**
Explanation: Loss of parietal cells reduces intrinsic factor, impairing B12 absorption.

**22.** In thalassaemia major, anaemia is primarily caused by:

a) Iron deficiency
b) Bone marrow failure
c) Defective globin chain synthesis
d) Vitamin B12 deficiency
e) Autoimmune destruction of red blood cells

**Answer: c) Defective globin chain synthesis**
Explanation: Imbalanced alpha/beta chain production causes ineffective erythropoiesis and haemolysis.

**23.** The erythrocyte sedimentation rate (ESR) in normal pregnancy is typically:

a) Decreased due to reduced erythrocyte aggregation
b) Markedly elevated due to increased fibrinogen
c) Unchanged from non-pregnant levels
d) Low in the first and second trimesters, rising in the third
e) Reduced in the third trimester

**Answer: b) Markedly elevated due to increased fibrinogen**
Explanation: Pregnancy raises fibrinogen and acute-phase proteins, increasing ESR.

**24.** What is the universal donor blood group for red blood cell transfusion?

a) AB positive
b) AB negative
c) O positive
d) O negative
e) A negative

**Answer: d) O negative**
Explanation: Lacks A, B, and Rh(D) antigens.

**25.** A patient receiving a blood transfusion develops fever, chills, and hypotension within 30 minutes. What is the most likely diagnosis?

a) Allergic reaction
b) Delayed haemolytic transfusion reaction
c) Febrile non-haemolytic transfusion reaction
d) Acute haemolytic transfusion reaction
e) Iron overload

**Answer: d) Acute haemolytic transfusion reaction**
Explanation: Rapid fever, chills and hypotension suggest ABO-incompatible intravascular haemolysis.

**26.** Which of the following is used to prevent transfusion-associated graft-versus-host disease in immunocompromised patients?

a) Leucodepletion
b) Irradiation of blood products
c) Washing of red blood cells
d) ABO cross-matching
e) Pathogen reduction

**Answer: b) Irradiation of blood products**
Explanation: Inactivates donor T-lymphocytes, preventing engraftment and attack on the recipient.

**27.** Which of the following blood components is indicated in a patient with thrombocytopenia and active bleeding?

a) Fresh frozen plasma
b) Cryoprecipitate
c) Red blood cells
d) Platelet concentrate
e) Albumin

**Answer: d) Platelet concentrate**
Explanation: Directly replaces deficient platelets.

**28.** Which infection is most commonly screened for in donated blood?

a) Epstein-Barr virus
b) Influenza
c) Hepatitis B
d) Norovirus
e) Human papillomavirus

**Answer: c) Hepatitis B**
Explanation: Mandatory transfusion-transmissible infection screen, with HIV, HCV and syphilis.

**29.** A peripheral blood film from a patient with suspected AML shows numerous blasts. Which cytochemical stain is most specific for confirming myeloid lineage?

a) Sudan Black B
b) Non-specific esterase (NSE)
c) Myeloperoxidase (MPO)
d) Periodic acid-Schiff (PAS)
e) Tartrate-resistant acid phosphatase (TRAP)

**Answer: c) Myeloperoxidase (MPO)**
Explanation: Highly specific for myeloid/granulocytic lineage.

**30.** Which of the following transfusion reactions is associated with hypotension and respiratory distress due to donor antibodies against recipient leukocytes?

a) TRALI (Transfusion-Related Acute Lung Injury)
b) TACO (Transfusion-Associated Circulatory Overload)
c) Delayed haemolytic reaction
d) Febrile non-haemolytic reaction
e) Iron overload

**Answer: a) TRALI**
Explanation: Donor anti-leukocyte antibodies activate recipient neutrophils in the pulmonary vasculature, causing non-cardiogenic pulmonary oedema.

**31.** A patient with liver failure is coagulopathic and actively bleeding. Which blood product is most appropriate?

a) Platelets
b) Packed red blood cells
c) Fresh frozen plasma
d) Albumin
e) Cryoprecipitate

**Answer: c) Fresh frozen plasma**
Explanation: Replaces the broad range of clotting factors synthesised by the failing liver.

**32.** How long after collection can citrate-phosphate-dextrose-adenine-1 (CPDA-1) packed red blood cells typically be stored before transfusion?

a) 5 days
b) 14 days
c) 21 days
d) 35 days
e) 42 days

**Answer: d) 35 days**
Explanation: CPDA-1 anticoagulant-preservative extends RBC shelf life to 35 days.

**33.** Which sample type is preferred for cytogenetic and molecular analysis in suspected ALL?

a) Bone marrow aspirate
b) Peripheral venous blood
c) Cerebrospinal fluid
d) Lymph node biopsy
e) Pleural fluid

**Answer: a) Bone marrow aspirate**
Explanation: Provides the highest yield of leukaemic blasts for cytogenetic and molecular study.

**34.** Which of the following is a known cause of aplastic anaemia?

a) Vitamin B12 deficiency
b) Epstein-Barr virus infection
c) Parvovirus B19
d) Chloramphenicol use
e) Erythropoietin therapy

**Answer: d) Chloramphenicol use**
Explanation: Idiosyncratic marrow toxicity is a recognised drug cause of aplastic anaemia.

**35.** Which diagnostic method is used to detect the Philadelphia chromosome in interphase cells?

a) Quantitative RT-PCR
b) Conventional cytogenetics
c) Fluorescence in situ hybridisation (FISH)
d) Flow cytometry
e) Immunocytochemistry

**Answer: c) FISH**
Explanation: Detects BCR-ABL fusion directly in interphase (non-dividing) cells, unlike conventional cytogenetics which needs metaphase.

**36.** A 60-year-old with established CLL complains of headaches and blurred vision. Which diagnostic procedure is indicated to assess for central nervous system involvement?

a) Magnetic resonance imaging of the brain
b) Computed tomography of the chest
c) Lumbar puncture with cerebrospinal fluid cytology
d) Positron emission tomography
e) Bone marrow aspirate

**Answer: c) Lumbar puncture with cerebrospinal fluid cytology**
Explanation: CSF cytology directly detects leukaemic infiltration of the CNS.

**37.** Which procedure is the gold standard to obtain diagnostic tissue in suspected lymphoma?

a) Excisional lymph node biopsy
b) Fine-needle aspiration
c) Core needle biopsy
d) Bone marrow aspirate
e) Endoscopic biopsy

**Answer: a) Excisional lymph node biopsy**
Explanation: Preserves full nodal architecture, essential for lymphoma subtyping.

**38.** Which immunophenotypic marker is typically positive in follicular lymphoma?

a) CD5
b) CD10
c) CD23
d) CD30
e) CD15

**Answer: b) CD10**
Explanation: Follicular lymphoma is a germinal-centre B-cell tumour; CD10 marks germinal-centre origin.

**39.** A 68-year-old man presents with bone pain, anaemia, and elevated total protein. Serum electrophoresis reveals a monoclonal spike. What is the most likely diagnosis?

a) Acute leukaemia
b) Multiple myeloma
c) Chronic lymphocytic leukaemia
d) Non-Hodgkin lymphoma
e) Amyloidosis

**Answer: b) Multiple myeloma**
Explanation: Bone pain, anaemia and a monoclonal (M) protein spike are classic myeloma features.

**40.** Which of the following is a common clinical finding in multiple myeloma?

a) Splenomegaly
b) Lymphadenopathy
c) Lytic bone lesions
d) Petechiae
e) Peripheral neuropathy

**Answer: c) Lytic bone lesions**
Explanation: Plasma cell proliferation activates osteoclasts, producing punched-out lytic lesions.

**41.** Bence Jones proteins in the urine are composed of:

a) Albumin
b) Kappa or lambda light chains
c) Immunoglobulin M
d) Alpha globulins
e) Haemoglobin fragments

**Answer: b) Kappa or lambda light chains**
Explanation: Free monoclonal light chains filtered by the kidney in myeloma.

**42.** A 55-year-old woman receives an unfractionated heparin infusion for a deep-vein thrombosis. Which test is most appropriate to monitor her anticoagulant effect?

a) Activated partial thromboplastin time (APTT)
b) Prothrombin time (PT)
c) Thrombin time (TT)
d) D-dimer
e) Anti-factor Xa

**Answer: a) APTT**
Explanation: Standard monitoring test for unfractionated heparin (intrinsic pathway effect).

**43.** In HIV-associated thrombocytopenia, autoantibodies are often directed against which platelet antigen?

a) Glycoprotein IIb/IIIa
b) Glycoprotein Ib/IX
c) Human platelet antigen-1
d) CD4
e) CD8

**Answer: a) Glycoprotein IIb/IIIa**
Explanation: Most commonly targeted platelet surface antigen in immune thrombocytopenia, including HIV-related disease.

**44.** Which coagulation factor is most markedly increased during pregnancy?

a) Protein C
b) Protein S
c) Antithrombin III
d) Factor XI
e) Fibrinogen

**Answer: e) Fibrinogen**
Explanation: Fibrinogen rises significantly in pregnancy, contributing to the hypercoagulable state.

**45.** Which of the following features distinguishes monoclonal gammopathy of undetermined significance (MGUS) from multiple myeloma?

a) Presence of lytic lesions
b) Presence of anaemia
c) Elevated M protein without end-organ damage
d) Hypercalcaemia
e) Renal impairment

**Answer: c) Elevated M protein without end-organ damage**
Explanation: MGUS lacks the CRAB features (Calcium, Renal, Anaemia, Bone) that define myeloma.

**46.** In patients with AML, marked gingival hypertrophy and infiltration is most commonly associated with which FAB subtype?

a) M2 (AML with maturation)
b) M3 (acute promyelocytic leukaemia)
c) M4 (acute myelomonocytic leukaemia)
d) M5 (acute monocytic leukaemia)
e) M1 (AML without maturation)

**Answer: d) M5 (acute monocytic leukaemia)**
Explanation: Monocytic subtypes infiltrate gums and skin due to tissue-homing monocytic blasts.

**47.** Which immunophenotypic marker is most characteristic of T-cell ALL?

a) CD10
b) CD19
c) CD20
d) CD3
e) CD33

**Answer: d) CD3**
Explanation: CD3 is the defining pan-T-cell marker.

**48.** A 55-year-old man presents with fatigue, weight loss and splenomegaly. His full blood count shows WCC 140x10^9/L with marked neutrophilia, left shift and basophilia. Which investigation is required to confirm the diagnosis of chronic myeloid leukaemia?

a) Bone marrow aspirate and trephine biopsy with cytogenetic analysis
b) Peripheral blood smear only
c) Quantitative RT-PCR for BCR-ABL transcripts
d) JAK2 V617F mutation analysis
e) Serum erythropoietin

**Answer: c) Quantitative RT-PCR for BCR-ABL transcripts**
Explanation: Confirms and quantifies the BCR-ABL fusion transcript, the molecular hallmark of CML; also used to monitor treatment response.

**49.** Which laboratory test is most widely used as a prognostic tumour marker in lymphoma?

a) C-reactive protein
b) Beta-2 microglobulin
c) Lactate dehydrogenase
d) Erythrocyte sedimentation rate
e) Serum ferritin

**Answer: c) Lactate dehydrogenase**
Explanation: LDH reflects tumour burden and turnover and is part of prognostic indices such as the IPI.

**50.** Which chromosomal translocation is diagnostic of Burkitt lymphoma?

a) t(8;14)
b) t(14;18)
c) t(11;14)
d) inv(11)
e) t(9;22)

**Answer: a) t(8;14)**
Explanation: Places the MYC oncogene (chromosome 8) under control of the immunoglobulin heavy chain enhancer (chromosome 14).

**51.** Which of the following is a hallmark feature of polycythaemia vera?

a) Decreased red cell mass
b) Low erythropoietin levels with increased haematocrit
c) Elevated erythropoietin due to hypoxia
d) Pancytopenia
e) Severe thrombocytopenia

**Answer: b) Low erythropoietin levels with increased haematocrit**
Explanation: Autonomous (EPO-independent) marrow proliferation suppresses endogenous EPO despite a high red cell mass.

**52.** Which gene mutation is most commonly associated with essential thrombocythaemia?

a) BCR-ABL
b) CALR
c) MPL
d) JAK2
e) FLT3

**Answer: d) JAK2**
Explanation: JAK2 V617F is present in the majority of essential thrombocythaemia cases.

**53.** Which of the following is most likely seen in myelofibrosis?

a) Hypercellular bone marrow with increased blasts
b) Fibrotic bone marrow with tear-drop red blood cells
c) Decreased reticulin in bone marrow
d) Pure erythroid hyperplasia
e) Smudge cells on blood film

**Answer: b) Fibrotic bone marrow with tear-drop red blood cells**
Explanation: Marrow fibrosis distorts erythrocyte shape, producing dacrocytes (tear-drop cells) on the film.

**54.** In the context of the reticuloendothelial system, what is a key histological feature of reactive lymphadenopathy?

a) Sheets of plasma cells
b) Starry-sky appearance
c) Follicular hyperplasia with preserved architecture
d) Sinusoidal infiltration by atypical lymphocytes
e) Effacement of lymph node architecture

**Answer: c) Follicular hyperplasia with preserved architecture**
Explanation: Benign reactive nodes retain normal architecture, unlike malignant infiltration or effacement.

**55.** Mycosis fungoides, a cutaneous T-cell lymphoma, characteristically expresses:

a) CD20
b) CD3
c) CD10
d) CD15
e) CD30

**Answer: b) CD3**
Explanation: Pan-T-cell marker, consistent with its T-cell origin.

**56.** A 20-year-old man presents with recurrent joint bleeds. His prothrombin time is normal, activated partial thromboplastin time (APTT) is prolonged and thrombin time (TT) is normal. Which coagulation factor abnormality is most likely?

a) Factor VII deficiency
b) Factor VIII deficiency (haemophilia A)
c) Dysfibrinogenaemia
d) Vitamin K deficiency
e) Von Willebrand disease

**Answer: b) Factor VIII deficiency (haemophilia A)**
Explanation: Isolated prolonged APTT with normal PT and TT localises the defect to the intrinsic pathway (factors VIII, IX, XI, XII); recurrent haemarthroses are classic for haemophilia A.

**57.** Which change is characteristic of early HIV infection before CD4 counts fall markedly?

a) Neutrophilia
b) Lymphopenia
c) Thrombocytosis
d) Eosinophilia
e) Basophilia

**Answer: b) Lymphopenia**
Explanation: Early HIV viraemia causes lymphocyte depletion before overt CD4 collapse.

**58.** Which natural anticoagulant is physiologically reduced in pregnancy, contributing to a hypercoagulable state?

a) Protein C
b) Protein S
c) Antithrombin III
d) Plasminogen
e) Tissue plasminogen activator

**Answer: b) Protein S**
Explanation: Free protein S levels fall in pregnancy, tipping the balance toward a prothrombotic state.

**59.** In acute promyelocytic leukaemia (APL), which coagulation abnormality is most characteristic of disseminated intravascular coagulation?

a) Elevated fibrinogen
b) Decreased fibrinogen
c) Shortened prothrombin time
d) Thrombocytosis
e) Decreased D-dimer levels

**Answer: b) Decreased fibrinogen**
Explanation: APL blasts release procoagulant material, consuming fibrinogen and clotting factors in DIC; D-dimer is elevated, not decreased.

**60.** To distinguish chronic myeloid leukaemia from polycythaemia vera, which mutation analysis would be most useful?

a) CALR exon 9 mutation
b) MPL W515L/K mutation
c) JAK2 V617F mutation
d) BCR-ABL fusion transcript
e) TET2 mutation

**Answer: d) BCR-ABL fusion transcript**
Explanation: BCR-ABL is specific to CML and absent in polycythaemia vera, which is driven by a JAK2 mutation instead.

## SECTION B: SHORT ANSWER QUESTIONS (60 marks)

**Question 1.** A 45-year-old presents with fatigue, early satiety and splenomegaly. FBC shows WBC 120x10^9/L (ref 4-12x10^9/L), neutrophilia with a left shift and basophilia.

**a) Diagnosis (1 mark)**

Answer: Chronic myeloid leukaemia (CML)

**b) Laboratory investigations to confirm the diagnosis (9 marks)**

Answer:
- Full blood count and peripheral blood film - neutrophilia with full spectrum of granulocyte maturation, basophilia, left shift
- Bone marrow aspirate and trephine biopsy - hypercellular marrow with myeloid hyperplasia
- Cytogenetic analysis (karyotyping) - detects t(9;22)(q34;q11), the Philadelphia chromosome
- Fluorescence in situ hybridisation (FISH) - detects BCR-ABL fusion, including in interphase cells
- Quantitative RT-PCR for BCR-ABL transcript - confirms diagnosis and is used for molecular monitoring
- Serum LDH and uric acid - reflect high cell turnover
- Leucocyte alkaline phosphatase (LAP) score - typically low in CML, helping differentiate from a leukaemoid reaction

**Question 2.** A 32-year-old woman with heavy menstrual bleeding presents with fatigue, pallor and pica.

**a) Diagnosis (1 mark)**

Answer: Iron deficiency anaemia

**b) Three clinical signs (3 marks)**

Answer:
- Koilonychia (spoon-shaped nails)
- Angular stomatitis / cheilosis
- Glossitis (smooth, sore tongue)

**c) Four laboratory tests and expected results (4 marks)**

Answer:
- Full blood count - microcytic, hypochromic anaemia (low MCV, low MCH)
- Peripheral blood film - microcytosis, hypochromia, anisopoikilocytosis, pencil cells
- Serum ferritin - decreased, reflecting depleted iron stores
- Serum iron and total iron-binding capacity (TIBC) - decreased serum iron with increased TIBC

**d) Two confirmatory laboratory tests (2 marks)**

Answer:
- Serum ferritin, the most specific marker of iron stores
- Serum transferrin saturation, which is reduced

**Question 3.** A 10-year-old child presents with a rapidly growing jaw mass. Describe the laboratory investigations needed to diagnose Burkitt lymphoma (10 marks).

Answer:
- Full blood count and peripheral film - may show anaemia and occasional circulating lymphoma cells
- Excisional lymph node or mass biopsy - histology shows a starry-sky appearance
- Immunohistochemistry - positive for CD10, CD19, CD20 and BCL6; negative for BCL2; very high Ki-67 proliferation index
- Cytogenetic analysis - detects t(8;14) or variants t(2;8) and t(8;22) involving MYC
- Bone marrow aspirate and trephine biopsy - assesses marrow infiltration and staging
- Lumbar puncture with CSF cytology - assesses CNS involvement, common in Burkitt lymphoma
- Serum LDH and uric acid - markedly elevated, reflecting high tumour turnover and tumour lysis risk
- Imaging (CT, MRI or PET) - assesses extent and stage of disease

**Question 4.** A 50-year-old man with cirrhosis and splenomegaly has a platelet count of 60x10^9/L (reference 150-450x10^9/L).

**a) Interpretation (1 mark)**

Answer: Thrombocytopenia

**b) Two causes (2 marks)**

Answer:
- Hypersplenism with splenic sequestration of platelets secondary to portal hypertension
- Reduced hepatic thrombopoietin production due to cirrhosis

**c) Laboratory tests to make a diagnosis and expected results (7 marks)**

Answer:
- Full blood count - thrombocytopenia, possibly mild anaemia or leucopenia if hypersplenism is present
- Peripheral blood film - confirms true thrombocytopenia by excluding platelet clumping
- Liver function tests - deranged, with low albumin and abnormal transaminases
- Coagulation profile (PT/INR, APTT) - prolonged due to reduced hepatic synthesis of clotting factors
- Abdominal ultrasound - confirms splenomegaly and portal hypertension
- Bone marrow aspirate or biopsy - usually normal or increased megakaryocytes, indicating peripheral sequestration rather than marrow failure
- Serum thrombopoietin level - may be reduced due to impaired hepatic synthesis

**Question 5.** A 6-year-old boy presents with recurrent haemarthroses and easy bruising.

| Test | Result | Reference |
|---|---|---|
| APTT | 55 seconds | 28-42 seconds |
| PT | 13 seconds | 12.3-15.1 seconds |

**a) Interpret and comment on the results (2 marks)**

Answer: Isolated prolonged APTT with a normal PT indicates a defect in the intrinsic coagulation pathway (factors VIII, IX, XI or XII), with an intact extrinsic pathway.

**b) Diagnosis (1 mark)**

Answer: Haemophilia A (factor VIII deficiency); haemophilia B (factor IX deficiency) is the key differential.

**c) Four additional tests and expected findings (8 marks)**

Answer:
- Factor VIII assay - reduced or absent activity, confirming haemophilia A
- Factor IX assay - normal, excluding haemophilia B
- Mixing study (APTT with normal plasma) - corrects, confirming factor deficiency rather than an inhibitor
- Von Willebrand factor antigen and activity - normal, excluding von Willebrand disease
- Thrombin time - normal, excluding a fibrinogen abnormality
- Genetic testing of the F8 gene - identifies the causative mutation for carrier detection and counselling

**Question 6.** A 28-year-old woman on a zidovudine-based ART regimen develops symptomatic macrocytic anaemia (MCV 110 fL).

**a) Mechanisms of zidovudine-induced anaemia (4 marks)**

Answer:
- Zidovudine inhibits mitochondrial and nuclear DNA polymerases in erythroid precursors, impairing DNA synthesis
- This causes ineffective erythropoiesis with nuclear-cytoplasmic asynchrony, producing macrocytosis
- Direct bone marrow suppression reduces erythroid precursor proliferation
- Severe cases can progress to pure red cell aplasia

**b) Three additional tests and expected findings (3 marks)**

Answer:
- Reticulocyte count - inappropriately low for the degree of anaemia, indicating a hypoproliferative process
- Serum B12 and folate - normal, excluding a nutritional cause of macrocytosis
- Bone marrow aspirate - erythroid hypoplasia with dysplastic features if severe

**c) Three other causes of macrocytic anaemia (3 marks)**

Answer:
- Vitamin B12 deficiency
- Folate deficiency
- Hypothyroidism (alcohol excess, liver disease and myelodysplastic syndrome are also accepted)

## SECTION C: LONG ANSWER QUESTION (20 marks)

**Question 1.** Discuss the components of blood and blood products, stating the indications of each.

Answer:
- Whole blood - contains RBCs, WBCs, platelets and plasma; rarely used now, reserved for massive haemorrhage or exchange transfusion
- Packed red blood cells - RBCs with most plasma removed; for symptomatic anaemia and acute blood loss to improve oxygen carriage
- Fresh frozen plasma - all coagulation factors, albumin and immunoglobulins; for multiple factor deficiencies, liver disease with bleeding, DIC, warfarin reversal and massive transfusion
- Platelet concentrate - concentrated platelets from whole blood or apheresis; for thrombocytopenia with bleeding, prophylaxis before invasive procedures and platelet function disorders
- Cryoprecipitate - rich in fibrinogen, factor VIII, von Willebrand factor and factor XIII; for hypofibrinogenaemia, DIC, von Willebrand disease and massive haemorrhage protocols
- Albumin - plasma protein concentrate; for hypoalbuminaemia, large-volume paracentesis, burns and nephrotic syndrome complications
- Granulocyte concentrate - concentrated neutrophils; for severe neutropenia with life-threatening infection unresponsive to antibiotics
- Immunoglobulin (IVIG) - pooled antibodies; for immune thrombocytopenic purpura, immunodeficiency states and autoimmune conditions
- Irradiated blood products - donor lymphocytes inactivated; for immunocompromised patients to prevent transfusion-associated graft-versus-host disease
- Leucodepleted or washed red cells - white cells removed or washed; to prevent febrile non-haemolytic reactions, reduce alloimmunisation and for IgA deficiency$md$
WHERE id = '1221cab3-aed5-4e10-b285-be7681d9596f';