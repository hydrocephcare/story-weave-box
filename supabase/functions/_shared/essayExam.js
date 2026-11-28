import { askGroqModel } from "./topicAi.js";
import { checkContent } from "./contentCheck.js";

export function parseEssayPaper(raw) {
  const text=String(raw||"");
  const match=text.match(/\{[\s\S]*\}/);
  if(!match)return {saqs:[],laqs:[]};
  try {
    const data=JSON.parse(match[0]);
    const parse=(items,marks)=>Array.isArray(items)?items.filter(x=>x?.question&&(x.model_answer||x.answer)).map(x=>({
      question:String(x.question).trim(),
      answer:String(x.model_answer||x.answer).trim(),
      marks,
    })).filter(x=>x.question.length>=12&&x.answer.length>=40):[];
    return {saqs:parse(data.saqs,5).slice(0,4),laqs:parse(data.laqs,20).slice(0,1)};
  } catch { return {saqs:[],laqs:[]}; }
}

/** Groq drafts the written paper; Gemini independently checks the questions and model answers. */
export async function generateReviewedEssayPaper({prompt,title,unit,env,fetchImpl=fetch}) {
  const draft=await askGroqModel(prompt,{env,fetchImpl,timeoutMs:60000,maxTokens:4500,plain:true});
  let essays=parseEssayPaper(draft.text);
  if(essays.saqs.length!==4||essays.laqs.length!==1)throw new Error("Written paper did not pass format validation.");
  let review=await checkContent({title,kind:"medical short-answer and long-answer examination with model answers",text:JSON.stringify(essays),env,fetchImpl,timeoutMs:45000});
  if(!review.validated) {
    const repairPrompt=`Correct the clinical or assessment-quality problems in this written exam. Preserve the unit scope (${unit}). Keep exactly four SAQs worth five marks each and one LAQ worth twenty marks. Model answers must be accurate, structured, proportionate to marks and use only accepted medical knowledge. Return ONLY JSON with keys saqs and laqs in the same schema.\nISSUES:\n${(review.issues||[]).map((x,i)=>(i+1)+". "+x.problem+" Fix: "+x.fix).join("\n")}\nPAPER:\n${JSON.stringify(essays)}`;
    const fixed=await askGroqModel(repairPrompt,{env,fetchImpl,timeoutMs:60000,maxTokens:4500,plain:true});
    essays=parseEssayPaper(fixed.text);
    if(essays.saqs.length!==4||essays.laqs.length!==1)throw new Error("Corrected written paper did not pass format validation.");
    review=await checkContent({title,kind:"medical short-answer and long-answer examination with model answers",text:JSON.stringify(essays),env,fetchImpl,timeoutMs:45000});
  }
  if(!review.validated)throw new Error("Written paper failed independent Gemini review: "+(review.issues||[]).slice(0,3).map(x=>x.problem).join("; "));
  const reviewedAt=new Date().toISOString();
  const annotate=(items)=>items.map(item=>({...item,aiReview:{status:"passed",model:review.model||"gemini",reviewedAt}}));
  return {essays:{saqs:annotate(essays.saqs),laqs:annotate(essays.laqs)},review};
}
