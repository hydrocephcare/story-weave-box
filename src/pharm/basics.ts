export type PharmBasic = { id: string; topic: string; q: string; a: string; note: string };

export const PHARM_BASICS: PharmBasic[] = [
  { id:"b01", topic:"Foundations", q:"What is pharmacology?", a:"The study of drugs and their effects in living systems.", note:"Start with two ideas: what the drug does to the body, and what the body does to the drug." },
  { id:"b02", topic:"Foundations", q:"What is pharmacodynamics?", a:"What the drug does to the body.", note:"Think receptors, mechanism of action and effects." },
  { id:"b03", topic:"Foundations", q:"What is pharmacokinetics?", a:"What the body does to the drug.", note:"Think ADME." },
  { id:"b04", topic:"ADME", q:"What does ADME mean?", a:"Absorption, distribution, metabolism and excretion.", note:"This is the basic journey of a drug through the body." },
  { id:"b05", topic:"Receptors", q:"What is an agonist?", a:"A drug that binds to and activates a receptor.", note:"It produces a receptor response." },
  { id:"b06", topic:"Receptors", q:"What is an antagonist?", a:"A drug that binds to a receptor and blocks activation.", note:"It prevents the usual receptor response." },
  { id:"b07", topic:"ADME", q:"What is bioavailability?", a:"The fraction of a dose that reaches systemic circulation unchanged.", note:"IV administration has essentially complete bioavailability." },
  { id:"b08", topic:"ADME", q:"What is first-pass metabolism?", a:"Metabolism before an absorbed oral drug reaches systemic circulation.", note:"The gut wall and liver can reduce the amount of oral drug reaching the circulation." },
  { id:"b09", topic:"Dosing", q:"What is drug half-life?", a:"The time for the plasma concentration to fall by about half.", note:"Half-life helps explain dosing intervals, accumulation and washout." },
  { id:"b10", topic:"Dosing", q:"About how many half-lives are needed to approach steady state?", a:"About four to five.", note:"Repeated doses accumulate gradually until input and elimination are approximately balanced." },
  { id:"b11", topic:"Dosing", q:"Why give a loading dose?", a:"To reach a target concentration rapidly.", note:"Useful when waiting several half-lives would be too slow." },
  { id:"b12", topic:"Dosing", q:"What is a maintenance dose for?", a:"To replace drug eliminated and maintain the desired concentration.", note:"Clearance is an important determinant." },
  { id:"b13", topic:"Safety", q:"What does narrow therapeutic index mean?", a:"The effective and toxic concentrations are close.", note:"Small exposure changes can matter; examples include lithium, digoxin and warfarin." },
  { id:"b14", topic:"Safety", q:"What is a contraindication?", a:"A circumstance in which a drug should not be used because the risk may outweigh benefit.", note:"Always connect the drug to the individual patient." },
  { id:"b15", topic:"Safety", q:"What should a medication history include?", a:"Prescribed, over-the-counter and herbal drugs, adherence, adverse reactions and allergies.", note:"Do not ask only about prescription tablets." },
  { id:"b16", topic:"Safety", q:"What should you ask when a patient reports a drug allergy?", a:"Which drug, the exact reaction, when it happened and how severe it was.", note:"This distinguishes intolerance from clinically important hypersensitivity." },
  { id:"b17", topic:"Organs", q:"Why does kidney function matter when prescribing?", a:"Reduced renal clearance can cause some drugs or metabolites to accumulate.", note:"The dose or interval may need adjustment." },
  { id:"b18", topic:"Organs", q:"Why does liver function matter when prescribing?", a:"The liver metabolises many drugs and severe dysfunction can alter drug exposure.", note:"Liver disease can change drug choice, dose and toxicity." },
  { id:"b19", topic:"Prescribing", q:"What should you check before prescribing?", a:"Indication, allergies, contraindications, interactions, organ function, dose and monitoring.", note:"Safe prescribing starts with the patient, not the drug name." },
  { id:"b20", topic:"Learning", q:"What seven things should you know about an important drug?", a:"Class, mechanism, uses, major adverse effects, contraindications, monitoring and a clinical pearl.", note:"Use the same framework for every Year 4 drug." }
];
