import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-student-token, x-ussd-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => new Uint8Array((value.match(/.{1,2}/g) || []).map((x) => parseInt(x, 16)));
const randomHex = (size = 32) => { const b = new Uint8Array(size); crypto.getRandomValues(b); return hex(b); };
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
const clean = (value: unknown, max = 500) => String(value ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const stripMarkup = (value: unknown, max = 600) => clean(String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"), max);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const text = (body: string) => new Response(body, { status: 200, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const url = Deno.env.get("SUPABASE_URL") || "";
const secretKeys = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); } catch { return {}; } })();
const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !serviceKey) console.error("Lite learning function is missing its Supabase server credentials.");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function normalizePhone(value: unknown) {
  let phone = clean(value, 32).replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(phone)) phone = "+254" + phone.slice(1);
  else if (/^254\d{9}$/.test(phone)) phone = "+" + phone;
  return /^\+[1-9]\d{8,14}$/.test(phone) ? phone : null;
}
async function pinHash(pin: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromHex(salt), iterations: 120000, hash: "SHA-256" }, key, 256);
  return hex(new Uint8Array(bits));
}
async function issueSession(studentId: string) {
  const token = randomHex(32);
  const tokenHash = await digest(token);
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  const { error } = await db.from("lite_students").update({ session_token_hash: tokenHash, session_expires_at: expires, last_login_at: new Date().toISOString() }).eq("id", studentId);
  if (error) throw error;
  return { token, expires_at: expires };
}
async function studentFromToken(req: Request) {
  const token = req.headers.get("x-student-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (token.length < 40) return null;
  const tokenHash = await digest(token);
  const { data } = await db.from("lite_students").select("id,phone_number,full_name,study_level,sms_opt_in,parent_phone,parent_sms_opt_in,preferred_subject,preferred_language,school_name").eq("session_token_hash", tokenHash).gt("session_expires_at", new Date().toISOString()).maybeSingle();
  return data || null;
}
async function getStudent(phone: string) {
  const { data } = await db.from("lite_students").select("id,phone_number,full_name,study_level,sms_opt_in,parent_phone,parent_sms_opt_in,preferred_subject,preferred_language,school_name").eq("phone_number", phone).maybeSingle();
  return data || null;
}
async function getSet(setId: string) {
  const { data, error } = await db.from("mcq_sets").select("id,title,category,questions,password_protected,published,deleted_at").eq("id", setId).eq("published", true).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data || data.password_protected) return null;
  return data;
}
function publicQuestion(set: any, index: number) {
  const q = Array.isArray(set?.questions) ? set.questions[index] : null;
  if (!q) return null;
  return {
    set_id: set.id,
    set_title: set.title,
    category: set.category,
    question_index: index,
    question: stripMarkup(q.question, 900),
    options: Array.isArray(q.options) ? q.options.map((x: unknown) => stripMarkup(x, 240)) : [],
  };
}
async function catalogue(studyLevel?: string) {
  let query = db.from("mcq_sets").select("id,title,category,slug,created_at").eq("published", true).is("deleted_at", null).eq("password_protected", false).order("created_at", { ascending: false }).limit(120);
  if (studyLevel) query = query.ilike("category", "%" + studyLevel + "%");
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
async function dailySet(studyLevel: string) {
  let sets = await catalogue(studyLevel);
  if (!sets.length) sets = await catalogue();
  if (!sets.length) return null;
  const day = new Date().toISOString().slice(0, 10);
  const seed = Array.from(day + "|" + studyLevel).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  for (let offset = 0; offset < sets.length; offset++) {
    const candidate = await getSet(sets[(seed + offset) % sets.length].id);
    if (candidate && Array.isArray(candidate.questions) && candidate.questions.length >= 5) return candidate;
  }
  const first = await getSet(sets[0].id);
  return first && Array.isArray(first.questions) && first.questions.length ? first : null;
}
async function registerStudent(payload: any, channel = "web") {
  const phone = normalizePhone(payload.phone_number);
  const name = clean(payload.full_name, 100);
  const level = clean(payload.study_level, 20);
  const pin = String(payload.pin || "");
  if (!phone || name.length < 2 || !/^Year [1-6]$/.test(level) || !/^\d{6}$/.test(pin)) {
    return { error: "Enter a valid Kenyan/international phone number, full name, study year and a six-digit PIN." };
  }
  const salt = randomHex(16);
  const hash = await pinHash(pin, salt);
  const record = {
    phone_number: phone,
    full_name: name,
    study_level: level,
    pin_hash: hash,
    pin_salt: salt,
    sms_opt_in: payload.sms_opt_in === true,
    sms_opt_in_at: payload.sms_opt_in === true ? new Date().toISOString() : null,
    parent_phone: normalizePhone(payload.parent_phone) || null,
    parent_sms_opt_in: payload.parent_sms_opt_in === true && Boolean(normalizePhone(payload.parent_phone)),
    preferred_subject: clean(payload.preferred_subject, 100) || null,
    preferred_language: payload.preferred_language === "sw" ? "sw" : "en",
    school_name: clean(payload.school_name, 120) || null,
    registration_channel: channel,
    consent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("lite_students").upsert(record, { onConflict: "phone_number" }).select("id,phone_number,full_name,study_level,sms_opt_in,parent_phone,parent_sms_opt_in,preferred_subject,preferred_language,school_name").single();
  if (error) throw error;
  const session = await issueSession(data.id);
  return { student: data, ...session };
}
async function loginStudent(payload: any) {
  const phone = normalizePhone(payload.phone_number);
  const pin = String(payload.pin || "");
  if (!phone || !/^\d{6}$/.test(pin)) return { error: "Enter your registered phone number and six-digit PIN." };
  const { data: row, error } = await db.from("lite_students").select("id,pin_hash,pin_salt").eq("phone_number", phone).maybeSingle();
  if (error) throw error;
  if (!row?.pin_hash || !row?.pin_salt) return { error: "No Lite learner account was found. Please register first." };
  const candidate = await pinHash(pin, row.pin_salt);
  if (candidate !== row.pin_hash) return { error: "The phone number or PIN is incorrect." };
  const student = await getStudent(phone);
  const session = await issueSession(row.id);
  return { student, ...session };
}
async function submitAnswer(student: any, setId: string, index: number, selected: number, daily = false) {
  const set = await getSet(setId);
  const q = set?.questions?.[index];
  if (!q || !Array.isArray(q.options) || selected < 1 || selected > q.options.length || selected > 5) return { error: "That question or answer is no longer available." };
  if (daily) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data: existing } = await db.from("lite_attempts").select("id").eq("student_id", student.id).eq("mcq_set_id", setId).eq("question_index", index).gte("attempted_at", start.toISOString()).limit(1);
    if (!existing?.length) {
      const { error } = await db.from("lite_attempts").insert({ student_id: student.id, mcq_set_id: setId, question_index: index, selected_option: selected, is_correct: Number(q.correct_answer) === selected });
      if (error) throw error;
    }
  } else {
    const { error } = await db.from("lite_attempts").insert({ student_id: student.id, mcq_set_id: setId, question_index: index, selected_option: selected, is_correct: Number(q.correct_answer) === selected });
    if (error) throw error;
  }
  return {
    is_correct: Number(q.correct_answer) === selected,
    correct_answer: Number(q.correct_answer),
    explanation: stripMarkup(q.explanation || "Review the explanation and key learning point.", 1200),
    question: stripMarkup(q.question, 900),
  };
}
async function getProgress(student: any) {
  const { data, error } = await db.from("lite_attempts").select("is_correct,attempted_at,mcq_set_id").eq("student_id", student.id).order("attempted_at", { ascending: false }).limit(1000);
  if (error) throw error;
  const rows = data || [];
  const correct = rows.filter((x: any) => x.is_correct).length;
  const recent = rows.slice(0, 12);
  return { total_attempts: rows.length, correct, incorrect: rows.length - correct, accuracy: rows.length ? Math.round(correct / rows.length * 100) : 0, recent };
}
async function adminUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: allowed } = await db.rpc("has_role", { _user_id: user.id, _role: "admin" });
  return allowed === true ? user : null;
}
async function sendAtSms(to: string, message: string) {
  const apiKey = Deno.env.get("AT_API_KEY") || "";
  const username = Deno.env.get("AT_USERNAME") || "sandbox";
  const environment = Deno.env.get("AT_ENV") === "production" ? "production" : "sandbox";
  if (!apiKey) throw new Error("Africa's Talking API key is not configured in Supabase Edge Function secrets.");
  const form = new URLSearchParams({ username, to, message });
  const sender = Deno.env.get("AT_SENDER_ID");
  if (sender) form.set("from", sender);
  const endpoint = environment === "production" ? "https://api.africastalking.com/version1/messaging" : "https://api.sandbox.africastalking.com/version1/messaging";
  const response = await fetch(endpoint, { method: "POST", headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(10000) });
  const body = await response.text();
  if (!response.ok) throw new Error("Africa's Talking returned HTTP " + response.status + ".");
  const parsed = JSON.parse(body);
  const recipient = parsed?.SMSMessageData?.Recipients?.[0];
  if (!recipient || Number(recipient.statusCode) >= 400) throw new Error(recipient?.status || "Africa's Talking did not accept the SMS.");
  return recipient;
}
async function sendAtAirtime(phone: string, amount: number) {
  if (Deno.env.get("AT_AIRTIME_ENABLED") !== "true") throw new Error("Airtime sending is disabled until an administrator enables the Africa's Talking airtime product.");
  const apiKey = Deno.env.get("AT_API_KEY") || "";
  const username = Deno.env.get("AT_USERNAME") || "sandbox";
  const environment = Deno.env.get("AT_ENV") === "production" ? "production" : "sandbox";
  if (!apiKey) throw new Error("Africa's Talking API key is not configured.");
  const form = new URLSearchParams({ username, recipients: JSON.stringify([{ phoneNumber: phone, amount: "KES " + amount.toFixed(2) }]) });
  const endpoint = environment === "production" ? "https://api.africastalking.com/version1/airtime/send" : "https://api.sandbox.africastalking.com/version1/airtime/send";
  const response = await fetch(endpoint, { method: "POST", headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(12000) });
  const body = await response.text();
  if (!response.ok) throw new Error("Africa's Talking airtime returned HTTP " + response.status + ".");
  const result = JSON.parse(body);
  const recipient = result?.responses?.[0];
  if (!recipient || !["Sent", "Success"].includes(String(recipient.status))) throw new Error(recipient?.errorMessage || result?.errorMessage || "Airtime request was not accepted.");
  return recipient;
}
async function ussd(req: Request, payload: any) {
  const supplied = new URL(req.url).searchParams.get("key") || req.headers.get("x-ussd-secret") || "";
  if (!supplied) return text("END Service configuration is incomplete. Please try again later.");
  const suppliedHash = await digest(supplied);
  const { data: settings } = await db.from("lite_operations_settings").select("ussd_enabled,ussd_secret_hash").eq("id", 1).maybeSingle();
  if (settings?.ussd_enabled === false || !settings?.ussd_secret_hash || suppliedHash !== settings.ussd_secret_hash) return text("END This service is temporarily unavailable.");
  const phone = normalizePhone(payload.phoneNumber || payload.phone_number);
  const sessionId = clean(payload.sessionId, 100);
  const raw = clean(payload.text, 1200);
  if (!phone || !sessionId) return text("END Invalid session. Please dial again.");
  const parts = raw ? raw.split("*") : [];
  const menu = "OmpathStudy Lite\n1. Register as a learner\n2. Daily quiz\n3. My progress\n4. Help";
  if (!parts.length) return text("CON " + menu);
  if (parts[0] === "1") {
    if (parts.length === 1) return text("CON Enter your full name:");
    if (parts.length === 2) return text("CON Choose your study year:\n1. Year 1\n2. Year 2\n3. Year 3\n4. Year 4\n5. Year 5\n6. Year 6");
    if (parts.length === 3) return text("CON Would you like daily learning SMS? Standard SMS charges may apply.\n1. Yes\n2. No");
    const name = clean(parts[1], 100);
    const yearNumber = Number(parts[2]);
    const level = "Year " + yearNumber;
    const smsOptIn = parts[3] === "1";
    if (name.length < 2 || !Number.isInteger(yearNumber) || yearNumber < 1 || yearNumber > 6 || !["1", "2"].includes(parts[3])) return text("END Registration details were invalid. Please dial again.");
    const { data: existing } = await db.from("lite_students").select("id").eq("phone_number", phone).maybeSingle();
    const record = { phone_number: phone, full_name: name, study_level: level, sms_opt_in: smsOptIn, sms_opt_in_at: smsOptIn ? new Date().toISOString() : null, preferred_language: "en", registration_channel: "ussd", consent_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const result = existing
      ? await db.from("lite_students").update(record).eq("id", existing.id)
      : await db.from("lite_students").insert(record);
    if (result.error) return text("END We could not save your registration. Please try again later.");
    return text("END Registration complete. Welcome to OmpathStudy Lite. Visit lite.ompathstudy.com to practise quizzes.");
  }
  if (parts[0] === "2") {
    const student = await getStudent(phone);
    if (!student) return text("END Please register first: visit lite.ompathstudy.com or choose 1 from the main USSD menu.");
    const set = await dailySet(student.study_level);
    if (!set) return text("END No quiz is available right now. Please try again later.");
    const answerCount = parts.length - 1;
    if (answerCount > 0) {
      const answer = Number(parts[parts.length - 1]);
      const questionIndex = answerCount - 1;
      const result = await submitAnswer(student, set.id, questionIndex, answer, true);
      if (result.error) return text("END " + result.error);
    }
    const nextIndex = answerCount;
    if (nextIndex >= Math.min(5, set.questions.length)) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data: attempts } = await db.from("lite_attempts").select("is_correct").eq("student_id", student.id).eq("mcq_set_id", set.id).gte("attempted_at", start.toISOString());
      const score = (attempts || []).filter((x: any) => x.is_correct).length;
      return text("END Daily quiz complete. Your recorded score today: " + score + "/" + Math.min(5, set.questions.length) + ". Visit lite.ompathstudy.com for explanations and more practice.");
    }
    const q = publicQuestion(set, nextIndex);
    if (!q || q.options.length < 2) return text("END The daily quiz is unavailable. Please try again later.");
    const labels = q.options.slice(0, 4).map((option: string, i: number) => (i + 1) + ". " + option).join("\n");
    return text("CON " + "Q" + (nextIndex + 1) + ": " + q.question.slice(0, 135) + "\n" + labels);
  }
  if (parts[0] === "3") {
    const student = await getStudent(phone);
    if (!student) return text("END Please register first at lite.ompathstudy.com.");
    const { data: attempts } = await db.from("lite_attempts").select("is_correct").eq("student_id", student.id).limit(500);
    const rows = attempts || [];
    const correct = rows.filter((x: any) => x.is_correct).length;
    return text("END " + student.full_name + ": " + rows.length + " questions attempted; " + correct + " correct. More progress: lite.ompathstudy.com");
  }
  if (parts[0] === "4") return text("END OmpathStudy Lite offers low-data medical learning, MCQs and daily quizzes. For help visit lite.ompathstudy.com.");
  return text("CON " + menu);
}
async function inboundSms(payload: any, req: Request) {
  const supplied = new URL(req.url).searchParams.get("key") || "";
  const { data: settings } = await db.from("lite_operations_settings").select("ussd_secret_hash").eq("id", 1).maybeSingle();
  if (!supplied || !settings?.ussd_secret_hash || await digest(supplied) !== settings.ussd_secret_hash) return json({ error: "Unauthorized" }, 401);
  const phone = normalizePhone(payload.from || payload.phoneNumber);
  const message = clean(payload.text, 120).toUpperCase();
  if (!phone) return json({ error: "Invalid sender" }, 400);
  const student = await getStudent(phone);
  if (!student) return json({ ok: true, message: "No learner profile found." });
  if (["STOP", "UNSUBSCRIBE", "CANCEL"].includes(message)) {
    await db.from("lite_students").update({ sms_opt_in: false, sms_opt_in_at: null, parent_sms_opt_in: false }).eq("id", student.id);
    return json({ ok: true, message: "You have opted out of OmpathStudy Lite learning SMS." });
  }
  const parts = message.split(/\s+/);
  if (parts.length === 2 && /^\d{4,6}$/.test(parts[0]) && /^[1-4ABCD]$/.test(parts[1])) {
    const option = /^[ABCD]$/.test(parts[1]) ? "ABCD".indexOf(parts[1]) + 1 : Number(parts[1]);
    const today = new Date().toISOString().slice(0, 10);
    const { data: delivery } = await db.from("lite_sms_deliveries").select("id,mcq_set_id,question_index").eq("student_id", student.id).eq("short_code", parts[0]).eq("delivery_date", today).maybeSingle();
    if (delivery) {
      const result = await submitAnswer(student, delivery.mcq_set_id, delivery.question_index, option, true);
      if (!result.error) return json({ ok: true, message: result.is_correct ? "Correct. " + result.explanation : "Not quite. " + result.explanation });
    }
  }
  return json({ ok: true, message: "Reply STOP to opt out. For a quiz, use the reference code followed by A, B, C or D." });
}
async function sendDailySms(req: Request) {
  const expected = Deno.env.get("CRON_SECRET") || "";
  const provided = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || provided !== expected) return json({ error: "Unauthorized" }, 401);
  const apiKey = Deno.env.get("AT_API_KEY") || "";
  if (!apiKey) return json({ error: "Africa's Talking API key is not configured." }, 503);
  const { data: students, error } = await db.from("lite_students").select("id,phone_number,study_level,preferred_language").eq("sms_opt_in", true).limit(500);
  if (error) throw error;
  const sent: any[] = [];
  const failed: any[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const student of students || []) {
    try {
      const { data: alreadySent } = await db.from("lite_sms_deliveries").select("id").eq("student_id", student.id).eq("delivery_date", today).limit(1);
      if (alreadySent?.length) continue;
      const set = await dailySet(student.study_level);
      if (!set?.questions?.length) continue;
      const q = publicQuestion(set, 0);
      if (!q) continue;
      const shortCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
      const message = "OmpathStudy daily quiz: " + q.question.slice(0, 110) + "\n1. " + q.options[0] + "\n2. " + q.options[1] + "\n3. " + (q.options[2] || "-") + "\n4. " + (q.options[3] || "-") + "\nReply " + shortCode + " A/B/C/D. " + "lite.ompathstudy.com";
      const recipient = await sendAtSms(student.phone_number, message);
      const { error: saveError } = await db.from("lite_sms_deliveries").insert({ student_id: student.id, mcq_set_id: set.id, question_index: 0, delivery_date: today, short_code: shortCode, provider_status: recipient.status || "Accepted", provider_message_id: recipient.messageId || null });
      if (saveError) throw saveError;
      sent.push({ student_id: student.id, status: recipient.status || "Accepted" });
    } catch (error) {
      failed.push({ student_id: student.id, error: String((error as Error)?.message || "SMS failed").slice(0, 120) });
    }
  }
  return json({ ok: failed.length === 0, sent: sent.length, failed: failed.length, details: { sent, failed } });
}
async function teacherDashboard(req: Request) {
  const user = await adminUser(req);
  if (!user) return json({ error: "Administrator access required." }, 403);
  const [students, attempts, attendance, announcements, rewards] = await Promise.all([
    db.from("lite_students").select("id,full_name,phone_number,study_level,sms_opt_in,parent_phone,school_name,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("lite_attempts").select("student_id,is_correct,attempted_at").order("attempted_at", { ascending: false }).limit(5000),
    db.from("lite_attendance").select("id,student_id,attendance_date,status").order("attendance_date", { ascending: false }).limit(1000),
    db.from("lite_announcements").select("*").order("created_at", { ascending: false }).limit(50),
    db.from("lite_airtime_rewards").select("id,student_id,amount,currency,reason,status,created_at,sent_at").order("created_at", { ascending: false }).limit(100),
  ]);
  for (const result of [students, attempts, attendance, announcements, rewards]) if (result.error) throw result.error;
  return json({ students: students.data || [], attempts: attempts.data || [], attendance: attendance.data || [], announcements: announcements.data || [], rewards: rewards.data || [] });
}
async function adminAction(req: Request, payload: any) {
  const user = await adminUser(req);
  if (!user) return json({ error: "Administrator access required." }, 403);
  const action = clean(payload.action, 40);
  if (action === "create_announcement") {
    const title = clean(payload.title, 140), body = clean(payload.body, 1200);
    if (title.length < 3 || body.length < 3) return json({ error: "Enter an announcement title and message." }, 400);
    const { data, error } = await db.from("lite_announcements").insert({ title, body, audience_study_level: clean(payload.audience_study_level, 20) || null, include_parents: payload.include_parents === true, created_by: user.id }).select("*").single();
    if (error) throw error;
    return json({ ok: true, announcement: data, note: "Saved as a draft. SMS delivery requires configured Africa's Talking credentials and a deliberate send action." });
  }
  if (action === "mark_attendance") {
    const studentId = clean(payload.student_id, 36);
    const status = ["present", "absent", "late", "excused"].includes(payload.status) ? payload.status : "present";
    const { data, error } = await db.from("lite_attendance").upsert({ student_id: studentId, attendance_date: clean(payload.attendance_date, 10) || new Date().toISOString().slice(0, 10), status, recorded_by: user.id }, { onConflict: "student_id,attendance_date" }).select("*").single();
    if (error) throw error;
    return json({ ok: true, attendance: data });
  }
  if (action === "create_airtime_reward") {
    const studentId = clean(payload.student_id, 36);
    const amount = Number(payload.amount);
    const reason = clean(payload.reason, 240);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000 || reason.length < 3) return json({ error: "Enter a valid reward amount and reason." }, 400);
    const { data, error } = await db.from("lite_airtime_rewards").insert({ student_id: studentId, amount, reason }).select("*").single();
    if (error) throw error;
    return json({ ok: true, reward: data, note: "Reward recorded as pending approval. Airtime is not sent until live Africa's Talking credentials are configured and an authorised send action is implemented." });
  }
  if (action === "send_airtime_reward") {
    const rewardId = clean(payload.reward_id, 36);
    const { data: reward, error: rewardError } = await db.from("lite_airtime_rewards").select("id,student_id,amount,currency,status").eq("id", rewardId).maybeSingle();
    if (rewardError) throw rewardError;
    if (!reward || reward.status !== "pending" || reward.currency !== "KES") return json({ error: "Only pending KES rewards can be sent." }, 409);
    const { data: learner, error: learnerError } = await db.from("lite_students").select("phone_number").eq("id", reward.student_id).maybeSingle();
    if (learnerError) throw learnerError;
    if (!learner?.phone_number) return json({ error: "The learner has no valid phone number." }, 409);
    try {
      const sent = await sendAtAirtime(learner.phone_number, Number(reward.amount));
      const { data: saved, error: saveError } = await db.from("lite_airtime_rewards").update({ status: "sent", provider_reference: sent.requestId || null, approved_by: user.id, sent_at: new Date().toISOString() }).eq("id", reward.id).eq("status", "pending").select("*").single();
      if (saveError) throw saveError;
      return json({ ok: true, reward: saved, provider_status: sent.status, provider_reference: sent.requestId || null });
    } catch (error) {
      await db.from("lite_airtime_rewards").update({ status: "failed", approved_by: user.id }).eq("id", reward.id).eq("status", "pending");
      return json({ error: String((error as Error)?.message || "Airtime send failed.") }, 502);
    }
  }
  return json({ error: "Unknown administrator action." }, 400);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!url || !serviceKey) return json({ error: "Learning service is not configured." }, 503);
  try {
    const payload = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
    const action = clean(payload.action || new URL(req.url).searchParams.get("action"), 40);
    if (action === "ussd") return await ussd(req, payload.payload || payload);
    if (action === "inbound_sms") return await inboundSms(payload, req);
    if (action === "send_daily_sms") return await sendDailySms(req);
    if (action === "register") {
      const result = await registerStudent(payload);
      return result.error ? json({ error: result.error }, 400) : json(result);
    }
    if (action === "login") {
      const result = await loginStudent(payload);
      return result.error ? json({ error: result.error }, 401) : json(result);
    }
    if (action === "catalogue") {
      const student = await studentFromToken(req);
      const sets = await catalogue(student?.study_level);
      return json({ student, sets });
    }
    if (action === "daily") {
      const student = await studentFromToken(req);
      if (!student) return json({ error: "Sign in to start your daily quiz." }, 401);
      const set = await dailySet(student.study_level);
      if (!set) return json({ error: "No published quiz is available for your study year." }, 404);
      return json({ set: { id: set.id, title: set.title, category: set.category }, question_count: Math.min(5, set.questions.length) });
    }
    if (action === "question") {
      const student = await studentFromToken(req);
      if (!student) return json({ error: "Sign in to practise." }, 401);
      const setId = clean(payload.set_id, 36), index = Math.max(0, Math.floor(Number(payload.question_index) || 0));
      const set = await getSet(setId);
      const q = publicQuestion(set, index);
      return q ? json({ question: q, total: set.questions.length }) : json({ error: "Question not found." }, 404);
    }
    if (action === "submit") {
      const student = await studentFromToken(req);
      if (!student) return json({ error: "Sign in to record your answer." }, 401);
      const result = await submitAnswer(student, clean(payload.set_id, 36), Math.max(0, Math.floor(Number(payload.question_index) || 0)), Math.floor(Number(payload.selected_option) || 0));
      return result.error ? json({ error: result.error }, 400) : json(result);
    }
    if (action === "progress") {
      const student = await studentFromToken(req);
      if (!student) return json({ error: "Sign in to view your progress." }, 401);
      return json({ student, progress: await getProgress(student) });
    }
    if (action === "teacher_dashboard") return await teacherDashboard(req);
    if (action === "admin_action") return await adminAction(req, payload);
    return json({ error: "Unknown learning action." }, 404);
  } catch (error) {
    console.error("OmpathStudy Lite learning error:", String((error as Error)?.message || "unknown").slice(0, 180));
    return json({ error: "The learning service could not complete this request. Please try again." }, 500);
  }
});
