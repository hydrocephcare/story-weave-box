import aiCases from "../../api/ai-cases.js";
import ai from "../../api/ai.js";
import driveNotes from "../../api/drive-notes.js";
import imageProxy from "../../api/image-proxy.js";
import ogMeta from "../../api/og-meta.ts";
import ogProxy from "../../api/og-proxy.js";
import prerender from "../../api/prerender.ts";
import sitemapIndex from "../../api/sitemap-index.js";
import sitemap from "../../api/sitemap.js";
import sourcePdf from "../../api/source-pdf.js";
import books from "../../public/data/books.json";
import brokenLinks from "../../public/data/broken-links.json";
import year1 from "../../public/data/year1-library.json";
import year2 from "../../public/data/year2-library.json";
import year3 from "../../public/data/year3-library.json";
import year4 from "../../public/data/year4-library.json";

const encoder = new TextEncoder();
const jsonData = {
  "books.json": books,
  "broken-links.json": brokenLinks,
  "year1-library.json": year1,
  "year2-library.json": year2,
  "year3-library.json": year3,
  "year4-library.json": year4,
};

function queryObject(searchParams) {
  const out = {};
  for (const [key, value] of searchParams) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
    } else out[key] = value;
  }
  return out;
}

async function bodyObject(request) {
  if (["GET", "HEAD"].includes(request.method)) return undefined;
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try { return await request.json(); } catch { return {}; }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    return Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === "string" ? value : value]));
  }
  const text = await request.text();
  return text || undefined;
}

function makeRequest(request, url, body) {
  const headers = Object.fromEntries(request.headers.entries());
  return {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    query: queryObject(url.searchParams),
    body,
    socket: { remoteAddress: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "" },
  };
}

function asBytes(value) {
  if (value == null) return new Uint8Array();
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return encoder.encode(JSON.stringify(value));
}

async function invoke(handler, request, url, body, streaming = false) {
  const req = makeRequest(request, url, body);
  let status = 200;
  const headers = new Headers();
  let payload;
  let completed = false;
  let streamController;
  let responseReady;
  let resolveReady;
  if (streaming) {
    responseReady = new Promise(resolve => { resolveReady = resolve; });
  }
  const res = {
    status(code) { status = Number(code) || 200; return this; },
    setHeader(name, value) { headers.set(name, Array.isArray(value) ? value.join(", ") : String(value)); return this; },
    getHeader(name) { return headers.get(name); },
    get headersSent() { return Boolean(streamController || completed); },
    set statusCode(code) { status = Number(code) || 200; },
    get statusCode() { return status; },
    json(value) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
      const text = JSON.stringify(value);
      if (streaming && streamController) {
        streamController.enqueue(encoder.encode(text));
        streamController.close();
        completed = true;
      } else {
        payload = text;
        completed = true;
        if (streaming) resolveReady(new Response(payload, { status, headers }));
      }
      return this;
    },
    send(value) {
      payload = value;
      completed = true;
      if (streaming) {
        if (streamController) {
          if (value != null) streamController.enqueue(asBytes(value));
          streamController.close();
        } else resolveReady(new Response(value, { status, headers }));
      }
      return this;
    },
    write(value) {
      if (!streaming) {
        payload = (payload || "") + (typeof value === "string" ? value : new TextDecoder().decode(asBytes(value)));
        return true;
      }
      if (!streamController) {
        const stream = new ReadableStream({ start(controller) { streamController = controller; } });
        if (!headers.has("content-type")) headers.set("content-type", "text/event-stream; charset=utf-8");
        if (!headers.has("cache-control")) headers.set("cache-control", "no-cache, no-transform");
        resolveReady(new Response(stream, { status, headers }));
      }
      streamController.enqueue(asBytes(value));
      return true;
    },
    end(value) {
      if (value != null) {
        if (streaming && streamController) streamController.enqueue(asBytes(value));
        else payload = value;
      }
      completed = true;
      if (streaming) {
        if (streamController) streamController.close();
        else resolveReady(new Response(payload == null ? null : payload, { status, headers }));
      }
      return this;
    },
  };

  if (streaming) {
    Promise.resolve()
      .then(() => handler(req, res))
      .then(() => { if (!completed) res.end(); })
      .catch(() => {
        if (streamController) {
          try { streamController.enqueue(encoder.encode("\\n\\ndata: [ERROR]\\n\\n")); streamController.close(); } catch {}
          completed = true;
        } else {
          status = 500;
          headers.set("content-type", "application/json; charset=utf-8");
          payload = JSON.stringify({ error: "Request could not be completed." });
          completed = true;
          resolveReady(new Response(payload, { status, headers }));
        }
      });
    return responseReady;
  }
  try {
    await handler(req, res);
    if (!completed) res.end();
  } catch {
    status = 500;
    headers.set("content-type", "application/json; charset=utf-8");
    payload = JSON.stringify({ error: "Request could not be completed." });
  }
  return new Response(payload == null ? null : payload, { status, headers });
}

async function studentData(request, url) {
  const file = url.searchParams.get("file") || "";
  const data = jsonData[file];
  if (!data) return Response.json({ error: "Unknown file" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let projectRef = null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    projectRef = new URL(payload.iss).hostname.split(".")[0];
  } catch {}
  if (projectRef !== "strfwaqvxvkhjbqrwmla") {
    return Response.json({ error: "Sign in with your student account" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const check = await fetch("https://strfwaqvxvkhjbqrwmla.supabase.co/rest/v1/rpc/is_mku_student", {
    method: "POST",
    headers: {
      apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJzdHJmd2Fxdnh2a2hqYnFyd21sYSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkyNzEyMDcxLCJleHAiOjIxMDgyODgwNzF9.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(8000),
  });
  if (!check.ok) return Response.json({ error: "Could not verify your account" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if ((await check.json()) !== true) return Response.json({ error: "MKU students only" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  if (route === "student-data") return studentData(request, url);
  if (route === "og-meta") return ogMeta(request);

  const handlers = {
    "ai": ai,
    "ai-cases": aiCases,
    "drive-notes": driveNotes,
    "image-proxy": imageProxy,
    "og-proxy": ogProxy,
    "prerender": prerender,
    "sitemap-index": sitemapIndex,
    "sitemap": sitemap,
    "source-pdf": sourcePdf,
  };
  const handler = handlers[route];
  if (!handler) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await bodyObject(request);
  return invoke(handler, request, url, body, route === "ai" && url.searchParams.get("task") === "chat");
}
