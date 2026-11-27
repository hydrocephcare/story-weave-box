// Minimal Vercel-style request/response adapter for legacy API handlers running as Pages Functions.
export async function runVercelHandler(handler, request) {
  const url = new URL(request.url);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (key in query) query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    else query[key] = value;
  }

  const headersIn = Object.fromEntries(request.headers.entries());
  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    if (raw) {
      const type = request.headers.get("content-type") || "";
      if (type.includes("application/json")) {
        try { body = JSON.parse(raw); }
        catch { return Response.json({ error: "Malformed JSON body." }, { status: 400 }); }
      } else body = raw;
    }
  }

  const req = {
    method: request.method,
    url: request.url,
    headers: headersIn,
    query,
    body,
  };

  let statusCode = 200;
  let headersSent = false;
  let ended = false;
  let responseBody = null;
  let streamController = null;
  let stream = null;
  const responseHeaders = new Headers();

  const res = {
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = Number(value) || 200; },
    get headersSent() { return headersSent; },
    setHeader(name, value) {
      if (Array.isArray(value)) responseHeaders.set(name, value.join(", "));
      else responseHeaders.set(name, String(value));
      return this;
    },
    getHeader(name) { return responseHeaders.get(name); },
    status(code) { statusCode = Number(code) || 200; return this; },
    json(value) {
      if (!responseHeaders.has("content-type")) responseHeaders.set("content-type", "application/json; charset=utf-8");
      responseHeaders.set("cache-control", responseHeaders.get("cache-control") || "no-store");
      responseBody = JSON.stringify(value);
      headersSent = true;
      ended = true;
      return this;
    },
    send(value) {
      responseBody = value;
      if (typeof value === "string" && !responseHeaders.has("content-type")) responseHeaders.set("content-type", "text/html; charset=utf-8");
      headersSent = true;
      ended = true;
      return this;
    },
    write(value) {
      if (!stream) {
        stream = new ReadableStream({ start(controller) { streamController = controller; } });
        headersSent = true;
      }
      if (value !== undefined && value !== null) {
        const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
        streamController.enqueue(bytes);
      }
      return true;
    },
    end(value) {
      if (stream) {
        if (value !== undefined && value !== null) {
          const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
          streamController.enqueue(bytes);
        }
        try { streamController.close(); } catch {}
      } else if (value !== undefined && value !== null) responseBody = value;
      headersSent = true;
      ended = true;
      return this;
    },
  };

  try {
    await handler(req, res);
  } catch (error) {
    if (streamController) {
      try { streamController.error(error); } catch {}
      return new Response(stream, { status: statusCode, headers: responseHeaders });
    }
    return Response.json({ error: "API request failed." }, { status: 500 });
  }

  if (stream) return new Response(stream, { status: statusCode, headers: responseHeaders });
  if (!ended && responseBody === null) responseBody = "";
  return new Response(responseBody, { status: statusCode, headers: responseHeaders });
}
