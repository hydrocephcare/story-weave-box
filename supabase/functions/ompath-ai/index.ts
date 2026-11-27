import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const ALLOWED = new Set(["https://www.ompathstudy.com","https://ompathstudy.com","https://stories.ompathstudy.com"]);
const headers = (origin: string) => ({
  ...(ALLOWED.has(origin) ? {"Access-Control-Allow-Origin":origin} : {}),
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
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

async function chatText(env:Record<string,string>,messages:any[],temperature:number,maxTokens:number,timeoutMs:number) {
  const g0=split(env.GROQ_API_KEYS||env.GROQ_API_KEY);
  const extra=split(env.GROQ_API_KEYS_EXTRA).filter(k=>!g0.includes(k));
  const g=g0.length?[...g0.slice(0,-1),...extra,g0[g0.length-1]]:extra;
  const m=split(env.GEMINI_API_KEYS||env.GEMINI_API_KEY);
  const entries=(keys:string[],url:string,models:string[])=>keys.flatMap((key,ki)=>models.map(model=>({key,url,model,id:model+":"+ki})));
  const gem=entries(m,"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",GEM);
  const groq=entries(g,"https://api.groq.com/openai/v1/chat/completions",GROQ);
  if(!gem.length&&!groq.length) throw new Error("No AI provider keys configured");
  const n=turn++,first=n%2===1||!gem.length;
  const A=rotate(first?groq:gem,Math.floor(n/2),first?GROQ.length:GEM.length);
  const B=rotate(first?gem:groq,Math.floor(n/2),first?GEM.length:GROQ.length);
  const all=[...A,...B],now=Date.now();
  const ordered=[...all.filter(t=>(cooldown.get(t.id)||0)<=now),...all.filter(t=>(cooldown.get(t.id)||0)>now)];
  const errors:string[]=[];
  for(const p of ordered) {
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
    try {
      const r=await fetch(p.url,{method:"POST",headers:{Authorization:"Bearer "+p.key,"Content-Type":"application/json"},body:JSON.stringify({model:p.model,messages,temperature,max_tokens:maxTokens}),signal:ctl.signal});
      if(r.ok) {
        const answer=(await r.json())?.choices?.[0]?.message?.content;
        if(typeof answer==="string"&&answer.trim()) return answer;
        errors.push(p.model+":empty");continue;
      }
      errors.push(p.model+":"+r.status);
      if(r.status===429)cooldown.set(p.id,Date.now()+60000);
      if(r.status===404)cooldown.set(p.id,Date.now()+3600000);
    } catch(e) { errors.push(p.model+":"+String(e).slice(0,80)); }
    finally { clearTimeout(timer); }
  }
  throw new Error("Provider fallback exhausted: "+errors.slice(-8).join("; "));
}

async function authenticate(req:Request) {
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
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
  const feature=String(body.feature||"").trim();
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(feature))return reply({error:"feature_required"},400,origin);
  const messages=Array.isArray(body.messages)?body.messages.slice(-20):[];
  const clean=messages.filter((m:any)=>m&&["system","user","assistant"].includes(m.role)&&typeof m.content==="string")
    .map((m:any)=>({role:m.role,content:m.content.slice(0,12000)})).filter((m:any)=>m.content);
  if(!clean.length||!clean.some((m:any)=>m.role==="user"))return reply({error:"valid_user_message_required"},400,origin);
  const env=Deno.env.toObject();
  if(!env.GROQ_API_KEYS&&!env.GROQ_API_KEY&&!env.GEMINI_API_KEYS&&!env.GEMINI_API_KEY&&!env.GROQ_API_KEYS_EXTRA)
    return reply({error:"ai_provider_not_configured",detail:"Add GROQ_API_KEYS and/or GEMINI_API_KEYS to Supabase Edge Function secrets."},503,origin);
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
