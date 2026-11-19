// POST { name, category?, context? } -> writes a full topic page once with Gemini (the same gateway Ompath AI uses), saves it in
// topic_pages, and hands the saved copy to everyone after that. The logic lives in ../_shared/topicAi.js so it can be tested.
import { topicAiCore } from "../_shared/topicAi.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ status: "method" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
  if (!token) return new Response(JSON.stringify({ status: "login_required" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData } = await userClient.auth.getUser(token);
  if (!authData?.user) return new Response(JSON.stringify({ status: "login_required" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  const { data: quota, error: quotaError } = await userClient.rpc("consume_feature", { p_feature: "topic_page_generation", p_units: 1 });
  if (quotaError) return new Response(JSON.stringify({ status: "verification_unavailable" }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
  if (!quota?.allowed) return new Response(JSON.stringify({ status: "limit", upgrade_required: true, quota }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
  const input = await req.json().catch(() => ({}));
  const { code, body } = await topicAiCore(input, { env: Deno.env.toObject() });
  return new Response(JSON.stringify(body), { status: code, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
