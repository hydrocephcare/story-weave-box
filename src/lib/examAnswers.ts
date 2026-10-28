// Saved answers of a timed exam (kept in the browser while the exam is open and after it is submitted).

/** The chosen option of each answered question, as text. */
export function picksOf(answers: Map<number, number>, questions: { options: string[] }[]): [number, string][] {
  return [...answers.entries()].map(([qi, oi]) => [qi, String(questions[qi]?.options?.[oi] ?? "")]);
}

/** Saved answers back as option positions in the questions as they are shown now. A saved option text wins over a saved position (the order of the
 *  options may have changed since); older saves without texts keep their positions. */
export function restoreAnswers(answers: [number, number][], picks: [number, string][] | undefined, questions: { options: string[] }[]): Map<number, number> {
  const text = new Map(picks || []);
  return new Map(answers.map(([qi, oi]) => {
    const t = text.get(qi);
    const at = t ? (questions[qi]?.options || []).indexOf(t) : -1;
    return [qi, at >= 0 ? at : oi] as [number, number];
  }));
}
