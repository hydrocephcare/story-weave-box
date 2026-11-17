/**
 * OmpathStudy Lite — private health encounter persistence.
 *
 * Server-side only. Do not import this module into browser code or expose
 * SUPABASE_SERVICE_ROLE_KEY. Clinical interpretation and patient-facing
 * assessments are deliberately handled by later, separately reviewed stages.
 */
const clean = (value, max = 500) => String(value ?? "").trim().replace(/[<>]/g, "").slice(0, max);

function normalizePhone(value) {
  let phone = clean(value, 32).replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(phone)) phone = "+254" + phone.slice(1);
  else if (/^254\d{9}$/.test(phone)) phone = "+" + phone;
  return /^\+[1-9]\d{8,14}$/.test(phone) ? phone : null;
}

async function db(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Health encounter storage is not configured.");
  const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/${path}`, {
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
  if (!response.ok) {
    // Avoid logging health data or phone numbers.
    console.error("Lite health storage request failed:", response.status);
    throw new Error("We could not securely save this health enquiry.");
  }
  return body ? JSON.parse(body) : [];
}

function validateSession(sessionId) {
  const session = clean(sessionId, 120);
  if (!/^[A-Za-z0-9._:-]{6,120}$/.test(session)) {
    throw new Error("Invalid health session.");
  }
  return session;
}

/**
 * Create a record only after the caller has obtained explicit consent.
 * Phone number is stored only for the agreed service purpose (e.g. requested SMS).
 */
export async function createHealthEncounter({
  sessionId,
  phoneNumber,
  consentGiven,
  smsConsent = false,
  preferredLanguage = "en",
  channel = "ussd",
}) {
  const session_id = validateSession(sessionId);
  const phone_number = normalizePhone(phoneNumber);
  if (!phone_number) throw new Error("A valid mobile number is required.");
  if (consentGiven !== true) throw new Error("Consent is required before saving a health enquiry.");
  if (!["en", "sw", "other"].includes(preferredLanguage)) throw new Error("Unsupported language preference.");
  if (!["ussd", "sms", "web"].includes(channel)) throw new Error("Unsupported channel.");

  const rows = await db("lite_health_encounters?on_conflict=session_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      session_id,
      phone_number,
      channel,
      consent_given: true,
      consented_at: new Date().toISOString(),
      sms_consent: smsConsent === true,
      preferred_language: preferredLanguage,
      updated_at: new Date().toISOString(),
    }),
  });
  return rows[0] || null;
}

/** Retrieve only the encounter matching both the session and caller's phone. */
export async function getHealthEncounter({ sessionId, phoneNumber }) {
  const session_id = validateSession(sessionId);
  const phone_number = normalizePhone(phoneNumber);
  if (!phone_number) throw new Error("A valid mobile number is required.");
  const rows = await db(
    `lite_health_encounters?select=*&session_id=eq.${encodeURIComponent(session_id)}&phone_number=eq.${encodeURIComponent(phone_number)}&limit=1`,
  );
  return rows[0] || null;
}

/** Update only explicitly permitted intake fields; assessment fields are server-owned. */
export async function updateHealthEncounter({ id, sessionId, phoneNumber, patch = {} }) {
  const session_id = validateSession(sessionId);
  const phone_number = normalizePhone(phoneNumber);
  if (!phone_number || !/^[0-9a-f-]{36}$/i.test(clean(id, 36))) {
    throw new Error("Invalid health encounter reference.");
  }

  const allowed = {};
  if (typeof patch.preferred_language === "string" && ["en", "sw", "other"].includes(patch.preferred_language)) {
    allowed.preferred_language = patch.preferred_language;
  }
  if (typeof patch.concern_category === "string") allowed.concern_category = clean(patch.concern_category, 80);
  if (typeof patch.original_message === "string") allowed.original_message = clean(patch.original_message, 1200);
  if (typeof patch.normalized_summary === "string") allowed.normalized_summary = clean(patch.normalized_summary, 1200);
  if (Array.isArray(patch.clarification_answers)) allowed.clarification_answers = patch.clarification_answers.slice(0, 5);
  if (Array.isArray(patch.red_flag_results)) allowed.red_flag_results = patch.red_flag_results.slice(0, 30);
  if (patch.assessment && typeof patch.assessment === "object" && !Array.isArray(patch.assessment)) allowed.assessment = patch.assessment;
  if (["not_assessed", "emergency", "urgent", "prompt", "routine", "uncertain"].includes(patch.urgency_level)) allowed.urgency_level = patch.urgency_level;
  if (["intake_started", "awaiting_clarification", "ready_for_assessment", "referred_urgent", "guide_pending", "complete", "abandoned"].includes(patch.status)) {
    allowed.status = patch.status;
  }
  allowed.updated_at = new Date().toISOString();

  const rows = await db(
    `lite_health_encounters?id=eq.${encodeURIComponent(id)}&session_id=eq.${encodeURIComponent(session_id)}&phone_number=eq.${encodeURIComponent(phone_number)}`,
    { method: "PATCH", body: JSON.stringify(allowed) },
  );
  return rows[0] || null;
}
