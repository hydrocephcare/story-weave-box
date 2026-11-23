type Context = { request: Request };
export const onRequestPost = async ({request}:Context):Promise<Response> => {
  const body = await request.text();
  const headers = new Headers({"content-type":"application/json","origin":"https://www.ompathstudy.com","referer":"https://www.ompathstudy.com/"});
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for",ip);
  const upstream = await fetch("https://www.ompathstudy.com/api/ai?task=assist",{method:"POST",headers,body});
  const responseHeaders = new Headers();
  responseHeaders.set("content-type",upstream.headers.get("content-type") || "application/json; charset=utf-8");
  responseHeaders.set("cache-control","no-store");
  return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
};
