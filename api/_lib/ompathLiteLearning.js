/** Proxy for the isolated OmpathStudy Lite EdTech Edge Function. */
const send = (res, status, body) => res.status(status).json(body);
export default async function liteLearning(req, res) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!base || !anon) return send(res, 503, { error: "Lite learning backend is not configured." });
  const task = String(req.query?.task || "");
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = task === "lite-learning-ussd" ? "ussd"
    : task === "lite-learning-sms-inbound" ? "inbound_sms"
    : task === "lite-learning-sms-send" ? "send_daily_sms"
    : String(body.action || req.query?.action || "");
  const payload = action === "ussd" ? { action, payload: body } : { ...body, action };
  const target = new URL(base + "/functions/v1/ompathstudy-lite-learning");
  if (action === "ussd" || action === "inbound_sms") {
    const key = String(req.query?.key || "");
    if (key) target.searchParams.set("key", key);
  }
  const headers = { apikey: anon, Authorization: "Bearer " + anon, "Content-Type": "application/json" };
  const studentToken = req.headers?.["x-student-token"];
  const auth = req.headers?.authorization;
  if (studentToken) headers["x-student-token"] = String(studentToken);
  if (auth && task !== "lite-learning-ussd" && task !== "lite-learning-sms-inbound") headers.Authorization = String(auth);
  const cronSecret = req.headers?.["x-cron-secret"] || req.headers?.authorization;
  if (action === "send_daily_sms" && cronSecret) headers["x-cron-secret"] = String(cronSecret).replace(/^Bearer\s+/i, "");
  try {
    const upstream = await fetch(target.toString(), {
      method: req.method || "POST",
      headers,
      body: req.method === "GET" ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await upstream.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (parsed !== null) return send(res, upstream.status, parsed);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain; charset=utf-8");
    return res.status(upstream.status).send(raw);
  } catch (error) {
    console.error("Lite learning proxy failed:", String(error?.message || error).slice(0, 120));
    return send(res, 502, { error: "The learning service is temporarily unavailable." });
  }
}
