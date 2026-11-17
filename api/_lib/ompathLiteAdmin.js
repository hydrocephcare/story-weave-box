/** Admin API for the Lite channel. The source MCQ library remains public.mcq_sets. */\nimport { sendAdminSandboxTest } from "./ompathLiteSms.js";
const json=(res,status,body)=>res.status(status).json(body);
async function request(path,key){
 const base=process.env.SUPABASE_URL;
 const r=await fetch(`${base.replace(/\/$/,"")}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"}});
 const body=await r.text();if(!r.ok)throw new Error(`Database request failed (${r.status})`);return body?JSON.parse(body):[];
}
export default async function liteAdmin(req,res){
 const url=process.env.SUPABASE_URL, serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const anonKey=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 if(!url||!serviceKey||!anonKey)return json(res,503,{error:"Lite admin is not configured."});
 const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!token)return json(res,401,{error:"Sign in required."});
 if(req.method!=="GET"&&req.method!=="POST")return json(res,405,{error:"Method not allowed."});
 try{
  const who=await fetch(`${url.replace(/\/$/,"")}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:`Bearer ${token}`}});
  if(!who.ok)return json(res,401,{error:"Session expired. Sign in again."});
  const user=await who.json();
  const roles=await fetch(`${url.replace(/\/$/,"")}/rest/v1/rpc/has_role`,{method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify({_user_id:user.id,_role:"admin"})});
  if(!roles.ok||await roles.json()!==true)return json(res,403,{error:"Administrator access required."});
  if(req.method==="POST"){
   const result=await sendAdminSandboxTest();
   return json(res,200,result);
  }
  const [students,sets,units,attempts,summary]=await Promise.all([
   request("lite_students?select=id,phone_number,full_name,study_level,preferred_subject,sms_opt_in,created_at&order=created_at.desc&limit=200",serviceKey),
   request("mcq_sets?select=id,title,category,unit,unit_id,university,school,updated_at&published=eq.true&deleted_at=is.null&order=updated_at.desc&limit=200",serviceKey),
   request("units?select=id,name,short_name,course_code,published&published=eq.true&order=display_order.asc&limit=200",serviceKey),
   request("lite_attempts?select=id,student_id,mcq_set_id,question_index,selected_option,is_correct,attempted_at&order=attempted_at.desc&limit=1000",serviceKey),
   request("rpc/lite_library_summary",serviceKey)
  ]);
  const library=Array.isArray(summary)&&summary[0]?summary[0]:{set_count:sets.length,question_count:0};
  return json(res,200,{students,sets,units,attempts,stats:{students:students.length,optedIn:students.filter(s=>s.sms_opt_in).length,sets:Number(library.set_count),questions:Number(library.question_count),attempts:attempts.length,correct:attempts.filter(a=>a.is_correct).length}});
 }catch(e){console.error("Lite admin API:",e);return json(res,500,{error:"Could not load OmpathStudy Lite data."});}
}
