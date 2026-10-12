// Starting points for the topic builder: structures and subjects that students search for by name. The builder still checks that the site
// really has material on each one, so a seed with nothing behind it never becomes a page. Add a name here to give it a chance.
const normTok = (t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") && !/(is|us)$/.test(t) ? t.slice(0, -1) : t);

const LIST = `
humerus, radius, ulna, clavicle, scapula, femur, tibia, fibula, patella, sternum, rib cage, vertebral column, cervical vertebrae, thoracic vertebrae, lumbar vertebrae, sacrum, coccyx, skull, mandible, maxilla, temporal bone, sphenoid bone, ethmoid bone, frontal bone, occipital bone, parietal bone, pelvis, hip bone, ilium, ischium, pubis, talus, calcaneus, scaphoid, lunate, carpal bones, metacarpals, phalanges, atlas, axis,
deltoid, biceps brachii, triceps brachii, brachialis, pectoralis major, latissimus dorsi, trapezius, gluteus maximus, quadriceps femoris, hamstrings, gastrocnemius, soleus, diaphragm, rotator cuff, supraspinatus, sternocleidomastoid, masseter, temporalis, rectus abdominis, psoas major, erector spinae, pelvic floor,
median nerve, ulnar nerve, radial nerve, axillary nerve, musculocutaneous nerve, sciatic nerve, femoral nerve, tibial nerve, common peroneal nerve, facial nerve, vagus nerve, trigeminal nerve, oculomotor nerve, phrenic nerve, hypoglossal nerve, glossopharyngeal nerve, brachial plexus, lumbar plexus, sacral plexus, cranial nerves, cauda equina, spinal cord, autonomic nervous system, sympathetic nervous system, parasympathetic nervous system,
aorta, carotid artery, subclavian artery, axillary artery, brachial artery, femoral artery, popliteal artery, coronary arteries, renal artery, portal vein, inferior vena cava, superior vena cava, jugular vein, great saphenous vein, circle of willis, lymphatic system, thoracic duct,
heart, lung, liver, kidney, spleen, pancreas, stomach, duodenum, jejunum, ileum, colon, rectum, appendix, gallbladder, thyroid gland, parathyroid gland, adrenal gland, pituitary gland, hypothalamus, thalamus, cerebellum, brainstem, hippocampus, amygdala, basal ganglia, cerebral cortex, bladder, prostate, uterus, ovary, testis, breast, eye, ear, larynx, pharynx, trachea, bronchi, pleura, pericardium, peritoneum, mediastinum, oesophagus, skin, placenta, cochlea, retina,
inguinal canal, femoral triangle, femoral canal, axilla, cubital fossa, popliteal fossa, carpal tunnel, thoracic outlet, shoulder joint, elbow joint, hip joint, knee joint, ankle joint, wrist joint, temporomandibular joint, intervertebral disc, brachial plexus injury, rotator cuff injury,
action potential, resting membrane potential, cardiac cycle, cardiac output, blood pressure, glomerular filtration rate, countercurrent multiplier, renin angiotensin aldosterone system, acid base balance, oxygen dissociation curve, surfactant, gastric acid secretion, bile, insulin, glucagon, cortisol, thyroid hormone, oxytocin, antidiuretic hormone, aldosterone, growth hormone, sleep, homeostasis, muscle contraction, synapse, neurotransmitters, reflex arc, vision, hearing, erythropoiesis, haemostasis, coagulation cascade, blood groups, lung volumes and capacities, ventilation perfusion, acid secretion, intestinal absorption, micturition, thermoregulation, menstrual cycle, spermatogenesis, lactation, pregnancy physiology, fetal circulation, pain pathways, spinal reflexes, sensory receptors, taste, smell,
inflammation, apoptosis, necrosis, neoplasia, hyperplasia, metaplasia, dysplasia, hypertrophy, atrophy, thrombosis, embolism, infarction, atherosclerosis, shock, oedema, amyloidosis, granuloma, hypersensitivity, autoimmunity, immunodeficiency, transplant rejection, wound healing, cell injury, tumour markers, carcinogenesis, metastasis, genetic disorders, chromosomal abnormalities,
diabetes mellitus, diabetic ketoacidosis, hypertension, heart failure, myocardial infarction, angina, atrial fibrillation, infective endocarditis, rheumatic heart disease, cardiomyopathy, asthma, COPD, pneumonia, tuberculosis, pulmonary embolism, pneumothorax, pleural effusion, lung cancer, bronchiectasis, malaria, HIV and AIDS, hepatitis, cirrhosis, peptic ulcer disease, inflammatory bowel disease, pancreatitis, gallstones, stroke, epilepsy, meningitis, multiple sclerosis, parkinson disease, alzheimer disease, schizophrenia, depression, bipolar disorder, anxiety disorders, autism spectrum disorder, ADHD, oppositional defiant disorder, conduct disorder, anaemia, sickle cell disease, thalassaemia, leukaemia, lymphoma, multiple myeloma, haemophilia, thyroid disease, hypothyroidism, hyperthyroidism, cushing syndrome, addison disease, acute kidney injury, chronic kidney disease, nephrotic syndrome, nephritic syndrome, urinary tract infection, pre-eclampsia, ectopic pregnancy, postpartum haemorrhage, gestational diabetes, polycystic ovary syndrome, endometriosis, cervical cancer, breast cancer, prostate cancer, appendicitis, intestinal obstruction, hernia, burns, rickets, kwashiorkor, marasmus, neonatal jaundice, measles, cholera, typhoid fever, schistosomiasis, leishmaniasis, trypanosomiasis, filariasis, amoebiasis, giardiasis, rabies, tetanus, sepsis, anaphylaxis,
staphylococcus aureus, streptococcus pneumoniae, streptococcus pyogenes, escherichia coli, salmonella, shigella, vibrio cholerae, mycobacterium tuberculosis, neisseria gonorrhoeae, neisseria meningitidis, clostridium, pseudomonas aeruginosa, helicobacter pylori, treponema pallidum, plasmodium falciparum, schistosoma, ascaris lumbricoides, hookworm, trypanosoma, leishmania, entamoeba histolytica, giardia lamblia, trichomonas vaginalis, taenia solium, anopheles mosquito, tsetse fly, sandfly, tick, flea, louse, cockroach, candida albicans, cryptococcus, aspergillus, dermatophytes, herpes simplex virus, hepatitis b virus, hepatitis c virus, influenza virus, rabies virus, ebola virus, HIV virus, gram positive bacteria, gram negative bacteria, antibiotic resistance, sterilisation, vaccines,
glycolysis, TCA cycle, gluconeogenesis, glycogen metabolism, urea cycle, beta oxidation, pentose phosphate pathway, oxidative phosphorylation, electron transport chain, cholesterol metabolism, ketone bodies, amino acid metabolism, purine metabolism, enzyme kinetics, vitamins, DNA replication, transcription, translation, PCR, gene expression, inheritance patterns, mendelian genetics, cytogenetics, buffers, haemoglobin, collagen, lipoproteins, bilirubin metabolism,
epidemiology, sensitivity and specificity, randomised controlled trial, study designs, sampling, biostatistics, confidence interval, p value, research methodology, screening, demography, communicable diseases, non communicable diseases, primary health care, health promotion, medical ethics, informed consent, communication skills, history taking, physical examination, mental state examination, prescription writing
`;

export const SEED_LIST = LIST.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
export const SEED_TOPICS = new Set(SEED_LIST.flatMap((s) => [s.toLowerCase(), s.toLowerCase().split(/\s+/).map(normTok).join(" ")]));

/** Words that describe the kind of page, not the subject. A candidate made only of these is never a topic. */
export const GENERIC_TOKENS = new Set(`question mcq paper exam examination notes note study guide answer comprehensive overview introduction summary section part review revision quiz practice test past cat year unit semester weekly set bank complete key point learning objective reference management diagnosis treatment clinical feature cause definition classification pathophysiology investigation complication prognosis epidemiology aetiology etiology symptom sign general principle type role function structure essay saq laq short long case study cases discussion approach basic basics advanced new update module lecture course outline syllabus content table list tips high yield mnemonic mnemonics important common frequently asked topic topics chapter lesson exercise exercises problem problems solution solutions mark marks time hours instructions attempt choose best select following statement true false correct incorrect all none above below main final end mid first second third fourth paper one two three section a b c d e physical risk factor history describe end several its legs feet mechanism effect use pattern finding sign test result method technique policy institutional academic complex medical physiology anatomy pathology biochemistry microbiology pharmacology parasitology immunology laq saq iv iii ii mbchb paper pp eoy normal abnormal marking scheme mku mbmm mbmp mbmb mbim mbog mbps bchem continuous assessment tall flower`.split(/\s+/).map(normTok));

/** Which broad subject a topic belongs to, from the units of the notes that mention it. First match wins. */
export const DOMAINS = [
  ["Anatomy", /anatom|embryolog|histolog|osteolog|neuroanat/],
  ["Physiology", /physiolog/],
  ["Biochemistry & genetics", /biochem|molecular|genetic|metabol|cytogen|enzyme|vitamin/],
  ["Pharmacology", /pharmacolog|drug/],
  ["Microbiology & immunology", /microbio|bacterio|parasit|entomolog|virolog|mycolog|immun|infectious/],
  ["Pathology", /patholog|neoplas|haemat|hemat|oncolog|cytopath|histopath|chemical/],
  ["Psychiatry", /psychiat|mental|psycholog|behavio/],
  ["Paediatrics", /paediatric|pediatric|child/],
  ["Obstetrics & gynaecology", /obstet|gynae|gynec|maternal/],
  ["Surgery", /surger|surgical|trauma|orthop/],
  ["Public health", /epidemiolog|statistic|community|public health|research|ethics|communication/],
];

// Each line of the seed list above belongs to one subject (anatomy, physiology, ...). Used to label a seed topic without guessing.
const LINE_DOMAIN = ["Anatomy", "Anatomy", "Anatomy", "Anatomy", "Anatomy", "Anatomy", "Physiology", "Pathology", "Medicine", "Microbiology & immunology", "Biochemistry & genetics", "Public health"];
const PSY = /schizophren|depress|bipolar|anxiety|autism|adhd|oppositional|conduct disorder/;
export const SEED_DOMAIN_OF = (() => {
  const out = [];
  const lines = LIST.trim().split(/\n/);
  lines.forEach((line, i) => {
    for (const raw of line.split(/,\s*/)) {
      const name = raw.trim().toLowerCase();
      if (!name) continue;
      const dom = i === 8 && PSY.test(name) ? "Psychiatry" : LINE_DOMAIN[i] || "Medicine";
      out.push([name.split(/\s+/).map(normTok).join(" "), dom]);
    }
  });
  return out;
})();
