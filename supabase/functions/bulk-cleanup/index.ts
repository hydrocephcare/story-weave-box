import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callOmniRoute, omniRouteConfig } from "../_shared/omniroute.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ANALYZE_CHARS = 40000;
const MAX_MCQ_EXTRACT_CHARS = 32000;
const OVERSIZED_ARTICLE_CHARS = 130000;
const CPU_BUDGET_MS = 1600;
const AI_MAX_CONTENT_CHARS = 18000;
const AI_MODEL = "google/gemini-3-flash-preview";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Year 1: Carbohydrate Metabolism and Bioenergetics": ["carbohydrate", "glycolysis", "krebs", "bioenergetics", "atp", "electron transport"],
  "Year 1: Lipid Metabolism": ["lipid metabolism", "fatty acid", "beta oxidation", "cholesterol synthesis", "lipoprotein"],
  "Year 1: Nitrogen Metabolism": ["nitrogen metabolism", "urea cycle", "amino acid catabolism", "ammonia"],
  "Year 1: Respiratory Physiology": ["respiratory physiology", "lung volume", "gas exchange", "ventilation", "spirometry"],
  "Year 1: Neurophysiology I": ["neurophysiology", "synapse", "action potential", "neurotransmitter", "reflex arc"],
  "Year 1: Gross Anatomy Head and Neck": ["head and neck", "cranial nerve", "pharynx", "larynx", "orbit", "nasal cavity", "skull", "face anatomy"],
  "Year 1: Histology Head and Neck": ["histology head", "salivary gland histology", "thyroid histology"],
  "Year 1: Anatomy": ["anatomy", "limb", "dissection", "upper limb", "lower limb", "thorax", "abdomen", "musculoskeletal", "osteology", "brachial plexus"],
  "Year 1: Embryology": ["embryology", "embryo", "fetal", "teratogen", "organogenesis", "gastrulation"],
  "Year 1: Cardiovascular Physiology": ["cardiac output", "heart rate", "blood pressure physiology", "ecg physiology", "cardiovascular physiology"],
  "Year 1: Behavioural Sciences and Ethics": ["behavioural science", "ethics", "doctor-patient", "consent", "confidentiality"],
  "Year 2: Neurochemistry": ["neurochemistry", "neurotransmitter metabolism", "dopamine synthesis", "serotonin pathway"],
  "Year 2: Biochemistry of Microorganisms": ["biochemistry of microorganism", "bacterial metabolism", "microbial biochemistry"],
  "Year 2: Gross Anatomy of Pelvis and Perineum": ["pelvis", "perineum", "pelvic floor", "urogenital triangle"],
  "Year 2: Physiology": ["physiology", "renal physiology", "endocrine physiology"],
  "Year 2: Complement and Immunoglobulin": ["complement", "immunoglobulin", "antibod", "immune complex", "opsonization"],
  "Year 2: Neurophysiology II": ["neurophysiology ii", "special senses", "motor system", "autonomic"],
  "Year 2: Parasitology": ["parasitology", "parasite", "helminth", "protozoa", "malaria", "plasmodium", "schistosom"],
  "Year 2: Microbiology": ["microbiology", "bacteriology", "bacteria", "gram-positive", "gram-negative", "staphylococ", "streptococ", "antibiotic"],
  "Year 2: Epidemiology and Statistics": ["epidemiology", "statistics", "prevalence", "incidence", "study design", "odds ratio"],
  "Year 3: Basic Pharmacology III": ["pharmacology", "pharmacokinetic", "pharmacodynamic", "drug", "receptor", "agonist", "antagonist", "basic pharmacology"],
  "Year 3: Blood Transfusion": ["blood transfusion", "blood group", "cross-match", "transfusion reaction"],
  "Year 3: Medical Virology": ["virology", "virus", "hiv", "hepatitis virus", "herpes virus", "viral replication"],
  "Year 3: Medical Mycology": ["mycology", "fungal", "candida", "aspergill", "dermatophyte"],
  "Year 3: Introduction to Clinical Techniques": ["clinical technique", "physical examination", "history taking", "clinical skill"],
  "Year 3: Neuropathology": ["neuropathology", "brain tumour", "meningitis pathology", "cns pathology", "demyelinat"],
  "Year 3: Bone and Soft Tissue Pathology": ["bone pathology", "soft tissue pathology", "osteosarcoma", "fracture pathology"],
  "Year 3: Breast Pathology": ["breast pathology", "breast cancer", "fibroadenoma", "breast mass"],
  "Year 3: Male Reproductive and Urinary System Pathology": ["prostate", "testicular", "renal pathology", "bladder pathology", "urinary system pathology"],
  "Year 3: Hematopathology": ["hematopathology", "lymphoma", "leukemia", "anemia", "hemoglobin", "coagulation", "platelet"],
  "Year 3: General Pathology": ["general pathology", "inflammation", "neoplasia", "cell injury", "wound healing", "thrombosis", "pathology", "necrosis", "apoptosis", "edema pathology", "embolism", "infarction", "granuloma", "female reproductive pathology", "respiratory pathology", "cardiovascular pathology", "gastrointestinal pathology", "liver pathology", "endocrine pathology", "skin pathology"],
  "Year 3: Junior Clerkship/Practicals in General Pathology I": ["junior clerkship pathology", "practicals in pathology"],
  "Year 4: Obstetrics and Gynaecology": ["obstetric", "gynaecolog", "pregnancy", "labour", "cesarean", "antenatal"],
  "Year 4: General Surgery": ["general surgery", "surgical", "appendicitis", "hernia", "cholecystectomy", "wound management"],
  "Year 4: Mental Health/Psychiatry": ["psychiatry", "mental health", "depression", "schizophrenia", "anxiety disorder", "psychosis"],
  "Year 4: Internal Medicine": ["internal medicine", "diabetes", "hypertension", "heart failure", "pneumonia", "chronic kidney"],
  "Year 4: Pediatrics and Child Health": ["pediatric", "child health", "neonatal", "immunization", "growth", "malnutrition"],
  "Year 4: Clinical Pharmacology II": ["clinical pharmacology", "drug interaction", "adverse drug", "prescribing"],
  "Year 5: Dermatology": ["dermatology", "skin", "rash", "eczema", "psoriasis"],
  "Year 5: Dental Health": ["dental", "oral health", "tooth", "caries"],
  "Year 5: Orthopedics and Trauma": ["orthopedic", "fracture", "dislocation", "trauma", "bone"],
  "Year 5: Ophthalmology": ["ophthalmology", "eye", "glaucoma", "cataract", "retina"],
  "Year 5: ENT": ["ent", "ear", "nose", "throat", "tonsil", "sinusitis", "otitis"],
  "Year 5: Public Health": ["public health", "vaccination", "disease prevention", "health promotion"],
};

type ArticleLite = {
  id: string;
  title: string;
  content: string;
  category: string;
  is_raw?: boolean | null;
};

type AiCleanupOutput = {
  title?: string;
  category?: string;
  content_type?: "article" | "mcq" | "essay" | "delete";
  clean_content?: string;
  reason?: string;
};

function normalizeTitle(title: string): string {
  const trimmed = (title || "").replace(/\s+/g, " ").trim();
  const withoutNoise = trimmed
    .replace(/^\d{4}\s+(end\s+year|mid\s+year|supplementary)\s+/i, "")
    .replace(/^yr\s*\d+\s+/i, "")
    .replace(/\s*\|\s*complete\s*set$/i, "")
    .trim();

  const likelyAllCaps = withoutNoise.length > 10 && withoutNoise === withoutNoise.toUpperCase();
  if (!likelyAllCaps) return withoutNoise || trimmed || "Untitled Study Note";

  return (withoutNoise || trimmed)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bMcq\b/g, "MCQ")
    .replace(/\bMcu\b/g, "MCU")
    .replace(/\bCvs\b/g, "CVS");
}

function inferTitleFromContent(content: string): string {
  const firstLine = (content || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const cleaned = (firstLine || "Untitled Study Note")
    .replace(/^#+\s*/, "")
    .replace(/^[\-*\d.)\s]+/, "")
    .replace(/\*\*/g, "")
    .slice(0, 90)
    .trim();
  return normalizeTitle(cleaned || "Untitled Study Note");
}

function detectBestCategory(title: string, content: string): string | null {
  const text = `${title} ${content.slice(0, 3000)}`.toLowerCase();
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

type ExtractedMcq = { question: string; options: string[]; correct_answer: number; explanation?: string };

function looksLikeEssayContent(content: string): boolean {
  const text = content || "";
  const longEssaySignals = (text.match(/\blong\s+essay\s+question\b/gi) || []).length;
  const shortAnswerSignals = (text.match(/\bshort\s+answer\s+questions?\b/gi) || []).length;
  const marksSignals = (text.match(/\(\s*\d+\s*marks?\s*\)/gi) || []).length;
  const subQuestionSignals = (text.match(/^\s*[a-e][\).]\s+.+$/gim) || []).length;
  const essayDirectiveSignals = (text.match(/\b(?:discuss|outline|describe|explain|classify|differentiate|calculate)\b/gi) || []).length;
  const explicitEssayKeywords = /\b(?:essay|saq|laq|short\s+answer|long\s+answer)\b/i.test(text);

  return (
    explicitEssayKeywords ||
    longEssaySignals >= 1 ||
    shortAnswerSignals >= 1 ||
    (marksSignals >= 5 && subQuestionSignals >= 5 && essayDirectiveSignals >= 4)
  );
}

function isMcqContent(content: string): boolean {
  const text = content || "";
  const lines = text.split("\n");
  const questionHeadings = (text.match(/^\s*(?:#+\s*)?(?:\*\*)?question\s*\d+/gim) || []).length;
  const answerLines = (text.match(/^\s*\*{0,2}answer\s*[:\-]\s*[A-E](?:[\).]|\b)/gim) || []).length;
  const optionLines = lines.filter((line) => {
    const trimmed = line.trim();
    return /^[A-Ea-e][\).]\s+/.test(trimmed) && trimmed.length <= 140 && !/\bmarks?\b/i.test(trimmed);
  }).length;
  const inlineOptionRuns = (text.match(/\b[a-e][\).]\s+[^\n]{2,120}(?=\s+[b-e][\).]\s+)/gi) || []).length;
  const hasMcqKeywords = /\bmcq|multiple choice|choose the (?:best|correct) answer\b/i.test(text);

  return (
    (questionHeadings >= 3 && (optionLines >= 12 || answerLines >= 3)) ||
    (questionHeadings >= 5 && optionLines >= 8) ||
    (answerLines >= 5 && optionLines >= 10) ||
    (hasMcqKeywords && optionLines >= 6) ||
    inlineOptionRuns >= 2
  );
}

function isLikelyValidMcqItem(item: ExtractedMcq): boolean {
  if (!item.question || item.question.trim().length < 8 || item.question.trim().length > 320) return false;
  if (!Array.isArray(item.options) || item.options.length < 4 || item.options.length > 6) return false;

  const optionLengths = item.options.map((opt) => opt.trim().length);
  const avgOptionLength = optionLengths.reduce((acc, len) => acc + len, 0) / optionLengths.length;
  const maxOptionLength = Math.max(...optionLengths);
  const essayishText = `${item.question} ${item.options.join(" ")}`;

  if (maxOptionLength > 180 || avgOptionLength > 90) return false;
  if (/\b(?:long\s+essay|short\s+answer|\(\s*\d+\s*marks?\s*\)|discuss|describe|outline|explain)\b/i.test(essayishText)) return false;

  return true;
}

function extractMcqsFromContent(content: string): ExtractedMcq[] {
  const questions: ExtractedMcq[] = [];
  const seenQuestions = new Set<string>();
  const normalizedContent = (content || "").replace(/\r/g, "");

  const pushQuestion = (item: ExtractedMcq | null) => {
    if (!item || !isLikelyValidMcqItem(item)) return;
    const key = item.question.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seenQuestions.has(key)) return;
    seenQuestions.add(key);
    questions.push(item);
  };

  const parseInlineMcqBlock = (rawBlock: string): ExtractedMcq | null => {
    const compact = rawBlock
      .replace(/\*\*/g, " ")
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (compact.length < 20) return null;

    const normalized = compact
      .replace(/^[-*]\s*/, "")
      .replace(/^question\s*\d+\s*[:\-.]?\s*/i, "")
      .replace(/^\d+\.\s*/, "");

    const firstOptionIndex = normalized.search(/\b[A-Ea-e][\).]\s+/);
    if (firstOptionIndex < 0) return null;

    const questionText = normalized
      .slice(0, firstOptionIndex)
      .replace(/[:\-]\s*$/, "")
      .trim();

    if (questionText.length < 8) return null;

    const optionsPart = normalized.slice(firstOptionIndex);
    const optionRegex = /([A-Ea-e])[\).]\s*([\s\S]*?)(?=(?:\s*[A-Ea-e][\).]\s)|(?:\s*Answer\s*[:\-])|(?:\s*Explanation\s*[:\-])|$)/g;
    const optionEntries: Array<[string, string]> = [];
    let match: RegExpExecArray | null;

    while ((match = optionRegex.exec(optionsPart)) !== null) {
      optionEntries.push([match[1].toUpperCase(), match[2].trim()]);
    }

    if (optionEntries.length < 4) return null;

    const answerLetter = optionsPart.match(/answer\s*[:\-]\s*([A-Ea-e])/i)?.[1]?.toUpperCase() || null;
    const correctAnswer = answerLetter ? Math.max(0, optionEntries.findIndex(([key]) => key === answerLetter)) : 0;
    const explanation = optionsPart.match(/explanation\s*[:\-]\s*(.+)$/i)?.[1]?.trim();

    return {
      question: questionText,
      options: optionEntries.map(([, value]) => value),
      correct_answer: correctAnswer,
      explanation: explanation || undefined,
    };
  };

  const headingBlocks = normalizedContent
    .split(/(?=^\s*(?:#+\s*)?(?:\*\*)?question\s*\d+\b)/gim)
    .filter((b) => /question\s*\d+/i.test(b));

  const qBlocks = headingBlocks.length > 0
    ? headingBlocks
    : normalizedContent.split(/(?=^\s*\d+\.\s+)/gm).filter((b) => /^\s*\d+\.\s+/.test(b));

  for (const block of qBlocks) {
    if (block.trim().length < 20) continue;

    const lines = block.split("\n");
    const questionParts: string[] = [];
    const optionMap: Record<string, string> = {};
    const explanationParts: string[] = [];

    let currentOption: string | null = null;
    let answerLetter: string | null = null;
    let inExplanation = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(?:#+\s*)?(?:\*\*)?question\s*\d+/i.test(line)) continue;

      const answerMatch = line.match(/^\*{0,2}answer\s*[:\-]\s*([A-Ea-e])/i);
      if (answerMatch) {
        answerLetter = answerMatch[1].toUpperCase();
        currentOption = null;
        inExplanation = false;
        continue;
      }

      if (/^\*{0,2}explanation\s*[:\-]/i.test(line)) {
        inExplanation = true;
        currentOption = null;
        explanationParts.push(line.replace(/^\*{0,2}explanation\s*[:\-]\s*/i, ""));
        continue;
      }

      const optionMatch = line.match(/^([A-Ea-e])[\).]\s*(.+)$/);
      if (optionMatch) {
        currentOption = optionMatch[1].toUpperCase();
        optionMap[currentOption] = optionMatch[2].trim();
        inExplanation = false;
        continue;
      }

      if (inExplanation) {
        explanationParts.push(line);
        continue;
      }

      if (currentOption) {
        optionMap[currentOption] = `${optionMap[currentOption]} ${line}`.trim();
        continue;
      }

      questionParts.push(line.replace(/^\d+\.\s*/, ""));
    }

    const optionEntries = Object.entries(optionMap).sort(([a], [b]) => a.localeCompare(b));
    if (optionEntries.length < 4) {
      pushQuestion(parseInlineMcqBlock(block));
      continue;
    }

    const questionText = questionParts.join(" ").replace(/\s+/g, " ").trim();
    if (questionText.length < 8) {
      pushQuestion(parseInlineMcqBlock(block));
      continue;
    }

    const options = optionEntries.map(([, value]) => value);
    let correctAnswer = 0;
    if (answerLetter) {
      const index = optionEntries.findIndex(([key]) => key === answerLetter);
      if (index >= 0) correctAnswer = index;
    }

    const explanation = explanationParts.join(" ").replace(/\s+/g, " ").trim() || undefined;
    pushQuestion({ question: questionText, options, correct_answer: correctAnswer, explanation });
  }

  if (questions.length < 5) {
    const inlineCandidates = normalizedContent
      .split("\n")
      .filter((line) => /\b[A-Ea-e][\).]\s/.test(line) && /answer\s*[:\-]\s*[A-Ea-e]/i.test(line));

    for (const line of inlineCandidates) {
      pushQuestion(parseInlineMcqBlock(line));
    }
  }

  return questions;
}

function extractEssayQuestions(content: string): { saqs: any[]; laqs: any[] } {
  const blocks = content
    .replace(/\r/g, "")
    .split(/(?=^\s*(?:question\s*)?\d+[.)\-:])/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 20);

  const saqs: any[] = [];
  const laqs: any[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const q = lines[0].replace(/^question\s*/i, "").replace(/^\d+[.)\-:]\s*/, "").trim();
    const answer = lines.slice(1).join(" ").trim();
    const marksMatch = block.match(/(\d+)\s*marks?/i);
    const marks = marksMatch ? Number(marksMatch[1]) : 5;

    const longSignal = /(long answer|essay|discuss|describe in detail|explain in detail)/i.test(block);
    if (longSignal || marks >= 12) {
      laqs.push({ question: q, answer: answer || "Model answer pending", marks: marks || 20 });
    } else {
      saqs.push({ question: q, answer: answer || "Model answer pending", marks: marks || 5 });
    }
  }

  return { saqs: saqs.slice(0, 20), laqs: laqs.slice(0, 10) };
}

function cleanContent(content: string): string {
  let cleaned = content || "";
  cleaned = cleaned.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)\s*/gi, "");
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2702}-\u{27B0}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]/gu, "");
  cleaned = cleaned.replace(/\b(?:as an ai|ai-generated|chatgpt|how can i help|how do you want us to help you)\b[^\n.]*[\n.]?/gi, "");
  cleaned = cleaned.replace(/([A-E]\))\s*([^\n]{3,}?)(?=\s*[B-E]\))/g, "$1 $2\n");
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n");
  cleaned = cleaned.replace(/[ \t]+$/gm, "");
  return cleaned.trim();
}

const COVER_BASE = "https://dekyjrfwvavtoivqivno.supabase.co/storage/v1/object/public/story-covers/articles";
function topicCover(title = "", category = ""): string {
  const s = `${title} ${category}`.toLowerCase();
  if (/genetic|cytogen/.test(s)) return `${COVER_BASE}/genetics.jpg`;
  if (/molecular/.test(s)) return `${COVER_BASE}/molecular-biology.jpg`;
  if (/biochem|bilirubin|enzyme|metabolism|protein|steroid|hormone|blood/.test(s)) return `${COVER_BASE}/clinical-biochem.jpg`;
  if (/communication|skills|counselling|patient|interview/.test(s)) return `${COVER_BASE}/communication.jpg`;
  if (/microbiolog|bacteriolog|bacteria/.test(s)) return `${COVER_BASE}/microbiology.jpg`;
  if (/parasitol|entomolog|helminth|protozo/.test(s)) return `${COVER_BASE}/parasitology.jpg`;
  if (/immun|complement|antibody/.test(s)) return `${COVER_BASE}/immunology.jpg`;
  if (/pharm|drug/.test(s)) return `${COVER_BASE}/pharmacology.jpg`;
  if (/git|gastro/.test(s)) return `${COVER_BASE}/git-physiology.jpg`;
  if (/physio|cns|neuro/.test(s)) return `${COVER_BASE}/physiology.jpg`;
  if (/biochem/.test(s)) return `${COVER_BASE}/clinical-biochem.jpg`;
  if (/epidemiolog|statistic/.test(s)) return `${COVER_BASE}/epidemiology.jpg`;
  return `${COVER_BASE}/molecular-biology.jpg`;
}

function inferYearTwoCategory(title = "", category = ""): string {
  const titleOnly = `${title}`.toLowerCase();
  const s = `${title} ${category}`.toLowerCase();
  if (/pharm|drug|antifungal|antiviral|antihelminthic|antiprotozoal|chemotherapy|antibiotic/.test(titleOnly)) return "Year 3: Basic Pharmacology II";
  if (/lymphoma|leukemia|anaemia|anemia|neoplasm|tumou?r|patholog/.test(titleOnly)) return "Year 3: Hematopathology";
  if (/biochem|bilirubin|enzyme|metabolism|protein|steroid|hormone|blood|heme|liver|transduction|second messenger/.test(titleOnly)) return "Year 2: Clinical Biochemistry";
  if (/bacteriolog|microbiolog|bacteria/.test(s)) return "Year 2: Microbiology";
  if (/parasitol|entomolog|helminth|protozo|amoeb|ameb|giardia|malaria|plasmod|leishmania|trypanosoma|trichomonas|balantidium|cestode|tapeworm|pinworm|vector/.test(titleOnly)) return "Year 2: Parasitology";
  if (/immun|complement|antibody|cellular/.test(titleOnly) || (/immun|complement|antibody|cellular/.test(s) && !/biochem|metabolism|bilirubin|enzyme/.test(s))) return "Year 2: Cellular Immunology";
  if (/genetic|cytogen|mutation/.test(s)) return "Year 2: Molecular Genetics and Cytogenetics";
  if (/molecular/.test(s)) return "Year 2: Molecular Biology";
  if (/git|gastro/.test(s)) return "Year 2: GIT Physiology";
  if (/biochem/.test(s)) return "Year 2: Clinical Biochemistry";
  if (/epidemiolog|statistic/.test(s)) return "Year 2: Epidemiology and Statistics";
  if (/communication|skills/.test(s)) return "Year 2: Human Communication Skills";
  return /^Year\s*2:/i.test(category) ? category : "Year 2: Physiology";
}

function normalizeYearTwoTitle(title = "", category = "", firstQuestion = ""): string {
  let out = normalizeTitle(plainText(title).replace(/&amp;/g, "&"));
  out = out
    .replace(/Cellular I\s+mmunology/gi, "Cellular Immunology")
    .replace(/\bMCQs?\b/gi, "MCQs")
    .replace(/\s*[:–-]\s*Complete\s*(?:Study\s*)?Guide$/i, "")
    .replace(/^Bachelor Of Medicine And Bachelor Of Surgery \(Mbchb\)$/i, "Molecular Biology Exam Review")
    .replace(/^Untitled$/i, "Medical Microbiology MCQs")
    .replace(/\s+/g, " ")
    .trim();
  if (!out || out.length < 5) out = firstQuestion ? `${plainText(firstQuestion).slice(0, 48)} MCQs` : `${category.replace(/^Year\s*\d+\s*:\s*/i, "")} Review`;
  if (/mcq/i.test(category) || /mcq|quiz|question|exam|paper/i.test(`${out} ${firstQuestion}`)) {
    if (!/\bMCQs?\b|Quiz|Questions/i.test(out)) out = `${out} MCQs`;
  }
  return out.slice(0, 90).replace(/[\s:–-]+$/, "");
}

function yearTwoTags(title = "", category = ""): string[] {
  const unit = category.replace(/^Year\s*\d+\s*:\s*/i, "");
  const source = `${title} ${unit}`.toLowerCase();
  const tags = new Set<string>(["Year 2", unit]);
  if (/immun|antibody|complement/.test(source)) tags.add("Immunology");
  if (/micro|bacter|strept|gene transfer/.test(source)) tags.add("Microbiology");
  if (/parasite|amoeb|malaria|giardia|leishmania|trypanosoma|entomology/.test(source)) tags.add("Parasitology");
  if (/genetic|cytogen|mutation/.test(source)) tags.add("Genetics");
  if (/molecular|dna|rna|transcription|translation/.test(source)) tags.add("Molecular Biology");
  if (/git|gastric|intestinal|digestion|absorption/.test(source)) tags.add("GIT Physiology");
  if (/biochem|metabolism|enzyme|hormone|bilirubin|heme/.test(source)) tags.add("Clinical Biochemistry");
  if (/physiology|renal|cns|growth hormone/.test(source)) tags.add("Physiology");
  return [...tags].filter(Boolean).slice(0, 8);
}

function plainText(value: unknown): string {
  return String(value || "")
    .replace(/&amp;nbsp;|&nbsp;|\u00A0/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\*+/g, "")
    .replace(/[_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOption(value: unknown): string {
  let out = plainText(value)
    .replace(/^\s*(?:option\s*)?[A-F][.)]\s*/i, "")
    .replace(/\s*(?:Answer|Correct\s*answer)\s*[:：]\s*[A-F]?.*$/i, "")
    .replace(/\s*(?:Explanation|Rationale)\s*[:：].*$/i, "")
    .replace(/\s*-\s*\($/, "")
    .trim();
  if (!out || /^[-()\s]+$/.test(out)) return "";
  if (/^(?:because|therefore|hence|this helps|this is because|it is because|which helps)\b/i.test(out)) return "";
  if (/^[a-z]/.test(out) && out.length > 65 && /\b(?:due to|helps|differentiate|therefore|because|while|which)\b/i.test(out)) return "";
  if (out.length > 150) {
    const concise = out.split(/\b(?:because|which|therefore|hence|as it|due to)\b/i)[0]?.trim();
    if (concise && concise.length >= 8) out = concise;
  }
  return out.slice(0, 170).replace(/[\s,;:-]+$/, "");
}

function splitOptions(question: string, options: unknown[]): string[] {
  const joined = `${question || ""} ${(options || []).join(" ")}`.replace(/\s+/g, " ").trim();
  const firstA = joined.search(/(?:^|\s)A\s*[.)]\s*/i);
  const source = firstA >= 0 ? joined.slice(firstA) : joined;
  const matches = Array.from(source.matchAll(/(?:^|\s)([A-F])\s*[.)]\s*([\s\S]*?)(?=\s*[B-F]\s*[.)]\s*|\s*(?:Answer|Correct\s*answer|Explanation)\s*[:：]|$)/gi));
  const raw = matches.length >= 2 ? matches.map((m) => m[2]) : options;
  const seen = new Set<string>();
  return raw.map(cleanOption).filter((opt) => {
    const key = opt.toLowerCase();
    if (!opt || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function normalizeStoredMcqQuestions(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  const genericDistractors = [
    "Mostly unchanged in early disease",
    "Reduced by routine feedback control",
    "Occurs only after chronic exposure",
    "Limited to a single tissue compartment",
    "Primarily an incidental laboratory finding",
    "Usually mediated by non-specific mechanisms",
  ];
  const usedQuestions = new Set<string>();
  return items.map((item, itemIndex) => {
    const rawAll = `${item?.question || item?.text || ""} ${(item?.options || []).join(" ")} ${item?.explanation || ""}`;
    const answerLetter = rawAll.match(/(?:Answer|Correct\s*answer)\s*[:：]\s*([A-F])/i)?.[1]?.toUpperCase();
    let correct = answerLetter ? answerLetter.charCodeAt(0) - 65 : Number.isFinite(item?.correct_answer) ? Number(item.correct_answer) : 0;
    const opts = splitOptions(item?.question || item?.text || "", Array.isArray(item?.options) ? item.options : []);
    if (opts.length < 2) return null;
    let question = plainText(item?.question || item?.text || "").replace(/\s*Choices:\s*$/i, "");
    const firstOption = question.search(/\sA\s*[.)]\s*/i);
    if (firstOption > 8) question = question.slice(0, firstOption).trim();
    question = question.replace(/^\d+[.)]\s*/, "").replace(/\s+/g, " ").trim();
    if (/\b\d+\s*marks?\b|\b(?:describe|discuss|outline|list|explain)\b/i.test(question)) return null;
    if (question.length < 8 || usedQuestions.has(question.toLowerCase())) return null;
    const explanation = plainText(item?.explanation || item?.answer || item?.model_answer || "").replace(/\s*---\s*$/, "");
    const expLower = explanation.toLowerCase();
    const optionHit = opts
      .map((opt, index) => ({ index, opt, hit: opt.length > 2 && expLower.includes(opt.toLowerCase()) }))
      .find((row) => row.hit);
    if (!answerLetter && optionHit) correct = optionHit.index;
    correct = Math.max(0, Math.min(correct, opts.length - 1));
    if (explanation && opts[correct] && !expLower.includes(opts[correct].toLowerCase())) {
      const lead = explanation.match(/^([A-Z][A-Za-z0-9+\-.]*(?:\s+[a-zA-Z0-9+\-.]+){0,3})\s+(?:is|are|was|were|causes|requires|uses|cleaves|produces)\b/)?.[1]?.trim();
      if (lead && lead.length >= 4 && lead.length <= 60 && !opts.some((opt) => expLower.includes(opt.toLowerCase()))) {
        opts[correct] = lead;
      }
    }
    while (opts.length < 5) {
      const filler = genericDistractors[(itemIndex + opts.length) % genericDistractors.length];
      if (!opts.some((opt) => opt.toLowerCase() === filler.toLowerCase())) opts.push(filler);
      else opts.push(`Alternative related mechanism ${opts.length + 1}`);
    }
    const correctText = opts[correct] || opts[0];
    const maxWrongLength = Math.max(22, correctText.length + 55);
    const finalOptions = opts.slice(0, 5).map((opt, idx) => idx === correct ? opt : opt.slice(0, maxWrongLength).replace(/[\s,;:-]+$/, ""));
    usedQuestions.add(question.toLowerCase());
    return { question, options: finalOptions, correct_answer: correct, ...(explanation.length > 8 ? { explanation: explanation.slice(0, 650) } : {}) };
  }).filter(Boolean);
}

function extractFirstJsonObject(text: string): any | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function callLovableAiCleanup(article: ArticleLite): Promise<AiCleanupOutput | null> {
  const allowedCategories = Object.keys(CATEGORY_KEYWORDS).join("\n");
  const contentForAi = article.content.slice(0, AI_MAX_CONTENT_CHARS);

  const messages = [
    {
      role: "system",
      content: `You clean and classify MBChB study notes. Return ONLY valid JSON with this exact schema:
{"title":"string","category":"string","content_type":"article|mcq|essay|delete","clean_content":"string","reason":"string"}
Rules:
- title must be concise, no emojis, no university names.
- category must be one of the allowed categories below.
- content_type = mcq if mostly MCQ exam items; essay if SAQ/LAQ style; delete only if empty/garbage.
- clean_content must preserve content but improve formatting and remove emojis/university mentions.
Allowed categories:\n${allowedCategories}`,
    },
    {
      role: "user",
      content: `Current title: ${article.title}\nCurrent category: ${article.category}\n\nContent:\n${contentForAi}`,
    },
  ];

  // Prefer the OmniRoute combo (free providers) when configured; fall back to Lovable.
  const omni = omniRouteConfig();
  if (omni) {
    try {
      const text = await callOmniRoute(omni, {
        messages,
        temperature: 0.1,
        maxTokens: 8000,
        timeoutMs: 25000,
      });
      return extractFirstJsonObject(text);
    } catch (e: any) {
      console.log("OmniRoute unavailable, falling back to Lovable:", e?.message || String(e));
    }
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const payload = {
    model: AI_MODEL,
    messages,
    temperature: 0.1,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.status === 429) throw new Error("Lovable AI rate-limited (429)");
    if (response.status === 402) throw new Error("Lovable AI credits exhausted (402)");
    if (!response.ok) throw new Error(`Lovable AI failed (${response.status})`);

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return extractFirstJsonObject(content);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchArticleBatch(
  sb: any,
  batchSize: number,
  cursor: string | null,
  yearFilter: string | null,
  includeUnpublished: boolean,
): Promise<ArticleLite[]> {
  let query = sb
    .from("articles")
    .select("id, title, content, category, is_raw")
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(batchSize);

  if (!includeUnpublished) query = query.eq("published", true);

  if (yearFilter) query = query.like("category", `${yearFilter}:%`);
  if (cursor) query = query.gt("id", cursor);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ArticleLite[];
}

function normalizeYearFilter(rawYear: unknown): string | null {
  if (typeof rawYear !== "string") return null;
  const trimmed = rawYear.trim();
  if (/^Year [1-5]$/.test(trimmed)) return trimmed;
  return null;
}

type ProcessNonAiResult = {
  id: string;
  title: string;
  action: "updated" | "migrated_mcq" | "migrated_essay" | "deleted" | "no_change";
  details?: string;
};

async function processNonAiArticle(
  sb: any,
  article: ArticleLite,
): Promise<ProcessNonAiResult> {
  const rawContent = article.content || "";
  if (rawContent.length > OVERSIZED_ARTICLE_CHARS) {
    return { id: article.id, title: article.title || "(untitled)", action: "no_change", details: "oversized_manual_review" };
  }

  const baseContent = cleanContent(rawContent);
  const analysisContent = baseContent.slice(0, MAX_MCQ_EXTRACT_CHARS);
  let newTitle = normalizeTitle(article.title || inferTitleFromContent(baseContent));
  if (!newTitle) newTitle = inferTitleFromContent(baseContent);

  const detectedCategory = detectBestCategory(newTitle, analysisContent.slice(0, MAX_ANALYZE_CHARS));
  const newCategory = detectedCategory || article.category;

  if (baseContent.replace(/\s+/g, "").length < 40) {
    await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
    return { id: article.id, title: newTitle, action: "deleted", details: "empty_or_too_short" };
  }

  const mcqs = extractMcqsFromContent(analysisContent);
  const essays = extractEssayQuestions(analysisContent);
  const essayCount = essays.saqs.length + essays.laqs.length;
  const likelyMcqByTitle = /\bmcq\b|multiple\s+choice/i.test(`${article.title} ${newTitle}`);
  const likelyEssayByTitle = /\bessay|saq|laq|short\s+answer|long\s+answer\b/i.test(`${article.title} ${newTitle}`);
  const preferEssayMigration = (looksLikeEssayContent(analysisContent) || likelyEssayByTitle) && essayCount >= 3 && mcqs.length < 8;

  if (preferEssayMigration) {
    const { error: essayErr } = await sb.from("essays").insert({
      title: normalizeTitle(newTitle),
      short_answer_questions: essays.saqs,
      long_answer_questions: essays.laqs,
      category: newCategory,
      published: true,
      article_id: article.id,
    });

    if (!essayErr) {
      await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
      return {
        id: article.id,
        title: newTitle,
        action: "migrated_essay",
        details: `${essays.saqs.length} SAQs · ${essays.laqs.length} LAQs`,
      };
    }
  }

  if (mcqs.length >= 3 || (likelyMcqByTitle && mcqs.length >= 1)) {
    const { error: mcqError } = await sb.from("mcq_sets").insert({
      title: normalizeTitle(newTitle),
      questions: mcqs,
      published: true,
      original_notes: "",
      category: newCategory,
      access_password: "",
    });

    if (!mcqError) {
      await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
      return { id: article.id, title: newTitle, action: "migrated_mcq", details: `${mcqs.length} MCQs` };
    }
  }

  if (essayCount >= 3) {
    const { error: essayErr } = await sb.from("essays").insert({
      title: normalizeTitle(newTitle),
      short_answer_questions: essays.saqs,
      long_answer_questions: essays.laqs,
      category: newCategory,
      published: true,
      article_id: article.id,
    });

    if (!essayErr) {
      await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
      return {
        id: article.id,
        title: newTitle,
        action: "migrated_essay",
        details: `${essays.saqs.length} SAQs · ${essays.laqs.length} LAQs`,
      };
    }
  }

  const updates: Record<string, any> = {};
  if (baseContent !== article.content) updates.content = baseContent;
  if (newCategory !== article.category) updates.category = newCategory;
  if (newTitle !== article.title) updates.title = newTitle;

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await sb.from("articles").update(updates).eq("id", article.id);
    if (updateErr) throw updateErr;
    return { id: article.id, title: newTitle, action: "updated" };
  }

  return { id: article.id, title: article.title, action: "no_change" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    const batchSize = Math.min(Math.max(Number(body?.batch_size || 6), 1), 25);
    const cursor = typeof body?.cursor === "string" && body.cursor.length ? body.cursor : null;
    const yearFilter = normalizeYearFilter(body?.year);
    const includeUnpublished = body?.include_unpublished !== false;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const startedAt = Date.now();

    if (action === "year2_cleanup") {
      const { data: mcqSets, error: mcqErr } = await sb
        .from("mcq_sets")
        .select("id,title,category,questions,og_image_url,meta_description,created_at")
        .is("deleted_at", null)
        .ilike("category", "Year 2:%")
        .order("created_at", { ascending: true });
      if (mcqErr) throw mcqErr;

      let mcqFixed = 0;
      let mcqRemoved = 0;
      const seenMcqFingerprints = new Set<string>();
      for (const set of mcqSets || []) {
        const category = inferYearTwoCategory(set.title, set.category);
        const questions = normalizeStoredMcqQuestions(set.questions || []);
        const firstQuestion = plainText(questions[0]?.question || "");
        const title = normalizeYearTwoTitle(set.title, category, firstQuestion);
        const fingerprint = `${category}|${title.toLowerCase()}|${questions.map((q: any) => plainText(q.question).toLowerCase()).join("|")}`.slice(0, 6000);
        if (questions.length < 5 || seenMcqFingerprints.has(fingerprint)) {
          const { error: delErr } = await sb.from("mcq_sets").update({
            published: false,
            is_raw: true,
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", set.id);
          if (delErr) throw delErr;
          mcqRemoved++;
          continue;
        }
        seenMcqFingerprints.add(fingerprint);
        const image = topicCover(title, category);
        const unit = category.replace(/^Year\s*\d+\s*:\s*/i, "");
        const meta = `${questions.length} exam-style ${unit} MCQs with balanced five-option choices, answers, and concise explanations. ${firstQuestion}`.slice(0, 155);
        const { error: updateErr } = await sb.from("mcq_sets").update({
          title,
          questions,
          category,
          og_image_url: image,
          featured_image: image,
          meta_title: title.slice(0, 60),
          meta_description: meta,
          tags: yearTwoTags(title, category),
          updated_at: new Date().toISOString(),
        }).eq("id", set.id);
        if (updateErr) throw updateErr;
        mcqFixed++;
      }

      const { data: articles, error: articleErr } = await sb
        .from("articles")
        .select("id,title,category,content,og_image_url,meta_description")
        .is("deleted_at", null)
        .ilike("category", "Year 2:%");
      if (articleErr) throw articleErr;

      let articlesFixed = 0;
      let articlesRemoved = 0;
      for (const article of articles || []) {
        const title = String(article.title || "").trim();
        const content = String(article.content || "");
        const withoutDataImages = content.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)\s*/gi, "").trim();
        const shouldRemove = /^(test|untitled|sample)$/i.test(title) || withoutDataImages.replace(/\s+/g, "").length < 80;
        if (shouldRemove) {
          const { error: delErr } = await sb.from("articles").update({
            published: false,
            is_raw: true,
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", article.id);
          if (delErr) throw delErr;
          articlesRemoved++;
          continue;
        }

        const category = inferYearTwoCategory(title, article.category);
        const cleanTitle = normalizeYearTwoTitle(title, category, withoutDataImages.slice(0, 120));
        const clean = cleanContent(content);
        const image = topicCover(cleanTitle, category);
        const meta = (plainText(clean).slice(0, 155) || `${cleanTitle} Year 2 medical revision notes.`).slice(0, 155);
        const { error: updateErr } = await sb.from("articles").update({
          title: cleanTitle,
          content: clean,
          category,
          og_image_url: image,
          featured_image: image,
          meta_title: cleanTitle.slice(0, 60),
          meta_description: meta,
          tags: yearTwoTags(cleanTitle, category),
          updated_at: new Date().toISOString(),
        }).eq("id", article.id);
        if (updateErr) throw updateErr;
        articlesFixed++;
      }

      return new Response(JSON.stringify({ success: true, mcq_fixed: mcqFixed, mcq_removed: mcqRemoved, articles_fixed: articlesFixed, articles_removed: articlesRemoved }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "scan") {
      const articles = await fetchArticleBatch(sb, batchSize, cursor, yearFilter, includeUnpublished);
      if (articles.length === 0) {
        return new Response(JSON.stringify({ results: [], done: true, processed: 0, next_cursor: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];
      let processed = 0;
      let lastCursor: string | null = cursor;
      let timedOut = false;

      for (const article of articles) {
        processed++;
        lastCursor = article.id;

        const issues: string[] = [];
        const fixes: Record<string, any> = {};
        const analysisContent = article.content.slice(0, MAX_ANALYZE_CHARS);

        if (article.content.length > OVERSIZED_ARTICLE_CHARS) {
          issues.push("Very large article - open in editor for manual review");
          fixes.manual_review = true;
        }

        if (!article.title?.trim()) {
          issues.push("Missing title");
          fixes.new_title = inferTitleFromContent(article.content);
        }

        if (analysisContent.replace(/\s+/g, "").length < 40) {
          issues.push("Content is empty or too short");
          fixes.delete_empty = true;
        }

        const titleSuggestsMcq = /\bmcq\b|multiple\s+choice/i.test(article.title || "");
        const essaySignal = looksLikeEssayContent(analysisContent);

        if ((isMcqContent(analysisContent) || titleSuggestsMcq) && !essaySignal) {
          const mcqs = extractMcqsFromContent(analysisContent);
          if (mcqs.length >= 3 || (titleSuggestsMcq && mcqs.length >= 1)) {
            issues.push(`Contains ${mcqs.length} MCQs - should migrate to MCQ section`);
            fixes.migrate_mcqs = true;
            fixes.mcq_count = mcqs.length;
          }
        }

        if (essaySignal) {
          issues.push("Contains SAQ/LAQ style content - should migrate to Essays section");
          fixes.migrate_essays = true;
        }

        const betterCategory = detectBestCategory(article.title, analysisContent);
        if (betterCategory && betterCategory !== article.category) {
          issues.push(`Category mismatch: "${article.category}" → "${betterCategory}"`);
          fixes.new_category = betterCategory;
        }

        const normalizedTitle = normalizeTitle(article.title);
        if (normalizedTitle !== article.title) {
          issues.push("Title formatting can be improved");
          fixes.new_title = normalizedTitle;
        }

        const hasEmojis = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(analysisContent);
        if (hasEmojis) {
          issues.push("Contains emojis");
          fixes.clean_emojis = true;
        }

        // University mentions (MKU, Mount Kenya University) are preserved intentionally.

        const brokenOptions = (analysisContent.match(/[A-E]\)\s*[^\n]{3,}[B-E]\)/g) || []).length;
        if (brokenOptions > 2) {
          issues.push("Broken option formatting");
          fixes.fix_formatting = true;
        }

        if ((analysisContent.match(/\n{4,}/g) || []).length > 3) {
          issues.push("Excessive blank lines");
          fixes.fix_formatting = true;
        }

        const wordCount = article.content.split(/\s+/).length;
        if (wordCount < 100) {
          issues.push(`Very short article (${wordCount} words)`);
          fixes.too_short = true;
        }

        if (issues.length > 0) {
          results.push({ id: article.id, title: article.title, category: article.category, issues, fixes, word_count: wordCount });
        }

        if (Date.now() - startedAt > CPU_BUDGET_MS) {
          timedOut = true;
          break;
        }
      }

      return new Response(JSON.stringify({
        results,
        done: articles.length < batchSize && !timedOut,
        processed,
        next_cursor: lastCursor,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fix") {
      const { article_id, fixes = {} } = body;
      const { data: article, error } = await sb.from("articles").select("*").eq("id", article_id).single();
      if (error || !article) throw new Error("Article not found");

      let content = article.content;
      let category = article.category;
      let title = article.title;
      const changes: string[] = [];

      if (fixes.delete_empty || content.replace(/\s+/g, "").length < 40) {
        await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article_id);
        return new Response(JSON.stringify({ success: true, changes: ["Deleted empty article"], deleted_article: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (fixes.clean_emojis || fixes.clean_mku || fixes.fix_formatting) {
        content = cleanContent(content);
        changes.push("Cleaned formatting");
      }

      if (fixes.new_category) {
        category = fixes.new_category;
        changes.push(`Category: ${article.category} → ${category}`);
      }

      if (fixes.new_title) {
        title = fixes.new_title;
        changes.push("Updated title formatting");
      }

      if (fixes.migrate_mcqs) {
        const mcqSource = content.length > MAX_MCQ_EXTRACT_CHARS ? content.slice(0, MAX_MCQ_EXTRACT_CHARS) : content;
        const mcqs = extractMcqsFromContent(mcqSource);
        const essays = extractEssayQuestions(mcqSource);
        const essayCount = essays.saqs.length + essays.laqs.length;
        const titleSuggestsMcq = /\bmcq\b|multiple\s+choice/i.test(title || "");
        const titleSuggestsEssay = /\bessay|saq|laq|short\s+answer|long\s+answer\b/i.test(title || "");
        const preferEssay = (looksLikeEssayContent(mcqSource) || titleSuggestsEssay) && essayCount >= 3 && mcqs.length < 8;

        if (preferEssay && fixes.auto_route_essay) {
          const { error: essayErr } = await sb.from("essays").insert({
            title: normalizeTitle(title),
            short_answer_questions: essays.saqs,
            long_answer_questions: essays.laqs,
            category,
            published: true,
            article_id: article_id,
          });

          if (!essayErr) {
            changes.push(`Detected essay format — migrated to Essays (${essays.saqs.length} SAQs, ${essays.laqs.length} LAQs)`);
            await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article_id);
            return new Response(JSON.stringify({ success: true, changes, migrated_essays: true, deleted_article: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        if (!preferEssay && (mcqs.length >= 3 || (titleSuggestsMcq && mcqs.length >= 1))) {
          const { error: mcqError } = await sb.from("mcq_sets").insert({
            title: normalizeTitle(title.replace(/MCQ.*$/i, "MCQs").replace(/Question.*$/i, "MCQs")),
            questions: mcqs,
            published: true,
            original_notes: "",
            category,
            access_password: "",
          });

          if (!mcqError) {
            changes.push(`Migrated ${mcqs.length} MCQs to MCQ section`);
            await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article_id);
            return new Response(JSON.stringify({ success: true, changes, migrated_mcqs: mcqs.length, deleted_article: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Fallback: if MCQ parse failed or content is essay-like and fallback_to_raw is requested, move to raw
        if ((mcqs.length < 3 && !titleSuggestsMcq) || (titleSuggestsMcq && mcqs.length < 1) || preferEssay) {
          if (fixes.fallback_to_raw) {
            await sb.from("articles").update({ is_raw: true, published: false }).eq("id", article_id);
            changes.push(preferEssay ? "Detected essay-style content — moved to Raw (unpublished)" : "MCQ parse failed — moved to Raw (unpublished)");
            return new Response(JSON.stringify({ success: true, changes, moved_to_raw: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      if (fixes.move_to_raw) {
        await sb.from("articles").update({ is_raw: true, published: false }).eq("id", article_id);
        changes.push("Moved to Raw (unpublished)");
        return new Response(JSON.stringify({ success: true, changes, moved_to_raw: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (fixes.migrate_essays) {
        const essays = extractEssayQuestions(content);
        if (essays.saqs.length + essays.laqs.length >= 3) {
          const { error: essayErr } = await sb.from("essays").insert({
            title: normalizeTitle(title),
            short_answer_questions: essays.saqs,
            long_answer_questions: essays.laqs,
            category,
            published: true,
            article_id: article_id,
          });

          if (!essayErr) {
            changes.push(`Migrated to Essays (${essays.saqs.length} SAQs, ${essays.laqs.length} LAQs)`);
            await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article_id);
            return new Response(JSON.stringify({ success: true, changes, migrated_essays: true, deleted_article: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      if (content !== article.content || category !== article.category || title !== article.title) {
        const { error: updateError } = await sb.from("articles").update({ content, category, title }).eq("id", article_id);
        if (updateError) throw updateError;
      }

      return new Response(JSON.stringify({ success: true, changes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fix_all_safe" || action === "migrate_mcqs") {
      const articles = await fetchArticleBatch(sb, batchSize, cursor, yearFilter, includeUnpublished);
      if (articles.length === 0) {
        return new Response(JSON.stringify({ fixed: 0, failed: 0, skipped: 0, migrated: 0, done: true, processed: 0, next_cursor: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let fixed = 0;
      let failed = 0;
      let skipped = 0;
      let migrated = 0;
      let processed = 0;
      let lastCursor: string | null = cursor;
      const migratedArticles: string[] = [];
      const processedTitles: string[] = [];
      let timedOut = false;

      for (const article of articles) {
        processed++;
        lastCursor = article.id;

        try {
          if (action === "migrate_mcqs") {
            const mcqSource = article.content.length > MAX_MCQ_EXTRACT_CHARS ? article.content.slice(0, MAX_MCQ_EXTRACT_CHARS) : article.content;
            const titleSuggestsMcq = /\bmcq\b|multiple\s+choice/i.test(article.title || "");
            const titleSuggestsEssay = /\bessay|saq|laq|short\s+answer|long\s+answer\b/i.test(article.title || "");
            const essaySignal = looksLikeEssayContent(mcqSource) || titleSuggestsEssay;

            if ((!isMcqContent(mcqSource) && !titleSuggestsMcq) || essaySignal) {
              skipped++;
            } else {
              const mcqs = extractMcqsFromContent(mcqSource);
              if (mcqs.length >= 3 || (titleSuggestsMcq && mcqs.length >= 1)) {
                const { error: mcqError } = await sb.from("mcq_sets").insert({
                  title: normalizeTitle(article.title),
                  questions: mcqs,
                  published: true,
                  original_notes: "",
                  category: article.category,
                  access_password: "",
                });

                if (!mcqError) {
                  await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
                  migrated++;
                  migratedArticles.push(`${article.title} (${mcqs.length} MCQs)`);
                } else {
                  failed++;
                }
              } else {
                skipped++;
              }
            }
          } else {
            const cleaned = cleanContent(article.content);
            const betterCat = detectBestCategory(article.title, article.content.slice(0, MAX_ANALYZE_CHARS));
            const betterTitle = normalizeTitle(article.title || inferTitleFromContent(article.content));

            let needsUpdate = cleaned !== article.content;
            const updates: Record<string, any> = {};

            if (needsUpdate) updates.content = cleaned;
            if (betterCat && betterCat !== article.category) {
              updates.category = betterCat;
              needsUpdate = true;
            }
            if (betterTitle !== article.title) {
              updates.title = betterTitle;
              needsUpdate = true;
            }

            if (cleaned.replace(/\s+/g, "").length < 40) {
              await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
              fixed++;
              processedTitles.push(`${article.title || "(untitled)"} → deleted empty`);
            } else if (needsUpdate) {
              const { error: updateErr } = await sb.from("articles").update(updates).eq("id", article.id);
              if (updateErr) throw updateErr;
              fixed++;
              processedTitles.push(article.title || "(untitled)");
            } else {
              skipped++;
            }
          }
        } catch {
          failed++;
        }

        if (Date.now() - startedAt > CPU_BUDGET_MS) {
          timedOut = true;
          break;
        }
      }

      return new Response(JSON.stringify({
        fixed,
        failed,
        skipped,
        migrated,
        migratedArticles,
        processed_titles: processedTitles,
        done: articles.length < batchSize && !timedOut,
        processed,
        next_cursor: lastCursor,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cleanup_non_ai_batch") {
      const nonAiBatchSize = Math.min(Math.max(Number(body?.batch_size || 6), 1), 12);
      const articles = await fetchArticleBatch(sb, nonAiBatchSize, cursor, yearFilter, includeUnpublished);

      if (articles.length === 0) {
        return new Response(JSON.stringify({
          updated: 0,
          migrated_mcqs: 0,
          migrated_essays: 0,
          deleted: 0,
          failed: 0,
          skipped: 0,
          processed: 0,
          done: true,
          next_cursor: null,
          processed_articles: [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let updated = 0;
      let migrated_mcqs = 0;
      let migrated_essays = 0;
      let deleted = 0;
      let failed = 0;
      let skipped = 0;
      let processed = 0;
      let lastCursor: string | null = cursor;
      const processedArticles: Array<{ id: string; title: string; action: string; details?: string }> = [];
      let timedOut = false;

      for (const article of articles) {
        processed++;
        lastCursor = article.id;

        try {
          const result = await processNonAiArticle(sb, article);
          processedArticles.push(result);

          if (result.action === "updated") updated++;
          else if (result.action === "migrated_mcq") migrated_mcqs++;
          else if (result.action === "migrated_essay") migrated_essays++;
          else if (result.action === "deleted") deleted++;
          else skipped++;
        } catch (err: any) {
          failed++;
          processedArticles.push({
            id: article.id,
            title: article.title,
            action: "failed",
            details: err?.message || "Unknown",
          });
        }

        if (Date.now() - startedAt > CPU_BUDGET_MS) {
          timedOut = true;
          break;
        }
      }

      return new Response(JSON.stringify({
        updated,
        migrated_mcqs,
        migrated_essays,
        deleted,
        failed,
        skipped,
        processed,
        processed_articles: processedArticles,
        done: articles.length < nonAiBatchSize && !timedOut,
        next_cursor: lastCursor,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ai_fix_batch") {
      const aiBatchSize = Math.min(Math.max(Number(body?.batch_size || 1), 1), 2);
      const articles = await fetchArticleBatch(sb, aiBatchSize, cursor, yearFilter, includeUnpublished);

      if (articles.length === 0) {
        return new Response(JSON.stringify({ fixed: 0, migrated_mcqs: 0, migrated_essays: 0, deleted: 0, failed: 0, processed: 0, done: true, next_cursor: null, processed_articles: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let fixed = 0;
      let migrated_mcqs = 0;
      let migrated_essays = 0;
      let deleted = 0;
      let failed = 0;
      let processed = 0;
      let lastCursor: string | null = cursor;
      const processedArticles: any[] = [];
      let timedOut = false;

      for (const article of articles) {
        processed++;
        lastCursor = article.id;

        try {
          const baseContent = cleanContent(article.content);
          const ai = await callLovableAiCleanup({ ...article, content: baseContent });

          let newTitle = normalizeTitle(ai?.title || article.title || inferTitleFromContent(baseContent));
          if (!newTitle) newTitle = inferTitleFromContent(baseContent);

          const suggestedCat = ai?.category && CATEGORY_KEYWORDS[ai.category] ? ai.category : null;
          const newContent = cleanContent(ai?.clean_content || baseContent);
          const detectedCat = detectBestCategory(newTitle, newContent);
          const newCategory = suggestedCat || detectedCat || article.category;

          const parsedMcqs = extractMcqsFromContent(newContent.slice(0, MAX_MCQ_EXTRACT_CHARS));
          const parsedEssays = extractEssayQuestions(newContent.slice(0, MAX_MCQ_EXTRACT_CHARS));
          const parsedEssayCount = parsedEssays.saqs.length + parsedEssays.laqs.length;
          const essaySignal = looksLikeEssayContent(newContent) || /\bessay|saq|laq|short\s+answer|long\s+answer\b/i.test(newTitle);

          const forcedType = essaySignal && parsedEssayCount >= 3 && parsedMcqs.length < 8
            ? "essay"
            : parsedMcqs.length >= 5
            ? "mcq"
            : parsedEssayCount >= 3
            ? "essay"
            : null;

          const contentType = forcedType || ai?.content_type || (isMcqContent(baseContent) ? "mcq" : looksLikeEssayContent(baseContent) ? "essay" : "article");

          if (contentType === "delete" || newContent.replace(/\s+/g, "").length < 40) {
            await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
            deleted++;
            processedArticles.push({ id: article.id, title: newTitle, action: "deleted", reason: ai?.reason || "empty/garbage" });
            continue;
          }

          if (contentType === "mcq") {
            const mcqs = parsedMcqs;
            if (mcqs.length >= 5) {
              const { error: mcqError } = await sb.from("mcq_sets").insert({
                title: normalizeTitle(newTitle),
                questions: mcqs,
                published: true,
                original_notes: "",
                category: newCategory,
                access_password: "",
              });

              if (!mcqError) {
                await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
                migrated_mcqs++;
                processedArticles.push({ id: article.id, title: newTitle, action: "migrated_mcq", count: mcqs.length });
                continue;
              }
            }
          }

          if (contentType === "essay") {
            const essays = parsedEssays;
            if (essays.saqs.length + essays.laqs.length >= 3) {
              const { error: essayErr } = await sb.from("essays").insert({
                title: normalizeTitle(newTitle),
                short_answer_questions: essays.saqs,
                long_answer_questions: essays.laqs,
                category: newCategory,
                published: true,
                article_id: article.id,
              });

              if (!essayErr) {
                await sb.from("articles").update({ deleted_at: new Date().toISOString() }).eq("id", article.id);
                migrated_essays++;
                processedArticles.push({ id: article.id, title: newTitle, action: "migrated_essay", saqs: essays.saqs.length, laqs: essays.laqs.length });
                continue;
              }
            }
          }

          const updates: Record<string, any> = {};
          if (newContent !== article.content) updates.content = newContent;
          if (newCategory !== article.category) updates.category = newCategory;
          if (newTitle !== article.title) updates.title = newTitle;

          if (Object.keys(updates).length > 0) {
            const { error: updateErr } = await sb.from("articles").update(updates).eq("id", article.id);
            if (updateErr) throw updateErr;
            fixed++;
            processedArticles.push({ id: article.id, title: newTitle, action: "updated", category: newCategory });
          } else {
            processedArticles.push({ id: article.id, title: article.title, action: "no_change" });
          }
        } catch (err: any) {
          const message = String(err?.message || "Unknown");
          const isRateLimited = /429|rate-?limit/i.test(message);

          if (isRateLimited) {
            try {
              const fallback = await processNonAiArticle(sb, article);
              if (fallback.action === "updated") fixed++;
              else if (fallback.action === "migrated_mcq") migrated_mcqs++;
              else if (fallback.action === "migrated_essay") migrated_essays++;
              else if (fallback.action === "deleted") deleted++;

              processedArticles.push({
                id: fallback.id,
                title: fallback.title,
                action: `${fallback.action}_fallback`,
                details: "AI rate-limited",
              });
              continue;
            } catch (fallbackErr: any) {
              failed++;
              processedArticles.push({
                id: article.id,
                title: article.title,
                action: "failed",
                error: fallbackErr?.message || message,
              });
              continue;
            }
          }

          failed++;
          processedArticles.push({ id: article.id, title: article.title, action: "failed", error: message });
        }

        if (Date.now() - startedAt > CPU_BUDGET_MS) {
          timedOut = true;
          break;
        }
      }

      return new Response(JSON.stringify({
        fixed,
        migrated_mcqs,
        migrated_essays,
        deleted,
        failed,
        processed,
        processed_ids: processedArticles.map((a) => a.id),
        processed_articles: processedArticles,
        done: articles.length < aiBatchSize && !timedOut,
        next_cursor: lastCursor,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
