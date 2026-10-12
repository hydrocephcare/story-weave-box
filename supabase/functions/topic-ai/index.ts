// POST { name, category?, context? } -> writes a full topic page once with Gemini (the same gateway Ompath AI uses), saves it in
// topic_pages, and hands the saved copy to everyone after that. The logic lives in ../_shared/topicAi.js so it can be tested.
import { topicAiCore } from "../_shared/topicAi.js";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ status: "method" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  const input = await req.json().catch(() => ({}));
  const { code, body } = await topicAiCore(input, { env: Deno.env.toObject() });
  return new Response(JSON.stringify(body), { status: code, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
