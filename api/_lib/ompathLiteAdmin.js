/** Admin API for Lite operations and patient-guide clinical approval registry. */
const json=(res,status,body)=>res.status(status).json(body);
const clean=(v,max=300)=>String(v??"").trim().replace(/[<>]/g,"").slice(0,max);
async function request(path,key,options={}) {
 const base=process.env.SUPABASE_URL;
 const response=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{
  ...options, headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:options.prefer||"return=representation",...options.headers},
  signal:AbortSignal.timeout(7000),
 });
 const body=await response.text();
 if(!response.ok)throw new Error(`Database request failed (${response.status})`);
 return body?JSON.parse(body):[];
}
async function authenticate(req) {
 const url=process.env.SUPABASE_URL, serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const anonKey=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 if(!url||!serviceKey||!anonKey)throw Object.assign(new Error("Lite admin is not configured."),{status:503});
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!token)throw Object.assign(new Error("Sign in required."),{status:401});
 const who=await fetch(`${url.replace(/\/$/,"")}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});
 if(!who.ok)throw Object.assign(new Error("Session expired. Sign in again."),{status:401});
 const user=await who.json();
 const roles=await fetch(`${url.replace(/\/$/,"")}/rest/v1/rpc/has_role`,{
  method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},
  body:JSON.stringify({_user_id:user.id,_role:"admin"}),signal:AbortSignal.timeout(5000),
 });
 if(!roles.ok||await roles.json()!==true)throw Object.assign(new Error("Administrator access required."),{status:403});
 return {url,serviceKey,user};
}
const PATIENT_TYPES=["patient_guide","patient_information","health_guide","Patient Guide","Patient Information","Health Guide"];
export default async function liteAdmin(req,res) {
 try {
  const {serviceKey,user}=await authenticate(req);
  if(req.method==="GET") {
   const healthEncounters=await request("lite_health_encounters?select=id,concern_category,status,urgency_level,channel,created_at,updated_at&order=created_at.desc&limit=200",serviceKey);
   const articleFilter="in.("+PATIENT_TYPES.map(x=>'"'+x+'"').join(",")+")";
   const candidates=await request("articles?select=id,title,slug,content_type,verification_status,published,requires_review,deleted_at,updated_at&content_type="+encodeURIComponent(articleFilter)+"&deleted_at=is.null&order=updated_at.desc&limit=100",serviceKey);
   const approvals=await request("lite_patient_guide_approvals?select=article_id,status,patient_language,audience,reviewer_name,reviewer_qualification,registration_body,registration_number,reviewed_at,review_due_at,review_notes,article_updated_at_snapshot",serviceKey);
   const stats={encounters:healthEncounters.length,emergency:healthEncounters.filter(x=>x.urgency_level==="emergency").length,urgent:healthEncounters.filter(x=>x.urgency_level==="urgent").length,awaiting:healthEncounters.filter(x=>["intake_started","awaiting_clarification","guide_pending"].includes(x.status)).length,completed:healthEncounters.filter(x=>x.status==="complete").length};
   const smsSettings=await request("lite_sms_settings?select=enabled,environment,sender_id&id=eq.1&limit=1",serviceKey).catch(()=>[]);
   const runtimeRows=await request("lite_operations_settings?select=ussd_enabled,ai_enabled,ai_daily_limit,updated_at&id=eq.1&limit=1",serviceKey).catch(()=>[]);
   const runtime=runtimeRows[0]||{ussd_enabled:true,ai_enabled:false,ai_daily_limit:100};
   const smsDeliveries=healthEncounters.filter(x=>x.sms_sent_at).slice(0,50).map(x=>({id:x.id,status:x.status,sent_at:x.sms_sent_at,channel:x.channel}));
   const ready=(value)=>Boolean(value&&String(value).trim());
   const operations={
    ussd:{enabled:runtime.ussd_enabled===true,callbackSecret:ready(process.env.USSD_CALLBACK_SECRET),callbackPath:"/api/ompath-lite",networkProvider:"Africa's Talking",mode:"callback-driven"},
    sms:{databaseSettings:Boolean(smsSettings[0]),enabled:smsSettings[0]?.enabled===true,environment:smsSettings[0]?.environment||"not configured",providerUsername:ready(process.env.AT_LIVE_USERNAME),providerApiKey:ready(process.env.AT_LIVE_API_KEY),senderId:ready(smsSettings[0]?.sender_id||process.env.AT_SENDER_ID),senderIdValue:smsSettings[0]?.sender_id||process.env.AT_SENDER_ID||"",inboundSecret:ready(process.env.AT_INBOUND_SECRET),cronSecret:ready(process.env.CRON_SECRET)},
    ai:{enabled:runtime.ai_enabled===true&&process.env.LITE_AI_INTERPRETATION_ENABLED==="true",adminEnabled:runtime.ai_enabled===true,featureFlag:process.env.LITE_AI_INTERPRETATION_ENABLED==="true",dailyLimit:Number(runtime.ai_daily_limit)||0,groqConfigured:ready(process.env.GROQ_API_KEY||process.env.GROQ_API_KEYS),geminiConfigured:ready(process.env.GEMINI_API_KEY||process.env.GEMINI_API_KEYS),backgroundExecution:"waitUntil"},
    storage:{supabaseUrl:ready(process.env.SUPABASE_URL),serviceRoleKey:ready(process.env.SUPABASE_SERVICE_ROLE_KEY),adminAuth:"Supabase session + admin role"},
    safety:{liveSmsSentByDiagnostics:false,ussdTestUsesLiveNetwork:false,aiAffectsTriage:false}
   };
   return json(res,200,{healthEncounters,stats,guideCandidates:candidates,guideApprovals:approvals,operations,smsDeliveries});
  }
  if(req.method!=="POST")return json(res,405,{error:"Method not allowed."});
  const body=req.body&&typeof req.body==="object"?req.body:{};
  const action=clean(body.action,40);
  if(action==="operations_settings_update"){
   const ussd_enabled=body.ussd_enabled===true;
   const ai_enabled=body.ai_enabled===true;
   const ai_daily_limit=Math.max(0,Math.min(10000,Math.floor(Number(body.ai_daily_limit)||0)));
   if(ai_enabled&&!(process.env.GROQ_API_KEY||process.env.GROQ_API_KEYS||process.env.GEMINI_API_KEY||process.env.GEMINI_API_KEYS))return json(res,409,{error:"AI cannot be armed until a server-side Groq or Gemini credential is configured."});
   await request("lite_operations_settings?on_conflict=id",serviceKey,{method:"POST",body:JSON.stringify({id:1,ussd_enabled,ai_enabled,ai_daily_limit,updated_by:user.id,updated_at:new Date().toISOString()}),headers:{"Prefer":"resolution=merge-duplicates,return=representation"}});
   return json(res,200,{ok:true,settings:{ussd_enabled,ai_enabled,ai_daily_limit},effective_ai_enabled:ai_enabled&&process.env.LITE_AI_INTERPRETATION_ENABLED==="true",note:"Lite runtime settings saved."});
  }
  if(action==="sms_settings_update"){
   const enabled=body.enabled===true;
   const environment=body.environment==="production"?"production":"sandbox";
   const sender_id=clean(body.sender_id,32)||null;
   if(enabled&&environment==="production"&&(!process.env.AT_LIVE_USERNAME||!process.env.AT_LIVE_API_KEY))return json(res,409,{error:"Live SMS cannot be enabled until the Africa's Talking live username and API key are configured as server secrets."});
   await request("lite_sms_settings?on_conflict=id",serviceKey,{method:"POST",body:JSON.stringify({id:1,enabled,environment,sender_id}),headers:{"Prefer":"resolution=merge-duplicates,return=representation"}});
   return json(res,200,{ok:true,settings:{enabled,environment,sender_id},note:"SMS settings saved. No message was sent."});
  }
  if(action==="ussd_menu_test"){
   const {default:ussdHandler}=await import("./ompathLite.js");
   const testResponse={statusCode:200,body:"",headers:{},status(code){this.statusCode=code;return this;},setHeader(name,value){this.headers[name]=value;},send(value){this.body=value;return this;}};
   await ussdHandler({method:"POST",body:{phoneNumber:"+254700000000",sessionId:"ADMIN-SIMULATION",text:""},query:{}},testResponse);
   return json(res,200,{ok:testResponse.statusCode===200,mode:"local_simulation",response:testResponse.body,liveNetwork:false});
  }
  if(action==="sms_readiness_test"){
   const rows=await request("lite_sms_settings?select=enabled,environment,sender_id&id=eq.1&limit=1",serviceKey).catch(()=>[]);
   const settings=rows[0]||null;
   return json(res,200,{ok:Boolean(settings&&settings.enabled===true&&settings.environment==="production"&&process.env.AT_LIVE_USERNAME&&process.env.AT_LIVE_API_KEY),mode:"readiness_only",liveSmsSent:false,settings:settings?{enabled:settings.enabled,environment:settings.environment,sender_id_configured:Boolean(settings.sender_id||process.env.AT_SENDER_ID)}:null,credentials:{usernameConfigured:Boolean(process.env.AT_LIVE_USERNAME),apiKeyConfigured:Boolean(process.env.AT_LIVE_API_KEY)}});
  }
  if(action==="ai_readiness_test"){
   const provider=process.env.GROQ_API_KEY||process.env.GROQ_API_KEYS?"Groq":process.env.GEMINI_API_KEY||process.env.GEMINI_API_KEYS?"Gemini":"none";
   return json(res,200,{ok:provider!=="none",enabled:process.env.LITE_AI_INTERPRETATION_ENABLED==="true",provider,mode:"configuration_check_only",modelRequestSent:false});
  }
  const articleId=clean(body.article_id,36);
  if(!/^[0-9a-f-]{36}$/i.test(articleId)||!["approve","reject","suspend","pending"].includes(action))return json(res,400,{error:"Invalid article or review action."});
  const articleRows=await request("articles?select=id,title,slug,content_type,verification_status,published,requires_review,deleted_at,updated_at&id=eq."+articleId+"&limit=1",serviceKey);
  const article=articleRows[0];
  if(!article||article.deleted_at||article.published!==true||article.requires_review!==false||!["reviewed","verified"].includes(article.verification_status)||!PATIENT_TYPES.includes(article.content_type))return json(res,409,{error:"This article is not currently eligible for patient-guide review. It must be published, patient-facing, and reviewed on the main site first."});
  const status={approve:"approved",reject:"rejected",suspend:"suspended",pending:"pending"}[action];
  const payload={article_id:articleId,status,updated_at:new Date().toISOString(),review_notes:clean(body.review_notes,1500)||null};
  if(action==="approve"){
   const reviewer_name=clean(body.reviewer_name,120),reviewer_qualification=clean(body.reviewer_qualification,120),registration_body=clean(body.registration_body,120),registration_number=clean(body.registration_number,80);
   const dueDays=Math.max(30,Math.min(365,Number(body.review_due_days)||180));
   if(reviewer_name.length<3||reviewer_qualification.length<3||registration_body.length<2||registration_number.length<2||body.reviewer_attested!==true)return json(res,400,{error:"Approval requires reviewer identity, professional qualification, registration body and number, and explicit attestation."});
   Object.assign(payload,{patient_language:body.patient_language==="sw"?"sw":"en",audience:["general","adult_women","pregnancy","postpartum","adolescent","caregiver"].includes(body.audience)?body.audience:"general",reviewer_user_id:user.id,reviewer_name,reviewer_qualification,registration_body,registration_number,reviewer_attested:true,reviewed_at:new Date().toISOString(),review_due_at:new Date(Date.now()+dueDays*86400000).toISOString(),article_updated_at_snapshot:article.updated_at});
  } else {
   Object.assign(payload,{reviewer_user_id:user.id,reviewed_at:new Date().toISOString(),review_due_at:null,article_updated_at_snapshot:null,reviewer_attested:false});
  }
  const saved=await request("lite_patient_guide_approvals?on_conflict=article_id",serviceKey,{method:"POST",body:JSON.stringify(payload),headers:{"Prefer":"resolution=merge-duplicates,return=representation"}});
  return json(res,200,{ok:true,approval:saved[0]||null});
 } catch(error) {
  const status=Number(error?.status)||500;
  if(status>=500)console.error("Lite Health Support admin API:",error instanceof Error?error.message:"unknown error");
  return json(res,status,{error:status===500?"Could not process the Health Support admin request.":error.message});
 }
}
