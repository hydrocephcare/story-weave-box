/** Admin API for de-identified Lite Health Support monitoring. */
const json=(res,status,body)=>res.status(status).json(body);
async function request(path,key){
 const base=process.env.SUPABASE_URL;
 const response=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{
  headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
  signal:AbortSignal.timeout(7000),
 });
 const body=await response.text();
 if(!response.ok)throw new Error(`Database request failed (${response.status})`);
 return body?JSON.parse(body):[];
}
export default async function liteAdmin(req,res){
 const url=process.env.SUPABASE_URL;
 const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const anonKey=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 if(!url||!serviceKey||!anonKey)return json(res,503,{error:"Lite admin is not configured."});
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!token)return json(res,401,{error:"Sign in required."});
 if(req.method!=="GET")return json(res,405,{error:"Method not allowed."});
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
  const healthEncounters=await request("lite_health_encounters?select=id,concern_category,status,urgency_level,channel,created_at,updated_at&order=created_at.desc&limit=200",serviceKey);
  const stats={
   encounters:healthEncounters.length,
   emergency:healthEncounters.filter(x=>x.urgency_level==="emergency").length,
   urgent:healthEncounters.filter(x=>x.urgency_level==="urgent").length,
   awaiting:healthEncounters.filter(x=>["intake_started","awaiting_clarification","guide_pending"].includes(x.status)).length,
   completed:healthEncounters.filter(x=>x.status==="complete").length,
  };
  return json(res,200,{healthEncounters,stats});
 }catch(error){
  console.error("Lite Health Support admin API:",error instanceof Error?error.message:"unknown error");
  return json(res,500,{error:"Could not load OmpathStudy Lite Health Support data."});
 }
}
