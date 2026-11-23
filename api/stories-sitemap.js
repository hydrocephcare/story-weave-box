const SUPABASE_URL = "https://strfwaqvxvkhjbqrwmla.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdHJmd2Fxdnh2a2hqYnFyd21sYSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkyNzEyMDcxLCJleHAiOjIxMDgyODgwNzF9.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
const ORIGIN = "https://stories.ompathstudy.com";
const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const slug = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/&/g," and ").replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
export default async function handler(req,res) {
  res.setHeader("Content-Type","application/xml; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=86400");
  const fixed = ["/","/stories","/share-your-story"];
  let rows = [];
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/stories?select=id,title,slug,created_at,updated_at&published=eq.true&deleted_at=is.null&order=created_at.desc&limit=1000", {headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+SUPABASE_ANON_KEY}});
    if(response.ok) rows = await response.json();
  } catch {}
  const urls = fixed.map(path => ({loc:ORIGIN+path}));
  for(const row of rows) {
    const path = "/stories/" + (row.slug || (row.id + "-" + (slug(row.title)||"story")));
    urls.push({loc:ORIGIN+path,lastmod:row.updated_at||row.created_at});
  }
  const body = urls.map(x => "<url><loc>"+esc(x.loc)+"</loc>"+(x.lastmod?"<lastmod>"+esc(new Date(x.lastmod).toISOString())+"</lastmod>":"")+"<changefreq>"+(x.lastmod?"monthly":"weekly")+"</changefreq><priority>"+(x.loc===ORIGIN+"/"?"1.0":x.loc===ORIGIN+"/stories"?"0.9":"0.7")+"</priority></url>").join("");
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+body+"</urlset>");
}
