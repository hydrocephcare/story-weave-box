import { generateReviewedTopicPage, validName, slugOf, askModel, askGroqModel, askGeminiModel, providerKeys } from "./topicAi.js";
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
const publicAssistHits=new Map<string,number[]>();
const publicTranscribeHits=new Map<string,number[]>();
const GEM=["gemini-3.5-flash","gemini-flash-lite-latest","gemini-2.5-flash","gemini-2.5-flash-lite"];
const GROQ=["openai/gpt-oss-120b","qwen/qwen3.8-27b","openai/gpt-oss-20b"];
const rotate=(a:any[],n:number,size:number)=>a.length?[...a.slice((n*size)%a.length),...a.slice(0,(n*size)%a.length)]:a;

async function chatText(env:Record<string,string>,messages:any[],temperature:number,maxTokens:number,timeoutMs:number) {
  const prompt=messages.map(m=>String(m.content||"")).join("\n\n");
  const result=await askModel(prompt,{env,fetchImpl:fetch,timeoutMs,maxTokens,plain:true,temperature});
  return result.text;
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
const githubJwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
async function authenticateWorkflow(req:Request) {
  const token=(req.headers.get("x-github-oidc")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return false;
  try {
    const {payload}=await jwtVerify(token,githubJwks,{issuer:"https://token.actions.githubusercontent.com",audience:"ompathstudy-topic-maintenance"});
    const allowed=new Set([
      "hydrocephcare/story-weave-box/.github/workflows/topics-daily.yml@refs/heads/main",
      "hydrocephcare/story-weave-box/.github/workflows/zone-daily.yml@refs/heads/main"
    ]);
    return payload.repository==="hydrocephcare/story-weave-box"&&payload.ref==="refs/heads/main"&&allowed.has(String(payload.workflow_ref||""))&&["push","schedule","workflow_dispatch"].includes(String(payload.event_name||""));
  } catch { return false; }
}
async function hasAdminRole(token:string) {
  try {
    const {payload}=await jwtVerify(token,jwks!);
    const response=await fetch(DATA_API_URL+"/rpc/has_role",{
      method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({_user_id:payload.sub,_role:"admin"}),signal:AbortSignal.timeout(8000)
    });
    return response.ok&&(await response.json())===true;
  } catch { return false; }
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
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return reply({error:"invalid_json"},400,origin);
  const env=Deno.env.toObject();
  if(body.task==="public_transcribe") {
    const ip=req.headers.get("x-client-ip")||req.headers.get("cf-connecting-ip")||String(req.headers.get("x-forwarded-for")||"").split(",")[0]||"unknown";
    const now=Date.now(),recent=(publicTranscribeHits.get(ip)||[]).filter(t=>now-t<3600000);
    if(recent.length>=240)return reply({error:"rate_limited",message:"Too many voice clips this hour. Try again later."},429,origin);
    recent.push(now);publicTranscribeHits.set(ip,recent);if(publicTranscribeHits.size>5000)publicTranscribeHits.clear();
    const audio=String(body.audio||"");
    if(audio.length<400)return reply({error:"No sound was received."},400,origin);
    if(audio.length>3800000)return reply({error:"That clip is too long."},413,origin);
    const mime=String(body.mime||"audio/webm").slice(0,40);
    const hint=String(body.hint||"").replace(/\s+/g," ").trim().slice(0,400);
    const ext=/mp4|m4a|aac/i.test(mime)?"m4a":/ogg/i.test(mime)?"ogg":/wav/i.test(mime)?"wav":/mpeg|mp3/i.test(mime)?"mp3":"webm";
    const keys=providerKeys(env,"GROQ").reverse();
    if(!keys.length)return reply({error:"Voice transcription is not configured."},503,origin);
    let lastStatus=0;
    try {
      const bytes=Uint8Array.from(atob(audio),c=>c.charCodeAt(0));
      for(const key of keys)for(const model of ["whisper-large-v3-turbo","whisper-large-v3"]) {
        try {
          const form=new FormData();
          form.append("file",new Blob([bytes],{type:mime}),"clip."+ext);
          form.append("model",model);form.append("language","en");form.append("temperature","0");form.append("response_format","json");
          if(hint)form.append("prompt",hint);
          const response=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+key},body:form,signal:AbortSignal.timeout(25000)});
          if(response.ok) {
            const text=String((await response.json())?.text||"").replace(/\s+/g," ").trim();
            return reply({text:/^(thank you[.!]?|thanks for watching[.!]?|you)$/i.test(text)?"":text},200,origin);
          }
          lastStatus=response.status;
          if(response.status===400)return reply({error:"That recording could not be read."},400,origin);
        } catch(e) { console.warn("Whisper attempt failed",String(e).slice(0,100)); }
      }
    } catch(e) { console.warn("Whisper request failed",String(e).slice(0,100)); }
    return reply({error:"The voice service is busy ("+lastStatus+"). Try again."},502,origin);
  }
  if(body.task==="public_assist") {
    const ip=req.headers.get("cf-connecting-ip")||String(req.headers.get("x-forwarded-for")||"").split(",")[0]||"unknown";
    const now=Date.now(),recent=(publicAssistHits.get(ip)||[]).filter(t=>now-t<3600000);
    if(recent.length>=20)return reply({error:"rate_limited",message:"You have used the writing helper a lot this hour. Please try again later."},429,origin);
    recent.push(now);publicAssistHits.set(ip,recent);if(publicAssistHits.size>5000)publicAssistHits.clear();
    const mode=String(body.mode||"");
    const clip=(v:any,n:number)=>String(v??"").replace(/\r/g,"").trim().slice(0,n);
    let system="",user="",maxTokens=600,timeoutMs=20000;
    if(mode==="bio") {
      const year=Number(body.year),level=year===7?"a finalist":year>=1&&year<=6?"a Year "+year+" student":"a medical student";
      const university=clip(body.university,60),name=clip(body.name,60),notes=clip(body.notes,400).replace(/"/g,"'");
      system='Write a short first-person author bio, 2–3 warm natural sentences, at most 280 characters. Use ONLY these facts: '+level+(university?' at '+university:'')+(name?', name '+name:'')+(notes?', and what they said: "'+notes+'"':'')+'. Do not invent hobbies, achievements, specialities or numbers. Return ONLY JSON: {"text":"..."}';
      user="Write my note.";
    } else if(mode==="story") {
      user=clip(body.text,12000);if(user.length<80)return reply({error:"Write a little more first, then ask for help."},400,origin);
      system='You are an editor for a broad community publication. Polish the writer’s story. Keep every fact, event, name and opinion; preserve their own voice, first person and tone; do not add events, advice, lessons or statistics; do not make it longer than 110% of the original. Fix spelling, grammar and punctuation, split run-on blocks into clear paragraphs, and keep list items. No headings, markdown symbols or commentary. Return ONLY JSON: {"text":"the polished story, paragraphs separated by a blank line"}.';
      maxTokens=6000;timeoutMs=50000;
    } else if(mode==="titles") {
      user=clip(body.text,6000);if(user.length<80)return reply({error:"Write a little more first, then ask for title ideas."},400,origin);
      system='Suggest four short, honest titles (maximum 70 characters each) for this story. They should sound human, not like an advert, and use only what is in the story. Return ONLY JSON: {"titles":["...","...","...","..."]}.';
    } else if(mode==="caption") {
      const near=clip(body.text,1200),file=clip(body.name,80).replace(/[_-]+/g," ").replace(/\.[a-z0-9]+$/i,"");
      system='Write one short caption (maximum 120 characters) for a picture a contributor is adding to a story. Use only nearby story text and the file name. Do not claim to see details you cannot know or invent facts. Plain words, no quotes or hashtags. Return ONLY JSON: {"text":"the caption"}.';
      user="Nearby text: "+(near||"(none)")+"\nFile name: "+(file||"(none)");
    } else return reply({error:"unknown_mode"},400,origin);
    try {
      const result=await askModel(system+"\n\n"+user,{env,fetchImpl:fetch,timeoutMs,maxTokens,plain:false,temperature:0.4});
      const parsed=JSON.parse(result.text);
      if(mode==="titles") {
        const titles=Array.isArray(parsed?.titles)?parsed.titles.map((x:any)=>clip(x,90)).filter(Boolean).slice(0,4):[];
        return titles.length?reply({titles},200,origin):reply({error:"no_title_ideas"},502,origin);
      }
      const text=clip(parsed?.text,mode==="story"?14000:320);
      return text?reply({text},200,origin):reply({error:"empty_assist"},502,origin);
    } catch(e) {
      console.warn("Public story-assist unavailable",String(e).slice(0,160));
      return reply({error:"assist_unavailable",message:"The writing helper is temporarily unavailable. Please try again."},503,origin);
    }
  }
  const workflowAuthenticated=body.task==="provider_call" ? await authenticateWorkflow(req) : false;
  const token=await authenticate(req);
  if(!token&&!workflowAuthenticated)return reply({error:"login_required"},401,origin);
  if(body.task==="provider_call") {
    const workflow=workflowAuthenticated;
    let token=null;
    if(!workflow) {
      token=await authenticate(req);
      if(!token)return reply({error:"login_required"},401,origin);
      const feature=String(body.feature||"").trim();
      if(feature) {
        if(!["ai_flashcard_generation","ai_mcq_generation","ai_note_generation","search_prediction","ompath_ai_questions"].includes(feature))
          return reply({error:"feature_not_allowed"},403,origin);
        const quota=await entitlement(token,feature);
        if(!quota.ok)return reply({error:quota.reason,upgrade_required:quota.status===402,quota:quota.quota},quota.status,origin);
      } else if(!await hasAdminRole(token)) {
        return reply({error:"admin_required"},403,origin);
      }
    }
    const provider=String(body.provider||"auto");
    if(!["auto","groq","gemini"].includes(provider))return reply({error:"invalid_provider"},400,origin);
    const prompt=String(body.prompt||"").slice(0,26000);
    if(prompt.length<2)return reply({error:"prompt_required"},400,origin);
    try {
      const options={env,fetchImpl:fetch,timeoutMs:Math.min(90000,Math.max(3000,Number(body.timeoutMs)||50000)),
        maxTokens:Math.min(12000,Math.max(32,Number(body.maxTokens)||3500)),plain:body.plain===true,
        temperature:Math.min(1.5,Math.max(0,Number(body.temperature)||0.3))};
      const result=provider==="groq"?await askGroqModel(prompt,options):provider==="gemini"?await askGeminiModel(prompt,options):await askModel(prompt,options);
      return reply({text:result.text,model:result.model||provider,provider},200,origin);
    } catch(e) {
      console.error("Supabase provider proxy failed",provider,String(e).slice(0,240));
      return reply({error:"provider_unavailable",detail:String(e).slice(0,180)},503,origin);
    }
  }
  if(body.task==="health") {
    const token=await authenticate(req);
    if(!token)return reply({error:"login_required"},401,origin);
    if(!await hasAdminRole(token))return reply({error:"admin_required"},403,origin);
    const probe=async(provider:string)=> {
      try {
        const prompt='Return only this JSON object: {"ok":true}';
        const result=provider==="groq"?await askGroqModel(prompt,{env,fetchImpl:fetch,timeoutMs:12000,maxTokens:80}):await askGeminiModel(prompt,{env,fetchImpl:fetch,timeoutMs:12000,maxTokens:80});
        return {ok:Boolean(result.text?.trim()),model:result.model||null};
      } catch(e) { return {ok:false,error:String(e).slice(0,180)}; }
    };
    const [groq,gemini,storage]=await Promise.all([
      probe("groq"),probe("gemini"),
      (async()=>{try{const r=await fetch(DATA_API_URL+"/topic_pages?select=slug&limit=1",{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(8000)});return {ok:r.ok,status:r.status};}catch{return {ok:false,status:0};}})()
    ]);
    const g=providerKeys(env,"GROQ"),m=providerKeys(env,"GEMINI");
    return reply({ok:groq.ok||gemini.ok,checkedAt:new Date().toISOString(),
      providers:{groq:{...groq,configuredKeys:g.length},gemini:{...gemini,configuredKeys:m.length}},
      neonStorage:storage,auth:{ok:true},functionVersion:"ompath-ai"},200,origin);
  }
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
