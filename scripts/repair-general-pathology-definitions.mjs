import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ARTICLE_ID = "de831f1b-1680-4561-8c03-cc91ed77b854";
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data: row, error: readError } = await db.from("articles").select("content").eq("id", ARTICLE_ID).single();
if (readError) throw readError;

const replacement = `Question 21
Define the following terms. (5 marks)

a) Hypoxia
b) Necrosis
c) Apoptosis
d) Anoxia

Answer:

**a) Hypoxia:** Reduced oxygen availability to tissues. Causes include respiratory disease, anaemia, carbon-monoxide exposure, high altitude, and impaired perfusion. Persistent hypoxia reduces oxidative phosphorylation, depletes ATP, and promotes anaerobic glycolysis with lactate production.

**b) Necrosis:** Uncontrolled pathological cell death after severe injury, characterized by cell swelling, loss of membrane integrity, leakage of cellular contents, and an inflammatory response. Nuclear changes include pyknosis, karyorrhexis, and karyolysis.

**c) Apoptosis:** Regulated, energy-dependent cell death characterized by cell shrinkage, chromatin condensation, fragmentation into membrane-bound apoptotic bodies, and phagocytosis without significant inflammation.

**d) Anoxia:** Complete absence of oxygen delivery to tissue. It is more severe than hypoxia and rapidly causes irreversible cellular injury if not corrected.`;

let content = String(row.content || "");
const malformed = `Question 21
: Define the following terms

A. Hypoxia: Reduced oxygen availability to tissues despite adequate perfusion. Can result from respiratory disease, anemia,…
B. Cells switch to anaerobic metabolism leading to lactic acidosis.
C. Necrosis: Pathological cell death characterized by cellular swelling, membrane disruption, organelle destruction, and…
D. Results from severe cell injury and is irreversible, unlike apoptosis.

Answer: A. Hypoxia: Reduced oxygen availability to tissues despite adequate perfusion. Can result from respiratory disease, anemia,…`;
if (!content.endsWith(malformed)) {
  if (content.includes("**d) Anoxia:** Complete absence of oxygen delivery to tissue.")) {
    console.log(JSON.stringify({ id: ARTICLE_ID, status: "already-repaired" }));
    process.exit(0);
  }
  throw new Error("Malformed Question 21 block was not found");
}
content = `${content.slice(0, -malformed.length)}${replacement}`;

const { data, error } = await db.from("articles").update({
  content,
  title: "General Pathology I — MCQs, Short Answers & Explanations",
  content_kind: "mcq_essay",
  exam_type: "Revision Questions",
  meta_title: "General Pathology I | MCQs & Short-Answer Revision",
  meta_description: "Revise General Pathology I with structured MCQs, complete short-answer questions, model definitions, and concise explanations of core disease mechanisms.",
  updated_at: new Date().toISOString(),
}).eq("id", ARTICLE_ID).select("id,title,slug").single();
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
