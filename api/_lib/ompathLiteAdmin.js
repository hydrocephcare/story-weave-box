/** Admin API for the Lite Health Support channel. */
const json=(res,status,body)=>res.status(status).json(body);
async function request(path,key){
 const base=process.env.SUPABASE_URL;
 const r=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{
  headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
  signal:AbortSignal.timeout(7000),
 });
 const body=await r.text();
 if(!r.ok)throw new Error(`Database request failed (${r.status})`);
 return body?JSON.parse(body):[];
}
export default async function liteAdmin(req,res){
 const url=process.env.SUPABASE_URL;
 const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const anonKey=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 if(!url||!serviceKey||!anonKey)return json(res,503,{error:"Lite admin is not configured."});
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!token)return json(res,401,{error:"Sign in required."});
 if(req.method!=="GET"&&req.method!=="POST")return json(res,405,{error:"Method not allowed."});
 try{
  const who=await fetch(`${url.replace(/\/$/,"")}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});
  if(!who.ok)return json(res,401,{error:"Session expired. Sign in again."});
  const user=await who.json();
  const roles=await fetch(`${url.replace(/\/$/,"")}/rest/v1/rpc/has_role`,{
   method:"POST",
   headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},
   body:JSON.stringify({_user_id:user.id,_role:"admin"}),
   signal:AbortSignal.timeout(5000),
  });
  if(!roles.ok||await roles.json()!==true)return json(res,403,{error:"Administrator access required."});
  if(req.method==="POST"){
   if(req.body?.action==="sandbox-test")return json(res,410,{error:"MCQ SMS has been retired. Lite now supports Health Support only."});
   if(req.body?.action==="save-settings"){
    const environment=req.body.environment==="production"?"production":"sandbox";
    const enabled=req.body.enabled===true;
    if(enabled&&environment!=="production")return json(res,400,{error:"Patient guide SMS can only be enabled in Live/Production. Sandbox is reserved for provider testing."});
    const senderId=String(req.body.sender_id||"").trim().slice(0,32)||null;
    if(enabled&&(!process.env.AT_LIVE_USERNAME||!process.env.AT_LIVE_API_KEY))return json(res,400,{error:"Patient guide SMS cannot be enabled until AT_LIVE_USERNAME and AT_LIVE_API_KEY are configured as Cloudflare Pages secrets."});
    const saved=await fetch(`${url.replace(/\/$/,"")}/rest/v1/lite_sms_settings?id=eq.1`,{
     method:"PATCH",
     headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json",Prefer:"return=representation"},
     body:JSON.stringify({enabled,environment,sender_id:senderId,updated_at:new Date().toISOString()}),
     signal:AbortSignal.timeout(7000),
    });
    if(!saved.ok)throw new Error("Could not save Lite Health Support SMS settings.");
    const rows=await saved.json();
    return json(res,200,{ok:true,settings:rows[0]});
   }
   return json(res,400,{error:"Unsupported admin action."});
  }
  const [healthEncounters,smsRows]=await Promise.all([
   request("lite_health_encounters?select=id,concern_category,status,urgency_level,channel,created_at,updated_at&order=created_at.desc&limit=200",serviceKey),
   request("lite_sms_settings?select=enabled,environment,sender_id,updated_at&id=eq.1&limit=1",serviceKey),
  ]);
  const smsSettings=smsRows[0]||{enabled:false,environment:"sandbox",sender_id:null};
  const stats={
   encounters:healthEncounters.length,
   emergency:healthEncounters.filter(x=>x.urgency_level==="emergency").length,
   urgent:healthEncounters.filter(x=>x.urgency_level==="urgent").length,
   awaiting:healthEncounters.filter(x=>["intake_started","awaiting_clarification","guide_pending"].includes(x.status)).length,
   completed:healthEncounters.filter(x=>x.status==="complete").length,
  };
  return json(res,200,{
   healthEncounters,
   smsSettings,
   smsCredentials:{production:!!(process.env.AT_LIVE_USERNAME&&process.env.AT_LIVE_API_KEY)},
   stats,
  });
 }catch(error){
  console.error("Lite Health Support admin API:",error instanceof Error?error.message:"unknown error");
  return json(res,500,{error:"Could not load OmpathStudy Lite Health Support data."});
 }
}
