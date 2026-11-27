import { runVercelHandler } from "../_lib/vercel-adapter.js";

// Neon Auth's adapter performs initialisation that Cloudflare forbids at Worker
// module scope. Load the sitemap handler only after a request has entered the
// Pages Function, so the SDK initialises inside the request lifecycle.
export const onRequest = async ({ request }) => {
  const { default: handler } = await import("../../api/generate-sitemap.ts");
  return runVercelHandler(handler, request);
};
