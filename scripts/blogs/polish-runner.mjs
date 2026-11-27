const audience="ompathstudy-blog-polish";
const endpoint=process.env.BLOG_POLISH_URL||"https://www.ompathstudy.com/api/neon-functions?name=blog-polish-batch";
const requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if(!requestUrl||!requestToken) throw new Error("GitHub Actions OIDC token access is not enabled.");
const url=new URL(requestUrl);
url.searchParams.set("audience",audience);
const tokenResponse=await fetch(url,{headers:{Authorization:"Bearer "+requestToken}});
const tokenBody=await tokenResponse.json().catch(()=>({}));
if(!tokenResponse.ok||!tokenBody.value) throw new Error("Could not obtain the publishing workflow identity token.");
const response=await fetch(endpoint,{
  method:"POST",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+tokenBody.value},
  body:JSON.stringify({count:Number(process.env.COUNT)||40,year:Number(process.env.YEAR)||0,minutes:Number(process.env.MINUTES)||50}),
  signal:AbortSignal.timeout(55*60*1000),
});
const result=await response.json().catch(()=>({}));
if(!response.ok||result.success!==true) throw new Error(result.error||"The Cloudflare blog-polish batch failed ("+response.status+").");
console.log(JSON.stringify(result));
