import { isTrustedBlogWorkflow } from "./blogPolishAuth.js";
import { getPolishSql, hasPolishWriteKey } from "./neonPolishStore.js";
import { yearOf } from "./blogPolishCore.js";

const json=(res,status,body)=>res.status(status).json(body);
const hours=row=>(Date.now()-new Date(row.updated_at).getTime())/3_600_000;

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return json(res,405,{error:"POST only."});
  if(!(await isTrustedBlogWorkflow(req.headers.authorization))) return json(res,403,{error:"Trusted OmpathStudy publishing workflow required."});
  try {
    const groq=String(process.env.GROQ_API_KEYS||process.env.GROQ_API_KEY||"");
    const gem=String(process.env.GEMINI_API_KEYS||process.env.GEMINI_API_KEY||"");
    if(!groq.trim()||!gem.trim()) return json(res,503,{error:"Groq and Gemini API keys are not configured in Cloudflare."});
    if(!(await hasPolishWriteKey())) return json(res,503,{error:"The Cloudflare polishing key has not been synced to Neon. Open Admin → Polish and sync the existing Cloudflare secret."});
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):req.body||{};
    const count=Math.max(1,Math.min(100,Number(body.count)||40));
    const onlyYear=Math.max(0,Math.min(6,Number(body.year)||0));
    const sql=getPolishSql();
    const articles=await sql.query(`SELECT id,title,category,length(content) AS content_length
      FROM public.articles WHERE published=true AND deleted_at IS NULL AND password_protected=false
        AND (scheduled_at IS NULL OR scheduled_at<=now())
      ORDER BY created_at ASC LIMIT 4000`);
    const states=await sql.query("SELECT article_id,status,updated_at,ai_review_status,verdict FROM public.blog_polish ORDER BY updated_at DESC LIMIT 5000");
    const state=new Map(states.map(x=>[x.article_id,x]));
    const eligible=articles.filter(a=>{
      if(onlyYear&&yearOf(a.category)!==onlyYear) return false;
      const s=state.get(a.id);
      if(!s) return true;
      if(s.verdict==="irrelevant") return false;
      const age=hours(s);
      const long=Number(a.content_length||0)>14000;
      return (s.status==="failed"&&age>12)
        || (s.status==="partial"&&(long||age>1))
        || (s.status==="working"&&age>0.2)
        || (s.status==="done"&&s.ai_review_status!=="passed"&&age>12);
    }).slice(0,count).map(a=>({id:a.id,title:a.title,category:a.category}));
    return json(res,200,{success:true,count:eligible.length,articles:eligible});
  } catch(error) {
    console.error("[blog-polish-queue]",error instanceof Error?error.message:String(error));
    return json(res,500,{error:"Could not prepare the scheduled article queue."});
  }
}
