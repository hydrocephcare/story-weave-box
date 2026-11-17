import { createHash, randomBytes } from "node:crypto";
/**
 * OmpathStudy Lite — private health encounter persistence.
 *
 * Server-side only. Do not import this module into browser code or expose
 * SUPABASE_SERVICE_ROLE_KEY. Clinical interpretation and patient-facing
 * assessments are deliberately handled by later, separately reviewed stages.
 */
const clean = (value, max = 500) => String(value ?? "").trim().replace(/[<>]/g, "").slice(0, max);

function normalizePhone(value) {
  if (value === null || value === undefined || value === "") return null;
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
    signal: options.signal || AbortSignal.timeout(6000),
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
  if (channel === "ussd" && !phone_number) throw new Error("A valid mobile number is required.");
  if (phoneNumber && !phone_number) throw new Error("A valid mobile number is required.");
  if (consentGiven !== true) throw new Error("Consent is required before saving a health enquiry.");
  if (!["en", "sw", "other"].includes(preferredLanguage)) throw new Error("Unsupported language preference.");
  if (!["ussd", "sms", "web"].includes(channel)) throw new Error("Unsupported channel.");

  // Repeated USSD callbacks must never reset an encounter or its consent.
  const existing = await db(
    `lite_health_encounters?select=id,session_id,phone_number,consent_given,status,assessment,expires_at&session_id=eq.${encodeURIComponent(session_id)}&limit=1`,
  );
  if (existing[0]) {
    if (existing[0].phone_number !== phone_number || existing[0].consent_given !== true) {
      throw new Error("This health session cannot be resumed.");
    }
    if (Date.parse(existing[0].expires_at) <= Date.now()) {
      throw new Error("This health session has expired. Please start a new enquiry.");
    }
    return existing[0];
  }
  const payload = {
    session_id, phone_number, channel, consent_given: true,
    consented_at: new Date().toISOString(), sms_consent: smsConsent === true,
    preferred_language, updated_at: new Date().toISOString(),
  };
  try {
    const rows = await db("lite_health_encounters", { method: "POST", body: JSON.stringify(payload) });
    return rows[0] || null;
  } catch {
    // A concurrent callback may have inserted first; read it, never upsert.
    const raced = await db(
      `lite_health_encounters?select=id,session_id,phone_number,consent_given,status,assessment,expires_at&session_id=eq.${encodeURIComponent(session_id)}&limit=1`,
    );
    if (raced[0]?.phone_number === phone_number && raced[0]?.consent_given === true && Date.parse(raced[0].expires_at) > Date.now()) return raced[0];
    throw new Error("We could not securely start this health enquiry.");
  }
}

/** Retrieve only the encounter matching both the session and caller's phone. */
export async function getHealthEncounter({ sessionId, phoneNumber }) {
  const session_id = validateSession(sessionId);
  const phone_number = normalizePhone(phoneNumber);
  if (phoneNumber && !phone_number) throw new Error("A valid mobile number is required.");
  const phoneFilter = phone_number ? "&phone_number=eq." + encodeURIComponent(phone_number) : "";
  const rows = await db(
    `lite_health_encounters?select=id,session_id,phone_number,channel,status,consent_given,preferred_language,concern_category,original_message,normalized_summary,clarification_answers,red_flag_results,urgency_level,assessment,guide_url,sms_consent,expires_at&session_id=eq.${encodeURIComponent(session_id)}${phoneFilter}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
  );
  return rows[0] || null;
}

/** Update only explicitly permitted intake fields; assessment fields are server-owned. */
export async function updateHealthEncounter({ id, sessionId, phoneNumber, patch = {} }) {
  const session_id = validateSession(sessionId);
  const phone_number = normalizePhone(phoneNumber);
  if ((phoneNumber && !phone_number) || !/^[0-9a-f-]{36}$/i.test(clean(id, 36))) {
    throw new Error("Invalid health encounter reference.");
  }

  const allowed = {};
  if (typeof patch.preferred_language === "string" && ["en", "sw", "other"].includes(patch.preferred_language)) {
    allowed.preferred_language = patch.preferred_language;
  }
  if (typeof patch.concern_category === "string") allowed.concern_category = clean(patch.concern_category, 80);
  if (typeof patch.original_message === "string") allowed.original_message = clean(patch.original_message, 1200);
  if (typeof patch.normalized_summary === "string") allowed.normalized_summary = clean(patch.normalized_summary, 1200);
  if (typeof patch.sms_sent_at === "string" && !Number.isNaN(Date.parse(patch.sms_sent_at))) allowed.sms_sent_at = patch.sms_sent_at;
  if (Array.isArray(patch.clarification_answers) && patch.clarification_answers.length <= 5 &&
      patch.clarification_answers.every((item) => item && typeof item === "object" && !Array.isArray(item) &&
        typeof item.question_id === "string" && item.question_id.length <= 60 &&
        (typeof item.answer === "string" || typeof item.answer === "number"))) {
    allowed.clarification_answers = patch.clarification_answers.map((item) => ({
      question_id: clean(item.question_id, 60), answer: clean(item.answer, 40),
    }));
  }
  if (Array.isArray(patch.red_flag_results) && patch.red_flag_results.length <= 30 &&
      patch.red_flag_results.every((item) => item && typeof item === "object" && !Array.isArray(item) &&
        typeof item.rule === "string" && typeof item.positive === "boolean")) {
    allowed.red_flag_results = patch.red_flag_results.map((item) => ({
      rule: clean(item.rule, 80), positive: item.positive,
      ...(typeof item.evidence === "string" ? { evidence: clean(item.evidence, 180) } : {}),
    }));
  }
  if (patch.assessment && typeof patch.assessment === "object" && !Array.isArray(patch.assessment) &&
      JSON.stringify(patch.assessment).length <= 12000) {
    allowed.assessment = patch.assessment;
  }
  if (["not_assessed", "emergency", "urgent", "prompt", "routine", "uncertain"].includes(patch.urgency_level)) allowed.urgency_level = patch.urgency_level;
  if (["intake_started", "awaiting_clarification", "ready_for_assessment", "referred_urgent", "guide_pending", "complete", "abandoned"].includes(patch.status)) {
    allowed.status = patch.status;
  }
  allowed.updated_at = new Date().toISOString();

  const phoneFilter = phone_number ? "&phone_number=eq." + encodeURIComponent(phone_number) : "";
  const rows = await db(
    `lite_health_encounters?id=eq.${encodeURIComponent(id)}&session_id=eq.${encodeURIComponent(session_id)}${phoneFilter}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    { method: "PATCH", body: JSON.stringify(allowed) },
  );
  return rows[0] || null;
}

/** Issue an unguessable, seven-day link for a reviewed patient resource. */
export async function createHealthGuideToken({ encounterId, resourceSlug }) {
  if (!/^[0-9a-f-]{36}$/i.test(clean(encounterId, 36)) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean(resourceSlug, 180))) {
    throw new Error("Invalid patient guide reference.");
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db("lite_health_guide_tokens", {
    method: "POST",
    body: JSON.stringify({ encounter_id: encounterId, resource_slug: resourceSlug, token_hash: tokenHash, expires_at: expiresAt }),
  });
  return { token, expiresAt };
}

/** Resolve a bearer token using only its SHA-256 digest. */
export async function getHealthGuideToken(token) {
  const raw = clean(token, 100);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(raw)) return null;
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const path = "lite_health_guide_tokens?select=id,resource_slug,expires_at,revoked_at&token_hash=eq." + tokenHash + "&revoked_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()) + "&limit=1";
  const rows = await db(path);
  const row = rows[0];
  if (!row) return null;
  const stillValid = await db(
    "lite_health_guide_tokens?id=eq." + encodeURIComponent(row.id) +
      "&revoked_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()),
    { method: "PATCH", body: JSON.stringify({ last_accessed_at: new Date().toISOString() }) },
  );
  if (!stillValid[0]) return null;
  return row;
}
/** Daily cron retention: remove expired bearer tokens, then expired encounters. */
export async function deleteExpiredHealthData() {
  const now = encodeURIComponent(new Date().toISOString());
  const expiredTokens = await db("lite_health_guide_tokens?expires_at=lt." + now, { method: "DELETE" });
  const expiredEncounters = await db("lite_health_encounters?expires_at=lt." + now, { method: "DELETE" });
  return { expiredTokens: expiredTokens.length, expiredEncounters: expiredEncounters.length };
}
