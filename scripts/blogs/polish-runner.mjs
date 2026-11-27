const audience="ompathstudy-blog-polish";
const base="https://www.ompathstudy.com";
const requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if(!requestUrl||!requestToken) throw new Error("GitHub Actions OIDC token access is not enabled.");
const url=new URL(requestUrl);
url.searchParams.set("audience",audience);
const tokenResponse=await fetch(url,{headers:{Authorization:"Bearer "+requestToken}});
const tokenBody=await tokenResponse.json().catch(()=>({}));
if(!tokenResponse.ok||!tokenBody.value) throw new Error("Could not obtain the publishing workflow identity token.");
const token=tokenBody.value;
const count=Math.max(1,Math.min(100,Number(process.env.COUNT)||40));
const year=Math.max(0,Math.min(6,Number(process.env.YEAR)||0));
const deadline=Date.now()+Math.max(1,Math.min(50,Number(process.env.MINUTES)||50))*60_000;
const headers={"Content-Type":"application/json",Authorization:"Bearer "+token};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function post(path,body,timeout=55_000) {
  const response=await fetch(base+path,{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const data=await response.json().catch(()=>({}));
  return {response,data};
}
const queued=await post("/api/neon-functions?name=blog-polish-queue",{count,year});
if(!queued.response.ok||queued.data.success!==true) throw new Error(queued.data.error||"Could not load the published-article queue ("+queued.response.status+").");
const articles=Array.isArray(queued.data.articles)?queued.data.articles:[];
console.log(articles.length+" published articles queued for incremental polishing.");
let polished=0,failed=0,held=0;
for(const article of articles) {
  if(Date.now()>deadline) break;
  let finished=false;
  for(let attempt=0;attempt<35&&Date.now()<deadline;attempt++) {
    try {
      const {response,data}=await post("/api/ai-polish",{id:article.id});
      if(response.status===429||response.status===503) {
        console.log("waiting for provider capacity: "+article.title.slice(0,60));
        await pause(15000);
        continue;
      }
      if(!response.ok) throw new Error(data.error||"HTTP "+response.status);
      if(data.status==="done") {
        finished=true;
        if(data.verified===true) polished++;
        else held++;
        console.log((data.verified===true?"verified: ":"held for review: ")+article.title.slice(0,70));
        break;
      }
      if(data.status==="failed") {
        finished=true;failed++;
        console.log("failed: "+article.title.slice(0,70));
        break;
      }
      if(data.status==="partial"&&data.more===true) { await pause(1200); continue; }
      if(data.status==="partial"||data.status==="working"||data.status==="busy") { await pause(data.hiccup?15000:8000); continue; }
      if(data.status==="invalid") { finished=true;held++;break; }
      await pause(5000);
    } catch(error) {
      console.log("retrying "+article.title.slice(0,60)+": "+String(error?.message||error).slice(0,120));
      await pause(10000);
    }
  }
  if(!finished) { failed++;console.log("deferred to the next run: "+article.title.slice(0,70)); }
}
console.log(JSON.stringify({queued:articles.length,polished,held,failed,remaining:Math.max(0,articles.length-polished-held-failed)}));
if(failed>0) process.exitCode=1;
