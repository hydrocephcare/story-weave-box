import { isNeonAdmin } from "./neonAdmin.js";
import { supabaseAiEnv } from "./supabaseAiEnv.js";
import { askModel, askGroqModel } from "../../supabase/functions/_shared/topicAi.js";
import { checkContent } from "../../supabase/functions/_shared/contentCheck.js";
import { placeNewQuestions } from "../../supabase/functions/_shared/mcqPositions.js";

const UNIT_CATEGORIES = [
  "Pathology","General Pathology","Basic Pharmacology II","Pharmacology","Hematopathology",
  "Research Methodology and Proposal Writing","Endocrine and Metabolic Pathology","Chemical Pathology",
  "Respiratory System Pathology","Junior Clerkship/Practicals in General Pathology I","Gastrointestinal Pathology",
  "Female Reproductive System Pathology","Cardiovascular System Pathology"
];
const bodyOf = (v) => typeof v === "string" ? JSON.parse(v || "{}") : v || {};
const cleanHeading = (v) => String(v || "").replace(/^#+\s*/,"").replace(/^\*+|\*+$/g,"").replace(/^"|"$/g,"").replace(/\s+/g," ").trim();
const compact = (v) => String(v || "").replace(/\s+/g," ").trim();
function clipNotes(notes,max=28000) {
  const value=String(notes||"").trim();
  if(value.length<=max)return value;
  const h=Math.floor(max*.5),m=Math.floor(max*.2),t=max-h-m,mid=Math.floor(value.length/2)-Math.floor(m/2);
  return value.slice(0,h)+"\n\n[... middle excerpt ...]\n\n"+value.slice(Math.max(0,mid),Math.max(0,mid)+m)+"\n\n[... ending excerpt ...]\n\n"+value.slice(-t);
}
function inferCategory(notes) {
  const n=notes.toLowerCase();
  if(/pharmacology|drug|dose|receptor/.test(n))return "Pharmacology";
  if(/hemat|blood film|anaemia|anemia/.test(n))return "Hematopathology";
  if(/gastro|liver|hepatic|intestinal/.test(n))return "Gastrointestinal Pathology";
  if(/respir|lung|bronch|asthma/.test(n))return "Respiratory System Pathology";
  if(/cardio|heart|myocard|vascular/.test(n))return "Cardiovascular System Pathology";
  if(/endocr|thyroid|adrenal|pituitary/.test(n))return "Endocrine and Metabolic Pathology";
  if(/female|ovary|uter|cervix/.test(n))return "Female Reproductive System Pathology";
  if(/pathology|histopath|lesion/.test(n))return "Pathology";
  return "Uncategorized";
}
function normalizeArticleOutput(raw) {
  const cleaned=String(raw||"").replace(/```[\s\S]*?```/g,"").trim();
  const lines=cleaned.split("\n");
  const first=lines.find((x)=>x.trim())||"Study Article";
  const title=cleanHeading(first)||"Study Article";
  let body=lines.slice(lines[0]?.trim()===first.trim()?1:0).join("\n").trim().replace(/^#\s+/gm,"## ");
  if(/^##\s+Summary\b/im.test(body)&&/^##\s+Key Points\b/im.test(body)&&/^##\s+Detailed Notes\b/im.test(body)&&/^##\s+Practice Questions\b/im.test(body))return {title,content:body};
  const paragraphs=body.split(/\n\s*\n/).map(compact).filter(Boolean);
  const summary=paragraphs[0]||"High-yield summary not provided.";
  const keyPoints=paragraphs.flatMap((p)=>p.split(/(?<=[.!?])\s+/)).map((x)=>x.trim()).filter((x)=>x.length>25).slice(0,8).map((x)=>"- "+x);
  const detailed=paragraphs.slice(1).join("\n\n")||summary;
  const practice=[1,2,3,4,5,6,7,8].map((n)=>n+". Explain a clinically important aspect of "+title+". → Provide the key mechanism, finding or management principle.");
  return {title,content:["## Summary",summary,"","## Key Points",...(keyPoints.length?keyPoints:["- Add high-yield points for this topic."]),"","## Detailed Notes",detailed,"","## Practice Questions",...practice].join("\n")};
}
function parseMcqs(raw,count) {
  const match=String(raw||"").match(/\[[\s\S]*\]/);
  if(!match)throw new Error("Could not parse the MCQ array.");
  const parsed=JSON.parse(match[0]);
  if(!Array.isArray(parsed))throw new Error("MCQ output was not an array.");
  const cleaned=parsed.map((item)=>{
    if(!item?.question||!Array.isArray(item.options)||item.options.length<2)return null;
    const question=compact(item.question),options=item.options.slice(0,6).map(compact);
    const correct=Number.isInteger(item.correct_answer)?Math.min(Math.max(item.correct_answer,0),options.length-1):0;
    return question?{question,options:options.map(x=>x.replace(/\s+—\s+related\s+(?:option|finding)$/i,"").slice(0,140)),correct_answer:correct,correct_answer_text:options[correct],explanation:compact(item.explanation)}:null;
  }).filter(Boolean);
  const seen=new Set(),unique=cleaned.filter((q)=>{const k=q.question.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();if(seen.has(k))return false;seen.add(k);return true;});
  return placeNewQuestions(unique.slice(0,count));
}
function parseEssays(raw) {
  const match=String(raw||"").match(/\{[\s\S]*\}/);
  if(!match)throw new Error("Could not parse written questions.");
  const data=JSON.parse(match[0]);
  const saqs=Array.isArray(data.saqs)?data.saqs.filter(q=>q?.question&&(q.model_answer||q.answer)).map(q=>({question:compact(q.question),answer:compact(q.model_answer||q.answer),marks:Number(q.marks)||5})):[];
  const laqs=Array.isArray(data.laqs)?data.laqs.filter(q=>q?.question&&(q.model_answer||q.answer)).map(q=>({question:compact(q.question),answer:compact(q.model_answer||q.answer),marks:Number(q.marks)||20})):[];
  return {saqs,laqs};
}
const parseJson = (raw) => { const m=String(raw||"").match(/\{[\s\S]*\}/); if(!m)throw new Error("The AI did not return valid JSON."); return JSON.parse(m[0]); };
async function callAI(messages,env,{plain=false,maxTokens=6000,timeoutMs=60000}={}) {
  const prompt=messages.map(m=>String(m.role||"user").toUpperCase()+":\n"+String(m.content||"")).join("\n\n");
  const out=await askModel(prompt,{env,plain,maxTokens,timeoutMs});
  if(!out?.text?.trim())throw new Error("Supabase AI returned an empty response.");
  return out.text;
}
async function generateReviewedArticle(messages,customTitle,env) {
  const base=messages.map(m=>String(m.role).toUpperCase()+":\n"+String(m.content||"")).join("\n\n");
  let corrections=[];
  for(let round=0;round<=2;round++){
    const prompt=base+(corrections.length?"\n\nCLINICAL REVIEW FINDINGS — CORRECT EACH ITEM:\n- "+corrections.join("\n- ")+"\nPreserve structure and correct only what is necessary.":"");
    const generated=await askGroqModel(prompt,{env,plain:true,maxTokens:8000,timeoutMs:65000});
    const article=normalizeArticleOutput(generated.text);
    if(customTitle)article.title=customTitle;
    const review=await checkContent({title:article.title,kind:"medical education article",text:article.content,env,timeoutMs:55000});
    if(!review.issues?.length)return {...article,aiReview:{status:"passed",generator:generated.model,reviewer:review.model,reviewedAt:review.at,fixRounds:round}};
    if(round===2)throw new Error("Clinical review held the article after two correction rounds: "+review.issues.map(x=>x.where+": "+x.problem).join(" | ").slice(0,500));
    corrections=review.issues.map(x=>"["+x.severity+"] "+x.where+": "+x.problem+". Correct statement: "+x.fix);
  }
  throw new Error("Clinical review did not approve this article.");
}

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({error:"POST only."});
  try {
    const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!(await isNeonAdmin(token)))return res.status(403).json({error:"Administrator access required."});
    const body=bodyOf(req.body),notes=body.notes;
    if(typeof notes!=="string"||!notes.trim())return res.status(400).json({error:"Notes must be a non-empty string."});
    const type=String(body.type||"flashcards"),customTitle=String(body.title||"").slice(0,140);
    const cardCount=Math.min(Math.max(Number(body.count)||20,5),100);
    const safe=clipNotes(notes),env=supabaseAiEnv(req);
    let messages=[],raw="";

    if(type==="categorize") {
      const prompt="Categorize these medical notes into ONE best unit from this exact list: "+UNIT_CATEGORIES.join("; ")+". Return only the exact category name, no explanation.\n\n"+safe.slice(0,5000);
      try { const value=(await callAI([{role:"user",content:prompt}],env,{plain:true,maxTokens:80})).trim().replace(/^"|"$/g,""); const exact=UNIT_CATEGORIES.find(c=>c.toLowerCase()===value.toLowerCase()); if(exact)return res.status(200).json({category:exact}); } catch {}
      return res.status(200).json({category:inferCategory(safe)});
    }
    if(type==="essay-qa") {
      messages=[{role:"system",content:"You are a medical examiner. Create exam-style written questions. Return ONLY JSON: {\"saqs\":[{\"question\":\"...\",\"model_answer\":\"...\",\"marks\":5}],\"laqs\":[{\"question\":\"...\",\"model_answer\":\"...\",\"marks\":20}]}. Create exactly six SAQs of 5 marks and one LAQ of 20 marks. Answers should be clinically structured and concise. No markdown."},{role:"user",content:safe}];
      raw=await callAI(messages,env,{maxTokens:7000}); return res.status(200).json(parseEssays(raw));
    }
    if(type==="publish-format") {
      messages=[{role:"system",content:"You are a fast medical publishing formatter. Return ONLY JSON: {\"title\":\"...\",\"content\":\"...\",\"tags\":[\"...\"],\"meta_title\":\"...\",\"meta_description\":\"...\",\"university\":\"Mount Kenya University\",\"school\":\"School of Medicine\",\"unit\":\"...\",\"exam_type\":\"...\",\"exam_year\":\"...\"}. Fix format only; do not rewrite academic meaning, shorten or remove questions, images or tables. Preserve MKU when present. Use clean markdown, 4-8 concise tags, and never invent exam details."},{role:"user",content:"Title: "+customTitle+"\n\nContent:\n"+safe}];
      raw=await callAI(messages,env,{maxTokens:7000});
      try { return res.status(200).json(parseJson(raw)); } catch { const n=normalizeArticleOutput(raw); return res.status(200).json({...n,tags:["mku"],university:"Mount Kenya University",school:"School of Medicine"}); }
    }
    if(type==="story-format") {
      messages=[{role:"system",content:"You are a light-touch story formatter. Return ONLY JSON: {\"title\":\"...\",\"content\":\"...\",\"category\":\"...\"}. Preserve author's voice and meaning. Fix necessary grammar, paragraph breaks, headings, spacing and punctuation. Keep safe HTML if input uses HTML; otherwise use clean markdown. Do not add plot or details."},{role:"user",content:"Title: "+(customTitle||"Untitled")+"\n\nStory:\n"+safe.slice(0,15000)}];
      raw=await callAI(messages,env,{maxTokens:5000});
      try { return res.status(200).json(parseJson(raw)); } catch { return res.status(200).json({title:customTitle||"Untitled",content:notes,category:"Stories"}); }
    }
    if(type==="direct-article"||type==="article") {
      messages=[{role:"system",content:"You are a medical education expert. Convert these notes into a comprehensive exam-focused study article in markdown. Title on first line. Include ## Summary, ## Key Points, ## Detailed Notes with ### subsections, and ## Practice Questions with at least 8 clinical Q→A lines. Use explanatory paragraphs, preserve all tables and content, do not use code fences. Do not fabricate facts, doses or references."},{role:"user",content:(customTitle?"Title: "+customTitle+"\n\n":"")+safe}];
      if(type==="article") { const result=await generateReviewedArticle(messages,customTitle,env); return res.status(200).json(result); }
      raw=await callAI(messages,env,{plain:true,maxTokens:9000});
      const result=normalizeArticleOutput(raw); if(customTitle)result.title=customTitle;
      return res.status(200).json(result);
    }
    if(type==="direct-mcqs"||type==="mcqs") {
      messages=[{role:"system",content:"You are a senior medical exam writer. Create EXACTLY "+cardCount+" clinically oriented MCQs. Return ONLY a JSON array with objects {\"question\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correct_answer\":0,\"explanation\":\"...\"}. Use four plausible options of similar length, exactly one best answer, no all/none of the above, clear clinical explanations. Spread correct positions naturally. Use accepted medical knowledge only."},{role:"user",content:"Create "+cardCount+" MCQs from these notes:\n\n"+safe}];
      raw=await callAI(messages,env,{maxTokens:9000});
      return res.status(200).json(parseMcqs(raw,cardCount));
    }
    if(type==="direct-flashcards"||type==="flashcards") {
      messages=[{role:"system",content:"You are a medical flashcard writer. Return ONLY a JSON array [{\"question\":\"...\",\"answer\":\"...\"}]. Create up to "+cardCount+" high-yield non-repetitive cards grounded in the supplied notes. Each answer should be concise but explanatory."},{role:"user",content:safe}];
      raw=await callAI(messages,env,{maxTokens:8000});
      const match=raw.match(/\[[\s\S]*\]/); if(!match)throw new Error("Failed to parse flashcards.");
      const parsed=JSON.parse(match[0]); if(!Array.isArray(parsed))throw new Error("Flashcards were not an array.");
      return res.status(200).json(parsed.filter(x=>x?.question&&x?.answer).map(x=>({question:compact(x.question),answer:compact(x.answer)})).slice(0,cardCount));
    }
    if(type==="generate-seo-meta") {
      messages=[{role:"system",content:"You are a medical SEO editor. Return ONLY JSON {\"meta_title\":\"...\",\"meta_description\":\"...\",\"slug\":\"...\"}. Title max 60 chars, description max 155 chars, slug lowercase hyphenated 3-6 words; do not invent clinical claims."},{role:"user",content:safe.slice(0,5000)}];
      raw=await callAI(messages,env,{maxTokens:700});
      return res.status(200).json(parseJson(raw));
    }
    if(type==="categorize-timetable") {
      messages=[{role:"system",content:"You are a medical curriculum organizer. Return ONLY JSON {\"categories\":[\"Year 1: Anatomy\",...]}. Detect year, normalize unit names, preserve semester if relevant, remove duplicates, sort by year then alphabetically."},{role:"user",content:safe.slice(0,10000)}];
      try { raw=await callAI(messages,env,{maxTokens:1500}); const result=parseJson(raw); if(Array.isArray(result.categories))return res.status(200).json(result); } catch {}
      const categories=safe.split("\n").map(x=>x.trim().replace(/^[-•*\d.)\]]+\s*/,"")).filter(x=>x.length>2);
      return res.status(200).json({categories:[...new Set(categories)]});
    }
    if(type==="moderate-story"||type==="moderate-and-fix-story") {
      const fix=type==="moderate-and-fix-story";
      messages=[{role:"system",content:fix?"You are a story editor and moderator. Reject spam, gibberish, offensive or non-story content. If approved, fix grammar and punctuation while preserving the author's voice and safe HTML. Return ONLY JSON: {\"rejected\":true,\"reason\":\"...\"} or {\"approved\":true,\"category\":\"Stories\",\"title\":\"...\",\"content\":\"...\"}.":"You moderate story submissions. Reject spam, gibberish, offensive or non-story content; accept reflections, medical experiences, creative writing, poems and essays. Return ONLY JSON {\"approved\":true,\"category\":\"Stories\",\"reason\":\"\"} or {\"rejected\":true,\"reason\":\"...\"}."},{role:"user",content:"Title: "+(customTitle||"Untitled")+"\n\nContent:\n"+safe.slice(0,15000)}];
      raw=await callAI(messages,env,{maxTokens:3500});
      return res.status(200).json(parseJson(raw));
    }
    if(type==="expand-story") {
      messages=[{role:"system",content:"You are a creative writing editor. Expand the story while preserving the author's voice and core message. Add vivid descriptions and dialogue only where they fit. Output first line title, blank line, then full story. Use paragraphs and markdown; do not alter the central meaning."},{role:"user",content:(customTitle?"Title: "+customTitle+"\n\n":"")+safe}];
      raw=await callAI(messages,env,{plain:true,maxTokens:9000});
      const lines=raw.trim().split("\n");
      return res.status(200).json({title:cleanHeading(lines[0]||customTitle||"Untitled Story"),content:lines.slice(1).join("\n").trim()});
    }
    return res.status(400).json({error:"Unsupported content generation type: "+type});
  } catch(error) {
    console.error("[generate-content] failed",String(error).slice(0,240));
    return res.status(502).json({error:"Ompath AI could not complete this content task. Please retry."});
  }
}
