import handler from "../../api/lite.js";

const routes = {
  "ompath-lite-web": "lite-web",
  "ompath-lite": "lite",
  "ompath-lite-sms": "lite-sms",
  "ompath-lite-admin": "lite-admin",
  "ompath-lite-guide": "health-guide",
  "ompath-lite-cleanup": "health-cleanup",
};

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, "");
  const task = routes[route];
  if (!task) return new Response(JSON.stringify({ error: "Unknown Lite API route." }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    const type = request.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    } else if (type.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(raw));
    } else {
      body = raw;
    }
  }

  let status = 200;
  const headers = new Headers();
  let responseBody = "";
  let committed = false;
  const res = {
    status(code) { status = code; return this; },
    setHeader(name, value) { headers.set(name, String(value)); return this; },
    json(value) {
      headers.set("content-type", "application/json; charset=utf-8");
      responseBody = JSON.stringify(value);
      committed = true;
      return this;
    },
    send(value) {
      if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");
      responseBody = typeof value === "string" ? value : String(value ?? "");
      committed = true;
      return this;
    },
  };

  const req = {
    method: request.method,
    url: request.url,
    body,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
    rawBody: typeof body === "string" ? body : undefined,
  };

  try {
    await handler({ ...req, query: { ...req.query, task }, executionContext: context }, res);
    if (!committed) {
      return new Response(JSON.stringify({ error: "The Lite API returned no response." }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(responseBody, { status, headers });
  } catch (error) {
    console.error("OmpathStudy Lite Pages adapter:", error);
    return new Response(JSON.stringify({ error: "Lite service temporarily unavailable." }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
