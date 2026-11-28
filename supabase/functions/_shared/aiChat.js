// Shared compatibility wrapper. Provider selection, retries, model IDs and Supabase routing live in topicAi.js.
import { askModel } from "./topicAi.js";

export async function chatText(env, messages, { temperature = 0.1, maxTokens = 8000, timeoutMs = 25000 } = {}) {
  const prompt = (Array.isArray(messages) ? messages : [])
    .map((message) => String(message?.role || "user").toUpperCase() + ":\n" + String(message?.content || ""))
    .join("\n\n");
  const result = await askModel(prompt, { env, fetchImpl: fetch, temperature, maxTokens, timeoutMs, plain: true });
  return result.text;
}
