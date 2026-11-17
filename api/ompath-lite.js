/**
 * OmpathStudy Lite — Africa's Talking USSD MVP.
 *
 * Configure server-side environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   AT_USERNAME, AT_API_KEY
 *
 * Africa's Talking USSD callback: POST /api/ompath-lite
 * Keep the service role key and Africa's Talking API key out of the browser.
 */
const json = (res, status, data) => res.status(status).json(data);
const ussd = (res, message, end = false) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send(`${end ? "END" : "CON"} ${message}`);
};
const clean = (value, max = 120) => String(value ?? "").trim().replace(/[<>]/g, "").slice(0, max);
const supabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server configuration");
  return { url: url.replace(/\/$/, ""), key };
};
async function db(path, options = {}) {
  const { url, key } = supabase();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${body.slice(0, 240)}`);
  return body ? JSON.parse(body) : [];
}
const mainMenu = "Welcome to OmpathStudy Lite\n1. Register\n2. Daily medical MCQ\n3. Help";
async function handleUssd(req, res) {
  const payload = req.body || {};
  const phone = clean(payload.phoneNumber, 24);
  const sessionId = clean(payload.sessionId, 100);
  const text = clean(payload.text, 300);
  if (!phone || !sessionId) return ussd(res, "Invalid USSD session. Please dial again.", true);

  const parts = text.split("*").filter(Boolean);
  try {
    if (parts.length === 0) return ussd(res, mainMenu);
    if (parts[0] === "1") {
      if (parts.length === 1) return ussd(res, "Enter your first and last name:");
      if (parts.length === 2) return ussd(res, "Select your study level:\n1. Certificate/Diploma\n2. Undergraduate\n3. Other");
      const name = clean(parts[1], 80);
      const level = ({ "1": "Certificate/Diploma", "2": "Undergraduate", "3": "Other" })[parts[2]];
      if (!name || !level) return ussd(res, "Invalid details. Dial again and register.", true);
      await db("lite_students?on_conflict=phone_number", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ phone_number: phone, full_name: name, study_level: level, updated_at: new Date().toISOString() }),
      });
      return ussd(res, `Registration successful, ${name}.\n\n${mainMenu}`);
    }
    if (parts[0] === "2") {
      const questions = await db("lite_questions?select=id,question,option_a,option_b,option_c,option_d,explanation&is_active=eq.true&order=created_at.desc&limit=1");
      const question = questions[0];
      if (!question) return ussd(res, "No question is available today. Please try again later.", true);
      if (parts.length === 1) {
        return ussd(res, `Daily MCQ\n${question.question}\n1. ${question.option_a}\n2. ${question.option_b}\n3. ${question.option_c}\n4. ${question.option_d}\n\nReply with 1, 2, 3 or 4.`);
      }
      const answer = Number(parts[1]);
      if (![1, 2, 3, 4].includes(answer)) return ussd(res, "Invalid answer. Choose 1, 2, 3 or 4.", true);
      const students = await db(`lite_students?select=id&phone_number=eq.${encodeURIComponent(phone)}&limit=1`);
      if (!students[0]) return ussd(res, "Please register first: choose 1 from the main menu.", true);
      const result = await db(`lite_questions?select=id,correct_option,explanation& id=eq.${question.id}&limit=1`.replace("& id=", "&id="));
      const current = result[0];
      if (!current) return ussd(res, "Question no longer available. Please try again.", true);
      const correct = answer === Number(current.correct_option);
      await db("lite_attempts", {
        method: "POST",
        body: JSON.stringify({ student_id: students[0].id, question_id: current.id, selected_option: answer, is_correct: correct }),
      });
      return ussd(res, `${correct ? "Correct!" : `Not quite. Correct answer: ${current.correct_option}.`}\n${clean(current.explanation, 350)}\n\nThank you for studying with OmpathStudy Lite.`, true);
    }
    if (parts[0] === "3") return ussd(res, "OmpathStudy Lite provides short medical learning activities by USSD. Register first, then choose Daily MCQ.", true);
    return ussd(res, mainMenu);
  } catch (error) {
    console.error("OmpathStudy Lite USSD error:", error);
    return ussd(res, "We could not process your request. Please try again shortly.", true);
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") return json(res, 200, { name: "OmpathStudy Lite", status: "ok", channel: "ussd" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  return handleUssd(req, res);
}
