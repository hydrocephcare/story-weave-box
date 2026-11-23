type Env = { SUPABASE_URL?:string; SUPABASE_ANON_KEY?:string };
export const onRequestGet = async ({env}:{env:Env}):Promise<Response> => {
  const base=env.SUPABASE_URL || "https://strfwaqvxvkhjbqrwmla.supabase.co";
  const key=env.SUPABASE_ANON_KEY || "";
  const rows:any[]=[];
  for(let offset=0;offset<10000;offset+=1000){
    const u=new URL(base+"/rest/v1/stories");
    u.searchParams.set("select","id,title,slug,created_at,updated_at,cover_image_url");
    u.searchParams.set("published","eq.true");u.searchParams.set("deleted_at","is.null");
    u.searchParams.set("order","created_at.desc");u.searchParams.set("limit","1000");u.searchParams.set("offset",String(offset));
    const r=await fetch(u.toString(),{headers:{apikey:key,Authorization:"Bearer "+key}});
    if(!r.ok)break;const batch=await r.json();if(!Array.isArray(batch)||!batch.length)break;
    rows.push(...batch);if(batch.length<1000)break;
  }
  const esc=(v:unknown)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const urls=[{loc:"https://stories.ompathstudy.com/"},{loc:"https://stories.ompathstudy.com/stories"},{loc:"https://stories.ompathstudy.com/share-your-story"}];
  for(const s of rows){
    const slug=String(s.slug||s.id);
    urls.push({loc:"https://stories.ompathstudy.com/stories/"+slug,lastmod:s.updated_at||s.created_at,image:s.cover_image_url||"",title:s.title||""} as any);
  }
  const body=urls.map((x:any)=>"<url><loc>"+esc(x.loc)+"</loc>"+(x.lastmod?"<lastmod>"+esc(new Date(x.lastmod).toISOString())+"</lastmod>":"")+(x.image?"<image:image><image:loc>"+esc(x.image)+"</image:loc><image:title>"+esc(x.title)+"</image:title></image:image>":"")+"</url>").join("");
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'+body+"</urlset>",{headers:{"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=900, s-maxage=3600"}});
};
