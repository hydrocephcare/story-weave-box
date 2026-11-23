type StoriesEnv = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
type PagesContext = { request: Request; env: StoriesEnv; next: () => Promise<Response> };
type StoryRow = { id:string; title:string; slug:string|null; content:string; category:string; created_at:string; updated_at?:string; cover_image_url?:string|null; meta_title?:string|null; meta_description?:string|null; tags?:string[]|null; reading_time_minutes?:number|null };
const ORIGIN = "https://stories.ompathstudy.com";
const escapeHtml = (value:unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const plainText = (value:string) => String(value || "").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g," ").trim();
async function rows(_env:StoriesEnv, params:Record<string,string>):Promise<StoryRow[]> {
  const query = "stories?" + new URLSearchParams(params).toString();
  const response = await fetch("https://ompath-sb-cache.hydrocephcare.workers.dev/?u=" + encodeURIComponent(query));
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data as StoryRow[] : [];
}
function documentHtml(title:string,description:string,canonical:string,body:string,image?:string,schema?:unknown) {
  const imageTag = image ? '<meta property="og:image" content="'+escapeHtml(image)+'"><meta name="twitter:image" content="'+escapeHtml(image)+'">' : "";
  const schemaTag = schema ? '<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,"\\u003c")+'</script>' : "";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(title)+'</title><meta name="description" content="'+escapeHtml(description)+'"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="'+escapeHtml(canonical)+'"><meta property="og:type" content="article"><meta property="og:site_name" content="Stories"><meta property="og:title" content="'+escapeHtml(title)+'"><meta property="og:description" content="'+escapeHtml(description)+'"><meta property="og:url" content="'+escapeHtml(canonical)+'"><meta name="twitter:card" content="summary_large_image">'+imageTag+schemaTag+'<style>body{max-width:850px;margin:40px auto;padding:0 20px;font:18px/1.75 Georgia,serif;color:#263b30}a{color:#315e47}h1{font-size:2.5rem;line-height:1.1}small{color:#64746a;font:13px Arial}</style></head><body><header><a href="/" style="font-weight:bold;font-size:24px;text-decoration:none">Stories.</a></header>'+body+'<footer><p><a href="/stories">Explore more stories</a> · <a href="/share-your-story">Share your story</a></p></footer></body></html>';
}
export const onRequest = async (context:PagesContext):Promise<Response> => {
  const request = context.request;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/,"") || "/";
  const ua = request.headers.get("user-agent") || "";
  const bot = /(bot|crawl|spider|google|bing|yandex|baidu|facebookexternalhit|whatsapp|telegram|discord|slack|linkedin|twitter|openseo-audit|ompathstudymonitor|inspectiontool)/i.test(ua);
  if (!bot || (url.searchParams.has("write")) || !["/","/stories","/share-your-story","/finalists"].includes(path) && !path.startsWith("/stories/")) return context.next();
  const baseQuery = {select:"id,title,slug,content,category,created_at,updated_at,cover_image_url,meta_title,meta_description,tags,reading_time_minutes",published:"eq.true","deleted_at":"is.null",limit:"1"};
  if (path.startsWith("/stories/")) {
    const param = decodeURIComponent(path.slice("/stories/".length));
    let found = await rows(context.env,{...baseQuery,slug:"eq."+param});
    if (!found.length) {
      const match = param.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      if (match) found = await rows(context.env,{...baseQuery,id:"eq."+match[0]});
    }
    const story = found[0];
    if (!story) return new Response(documentHtml("Story not found | Stories","This story could not be found.",ORIGIN+path,"<h1>Story not found</h1><p>The story may have been removed or is no longer published.</p>"),{status:404,headers:{"content-type":"text/html; charset=utf-8","x-robots-tag":"noindex"}});
    const text = plainText(story.content || "");
    const description = String(story.meta_description || text.slice(0,160) || "Read an original story on Stories.").slice(0,160);
    const title = String(story.meta_title || (story.title+" | Stories"));
    const canonical = ORIGIN+"/stories/"+(story.slug || param);
    const body = "<article><p><small>"+escapeHtml(story.category || "Community story")+" · "+escapeHtml(story.reading_time_minutes || Math.max(1,Math.ceil(text.split(" ").length/220)))+" min read</small></p><h1>"+escapeHtml(story.title)+"</h1><p>"+escapeHtml(description)+"</p><article><p>"+escapeHtml(text.slice(0,100000))+"</p></article></article>";
    const schema = {"@context":"https://schema.org","@type":"Article","headline":story.title,"description":description,"articleBody":text.slice(0,12000),"image":story.cover_image_url || undefined,"datePublished":story.created_at,"dateModified":story.updated_at || story.created_at,"author":{"@type":"Person","name":"Community writer"},"publisher":{"@type":"Organization","name":"Stories","url":ORIGIN},"mainEntityOfPage":canonical};
    return new Response(documentHtml(title,description,canonical,body,story.cover_image_url || undefined,schema),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=60, s-maxage=300","x-content-type-options":"nosniff"}});
  }
  if (path === "/share-your-story" || path === "/finalists") {
    const title = "Share your story | Stories";
    const description = "Everyone has a story worth sharing. Publish personal experiences, ideas, knowledge and creative writing. Your name can stay private.";
    const body = "<h1>Your story deserves to be heard</h1><p>"+escapeHtml(description)+"</p><p><a href='/stories?write=1'>Start writing</a></p>";
    return new Response(documentHtml(title,description,ORIGIN+path,body),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=60"}});
  }
  const recent = await rows(context.env,{select:"id,title,slug,category,created_at,meta_description,cover_image_url",published:"eq.true","deleted_at":"is.null",order:"created_at.desc",limit:"20"});
  const links = recent.map(s => {
    const slug = s.slug || s.id;
    return "<article><h2><a href='/stories/"+escapeHtml(slug)+"'>"+escapeHtml(s.title)+"</a></h2><small>"+escapeHtml(s.category || "Community story")+"</small><p>"+escapeHtml(s.meta_description || plainText(s.content || "").slice(0,180))+"</p></article>";
  }).join("");
  const title = "Stories | Read and Publish Original Stories";
  const description = "Personal experiences, ideas, knowledge and reflections from writers around the world. Read, discover and publish stories on every subject.";
  const body = "<main><h1>Stories</h1><p>"+escapeHtml(description)+"</p><p><a href='/share-your-story'>Write for Stories</a></p><h2>Recently published</h2>"+(links || "<p>New stories will appear here soon.</p>")+"</main>";
  const schema = {"@context":"https://schema.org","@type":"WebSite","name":"Stories","url":ORIGIN,"description":description,"publisher":{"@type":"Organization","name":"Stories"}};
  return new Response(documentHtml(title,description,ORIGIN+"/",body,undefined,schema),{headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=60, s-maxage=300","x-content-type-options":"nosniff"}});
};
