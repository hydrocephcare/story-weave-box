/**
 * Admin-only management API for OmpathStudy Lite.
 * Authenticates the Supabase access token and checks has_role(admin) server-side.
 */
const json = (res, status, body) => res.status(status).json(body);
async function request(path, key, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: options.prefer || "return=representation", ...options.headers },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return body ? JSON.parse(body) : [];
}
export default async function liteAdmin(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0cmZ3YXF2eHZraGpicXJ3bWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MTIwNzEsImV4cCI6MjEwODI4ODA3MX0.F_bGNSKsC6Wbriit19-OIwNdScqAUU0yhJ3TtQuiTkE";
  if (!url || !serviceKey || !anonKey) return json(res, 503, { error: "Lite admin is not configured." });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(res, 401, { error: "Sign in required." });
  try {
    const who = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
    if (!who.ok) return json(res, 401, { error: "Session expired. Sign in again." });
    const user = await who.json();
    const roles = await request(`rpc/has_role`, serviceKey, { method: "POST", body: JSON.stringify({ _user_id: user.id, _role: "admin" }) });
    if (roles !== true) return json(res, 403, { error: "Administrator access required." });
    if (req.method === "GET") {
      const [students, questions, attempts, recent] = await Promise.all([
        request("lite_students?select=id,phone_number,full_name,study_level,sms_opt_in,created_at&order=created_at.desc&limit=200", serviceKey),
        request("lite_questions?select=id,question,option_a,option_b,option_c,option_d,correct_option,explanation,is_active,created_at&order=created_at.desc&limit=100", serviceKey),
        request("lite_attempts?select=id,is_correct,attempted_at&limit=1000", serviceKey),
        request("lite_attempts?select=id,student_id,question_id,selected_option,is_correct,attempted_at&order=attempted_at.desc&limit=20", serviceKey),
      ]);
      return json(res, 200, { students, questions, stats: { students: students.length, optedIn: students.filter(s => s.sms_opt_in).length, questions: questions.length, attempts: attempts.length, correct: attempts.filter(a => a.is_correct).length }, recent });
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const question = String(b.question || "").trim();
      const options = [b.option_a, b.option_b, b.option_c, b.option_d].map(v => String(v || "").trim());
      const answer = Number(b.correct_option);
      const explanation = String(b.explanation || "").trim();
      if (!question || options.some(v => !v) || ![1,2,3,4].includes(answer) || !explanation) return json(res, 400, { error: "Complete the question, all four options, correct answer and explanation." });
      const rows = await request("lite_questions", serviceKey, { method: "POST", body: JSON.stringify({ question, option_a: options[0], option_b: options[1], option_c: options[2], option_d: options[3], correct_option: answer, explanation, is_active: Boolean(b.is_active) }) });
      return json(res, 201, { question: rows[0] });
    }
    if (req.method === "PATCH") {
      const id = String(req.body?.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 400, { error: "Valid question ID required." });
      const rows = await request(`lite_questions?id=eq.${id}`, serviceKey, { method: "PATCH", body: JSON.stringify({ is_active: Boolean(req.body.is_active) }) });
      return json(res, 200, { question: rows[0] || null });
    }
    return json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Lite admin API:", error);
    return json(res, 500, { error: "Could not complete the Lite admin request." });
  }
}
