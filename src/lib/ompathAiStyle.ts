// A short note added to what the model is asked, so the answer is shaped for the student: pitched at their year, and laid out as a comparison table,
// a revision summary or a mnemonic when that is what they asked for. Kept short: the model function trims long questions.

export function answerStyle(text: string, year: number | null, student = ""): string {
  const hints: string[] = [];
  if (year) hints.push(`The student is in Year ${year} of MBChB: pitch the depth for that year.`);
  if (/\b(compare|comparison|difference between|differences between|differentiate|distinguish|vs\.?|versus)\b/i.test(text)) hints.push("Give a compact markdown comparison table first, then 3 bullets on telling them apart in an exam.");
  else if (/\b(summar(y|ise|ize)|short notes|revision notes|high[- ]yield)\b/i.test(text)) hints.push("Write a one-page revision summary: 4-6 key points as bullets, then short sections with bullets and a table if useful.");
  else if (/\b(mnemonic|how (do|can) i remember)\b/i.test(text)) hints.push("Give one short memorable mnemonic and what each letter stands for.");
  else if (/\b(explain|what is|what are|why|how does|how do)\b/i.test(text)) hints.push("Use short paragraphs and bullets, bold the key terms, end with one exam tip.");
  // honesty and learning, not only notes: say when unsure, and end with a quick self-check
  hints.push("Be accurate: if the site's notes do not cover it or you are unsure, say so plainly instead of guessing.");
  if (text.trim().length > 12 && !/^(hi|hello|thanks)/i.test(text.trim())) hints.push("End with one short 'Check yourself:' question on the main point.");
  if (student) hints.push(student);
  return hints.length ? `${text}\n\n(${hints.join(" ")})` : text;
}
