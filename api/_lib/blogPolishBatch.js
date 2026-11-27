import { createRemoteJWKSet, jwtVerify } from "jose";
import { askModel } from "../../supabase/functions/_shared/topicAi.js";
import { yearOf } from "./blogPolishCore.js";
import { polishArticle } from "./blogPolishRun.js";
import { verifyBlogContent } from "./blogPolishVerify.js";
import { getPolishSql, hasPolishWriteKey } from "./neonPolishStore.js";

const AUDIENCE="ompathstudy-blog-polish";
const WORKFLOW_REF="hydrocephcare/story-weave-box/.github/workflows/blogs-polish.yml@refs/heads/main";
const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json=(res,status,body)=>res.status(status).json(body);

async function trustedWorkflow(req) {
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) return false;
  try {
    const {payload}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
    return payload.repository==="hydrocephcare/story-weave-box"
      && payload.workflow_ref===WORKFLOW_REF
      && payload.ref==="refs/heads/main"
      && ["schedule","workflow_dispatch","push"].includes(String(payload.event_name||""));
  } catch { return false; }
}

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return json(res,405,{error:"POST only."});
  if(!(await trustedWorkflow(req))) return json(res,403,{error:"Trusted OmpathStudy publishing workflow required."});
  try {
    const sql=getPolishSql();
    const groq=String(process.env.GROQ_API_KEYS||process.env.GROQ_API_KEY||"");
    const gem=String(process.env.GEMINI_API_KEYS||process.env.GEMINI_API_KEY||"");
    if(!groq.trim()||!gem.trim()) return json(res,503,{error:"Groq and Gemini API keys are not configured."});
    if(!(await hasPolishWriteKey())) return json(res,503,{error:"The Cloudflare polishing key has not been synced to Neon. Open Admin → Polish and sync the existing Cloudflare secret."});

    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):req.body||{};
    const count=Math.max(1,Math.min(100,Number(body.count)||40));
    const onlyYear=Math.max(0,Math.min(6,Number(body.year)||0));
    const minutes=Math.max(1,Math.min(50,Number(body.minutes)||50));
    const started=Date.now(),deadline=started+minutes*60_000;
    const articles=await sql.query(`SELECT id,title,category,content,original_notes
      FROM public.articles
      WHERE published=true AND deleted_at IS NULL AND password_protected=false
        AND (scheduled_at IS NULL OR scheduled_at<=now())
      ORDER BY created_at ASC LIMIT 4000`);
    const prior=await sql.query("SELECT article_id,status,updated_at,ai_review_status,verdict FROM public.blog_polish ORDER BY updated_at DESC LIMIT 5000");
    const state=new Map(prior.map(x=>[x.article_id,x]));
    const hours=x=>(Date.now()-new Date(x.updated_at).getTime())/3_600_000;
    const eligible=a=>{
      const s=state.get(a.id);
      if(!s) return true;
      if(s.verdict==="irrelevant") return false;
      return (s.status==="failed"&&hours(s)>12)||(s.status==="partial"&&hours(s)>1)
        ||(s.status==="working"&&hours(s)>0.5)||(s.status==="done"&&s.ai_review_status!=="passed"&&hours(s)>12);
    };
    const order=a=>{const y=yearOf(a.category);return y?[0,2,1,3,4,5,6].indexOf(y):7;};
    const queue=articles.filter(a=>(!onlyYear||yearOf(a.category)===onlyYear)&&eligible(a)).sort((a,b)=>order(a)-order(b));
    const ask=(prompt,timeoutMs,maxTokens)=>askModel(prompt,{env:{GROQ_API_KEYS:groq},timeoutMs,maxTokens,plain:true}).then(r=>r.text);
    const save=async(id,row)=>{
      const allowed=new Set(["title","description","image_query","verdict","reason","model","content","status","ai_review_status","ai_review_model","ai_reviewed_at","ai_review_issues"]);
      const entries=Object.entries(row).filter(([key,value])=>allowed.has(key)&&value!==undefined);
      if(!entries.length)return;
      const set=entries.map(([key],i)=>`${key}=$${i+2}${key==="ai_review_issues"?"::jsonb":""}`).join(", ");
      const values=entries.map(([key,value])=>key==="ai_review_issues"?JSON.stringify(value??[]):value);
      await sql.query(`UPDATE public.blog_polish SET ${set},updated_at=now() WHERE article_id=$1`,[id,...values]);
    };

    let done=0,kept=0,failed=0,strikes=0,attempted=0;
    for(const a of queue) {
      if(done+kept+failed>=count||Date.now()>deadline||strikes>=3) break;
      const had=state.get(a.id);
      const claim=had
        ? await sql.query("UPDATE public.blog_polish SET status='working',updated_at=now() WHERE article_id=$1 AND status=$2 AND updated_at=$3 RETURNING article_id",[a.id,had.status,had.updated_at])
        : await sql.query("INSERT INTO public.blog_polish(article_id,status) VALUES($1,'working') ON CONFLICT(article_id) DO NOTHING RETURNING article_id",[a.id]);
      if(!claim.length) continue;
      attempted++;
      try {
        const result=await polishArticle(a,ask,{chunk:true});
        if(result.verdict==="irrelevant") {
          await save(a.id,{title:result.title,description:result.description,verdict:result.verdict,reason:result.reason||"Not medical study material; not AI-verified.",status:"done",ai_review_status:"held",ai_review_model:null,ai_reviewed_at:new Date().toISOString(),ai_review_issues:[{severity:"medium",where:"content type",problem:"Not medical study material.",fix:"No medical verification badge is applied."}]});
          kept++; continue;
        }
        if(result.status!=="done") {
          await save(a.id,{status:"partial",content:null,reason:result.reason||"The writer was interrupted; the daily queue will retry.",ai_review_status:null});
          failed++;strikes++;continue;
        }
        const review=await verifyBlogContent(a,result.content,{GROQ_API_KEYS:groq,GEMINI_API_KEYS:gem},{allowRepair:true,timeoutMs:50000});
        await save(a.id,{title:result.title,description:result.description,image_query:result.image_query,content:review.status==="passed"?review.content:null,verdict:result.verdict,reason:review.status==="held"?"Gemini verification held: "+(review.issues?.[0]?.problem||"review did not pass"):(result.reason||null),status:"done",model:"groq",ai_review_status:review.status,ai_review_model:review.model,ai_reviewed_at:review.at,ai_review_issues:review.issues||[]});
        strikes=0;
        if(review.status==="passed"&&result.content) done++;
        else if(review.status==="passed") kept++;
        else failed++;
      } catch(error) {
        failed++;strikes++;
        await save(a.id,{status:"failed",reason:String(error?.message??"failed").slice(0,200)});
      }
    }
    return json(res,200,{success:true,eligible:queue.length,attempted,polished:done,kept,failed,remaining:Math.max(0,queue.length-done-kept-failed),elapsedMs:Date.now()-started});
  } catch(error) {
    console.error("[blog-polish-batch]",error instanceof Error?error.message:String(error));
    return json(res,500,{error:"Automatic blog polishing failed. Check the backend health report."});
  }
}
