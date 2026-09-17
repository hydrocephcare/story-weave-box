import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ARTICLE_ID = "8f6e9f23-1e3c-4e2a-b49e-d4fb01bfa3a9";
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data: row, error: readError } = await db.from("articles").select("content").eq("id", ARTICLE_ID).single();
if (readError) throw readError;

let content = String(row.content || "");
const replacements = [
  [
    "**Severe metabolic acidosis with appropriate respiratory compensation** (partially compensated metabolic acidosis with high anion gap)",
    "**Severe high-anion-gap metabolic acidosis with superimposed respiratory acidosis (inadequate respiratory compensation)**",
  ],
  [
    "The measured PaCO₂ of 26.3 mmHg indicates appropriate compensation.",
    "The expected PaCO₂ is 18.5 ± 2 mmHg (16.5-20.5 mmHg). The measured PaCO₂ of 26.3 mmHg is higher than expected, demonstrating a concurrent respiratory acidosis or inadequate ventilatory compensation.",
  ],
  [
    "**Acute respiratory alkalosis with partial metabolic compensation** (or respiratory alkalosis with compensatory metabolic acidosis if >3 days)",
    "**Chronic respiratory alkalosis with appropriate renal compensation** (the disturbance has persisted for 3 days)",
  ],
  [
    "**VERY HIGH RISK for atherosclerotic cardiovascular disease (ASCVD)**",
    "**Severe primary hypercholesterolaemia (LDL-C ≥190 mg/dL), requiring treatment without relying on a calculated 10-year risk**",
  ],
  [
    "**10-year ASCVD risk likely >20%**",
    "**A numerical 10-year ASCVD risk cannot be calculated from the supplied data because blood pressure, smoking, diabetes and treatment status are missing. LDL-C ≥190 mg/dL independently warrants high-intensity statin therapy in eligible adults.**",
  ],
];

let changed = 0;
for (const [before, after] of replacements) {
  if (content.includes(after)) continue;
  if (!content.includes(before)) throw new Error(`Expected source text not found: ${before.slice(0, 80)}`);
  content = content.replace(before, after);
  changed++;
}

const heading = "## Clinical verification sources";
if (!content.includes(heading)) {
  content += `\n\n---\n\n${heading}\n\n- [Merck Manual: Metabolic acidosis and Winter's formula](https://www.merckmanuals.com/en-ca/professional/nephrology/acid-base-regulation-and-disorders/metabolic-acidosis)\n- [Merck Manual: Expected compensation in acid-base disorders](https://www.merckmanuals.com/en-ca/professional/multimedia/table/primary-changes-and-compensations-in-simple-acid-base-disorders)\n- [ACC/AHA cholesterol guidance for LDL-C at least 190 mg/dL](https://www.acc.org/Education-and-Meetings/Patient-Case-Quizzes/2023/10/13/12/34/Approach-to-Risk-Assessment-and-Management-of-ASCVD)\n`;
  changed++;
}

if (!changed) {
  console.log(JSON.stringify({ id: ARTICLE_ID, changed: 0, status: "already-remediated" }));
  process.exit(0);
}

const { data, error } = await db.from("articles").update({
  content,
  updated_at: new Date().toISOString(),
}).eq("id", ARTICLE_ID).select("id,slug,updated_at").single();
if (error) throw error;
console.log(JSON.stringify({ ...data, changed }, null, 2));
