// "Quick Summary — Start Here" pop-ups shown at the top of a study note: the idea in plain words before the full notes. Keyed by note slug.
export interface QuickSummary {
  title: string;
  subtitle: string;
  intro: string;
  cards: { heading: string; think: string; body: string }[];
  memory: string[];
  caution: string;
}

export const QUICK_SUMMARIES: Record<string, QuickSummary> = {
  "neurodevelopmental-disorders-autism-intellectual-disability": {
    title: "Start with the basics",
    subtitle: "Neurodevelopmental disorders · Year 4 Psychiatry",
    intro: "Neurodevelopmental means a condition that affects how skills develop as a child grows, for example learning, communication, play or independence.",
    cards: [
      { heading: "Intellectual Disability (ID)", think: "learning and everyday independence.", body: "The child has significant difficulties with thinking and learning (such as understanding, reasoning or solving problems) and with adaptive skills (such as dressing, communicating needs or managing daily routines)." },
      { heading: "Autism Spectrum Disorder (ASD)", think: "social communication + repetitive patterns.", body: "The child has persistent difficulties with social communication or interaction, together with restricted or repetitive behaviours, interests or routines. A child may become very distressed when a familiar routine changes." },
    ],
    memory: ["ID = learning + adaptive functioning.", "ASD = social communication + restricted/repetitive behaviour."],
    caution: "These are clues, not diagnoses. Children develop at different rates, and a clinician considers the child's developmental history, functioning, examination and other possible explanations. ASD and ID can occur together.",
  },
  "neurodevelopmental-disorders-adhd-disruptive-behaviour": {
    title: "Start with the basics",
    subtitle: "ADHD and disruptive behaviour · Year 4 Psychiatry",
    intro: "Every child is sometimes distracted, active or defiant. A disorder means a persistent pattern that is beyond what is expected for the child's age and that harms daily life.",
    cards: [
      { heading: "ADHD", think: "inattention, hyperactivity, impulsivity.", body: "The child struggles to keep their mind on a task, moves or fidgets excessively, or acts before thinking. Symptoms last at least 6 months, began before age 12 and appear in at least two settings, such as home and school." },
      { heading: "Oppositional defiant disorder (ODD)", think: "angry, argumentative, defiant.", body: "A repeated pattern of angry or irritable mood, arguing with adults and refusing to follow rules, without serious harm to others." },
      { heading: "Conduct disorder (CD)", think: "breaking rules and rights of others.", body: "A more serious pattern: aggression to people or animals, destroying property, lying or stealing, or serious rule violations." },
    ],
    memory: ["ADHD = can't pay attention or sit still, and acts before thinking.", "ODD = defiant. CD = breaks the rights of others."],
    caution: "Poor sleep, anxiety, learning problems, hearing or vision problems and stress can look like ADHD. A clinician checks these before diagnosing, and a teacher's report alone does not confirm ADHD.",
  },
};
