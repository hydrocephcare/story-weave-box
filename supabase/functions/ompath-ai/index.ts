import { generateReviewedTopicPage, validName, slugOf } from "./topicAi.js";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const ALLOWED = new Set(["https://www.ompathstudy.com","https://ompathstudy.com","https://stories.ompathstudy.com"]);
const headers = (origin: string) => ({
  ...(ALLOWED.has(origin) ? {"Access-Control-Allow-Origin":origin} : {}),
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-neon-authorization",
  "Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"
});
const reply = (data:unknown,status=200,origin="") => new Response(JSON.stringify(data),{
  status,headers:{...headers(origin),"Content-Type":"application/json","Cache-Control":"no-store"}
});
const JWKS_URL=Deno.env.get("NEON_AUTH_JWKS_URL")||"";
const DATA_API_URL=(Deno.env.get("NEON_DATA_API_URL")||"").replace(/\/+$/,"");
const jwks=JWKS_URL?createRemoteJWKSet(new URL(JWKS_URL)):null;

const split=(v:unknown)=>[...new Set(String(v??"").split(/[\s,]+/).map(k=>k.trim()).filter(Boolean))];
let turn=0;
const cooldown=new Map<string,number>();
const GEM=["gemini-3.5-flash","gemini-flash-lite-latest","gemini-2.5-flash","gemini-2.5-flash-lite"];
const GROQ=["openai/gpt-oss-120b","qwen/qwen3.8-27b","openai/gpt-oss-20b"];
const rotate=(a:any[],n:number,size:number)=>a.length?[...a.slice((n*size)%a.length),...a.slice(0,(n*size)%a.length)]:a;

async function chatText(env:Record<string,string>,messages:any[],temperature:number,maxTokens:number,timeoutMs:number,maxAttempts=0,preferGroq=false) {
  // Accept comma/newline-separated lists and individually named secrets,
  // e.g. GROQ_API_KEY_1, GROQ_API_KEY_2, GEMINI_API_KEY_1.
  const collectKeys=(provider:string)=>{
    const pattern=new RegExp("^"+provider+"_API_KEYS?(?:_\\d+)?$");
    return [...new Set(Object.keys(env).filter(name=>pattern.test(name)).sort()
      .flatMap(name=>split(env[name])))];
  };
  const g0=collectKeys("GROQ");
  const extra=split(env.GROQ_API_KEYS_EXTRA).filter(k=>!g0.includes(k));
  const g=[...g0,...extra];
  const m=collectKeys("GEMINI");
  console.log("Ompath AI provider key inventory",{groq:g.length,gemini:m.length});
  const entries=(keys:string[],url:string,models:string[])=>keys.flatMap((key,ki)=>models.map(model=>({key,url,model,id:model+":"+ki})));
  const gem=entries(m,"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",GEM);
  const groq=entries(g,"https://api.groq.com/openai/v1/chat/completions",GROQ);
  if(!gem.length&&!groq.length) throw new Error("No AI provider keys configured");
  const n=turn++,first=preferGroq||n%2===1||!gem.length;
  const A=rotate(first?groq:gem,Math.floor(n/2),first?GROQ.length:GEM.length);
  const B=rotate(first?gem:groq,Math.floor(n/2),first?GEM.length:GROQ.length);
  const all=[...A,...B],now=Date.now();
  const ordered=[...all.filter(t=>(cooldown.get(t.id)||0)<=now),...all.filter(t=>(cooldown.get(t.id)||0)>now)];
  const errors:string[]=[];
  let attempted=0;
  for(const p of ordered) {
    if(maxAttempts>0&&attempted>=maxAttempts)break;
    attempted++;
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
    try {
      const r=await fetch(p.url,{method:"POST",headers:{Authorization:"Bearer "+p.key,"Content-Type":"application/json"},body:JSON.stringify({model:p.model,messages,temperature,max_tokens:maxTokens}),signal:ctl.signal});
      if(r.ok) {
        const answer=(await r.json())?.choices?.[0]?.message?.content;
        if(typeof answer==="string"&&answer.trim()) return answer;
        errors.push(p.model+":empty");continue;
      }
      const providerDetail=(await r.text()).slice(0,240).replaceAll(p.key,"[redacted]");
      errors.push(p.model+":"+r.status+":"+providerDetail);
      if(r.status===429)cooldown.set(p.id,Date.now()+60000);
      if(r.status===404)cooldown.set(p.id,Date.now()+3600000);
    } catch(e) { errors.push(p.model+":"+String(e).slice(0,80)); }
    finally { clearTimeout(timer); }
  }
  throw new Error("Provider fallback exhausted: "+errors.slice(-8).join("; "));
}

async function authenticate(req:Request) {
  const token=(req.headers.get("x-neon-authorization")||req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token||!jwks)return null;
  try {
    const {payload}=await jwtVerify(token,jwks);
    if(!payload.sub||!/^[0-9a-f-]{36}$/i.test(String(payload.sub)))return null;
    return token;
  } catch { return null; }
}
async function entitlement(token:string,feature:string) {
  const r=await fetch(DATA_API_URL+"/rpc/consume_feature",{
    method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({p_feature:feature,p_units:1}),signal:AbortSignal.timeout(10000)
  });
  if(r.status===401||r.status===403)return {ok:false,status:401,reason:"invalid_session"};
  if(!r.ok)return {ok:false,status:503,reason:"verification_unavailable"};
  const data=await r.json();
  return data?.allowed?{ok:true,quota:data}:{ok:false,status:402,reason:"limit",quota:data};
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=="POST")return reply({error:"POST only"},405,origin);
  if(origin&&!ALLOWED.has(origin))return reply({error:"origin_not_allowed"},403,origin);
  if(!JWKS_URL||!DATA_API_URL)return reply({error:"neon_auth_not_configured",detail:"Set NEON_AUTH_JWKS_URL and NEON_DATA_API_URL."},503,origin);
  const token=await authenticate(req);
  if(!token)return reply({error:"login_required"},401,origin);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return reply({error:"invalid_json"},400,origin);
  const env=Deno.env.toObject();
  if(!env.GROQ_API_KEYS&&!env.GROQ_API_KEY&&!env.GEMINI_API_KEYS&&!env.GEMINI_API_KEY&&!env.GROQ_API_KEYS_EXTRA)
    return reply({error:"ai_provider_not_configured"},503,origin);

  // Full topic generation runs on Supabase. Neon remains the source of truth for topic_pages.
  if(body.task==="topic") {
    const name=String(body.name??"").trim();
    const category=String(body.category??"").slice(0,60);
    const context=String(body.context??"").slice(0,3000);
    if(!validName(name))return reply({status:"invalid"},400,origin);
    const slug=slugOf(name);
    // Return an already-published topic immediately; only new topics pay the two-model generation/review cost.
    try {
      const cached=await fetch(DATA_API_URL+"/topic_pages?slug=eq."+encodeURIComponent(slug)+"&select=status,content&limit=1",{
        headers:{Authorization:"Bearer "+token,Accept:"application/json"},
        signal:AbortSignal.timeout(5000)
      });
      if(cached.ok) {
        const rows=await cached.json();
        const existing=Array.isArray(rows)?rows[0]:null;
        if(existing?.status==="published"&&existing.content) {
          return reply({status:"published",page:existing.content,saved:true,slug,name,existing:true},200,origin);
        }
      } else {
        console.warn("Topic cache lookup unavailable",cached.status);
      }
    } catch(e) {
      console.warn("Topic cache lookup timed out",String(e).slice(0,120));
    }
    const quota=await entitlement(token,"topic_page_generation");
    if(!quota.ok)return reply({status:quota.reason,upgrade_required:quota.status===402,quota:quota.quota},quota.status,origin);
    try {
      const generated=await generateReviewedTopicPage({name,category,context,choices:body.choices&&typeof body.choices==="object"?body.choices:undefined,env,fetchImpl:fetch},{env,fetchImpl:fetch,timeoutMs:75000});
      const page=generated.page;
      if(!page?.medical)return reply({status:"rejected"},422,origin);
      if(page.aiReview?.status!=="passed"||!page.aiReview?.model)return reply({status:"failed",reason:"review"},502,origin);
      const saved=await fetch(DATA_API_URL+"/rpc/publish_topic_page",{
        method:"POST",
        headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({p_slug:slug,p_name:name,p_category:category,p_content:page,p_model:page.model||"groq"}),
        signal:AbortSignal.timeout(15000)
      });
      if(!saved.ok) {
        const detail=(await saved.text()).slice(0,240);
        console.error("Topic persistence failed",saved.status,detail);
        return reply({status:"failed",reason:"persistence"},502,origin);
      }
      const result=await saved.json();
      if(!result?.ok)return reply({status:"failed",reason:result?.reason||"persistence"},502,origin);
      return reply({status:"published",page,saved:true,slug,name,quota:quota.quota},200,origin);
    } catch(e) {
      console.error("Ompath topic generation failed",String(e).slice(0,400));
      return reply({status:"failed",reason:"generation"},502,origin);
    }
  }

  if(body.task==="search_predict") {
    const query=String(body.query??"").trim().slice(0,180);
    if(query.length<3)return reply({predictions:[]},200,origin);
    const quota=await entitlement(token,"search_prediction");
    if(!quota.ok)return reply({predictions:[],quota_limited:true},200,origin);
    try {
      const prompt='You are a medical-study search query predictor. Do not answer the question. Infer the most likely medical subject and return only JSON: {"queries":[string]}. Give at most three short alternate search queries using standard medical terminology, synonyms, common abbreviations or likely corrected spelling. Preserve the intended subject; do not broaden to unrelated topics, invent a year level, or include explanations. If the query is already clear and needs no expansion, return an empty array.\nQUERY: '+query;
      const raw=await chatText(env,[{role:"system",content:"Return valid JSON only. Be conservative and precise."},{role:"user",content:prompt}],0.1,420,3000,4,true);
      const match=raw.match(/\{[\s\S]*\}/);
      const parsed=match?JSON.parse(match[0]):{};
      const predictions=[...new Set((Array.isArray(parsed.queries)?parsed.queries:[])
        .map((x:any)=>String(x??"").trim()).filter((x:string)=>x.length>=3&&x.length<=100&&x.toLowerCase()!==query.toLowerCase()))].slice(0,3);
      return reply({predictions},200,origin);
    } catch(e) {
      console.warn("Search prediction unavailable",String(e).slice(0,160));
      return reply({predictions:[]},200,origin);
    }
  }

  const feature=String(body.feature||"").trim();
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(feature))return reply({error:"feature_required"},400,origin);
  const messages=Array.isArray(body.messages)?body.messages.slice(-20):[];
  const clean=messages.filter((m:any)=>m&&["system","user","assistant"].includes(m.role)&&typeof m.content==="string")
    .map((m:any)=>({role:m.role,content:m.content.slice(0,12000)})).filter((m:any)=>m.content);
  if(!clean.length||!clean.some((m:any)=>m.role==="user"))return reply({error:"valid_user_message_required"},400,origin);
  const quota=await entitlement(token,feature);
  if(!quota.ok)return reply({error:quota.reason,upgrade_required:quota.status===402,quota:quota.quota},quota.status,origin);
  try {
    const answer=await chatText(env,clean,Math.min(1.5,Math.max(0,Number(body.temperature)||0.2)),
      Math.min(8192,Math.max(128,Math.floor(Number(body.max_tokens)||3000))),
      Math.min(90000,Math.max(10000,Number(body.timeout_ms)||60000)));
    return reply({id:"ompath-"+crypto.randomUUID(),object:"chat.completion",created:Math.floor(Date.now()/1000),
      model:"ompathstudy-auto",choices:[{index:0,message:{role:"assistant",content:answer},finish_reason:"stop"}],
      usage:null,provider:"automatic",quota:quota.quota},200,origin);
  } catch(e) {
    console.error("Ompath AI provider failure",String(e).slice(0,250));
    return reply({error:"ai_temporarily_unavailable",message:"All configured AI providers are temporarily unavailable. Please retry shortly."},503,origin);
  }
});
