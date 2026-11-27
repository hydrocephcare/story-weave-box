import { neon } from "@neondatabase/serverless";
import { verifyNeonToken } from "../../api/_lib/neonAdmin.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Authorization",
  },
});

function database() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("Database is not configured.");
  return neon(url);
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!["GET", "PUT"].includes(request.method)) return json({ error: "Method not allowed" }, 405);

  const bearer = request.headers.get("Authorization") || "";
  const identity = await verifyNeonToken(bearer);
  if (!identity) return json({ error: "Please sign in again." }, 401);

  try {
    const sql = database();
    if (request.method === "GET") {
      const rows = await sql.query(
        "SELECT data FROM public.ai_user_history WHERE user_id = $1::uuid LIMIT 1",
        [identity.id],
      );
      const data = rows?.[0]?.data && typeof rows[0].data === "object"
        ? rows[0].data
        : { sessions: [], deleted: [] };
      return json({ data });
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid history payload." }, 400); }
    const payload = body?.data;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "Invalid history payload." }, 400);
    }
    const sessions = Array.isArray(payload.sessions) ? payload.sessions.slice(0, 25) : [];
    const deleted = Array.isArray(payload.deleted) ? payload.deleted.slice(-100) : [];
    const data = { sessions, deleted };
    const encoded = JSON.stringify(data);
    if (new TextEncoder().encode(encoded).byteLength > 380000) {
      return json({ error: "Your saved AI history is too large to sync." }, 413);
    }

    await sql.query(
      "INSERT INTO public.ai_user_history (user_id, data, updated_at) VALUES ($1::uuid, $2::jsonb, now()) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [identity.id, encoded],
    );
    return json({ success: true });
  } catch (error) {
    console.error("ai-history", error);
    return json({ error: "Could not sync AI history right now." }, 503);
  }
}
