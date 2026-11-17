/**
 * OmpathStudy Lite — Africa's Talking USSD MVP.
 * Uses the existing /api/ai multiplexer to avoid adding another Vercel function.
 * Server environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
const mainMenu = "Welcome to OmpathStudy Lite\n1. Register\n2. Daily medical MCQ\n3. Help\\n4. SMS preferences";
const clean = (value, max = 120) => String(value ?? "").trim().replace(/[<>]/g, "").slice(0, max);
const reply = (res, message, end = false) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send(`${end ? "END" : "CON"} ${message}`);
};
async function db(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server configuration");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
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
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : [];
}
async function ussd(req, res) {
  const payload = req.body || {};
  const phone = clean(payload.phoneNumber, 24);
  const sessionId = clean(payload.sessionId, 100);
  const text = clean(payload.text, 300);
  if (!phone || !sessionId) return reply(res, "Invalid session. Please dial again.", true);
  const parts = text.split("*");
  try {
    if (!text) return reply(res, mainMenu);

    if (parts[0] === "1") {
      if (parts.length === 1) return reply(res, "Enter your first and last name:");
      if (parts.length === 2) return reply(res, "Select your study level:\n1. Certificate/Diploma\n2. Undergraduate\n3. Other");
      const fullName = clean(parts[1], 80);
      const studyLevel = ({ "1": "Certificate/Diploma", "2": "Undergraduate", "3": "Other" })[parts[2]];
      if (!fullName || !studyLevel) return reply(res, "Invalid details. Please dial again to register.", true);
      await db("lite_students?on_conflict=phone_number", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ phone_number: phone, full_name: fullName, study_level: studyLevel, updated_at: new Date().toISOString() }),
      });
      return reply(res, `Registration successful, ${fullName}. Dial again to open the main menu.`, true);
    }

    if (parts[0] === "2") {
      const questions = await db("lite_questions?select=id,question,option_a,option_b,option_c,option_d&is_active=eq.true&order=created_at.desc&limit=1");
      const question = questions[0];
      if (!question) return reply(res, "No question is available today. Please try again later.", true);
      if (parts.length === 1) {
        return reply(res, `Daily MCQ\n${question.question}\n1. ${question.option_a}\n2. ${question.option_b}\n3. ${question.option_c}\n4. ${question.option_d}\n\nReply with 1, 2, 3 or 4.`);
      }
      const selected = Number(parts[1]);
      if (![1, 2, 3, 4].includes(selected)) return reply(res, "Invalid answer. Choose 1, 2, 3 or 4.", true);
      const students = await db(`lite_students?select=id&phone_number=eq.${encodeURIComponent(phone)}&limit=1`);
      if (!students[0]) return reply(res, "Please register first. Dial again and choose 1.", true);
      const current = await db(`lite_questions?select=id,correct_option,explanation&id=eq.${question.id}&limit=1`);
      if (!current[0]) return reply(res, "Question no longer available. Please try again.", true);
      const correct = selected === Number(current[0].correct_option);
      await db("lite_attempts?on_conflict=student_id,question_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ student_id: students[0].id, question_id: current[0].id, selected_option: selected, is_correct: correct }),
      });
      return reply(res, `${correct ? "Correct!" : `Not quite. Correct answer: ${current[0].correct_option}.`}\n${clean(current[0].explanation, 350)}\n\nThank you for studying with OmpathStudy Lite.`, true);
    }

    if (parts[0] === "3") return reply(res, "Short medical learning activities for basic phones. Register, then choose Daily medical MCQ.", true);

    if (parts[0] === "4") {
      const students = await db(`lite_students?select=id,sms_opt_in&phone_number=eq.${encodeURIComponent(phone)}&limit=1`);
      if (!students[0]) return reply(res, "Please register first using option 1.", true);
      if (parts.length === 1) return reply(res, "SMS learning preferences\\n1. Subscribe to daily MCQs\\n2. Unsubscribe from SMS");
      if (parts[1] === "1") {
        await db(`lite_students?id=eq.${students[0].id}`, { method: "PATCH", body: JSON.stringify({ sms_opt_in: true, sms_opt_in_at: new Date().toISOString() }) });
        return reply(res, "You are subscribed to daily medical MCQs by SMS. Reply STOP to any SMS to unsubscribe.", true);
      }
      if (parts[1] === "2") {
        await db(`lite_students?id=eq.${students[0].id}`, { method: "PATCH", body: JSON.stringify({ sms_opt_in: false, sms_opt_in_at: null }) });
        return reply(res, "You have unsubscribed from daily SMS learning.", true);
      }
      return reply(res, "Choose 1 to subscribe or 2 to unsubscribe.", true);
    }
    return reply(res, mainMenu);
  } catch (error) {
    console.error("OmpathStudy Lite USSD error:", error);
    return reply(res, "We could not process your request. Please try again shortly.", true);
  }
}
export default async function ompathLite(req, res) {
  if (req.method === "GET") return res.status(200).json({ name: "OmpathStudy Lite", status: "ok", channel: "ussd" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return ussd(req, res);
}
