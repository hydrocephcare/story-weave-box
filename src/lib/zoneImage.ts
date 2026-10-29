// Image Spot: picture questions from the spot banks (Aponeurosis Anatomy, Histology and Embryology, the Year 1 and 2 anatomy marathons).
// A spot question often asks several things at once ("identify the tissue, give two reasons, state the fibre"); the game asks only the first,
// and the wrong options are answers to questions that ask the same thing ("identify the tissue"), so they are the same kind of answer.
import { visibleToYear } from "@/lib/noteRank";
import { loadBank, loadCatalog, type BankQuestion } from "@/lib/questionBank";
import { shuffle, topicWords, type ZoneQuestion } from "@/lib/zone";

const NL = String.fromCharCode(10);
const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
const bullets = (a: string): string[] => a.split(NL).map((l) => l.replace(/^[-*•\s]+/, "").replace(/\*\*/g, "").trim()).filter((l) => l.length > 2);
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t);
const ASK = /^(identify|name|state|what|which|label|give the name|give the)\b/i;
// "Identify A and B", "name the structure marked X": the question depends on letters on the picture, which a multiple-choice card cannot ask about
const LETTERED = /\b[A-Z]\b(?!['’])/;
const nk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function spotStem(question: string): string {
  const q = question.replace(/\s+/g, " ").trim().replace(/[?.:]+$/, "");
  const first = q.split(/,|;| and (?=give|state|name|describe|explain|list|identify|mention|outline)|\. /)[0].trim();
  return first.length >= 8 ? first : q;
}
const stemKey = (stem: string) => stem.toLowerCase().replace(/\b(two|three|four|five|one|the|a|an|of|in|this|that|shown|marked|labelled|labeled|tagged)\b/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** "Slide: skeletal muscle", "A: long head of biceps" and "Fibrocartilage - chondroblasts in lacunae" become "skeletal muscle", "long head of biceps" and "Fibrocartilage". */
function cleanOption(t: string): string {
  const noLabel = t.replace(/^(?:slide(?: shown)?|figure|image|photo|picture|structure|label|specimen|anomaly|diagnosis|tissue|organ|gland|species|stage|stain|section|type|answer|identification|[A-Z]|\d+)\s*[:.)]\s*/i, "");
  const m = noLabel.split(/\s[-–—]\s|;|\s\(/)[0].trim();
  const text = clip(m.length >= 3 ? m : noLabel, 90);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function spotAnswer(q: BankQuestion): string {
  const lines = bullets(q.answer);
  const stem = spotStem(q.question);
  const k = Math.min(lines.length, WORDS[(stem.toLowerCase().match(/\b(two|three|four|five)\b/) ?? [])[1] ?? ""] ?? 1);
  return lines.slice(0, Math.max(1, Math.min(k, 3))).map(cleanOption).join("; ");
}

export async function imageQuestions(topic: string, year: number | null, want: number): Promise<ZoneQuestion[]> {
  try {
    const words = topicWords(topic);
    const metas = (await loadCatalog()).filter((m) => visibleToYear(m.category, year));
    const titled = metas.filter((m) => words.some((w) => `${m.title} ${m.category}`.toLowerCase().includes(w)));
    const generic = /^(anatomy|histology|embryology|gross|spot|pictures?|images?|aponeurosis)$/i.test(topic.trim());
    const use = titled.length ? titled : metas;
    const banks = (await Promise.all(use.map(loadBank))).filter((b): b is NonNullable<typeof b> => !!b);
    const all = banks.flatMap((b) => b.questions).filter((q) => bullets(q.answer).length > 0 && ASK.test(spotStem(q.question)) && !LETTERED.test(spotStem(q.question)));
    let pool = all.filter((q) => q.image);
    if (!titled.length && !generic && words.length) pool = pool.filter((q) => words.some((w) => `${q.question} ${q.section} ${q.answer} ${q.imageAlt ?? ""}`.toLowerCase().includes(w)));
    pool = pool.filter((q) => spotAnswer(q).length > 2);
    const seen = new Set<string>();
    const out: ZoneQuestion[] = [];
    for (const q of shuffle(pool)) {
      const stem = spotStem(q.question), key = stemKey(stem), right = spotAnswer(q);
      if (seen.has(nk(right))) continue;
      const same = (x: BankQuestion) => stemKey(spotStem(x.question)) === key;
      const near = (x: BankQuestion) => stemKey(spotStem(x.question)).split(" ").slice(0, 2).join(" ") === key.split(" ").slice(0, 2).join(" ");
      const choose = (f: (x: BankQuestion) => boolean, have: string[]) => {
        const out2: string[] = [];
        for (const x of shuffle(all.filter((y) => y !== q && f(y)))) {
          const t = spotAnswer(x), n = nk(t);
          if (t.length < 3 || n === nk(right) || n.includes(nk(right)) || nk(right).includes(n) || [...have, ...out2].some((h) => nk(h) === n)) continue;
          out2.push(t);
        }
        return out2;
      };
      let wrong = choose(same, []);
      if (wrong.length < 3) wrong = [...wrong, ...choose((x) => near(x) && x.section === q.section, wrong)];
      wrong = wrong.slice(0, 3);
      if (wrong.length < 3) continue;
      seen.add(nk(right));
      const options = shuffle([right, ...wrong]);
      out.push({ q: `${stem}?`, image: q.image, options, correct: options.indexOf(right), explanation: clip(bullets(q.answer).join(" • "), 700), kind: "image" });
      if (out.length >= want) break;
    }
    return out;
  } catch { return []; }
}
