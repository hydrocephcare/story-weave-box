import { askGroqModel } from "./topicAi.js";
import { checkContent } from "./contentCheck.js";
import { hardenBatch, weakness } from "./mcqHarden.js";
import { placeNewQuestions } from "./mcqPositions.js";

function cleanStudyNote(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 12000);
}
function parseNoteMcqs(raw) {
  const text=String(raw||""); const start=text.indexOf("["); const end=text.lastIndexOf("]");
  if(start<0||end<=start)return [];
  let data; try{data=JSON.parse(text.slice(start,end+1));}catch{return [];}
  if(!Array.isArray(data))return [];
  return data.filter(q=>q?.question&&Array.isArray(q.options)&&q.options.length>=4&&Number.isInteger(q.correct_answer)&&q.correct_answer>=0&&q.correct_answer<=3)
    .map(q=>({question:String(q.question).trim(),options:q.options.slice(0,4).map(x=>String(x).trim()),correct_answer:q.correct_answer,explanation:String(q.explanation||"").trim()}))
    .filter(q=>q.question.length>=12&&q.explanation.length>=12&&q.options.every(x=>x.length>0)&&new Set(q.options.map(x=>x.toLowerCase())).size===4&&!/all of the above|none of the above/i.test(q.options.join(" ")));
}
function parseNoteCards(raw) {
  const text=String(raw||""); const start=text.indexOf("["); const end=text.lastIndexOf("]");
  if(start<0||end<=start)return [];
  let data; try{data=JSON.parse(text.slice(start,end+1));}catch{return [];}
  if(!Array.isArray(data))return [];
  const seen=new Set();
  return data.filter(c=>c?.question&&c?.answer).map(c=>({question:String(c.question).trim(),answer:Array.isArray(c.answer)?c.answer.map(x=>"- "+String(x)).join("\n"):String(c.answer).trim()}))
    .filter(c=>{const key=c.question.toLowerCase().replace(/[^a-z0-9]+/g," ").slice(0,60);const words=c.answer.split(/\s+/).filter(Boolean).length;if(key.length<8||seen.has(key)||words<30||words>75)return false;seen.add(key);return true;});
}
export function dedupeNoteMcqs(items, existing=[]) {
  const seen=new Set(existing.map(q=>String(q.question||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().slice(0,60)));
  return items.filter(q=>{const key=q.question.toLowerCase().replace(/[^a-z0-9]+/g," ").trim().slice(0,60);if(seen.has(key))return false;seen.add(key);return true;});
}
export async function generateNoteMcqs(article, env, count=24, avoid=[]) {
  const text=cleanStudyNote(article.content);
  const prompt=`Write exactly ${count} challenging single-best-answer MCQs for medical students from this study note.
At least two thirds should be short clinical vignettes. Each question must have exactly four plausible options, one best answer, a 0-based correct_answer index, and a concise explanation.
Do not use all/none of the above. Do not make the correct option conspicuously longer. Use only supported facts; never invent doses or diagnostic criteria.
Return ONLY a JSON array of objects: {"question":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"..."}.
TOPIC: ${article.title} | ${article.category}
AVOID REPEATING: ${avoid.slice(0,30).map(q=>String(q).slice(0,120)).join("\n")}
SOURCE NOTE:
${text}`;
  const draft=await askGroqModel(prompt,{env,plain:true,timeoutMs:55000,maxTokens:6500});
  let questions=parseNoteMcqs(draft.text).slice(0,count);
  if(questions.length<Math.max(Math.min(8,count),Math.floor(count*0.55)))throw new Error("MCQ generation returned too few valid questions.");
  const weak=questions.map((q,i)=>weakness(q).some(w=>w!=="recall")?i:-1).filter(i=>i>=0).slice(0,8);
  if(weak.length){try{const fixed=await hardenBatch(env,weak.map(i=>questions[i]),{subject:article.title+" ("+article.category+")"});weak.forEach((i,k)=>{if(fixed[k])questions[i]={...fixed[k]};});}catch{}}
  questions=placeNewQuestions(dedupeNoteMcqs(questions,avoid));
  let review=await checkContent({title:article.title,kind:"medical multiple-choice questions",text:JSON.stringify(questions),env,timeoutMs:45000});
  if(!review.validated) {
    const repairPrompt=`Correct the clinical or assessment-quality problems below. Preserve the source-note scope. Ensure exactly four plausible options, one best answer, a valid 0-based answer index and a concise explanation. Use only facts supported by the source note. Return ONLY a JSON array in the same schema.\nISSUES:\n${(review.issues||[]).map((x,i)=>(i+1)+". "+x.problem+" Fix: "+x.fix).join("\n")}\nQUESTIONS:\n${JSON.stringify(questions)}`;
    const fixed=await askGroqModel(repairPrompt,{env,plain:true,timeoutMs:55000,maxTokens:6500});
    questions=parseNoteMcqs(fixed.text).slice(0,count);
    if(questions.length<Math.max(Math.min(8,count),Math.floor(count*0.55)))throw new Error("MCQ correction returned too few valid questions.");
    questions=placeNewQuestions(dedupeNoteMcqs(questions,avoid));
    review=await checkContent({title:article.title,kind:"medical multiple-choice questions",text:JSON.stringify(questions),env,timeoutMs:45000});
  }
  if(!review.validated)throw new Error("MCQs failed independent medical review: "+(review.issues||[]).slice(0,3).map(x=>x.problem).join("; "));
  return {questions,review};
}
export async function generateNoteFlashcards(article, env, requestedCount = null) {
  const text=cleanStudyNote(article.content).slice(0,10000);
  const count=requestedCount===null||requestedCount===undefined
    ? Math.max(10,Math.min(22,Math.round(text.length/450)))
    : Math.max(1,Math.min(100,Math.round(Number(requestedCount)||10)));
  const prompt=`Create ${count} high-yield revision flashcards for medical students from this study note.
Each card covers one distinct angle: definition, causes, pathophysiology, clinical features, classification, investigations, differentials, management/pharmacology, complications, ward-round points, prognosis or prevention. Use only angles supported by the note.
Each answer is 35–60 words: a direct answer, then 3–4 short explanatory lines, and a final Related line. Do not repeat facts across cards. No invented doses or criteria.
Return ONLY JSON array: [{"question":"...","answer":"..."}].
TOPIC: ${article.title} | ${article.category}
SOURCE NOTE:
${text}`;
  const draft=await askGroqModel(prompt,{env,plain:true,timeoutMs:55000,maxTokens:7000});
  let cards=parseNoteCards(draft.text).slice(0,count);
  if(cards.length<Math.max(Math.min(8,count),Math.floor(count*0.55)))throw new Error("Flashcard generation returned too few distinct usable cards.");
  let review=await checkContent({title:article.title,kind:"medical revision flashcards",text:JSON.stringify(cards),env,timeoutMs:45000});
  if(!review.validated) {
    const repairPrompt=`Correct the clinical errors below in this flashcard set. Preserve the source-note scope. Each answer must remain 35–60 words, accurate, distinct and suitable for medical students. Use only supported facts. Return ONLY the complete JSON array in the same schema.\nISSUES:\n${(review.issues||[]).map((x,i)=>(i+1)+". "+x.problem+" Fix: "+x.fix).join("\n")}\nFLASHCARDS:\n${JSON.stringify(cards)}`;
    const fixed=await askGroqModel(repairPrompt,{env,plain:true,timeoutMs:55000,maxTokens:7000});
    cards=parseNoteCards(fixed.text).slice(0,count);
    if(cards.length<Math.max(Math.min(8,count),Math.floor(count*0.55)))throw new Error("Flashcard correction returned too few distinct usable cards.");
    review=await checkContent({title:article.title,kind:"medical revision flashcards",text:JSON.stringify(cards),env,timeoutMs:45000});
  }
  if(!review.validated)throw new Error("Flashcards failed independent medical review: "+(review.issues||[]).slice(0,3).map(x=>x.problem).join("; "));
  return {cards,review};
}


