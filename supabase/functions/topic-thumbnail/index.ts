import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const stop = new Set(["year","unit","mcq","mcqs","study","notes","introduction","basic","advanced","clinical","review","quiz","exam","examination","paper","past","bank","course","outline","questions","answers","answer","guide","part","section","complete","comprehensive","medical","student","students","must","know","high","yield","the","and","of","in","to","for","with","from","an","a","on","by","at"]);

function hash(value: string): number { let h=2166136261; for(let i=0;i<value.length;i++) h=Math.imul(h^value.charCodeAt(i),16777619); return h>>>0; }
function topic(title: string, category: string): string {
  const clean=title.replace(/&(?:amp|nbsp);/gi," ").replace(/\b(?:19|20)\d{2}\b/g," ").replace(/\b(?:part|set|section)\s*\d+(?:\s*of\s*\d+)?\b/gi," ").replace(/[^A-Za-z0-9 ]+/g," ").toLowerCase();
  const words=clean.split(/\s+/).filter((w)=>w.length>2&&!stop.has(w)&&!/^\d+$/.test(w));
  return words.slice(0,4).join(" ") || category.replace(/^year\s*\d+\s*[:-]?\s*/i,"") || "medicine";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null,{headers:cors});
  try {
    const url=new URL(req.url), id=url.searchParams.get("id")||"", type=url.searchParams.get("type")==="mcq"?"mcq":"article";
    if(!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Invalid resource",{status:400,headers:cors});
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const table=type==="mcq"?"mcq_sets":"articles";
    const {data}=await db.from(table).select("title,category").eq("id",id).eq("published",true).is("deleted_at",null).maybeSingle();
    if(!data) return new Response("Not found",{status:404,headers:cors});
    const searches=[`${topic(data.title,data.category||"")} medical`,`${topic(data.category||"",data.category||"")} medicine`,"human anatomy medicine"];
    let images:string[]=[];
    for(const search of searches) {
      const params=new URLSearchParams({action:"query",format:"json",generator:"search",gsrnamespace:"6",gsrsearch:search,gsrlimit:"12",prop:"imageinfo",iiprop:"url",iiurlwidth:"1200"});
      const result=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`,{headers:{"User-Agent":"OmpathStudy/1.0 (https://www.ompathstudy.com/about)"}});
      const json=await result.json();
      images=Object.values(json?.query?.pages||{}).flatMap((page:any)=>{const info=page.imageinfo?.[0];const image=info?.thumburl||info?.url;return image&&!/\.svg(?:\?|$)|\.pdf\/page/i.test(image)?[image]:[];});
      if(images.length) break;
    }
    if(!images.length) return Response.redirect("https://www.ompathstudy.com/og-default.png",302);
    return new Response(null,{status:302,headers:{...cors,"Location":images[hash(`${type}:${id}`)%Math.min(images.length,8)],"Cache-Control":"public, max-age=604800, s-maxage=604800","Link":"<https://commons.wikimedia.org/>; rel=\"license\""}});
  } catch (error) { console.error(error); return Response.redirect("https://www.ompathstudy.com/og-default.png",302); }
});
