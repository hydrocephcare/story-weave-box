import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const pages = [
  {
    slug: "medical-entomology-parasitology-quiz",
    title: "Medical Entomology & Parasitology CAT — MCQs, Essays & Answers",
    meta_title: "Medical Entomology & Parasitology CAT | MCQs & Answers",
    meta_description: "Revise medical entomology and parasitology with structured MCQs, short-answer questions, corrected keys, and concise explanations for Year 3 medicine.",
    replacements: [
      ["**Answer:\nA. DDT**\nExplanation: DDT (organochlorine) targets GABA-gated chloride channels in the insect nervous system.", "**Answer: No listed option is correct.**\nExplanation: DDT and permethrin act primarily on voltage-gated sodium channels. Cyclodiene insecticides such as aldrin/dieldrin and phenylpyrazoles such as fipronil are the classic GABA-gated chloride-channel antagonists. This source item is flawed."],
      ["**Answer:\nB. Lutzomyia species**\nExplanation: *Lutzomyia* sandflies are the larviparous genus tested here.", "**Answer: D. Glossina gambiense**\nExplanation: Tsetse flies (*Glossina*) are adenotrophically viviparous: the female nourishes one larva internally and deposits a mature larva. *Lutzomyia* sandflies lay eggs and are not larviparous."],
      ["**Answer:\nA. Simulium species**\n\n---\nQuestion 18", "**Answer: B. Anopheles species**\nExplanation: Blackwater fever is a severe haemolytic complication associated with *Plasmodium falciparum* malaria; *Anopheles* is the malaria vector. *Simulium* transmits *Onchocerca volvulus* and is unrelated to blackwater fever.\n\n---\nQuestion 18"],
      ["**Answer:\nA. DDT**\n\n---\nQuestion 33", "**Answer: No listed option is correct.**\nExplanation: DDT acts on voltage-gated sodium channels, not the GABA site. The source question lacks a valid GABA-targeting choice.\n\n---\nQuestion 33"],
      ["**Answer:\nB. Stationary** *(paper's marked answer; note \"idiophase\" is technically the more precise fermentation-science term for secondary metabolite production, but the exam's key marks stationary phase)*", "**Answer: D. Idiophase**\nExplanation: Secondary metabolites are characteristically produced during the idiophase, which commonly overlaps the stationary phase. Because both are offered, idiophase is the more precise single-best answer."],
    ],
  },
  {
    slug: "bacteriology-and-entomology-main-exam",
    title: "Bacteriology & Medical Entomology Main Exam — MCQs and Model Answers",
    meta_title: "Bacteriology & Medical Entomology Exam | Answers",
    meta_description: "Study bacteriology and medical entomology through a structured main exam with MCQs, short-answer questions, model answers, and revision explanations.",
    replacements: [],
  },
];

for (const page of pages) {
  const { data: row, error: readError } = await db.from("articles").select("id,content,tags").eq("slug", page.slug).single();
  if (readError) throw readError;
  let content = String(row.content || "");
  for (const [before, after] of page.replacements) {
    if (content.includes(after)) continue;
    if (!content.includes(before)) throw new Error(`${page.slug}: expected correction text was not found`);
    content = content.replace(before, after);
  }
  if (page.slug === "medical-entomology-parasitology-quiz" && !content.includes("## Verification sources")) {
    content += `\n\n---\n\n## Verification sources\n\n- [WHO malaria entomology and vector control training module](https://www.afro.who.int/sites/default/files/2017-06/9789241505819_eng.pdf)\n- [NCBI MeSH: Blackwater fever](https://www.ncbi.nlm.nih.gov/mesh/68001742)\n`;
  }
  const tags = (Array.isArray(row.tags) ? row.tags : []).filter((tag) => !/^(?:mku|mount kenya university)$/i.test(String(tag)));
  const { error } = await db.from("articles").update({
    content,
    title: page.title,
    meta_title: page.meta_title,
    meta_description: page.meta_description,
    tags,
    content_kind: "mcq_essay",
    exam_type: "Exam",
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (error) throw error;
  console.log(JSON.stringify({ id: row.id, slug: page.slug, title: page.title }));
}
