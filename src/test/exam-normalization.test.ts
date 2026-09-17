import { describe, expect, it } from "vitest";
import { cleanExamQuestions } from "@/pages/ExamStart";
import { normalizeMcqQuestions } from "@/lib/store";

describe("exam question normalization", () => {
  it("remaps the answer after blank and duplicate options are removed", () => {
    const [question] = normalizeMcqQuestions([{
      question: "Which organism is the leading cause of typical pneumonia?",
      options: ["", "H. influenzae", "S. pneumoniae", "H. influenzae", "M. pneumoniae"],
      correct_answer: 2,
      explanation: "Streptococcus pneumoniae is the leading cause.",
    }]);

    expect(question.options?.[question.correct_answer ?? -1]).toBe("S. pneumoniae");
    expect(question.correct_answer_text).toBe("S. pneumoniae");
  });

  it("uses persisted answer text to recover from a stale numeric index", () => {
    expect(cleanExamQuestions([{
      question: "Which organism causes diphtheria?",
      options: ["Streptococcus pyogenes", "Corynebacterium diphtheriae", "Neisseria meningitidis"],
      correct_answer: 0,
      correct_answer_text: "Corynebacterium diphtheriae",
      explanation: "Corynebacterium diphtheriae causes diphtheria.",
    }])).toEqual([expect.objectContaining({
      correct_answer: 1,
      correct_answer_text: "Corynebacterium diphtheriae",
    })]);
  });
  it("removes repeated labelled choices and remaps the answer", () => {
    expect(cleanExamQuestions([{ question: "  Test? ", options: ["A. Alpha", "B. Beta", "D. Beta", "D. Delta"], correct_answer: 3 }])).toEqual([
      { question: "Test?", options: ["Alpha", "Beta", "Delta"], correct_answer: 2, explanation: undefined },
    ]);
  });

  it("drops incomplete questions without a valid answer", () => {
    expect(cleanExamQuestions([{ question: "Broken", options: ["Only one"], correct_answer: 0 }])).toEqual([]);
  });

  it("recovers an invalid imported answer index from an explicit answer marker", () => {
    expect(cleanExamQuestions([{
      question: "Flexor digitorum longus",
      options: ["Superficial to tibialis posterior", "Arises from the tibia", "Communicates with FHL", "None", "All of the above"],
      correct_answer: 32,
      explanation: "Correct answer: E. All of the above.",
    }])).toEqual([expect.objectContaining({ correct_answer: 4 })]);
  });

  it("withholds an ambiguous invalid answer instead of guessing", () => {
    expect(cleanExamQuestions([{
      question: "Unverified question",
      options: ["Alpha", "Beta", "Gamma"],
      correct_answer: 12,
      explanation: "Review this item.",
    }])).toEqual([]);
  });

  it("does not trust an explanation that merely repeats an option", () => {
    expect(cleanExamQuestions([{
      question: "Potentially incorrect imported anatomy item",
      options: ["Tibia", "Fibula", "All of the above"],
      correct_answer: 32,
      explanation: "All of the above statements are correct.",
    }])).toEqual([]);
  });

  it("repairs WordPress True/False exports containing duplicated choices and explanation fragments", () => {
    expect(cleanExamQuestions([{
      question: "Receptor agonists result in a drug response.",
      options: ["True", "False", "True", "This is the mechanism by which many drugs exert their therapeutic effects."],
      correct_answer: 0,
      explanation: "Agonists activate receptors.",
    }])).toEqual([expect.objectContaining({ options: ["True", "False"], correct_answer: 0 })]);
  });

  it("extracts a WordPress explanation appended to the question stem", () => {
    expect(cleanExamQuestions([{
      question: "Which fungus is associated with pigeon droppings? Cryptococcus neoformans is enriched in contaminated soil.",
      options: ["Candida", "Aspergillus", "Cryptococcus", "Mucor"],
      correct_answer: 2,
    }])).toEqual([expect.objectContaining({
      question: "Which fungus is associated with pigeon droppings? Cryptococcus neoformans is enriched in contaminated soil.",
      explanation: undefined,
    })]);

    expect(cleanExamQuestions([{
      question: "Which fungus is associated with pigeon droppings?: Cryptococcus neoformans is enriched in contaminated soil.",
      options: ["Candida", "Aspergillus", "Cryptococcus", "Mucor"],
      correct_answer: 2,
    }])).toEqual([expect.objectContaining({
      question: "Which fungus is associated with pigeon droppings?",
      explanation: "Cryptococcus neoformans is enriched in contaminated soil.",
    })]);
  });

  it("qualifies the verified C. glabrata oral step-down question", () => {
    expect(cleanExamQuestions([{
      question: "A transplant patient has systemic candidiasis due to C. glabrata resistant to fluconazole. Which is a reasonable oral alternative?",
      options: ["Fluconazole", "Posaconazole", "Nystatin", "Griseofulvin"],
      correct_answer: 1,
    }])).toEqual([expect.objectContaining({
      question: expect.stringContaining("After initial echinocandin therapy"),
      correct_answer: 1,
      explanation: expect.stringContaining("only when the isolate is susceptible"),
    })]);
  });

  it.each([
    "Aflatoxins are a serious problem because: two supplied choices are true",
    "More visible symptoms of fungal infection appearing recently because: all the above",
    "(continued options for mycetoma agents) Nocardia causes actinomycetoma",
    "All are zoophilic dermatophytes — select all that apply",
  ])("withholds a known unsafe legacy mycology item: %s", (question) => {
    expect(cleanExamQuestions([{
      question,
      options: ["Alpha", "Beta", "Gamma", "All the above"],
      correct_answer: 0,
    }])).toEqual([]);
  });

  it("withholds a shifted legacy item whose first option was appended to its stem", () => {
    expect(cleanExamQuestions([{
      question: "Fimbriae:A) Attach bacteria to various surfaces.",
      options: ["Help bacteria move", "Cause disease", "Store nutrients"],
      correct_answer: 0,
    }])).toEqual([]);
  });

  it("repairs the incomplete Aspergillus flavus option", () => {
    expect(cleanExamQuestions([{
      question: "Aflatoxins are produced by which fungus? ---",
      options: ["flavus", "Aspergillus niger", "Candida albicans"],
      correct_answer: 0,
    }])).toEqual([expect.objectContaining({
      question: "Which fungus is a major producer of aflatoxins?",
      options: ["Aspergillus flavus", "Aspergillus niger", "Candida albicans"],
      correct_answer: 0,
      explanation: expect.stringContaining("Aspergillus parasiticus"),
    })]);
  });

  it("rewrites the misleading dermatophyte isolation item as a KOH confirmation question", () => {
    expect(cleanExamQuestions([{
      question: "Most reliable lab method for isolation of Trichophyton rubrum?",
      options: ["Blood culture", "Serology", "Skin scrapings, microscopic examination using KOH", "Urease test"],
      correct_answer: 2,
    }])).toEqual([expect.objectContaining({
      question: expect.stringContaining("confirm suspected dermatophytosis"),
      correct_answer: 2,
      explanation: expect.stringContaining("species-level identification"),
    })]);
  });

  it("removes imported paper boundaries from questions and recovered explanations", () => {
    expect(cleanExamQuestions([{
      question: "Which benign tumour is composed of smooth muscle?: Leiomyoma is a benign smooth-muscle tumour. --- # GENETICS ---",
      options: ["Leiomyoma", "Lymphoma", "Melanoma"],
      correct_answer: 0,
    }, {
      question: "Which gene is mutated in cystic fibrosis? --- ## Set 2 — Genetics",
      options: ["CFTR", "RB1", "APC"],
      correct_answer: 0,
      explanation: "CFTR encodes a chloride channel. ---",
    }])).toEqual([
      expect.objectContaining({
        question: "Which benign tumour is composed of smooth muscle?",
        explanation: "Leiomyoma is a benign smooth-muscle tumour.",
      }),
      expect.objectContaining({
        question: "Which gene is mutated in cystic fibrosis?",
        explanation: "CFTR encodes a chloride channel.",
      }),
    ]);
  });

  it("updates the East African sleeping-sickness treatment item to current WHO guidance", () => {
    expect(cleanExamQuestions([{
      question: "Which of the following is used for stage I East African sleeping sickness?",
      options: ["Suramin", "Melarsoprol", "Eflornithine", "Pentamidine", "None of the above"],
      correct_answer: 3,
    }])).toEqual([expect.objectContaining({
      question: expect.stringContaining("current WHO guidance"),
      options: ["Suramin", "Melarsoprol", "Eflornithine", "Pentamidine", "Fexinidazole"],
      correct_answer: 4,
      explanation: expect.stringContaining("updated in 2024"),
    })]);
  });

  it("marks metrifonate as historical and corrects the osseous hydatid answer", () => {
    const result = cleanExamQuestions([{
      question: "Which parasite can be BEST treated with Metrifonate?",
      options: ["Clonorchis sinensis", "Schistosoma haematobium", "Fasciola hepatica"],
      correct_answer: 1,
    }, {
      question: "Which parasite can cause erosion of bones?",
      options: ["Ascaris lumbricoides", "Echinococcus granulosus", "Gnathostoma spinigerum"],
      correct_answer: 2,
    }]);
    expect(result[0]).toEqual(expect.objectContaining({
      question: expect.stringContaining("historically"), correct_answer: 1, explanation: expect.stringContaining("withdrawn"),
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      question: expect.stringContaining("osseous hydatid"), correct_answer: 1, explanation: expect.stringContaining("Echinococcus granulosus"),
    }));
  });

  it("repairs imprecise RB, granuloma, and tumour-assessment pathology items", () => {
    const result = cleanExamQuestions([{
      question: "RB gene, 'the guardian of the genome' regulates the cell cycle at",
      options: ["G1/S Checkpoint", "G2 Checkpoint", "Intra-S Checkpoint"],
      correct_answer: 0,
    }, {
      question: "A Granuloma is comprised of",
      options: ["Fibroblasts and capillaries", "Central necrotic area, epithelioid cells and lymphocytes"],
      correct_answer: 1,
    }, {
      question: "Which of the following is TRUE regarding the pathologic assessment of tumours",
      options: ["Grading is the degree of macroscopic and microscopic differentiation", "Staging is the extent of spread of tumours", "TNM and AJCC systems can be used for staging malignant tumours", "All of the above"],
      correct_answer: 3,
    }]);
    expect(result[0]).toEqual(expect.objectContaining({ question: expect.stringContaining("RB tumour-suppressor"), explanation: expect.stringContaining("p53") }));
    expect(result[1]).toEqual(expect.objectContaining({ question: expect.stringContaining("caseating granuloma"), explanation: expect.stringContaining("not present in every") }));
    expect(result[2]).toEqual(expect.objectContaining({
      options: expect.arrayContaining(["Grading assesses microscopic differentiation and other histologic features"]),
      correct_answer: 3,
      explanation: expect.stringContaining("stage describes tumour extent"),
    }));
  });

  it("adds the defining liver-enzyme criterion and nuance to the HELLP case", () => {
    expect(cleanExamQuestions([{
      question: "A 28-year-old female at 32 weeks gestation presents with schistocytic anemia, thrombocytopenia, and normal coagulation studies. ADAMTS13 is 45%. BP is 160/110 mmHg, urinalysis shows 3+ protein. What is the most likely diagnosis?",
      options: ["TTP", "HUS", "HELLP Syndrome", "DIC"],
      correct_answer: 2,
      explanation: "ADAMTS13 >10% rules out TTP.",
    }])).toEqual([expect.objectContaining({
      question: expect.stringContaining("AST 180 U/L"),
      correct_answer: 2,
      explanation: expect.stringContaining("makes immune TTP less likely"),
    })]);
  });

  it("repairs split immunohaematology stems and their answer indexes", () => {
    const result = cleanExamQuestions([{
      question: "In a patient with warm autoimmune hemolytic anemia (WAIH",
      options: ["and a pan-reactive antibody screen, which method is used to detect underlying alloantibodies if the patient has been recently transfused?", "Autologous adsorption", "Allogeneic adsorption using phenotype-matched cells", "Acid elution", "Saline replacement"],
      correct_answer: 2,
    }, {
      question: "Which specific modification to blood products is required to prevent Transfusion-Associated Graft-versus-Host Disease (TA-GvH ---",
      options: ["in an immunocompromised bone marrow transplant recipient?", "Leukoreduction", "Irradiation", "Washing", "Volume reduction"],
      correct_answer: 0,
    }]);
    expect(result[0]).toEqual(expect.objectContaining({
      question: expect.stringContaining("recently transfused"),
      options: ["Autologous adsorption", "Allogeneic adsorption using phenotype-matched cells", "Acid elution", "Saline replacement"],
      correct_answer: 1,
      explanation: expect.stringContaining("donor red cells"),
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      question: expect.stringContaining("TA-GVHD"),
      options: ["Leukoreduction", "Irradiation", "Washing", "Volume reduction"],
      correct_answer: 1,
      explanation: expect.stringContaining("T lymphocytes"),
    }));
  });

  it("repairs the truncated TRALI option and open-system red-cell limit", () => {
    const result = cleanExamQuestions([{
      question: "Which donor antibodies are most commonly associated with TRALI?",
      options: ["ABO", "RhD", "HLA or Human Neutrophil Antigens (HN", "Kell"],
      correct_answer: 2,
    }, {
      question: "What is the shelf life of red blood cells prepared in an open system when stored at 1-6 C?",
      options: ["4 hours", "24 hours", "7 days", "42 days"],
      correct_answer: 0,
    }]);
    expect(result[0]).toEqual(expect.objectContaining({
      options: expect.arrayContaining(["HLA or human neutrophil antigens (HNA)"]),
      correct_answer: 2,
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      correct_answer: 1,
      explanation: expect.stringContaining("within 24 hours"),
    }));
  });
});
