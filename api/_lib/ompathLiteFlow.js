/**
 * Adaptive question branching for the USSD pregnancy intake.
 * answers are ordered: emergency screen, pregnancy status, gestational age.
 */
export function adaptPregnancyQuestions(questions, category, answers = []) {
  const result = questions.map((question) => ({ ...question }));
  if (category !== "Pregnancy-related concern") return result;

  if (["2", "3"].includes(String(answers[1] || ""))) {
    for (const id of ["gestation", "pregnancy_movement"]) {
      const index = result.findIndex((question) => question.id === id);
      if (index >= 0) result.splice(index, 1);
    }
    const bleeding = result.find((question) => question.id === "pregnancy_bleeding_or_fluid");
    if (bleeding) {
      bleeding.en = "Are you having vaginal bleeding?";
      bleeding.sw = "Je, unatokwa damu ukeni?";
    }
  } else if (["1", "4"].includes(String(answers[2] || ""))) {
    const index = result.findIndex((question) => question.id === "pregnancy_movement");
    if (index >= 0) result.splice(index, 1);
  }
  return result;
}
